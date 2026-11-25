import type { LinienConfig, RoadsConfig } from "../config";
import { sliceLine, type LonLat } from "../world/geo";
import type { RoadNetwork } from "../world/roads";
import { findRoute, type Snap } from "../world/router";
import type { PerleAufgeloest } from "./typen";

/** Stück eines gerichteten Straßenabschnitts, das der Bus befährt (Anteil t0 bis t1). */
export interface Stueck {
  edge: number;
  t0: number;
  t1: number;
}

/** Grundwerte eines Haltestellenabschnitts. Die Fahrzeit zu einer Uhrzeit folgt mit `abschnittZeitS`. */
export interface Abschnitt {
  /** Index der Start- und Zielhaltestelle in der Perlenkette. */
  von: number;
  nach: number;
  lengthM: number;
  /** Reine Fahrzeit mit der erlaubten Geschwindigkeit (höchstens `hoechstgeschwindigkeitKmh`), ohne Faktor. */
  fahrS: number;
  /** Zuschläge für Ampeln und Kreuzungen; werden nicht mit dem Verkehrsfaktor multipliziert. */
  zuschlagS: number;
}

export interface Strecke {
  /** Index der Perle, nach der keine Route gefunden wurde (Route von Perle i nach i + 1 fehlt). */
  fehlt: number[];
  /** Perlen ohne Anschluss ans Busnetz. */
  ohneNetz: number[];
  stuecke: Stueck[];
  abschnitte: Abschnitt[];
  lengthM: number;
  coords: LonLat[];
  /** Benutzte Straßenklassen, die als eng gelten (für die Prüfung "Passt der Bus zur Linie?"). */
  engeKlassen: string[];
  /** Die Route wendet in einer Sackgasse. */
  wendetInSackgasse: boolean;
}

const EPS = 1e-9;

/** Reine Fahrzeit eines Stücks bei erlaubter Geschwindigkeit, gedeckelt auf die Höchstgeschwindigkeit der Busse. */
export function stueckFahrS(net: RoadNetwork, s: Stueck, cfg: LinienConfig): number {
  const e = net.edges[s.edge];
  const kmh = Math.min(e.speedKmh, cfg.hoechstgeschwindigkeitKmh);
  return ((s.t1 - s.t0) * e.lengthM) / (kmh / 3.6);
}

/** Ampel- und Kreuzungszuschlag eines Stücks: nur, wenn der Bus das Ende des Abschnitts erreicht. */
export function stueckZuschlagS(net: RoadNetwork, s: Stueck, roads: RoadsConfig): number {
  if (s.t1 < 1 - EPS) return 0;
  const e = net.edges[s.edge];
  return e.signals * roads.ampelZuschlagS + (e.junctionAtEnd ? roads.kreuzungZuschlagS : 0);
}

/** Zerlegt eine Route aus `findRoute` in Stücke mit Anteilen. */
function stueckeDerRoute(edges: number[], start: Snap, ziel: Snap): Stueck[] {
  if (edges.length === 1) return [{ edge: edges[0], t0: start.t, t1: ziel.t }];
  return edges.map((e, i) => ({ edge: e, t0: i === 0 ? start.t : 0, t1: i === edges.length - 1 ? ziel.t : 1 }));
}

/** Zwischenspeicher für Routen zwischen zwei Perlen (Schlüssel aus Abschnitten und Anteilen). */
export class RoutenCache {
  private readonly m = new Map<string, { edges: number[]; start: Snap; ziel: Snap } | null>();
  constructor(private readonly groesse: number) {}
  hole(net: RoadNetwork, von: Snap[], nach: Snap[], roads: RoadsConfig) {
    const k = `${von.map((s) => `${s.edge}:${s.t}`).join(",")}>${nach.map((s) => `${s.edge}:${s.t}`).join(",")}`;
    if (this.m.has(k)) return this.m.get(k)!;
    const r = findRoute(net, von, nach, roads);
    const v = r ? { edges: r.edges, start: von.find((s) => s.edge === r.edges[0])!, ziel: nach.find((s) => s.edge === r.edges[r.edges.length - 1])! } : null;
    if (this.m.size >= this.groesse) this.m.clear();
    this.m.set(k, v);
    return v;
  }
}

