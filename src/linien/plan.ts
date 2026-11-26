import { PLAN_TAGE, type LinienConfig, type PlanTag, type RoadsConfig } from "../config";
import { haversine } from "../world/geo";
import type { RoadNetwork } from "../world/roads";
import type { Snap } from "../world/router";
import { abschnittZeitS, erzeugeFahrten, verkette, type Fahrt, type Umlauf, type UmlaufFahrt } from "./fahrplan";
import { berechneStrecke, RoutenCache, streckeVollstaendig, type Strecke } from "./strecke";
import type { HaltDaten, PerleAufgeloest, Variante } from "./typen";

/** Anfrage an den Simulations-Worker: eine Linie mit aufgelösten Haltestellen. */
export interface PlanAnfrage {
  linieId: number;
  aktiv: boolean;
  varianten: (Pick<Variante, "id" | "wendezeitS" | "takt" | "eigenerFerientakt" | "aenderungen"> & { perlen: PerleAufgeloest[] })[];
  /** Anschluss des Betriebshofs ans Straßennetz (für die Ausrückfahrt), oder null ohne Betriebshof. */
  hof: Snap[] | null;
}

export interface Ausrueck {
  lengthM: number;
  fahrS: number;
  zuschlagS: number;
}

export interface VariantenPlan {
  id: number;
  strecke: Omit<Strecke, "stuecke">;
  vollstaendig: boolean;
  /** Fahrt vom Betriebshof zur ersten Haltestelle, null ohne Betriebshof oder ohne Route. */
  ausrueck: Ausrueck | null;
  /** Fahrt von der letzten Haltestelle zum Betriebshof (Einrücken, A3c-9), null ohne Betriebshof oder ohne Route. */
  einrueck: Ausrueck | null;
  /** Ort und Name der ersten und letzten Haltestelle (Ort wie bei der Verkettung, Gegenhaltestellen gleich). */
  start: { ort: string; name: string } | null;
  ziel: { ort: string; name: string } | null;
}

export interface UmlaufPlan extends Umlauf {
  /** Abfahrt am Betriebshof und Fahrzeit bis zur ersten Haltestelle des Umlaufs, null ohne Ausrückroute. */
  ausrueck: { abHofS: number; fahrzeitS: number } | null;
  /** Ankunft am Betriebshof nach der letzten Fahrt und Fahrzeit dorthin, null ohne Einrückroute. */
  einrueck: { anHofS: number; fahrzeitS: number } | null;
}

export interface TagesPlan {
  fahrten: Fahrt[];
  umlaeufe: UmlaufPlan[];
  /** Bedarf an Bussen: Zahl der Umläufe. */
  busbedarf: number;
}

export interface LinienPlan {
  linieId: number;
  varianten: VariantenPlan[];
  tage: Record<PlanTag, TagesPlan>;
}

/** Gleicher Ort für die Verkettung: dieselbe Haltestelle oder gleicher Name im Umkreis (Gegenhaltestelle, F2). */
export function gleicherOrt(a: HaltDaten, b: HaltDaten, cfg: LinienConfig): boolean {
  return a.id === b.id || (!!a.name && a.name === b.name && haversine(a.coord, b.coord) <= cfg.gegenhaltestelleRadiusM);
}

/** Ordnet Haltestellen Orten zu (Vereinigung über `gleicherOrt`). Schlüssel ist die kleinste Id der Gruppe. */
export function orte(halte: HaltDaten[], cfg: LinienConfig): Map<string, string> {
  const ids = [...new Map(halte.map((h) => [h.id, h])).values()].sort((a, b) => a.id.localeCompare(b.id));
  const eltern = new Map(ids.map((h) => [h.id, h.id]));
  const wurzel = (x: string): string => (eltern.get(x) === x ? x : wurzel(eltern.get(x)!));
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (gleicherOrt(ids[i], ids[j], cfg)) {
        const a = wurzel(ids[i].id), b = wurzel(ids[j].id);
        if (a !== b) eltern.set(a < b ? b : a, a < b ? a : b);
      }
  return new Map(ids.map((h) => [h.id, wurzel(h.id)]));
}

const leererTag = (): TagesPlan => ({ fahrten: [], umlaeufe: [], busbedarf: 0 });

/**
 * Berechnet eine Linie: Routen und Abschnitte je Variante, Fahrten je Tagesart, Umläufe und Bedarf an Bussen,
 * Ausrückfahrten. Deterministisch: gleiche Anfrage, gleiches Ergebnis. Eine Variante ohne vollständige Route und eine
 * deaktivierte Linie erzeugen keine Fahrten.
 */