/**
 * Route über alle Perlen. Zwischen zwei Perlen gilt die Route mit der kürzesten Fahrzeit (Dijkstra wie in Etappe 1,
 * ohne Verkehrsfaktor, damit die Route über den Tag gleich bleibt). Einbahnstraßen und Abbiegeverbote gelten; gewendet
 * wird nur in Sackgassen. Die nächste Teilroute beginnt auf dem Abschnitt, auf dem die vorige angekommen ist, damit der
 * Bus an einer Perle nicht die Richtung wechselt.
 */
export function berechneStrecke(net: RoadNetwork, perlen: PerleAufgeloest[], cfg: LinienConfig, roads: RoadsConfig, cache = new RoutenCache(cfg.routenCacheGroesse)): Strecke {
  const fehlt: number[] = [];
  const ohneNetz = perlen.map((p, i) => (p.snaps.length ? -1 : i)).filter((i) => i >= 0);
  const stuecke: Stueck[] = [];
  /** Index im Stück-Array, an dem die Teilroute zur Perle i + 1 endet. */
  const endeNach: number[] = [];
  let ankunft: Snap | null = null;
  for (let i = 0; i + 1 < perlen.length; i++) {
    const von: Snap[] = ankunft ? [ankunft] : perlen[i].snaps;
    const r: { edges: number[]; start: Snap; ziel: Snap } | null = von.length && perlen[i + 1].snaps.length ? cache.hole(net, von, perlen[i + 1].snaps, roads) : null;
    if (!r) {
      fehlt.push(i);
      ankunft = null;
      endeNach.push(stuecke.length);
      continue;
    }
    stuecke.push(...stueckeDerRoute(r.edges, r.start, r.ziel));
    endeNach.push(stuecke.length);
    ankunft = r.ziel;
  }

  // Haltestellenabschnitte: von Haltestelle zu Haltestelle, Wegpunkte dazwischen gehören zum Abschnitt
  const halte = perlen.map((p, i) => (p.halt ? i : -1)).filter((i) => i >= 0);
  const abschnitte: Abschnitt[] = [];
  for (let k = 0; k + 1 < halte.length; k++) {
    const a = halte[k], b = halte[k + 1];
    const von = a === 0 ? 0 : endeNach[a - 1];
    const bis = endeNach[b - 1];
    let lengthM = 0, fahrS = 0, zuschlagS = 0;
    for (let j = von; j < bis; j++) {
      const s = stuecke[j];
      lengthM += (s.t1 - s.t0) * net.edges[s.edge].lengthM;
      fahrS += stueckFahrS(net, s, cfg);
      zuschlagS += stueckZuschlagS(net, s, roads);
    }
    abschnitte.push({ von: a, nach: b, lengthM, fahrS, zuschlagS });
  }

  const coords: LonLat[] = [];
  for (const s of stuecke) {
    const teil = sliceLine(net.edges[s.edge].coords, s.t0, s.t1);
    coords.push(...(coords.length ? teil.slice(1) : teil));
  }
  const eng = new Set<string>();
  let wendet = false;
  for (let j = 0; j < stuecke.length; j++) {
    const e = net.edges[stuecke[j].edge];
    if (cfg.engKlassen.includes(e.cls)) eng.add(e.cls);
    if (j > 0 && net.edges[stuecke[j - 1].edge].twin === e.id && stuecke[j - 1].t1 >= 1 - EPS) wendet = true;
  }
  return {
    fehlt,
    ohneNetz,
    stuecke,
    abschnitte,
    lengthM: stuecke.reduce((s, x) => s + (x.t1 - x.t0) * net.edges[x.edge].lengthM, 0),
    coords,
    engeKlassen: [...eng].sort(),
    wendetInSackgasse: wendet,
  };
}

/** Eine Strecke ist vollständig, wenn jede Perle am Netz liegt, jede Teilroute existiert und es mindestens zwei Haltestellen gibt. */
export const streckeVollstaendig = (s: Strecke): boolean => s.fehlt.length === 0 && s.ohneNetz.length === 0 && s.abschnitte.length > 0;