export function berechneLinie(net: RoadNetwork, a: PlanAnfrage, cfg: LinienConfig, roads: RoadsConfig, cache = new RoutenCache(cfg.routenCacheGroesse)): LinienPlan {
  const varianten: VariantenPlan[] = [];
  const intern: { v: PlanAnfrage["varianten"][number]; strecke: Strecke; standzeit: number[]; start: HaltDaten | null; ziel: HaltDaten | null; ausrueck: Ausrueck | null; einrueck: Ausrueck | null }[] = [];
  const einAbschnitt = (von: PerleAufgeloest, nach: PerleAufgeloest): Ausrueck | null => {
    const s = berechneStrecke(net, [{ ...von, standzeitS: 0 }, { ...nach, standzeitS: 0 }], cfg, roads, cache);
    return streckeVollstaendig(s) ? { lengthM: s.abschnitte[0].lengthM, fahrS: s.abschnitte[0].fahrS, zuschlagS: s.abschnitte[0].zuschlagS } : null;
  };
  for (const v of a.varianten) {
    const strecke = berechneStrecke(net, v.perlen, cfg, roads, cache);
    const halte = v.perlen.filter((p) => p.halt);
    const start = halte[0]?.halt ?? null, ziel = halte[halte.length - 1]?.halt ?? null;
    let ausrueck: Ausrueck | null = null, einrueck: Ausrueck | null = null;
    if (a.hof?.length && start && ziel) {
      const hofPerle: PerleAufgeloest = { halt: { id: "_hof", name: "", coord: a.hof[0].point, snaps: a.hof }, coord: a.hof[0].point, snaps: a.hof, standzeitS: 0 };
      // Ausrückfahrt als ein Abschnitt vom Anschluss des Tors zur ersten Haltestelle (A3b-14), Einrücken umgekehrt (A3c-9)
      if (halte[0].snaps.length) ausrueck = einAbschnitt(hofPerle, halte[0]);
      if (halte[halte.length - 1].snaps.length) einrueck = einAbschnitt(halte[halte.length - 1], hofPerle);
    }
    const vollstaendig = streckeVollstaendig(strecke);
    const { stuecke: _s, ...ohneStuecke } = strecke;
    varianten.push({ id: v.id, strecke: ohneStuecke, vollstaendig, ausrueck, einrueck, start: null, ziel: null });
    intern.push({ v, strecke, standzeit: halte.map((p) => p.standzeitS), start, ziel, ausrueck, einrueck });
  }

  const ort = orte(intern.flatMap((x) => [x.start, x.ziel].filter((h): h is HaltDaten => !!h)), cfg);
  intern.forEach((x, i) => {
    varianten[i].start = x.start ? { ort: ort.get(x.start.id)!, name: x.start.name } : null;
    varianten[i].ziel = x.ziel ? { ort: ort.get(x.ziel.id)!, name: x.ziel.name } : null;
  });
  const tage = Object.fromEntries(PLAN_TAGE.map((t) => [t, leererTag()])) as Record<PlanTag, TagesPlan>;
  if (!a.aktiv) return { linieId: a.linieId, varianten, tage };
  for (const tag of PLAN_TAGE) {
    const fahrten: Fahrt[] = [];
    for (const x of intern) if (streckeVollstaendig(x.strecke)) fahrten.push(...erzeugeFahrten(x.v, x.strecke.abschnitte, x.standzeit, tag, cfg));
    fahrten.sort((p, q) => p.abfahrtS - q.abfahrtS || p.variante - q.variante || p.schluessel.localeCompare(q.schluessel));
    const jeVariante = new Map(intern.map((x) => [x.v.id, x]));
    const fuerUmlauf: UmlaufFahrt[] = fahrten
      .filter((f) => f.status !== "gestrichen")
      .map((f) => {
        const x = jeVariante.get(f.variante)!;
        return { variante: f.variante, schluessel: f.schluessel, abfahrtS: f.abfahrtS, ankunftS: f.ankunftS, startOrt: ort.get(x.start!.id)!, zielOrt: ort.get(x.ziel!.id)!, wendezeitS: x.v.wendezeitS };
      });
    const umlaeufe: UmlaufPlan[] = verkette(fuerUmlauf).map((u) => {
      const ar = jeVariante.get(u.fahrten[0].variante)!.ausrueck;
      const er = jeVariante.get(u.fahrten[u.fahrten.length - 1].variante)!.einrueck;
      const fa = ar ? abschnittZeitS(ar, tag, u.beginnS, cfg) : 0;
      // Einrücken: Faktor zur Ankunft an der letzten Haltestelle (A3c-9)
      const fe = er ? abschnittZeitS(er, tag, u.endeS, cfg) : 0;
      return { ...u, ausrueck: ar ? { abHofS: u.beginnS - fa, fahrzeitS: fa } : null, einrueck: er ? { anHofS: u.endeS + fe, fahrzeitS: fe } : null };
    });
    tage[tag] = { fahrten, umlaeufe, busbedarf: umlaeufe.length };
  }
  return { linieId: a.linieId, varianten, tage };
}
