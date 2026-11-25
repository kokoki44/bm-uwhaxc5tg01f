import type { Map as MapLibreMap } from "maplibre-gl";
import type { Bus } from "../catalog/katalog";
import { config, PLAN_TAGE, type PlanTag } from "../config";
import { analysiereHof } from "../depot/analyse";
import { fahrtZeiten } from "../linien/fahrplan";
import { Haltestellen, loesePerlenAuf, planAnfrage } from "../linien/linien";
import type { LinienPlan, PlanAnfrage, VariantenPlan } from "../linien/plan";
import type { HaltId, Linie, Perle } from "../linien/typen";
import { setzeKartenklick, zeigeAuswahl, zeigeHaltestellen, zeigeLinien } from "../map/linienkarte";
import type { Simulation } from "../sim/client";
import { LocalProj, pointInRings, projectOnLine, type LonLat } from "../world/geo";
import type { Snap } from "../world/router";
import { torAnbindung } from "../world/standorte";
import { istFreigeschaltet } from "../world/unlock";
import type { World } from "../world/world";
import { aktualisiereFenster, type SpielUi } from "./spielui";

/** Alles, was die Fenster des Linienbereichs brauchen. */
export interface LinienUi extends SpielUi {
  map: MapLibreMap;
  world: World;
  sim: Simulation;
  modelle: Map<string, Bus>;
  halte: Haltestellen;
  /** Zuletzt berechnete Pläne je Linie. */
  plaene: Map<number, LinienPlan>;
}

const L = config.linien;
/** Die Grundlinie wird als Variante 0 mitberechnet, damit der Editor ihre Route und Lücken zeigen kann. */
export const GRUNDLINIE = 0;

let lu: LinienUi | null = null;
const stand = new Map<number, number>();
const fehler = new Map<number, string>();

/** Fehler der letzten Berechnung je Linie (Worker hat abgelehnt), sonst undefined. */
export const berechnungsFehler = (linieId: number): string | undefined => fehler.get(linieId);

export function baueLinienUi(basis: Omit<LinienUi, "halte" | "plaene">): LinienUi {
  lu = { ...basis, halte: new Haltestellen(basis.world.stops, basis.spiel.netz), plaene: new Map() };
  return lu;
}

export const linienUi = (): LinienUi => {
  if (!lu) throw new Error("Linienbereich nicht bereit");
  return lu;
};

/** Liegt ein Punkt in einem freigeschalteten Gebiet? Nur dort darf eine Linie halten (Durchfahrt ohne Halt). */
export function freigeschaltet(u: LinienUi, p: LonLat): boolean {
  return u.world.gebiete.some((g) => istFreigeschaltet(u.spiel.freischaltungen, g.id) && pointInRings(p, g.rings));
}

/** Anschluss des Betriebshofs ans Straßennetz für die Ausrückfahrt (Mitte der Torseite, beide Fahrtrichtungen). */
export function hofAnschluss(u: LinienUi): Snap[] | null {
  const hof = u.spiel.betriebshof;
  if (!hof) return null;
  const a = analysiereHof(hof, u.k.hof);
  for (const [id, seite] of a.torSeite) {
    const t = torAnbindung(hof, id, seite, u.world.network, config.grundstueck);
    if (!t) continue;
    const e = u.world.network.edges[t.edge];
    const b = u.world.bbox;
    const pr = projectOnLine(t.punkt, e.coords, new LocalProj((b[0] + b[2]) / 2, (b[1] + b[3]) / 2));
    const snaps: Snap[] = [{ edge: e.id, t: pr.t, dist: 0, point: pr.point }];
    if (e.twin >= 0) snaps.push({ edge: e.twin, t: 1 - pr.t, dist: 0, point: pr.point });
    return snaps;
  }
  return null;
}

const leererTakt = () => Object.fromEntries(PLAN_TAGE.map((t) => [t, []])) as unknown as Record<PlanTag, never[]>;

/** Anfrage mit der Grundlinie als Variante 0. */
export function anfrage(u: LinienUi, l: Linie): PlanAnfrage {
  const a = planAnfrage(l, u.halte, hofAnschluss(u));
  a.varianten.unshift({ id: GRUNDLINIE, perlen: loesePerlenAuf(l.perlen, u.halte), wendezeitS: 0, takt: leererTakt(), eigenerFerientakt: { werktag: false, samstag: false, sonnFeiertag: false }, aenderungen: [] });
  return a;
}

/** Varianten des Plans ohne die Grundlinie. */
export const variantenPlaene = (p: LinienPlan | undefined): VariantenPlan[] => (p?.varianten ?? []).filter((v) => v.id !== GRUNDLINIE);

/**
 * Berechnet eine Linie (oder alle) im Simulations-Worker neu. Danach werden Karte und offene Fenster aktualisiert.
 * Antworten auf ältere Anfragen werden verworfen.
 */
export async function berechne(linieId?: number): Promise<void> {
  const u = linienUi();
  const linien = u.spiel.netz.linien.filter((l) => linieId === undefined || l.id === linieId);
  if (linieId === undefined) for (const id of [...u.plaene.keys()]) if (!u.spiel.netz.linien.some((l) => l.id === id)) u.plaene.delete(id);
  await Promise.all(
    linien.map(async (l) => {
      const nr = (stand.get(l.id) ?? 0) + 1;
      stand.set(l.id, nr);
      try {
        const p = await u.sim.plane(anfrage(u, l));
        if (stand.get(l.id) === nr && u.spiel.netz.linien.some((x) => x.id === l.id)) {
          u.plaene.set(l.id, p);
          fehler.delete(l.id);
        }
      } catch (e) {
        // Der Worker hat die Anfrage abgelehnt: alter Plan bleibt, die Linienliste meldet es
        fehler.set(l.id, String(e instanceof Error ? e.message : e));
      }
    }),
  );
  if (linieId !== undefined && !u.spiel.netz.linien.some((l) => l.id === linieId)) u.plaene.delete(linieId);
  zeichneKarte();
  aktualisiereFenster();
}

/** Auswahl für die Hervorhebung auf der Karte: Linie und Variante (Grundlinie = 0). */
let auswahl: { linie: number; variante: number } | null = null;

export function waehleAus(linie: number | null, variante = GRUNDLINIE): void {
  auswahl = linie === null ? null : { linie, variante };
  zeichneKarte();
}

export const ausgewaehlt = () => auswahl;

/** Linien, Hervorhebung und Haltestellen auf der Karte neu zeichnen. */
export function zeichneKarte(): void {
  const u = linienUi();
  zeigeHaltestellen(u.map, u.halte.alle().map((h) => ({ id: h.id, name: h.name, coord: h.coord, neu: u.halte.istNeu(h.id) })));
  zeigeLinien(
    u.map,
    u.spiel.netz.linien.map((l) => ({ nummer: l.nummer, farbe: l.farbe, aktiv: l.aktiv, routen: variantenPlaene(u.plaene.get(l.id)).map((v) => v.strecke.coords) })),
  );
  const l = auswahl ? u.spiel.netz.linien.find((x) => x.id === auswahl!.linie) : undefined;
  if (!l) {
    zeigeAuswahl(u.map, null, [], "#000000");
    return;
  }
  const v = auswahl!.variante === GRUNDLINIE ? null : l.varianten.find((x) => x.id === auswahl!.variante);
  const perlen: Perle[] = v ? v.perlen : l.perlen;
  const route = u.plaene.get(l.id)?.varianten.find((x) => x.id === (v ? v.id : GRUNDLINIE))?.strecke.coords ?? null;
  zeigeAuswahl(u.map, route, loesePerlenAuf(perlen, u.halte).map((p) => ({ coord: p.coord, art: p.halt ? ("halt" as const) : ("weg" as const) })), l.farbe);
}

/* ---------- Werkzeuge für Klicks auf die Karte ---------- */

export type Werkzeug = "halt" | "neu" | "weg" | "aus";

export interface WerkzeugZiel {
  /** Fenster, zu dem das Werkzeug gehört; schließt es, endet das Werkzeug. */
  fenster: string;
  werkzeug: Werkzeug;
  /** Klick auf eine vorhandene Haltestelle. */
  halt(id: HaltId): void;
  /** Klick auf die Karte außerhalb einer Haltestelle (neue Haltestelle oder Wegpunkt). */
  punkt(p: LonLat): void;
}

let ziel: WerkzeugZiel | null = null;

export function setzeWerkzeug(z: WerkzeugZiel | null): void {
  ziel = z && z.werkzeug !== "aus" ? z : null;
  const u = linienUi();
  setzeKartenklick(u.map, ziel && (ziel.werkzeug === "neu" || ziel.werkzeug === "weg") ? (p) => pruefeZiel()?.punkt(p) : null);
}

/** Werkzeug nur, solange sein Fenster offen ist. */
function pruefeZiel(): WerkzeugZiel | null {
  if (ziel && !document.querySelector(`[data-testid="fenster-${ziel.fenster}"]`)) setzeWerkzeug(null);
  return ziel;
}

export const werkzeug = (): WerkzeugZiel | null => pruefeZiel();

/** Klick auf eine Haltestelle der Karte: gehört er einem Werkzeug, liefert die Funktion true. */
export function haltKlick(id: HaltId): boolean {
  const z = pruefeZiel();
  if (!z || z.werkzeug !== "halt") return false;
  z.halt(id);
  return true;
}

/** Fahrzeit einer Variante über den Tag (Werktag): kleinster und größter Wert über die vollen Stunden des Betriebstags. */
export function fahrzeitSpanne(v: VariantenPlan, standzeitS: number[], tag: PlanTag = "werktag"): [number, number] | null {
  if (!v.vollstaendig) return null;
  let a = Infinity, b = -Infinity;
  for (let h = L.betriebstagBeginnH; h < 24 + L.betriebstagBeginnH; h++) {
    const z = fahrtZeiten(v.strecke.abschnitte, standzeitS, tag, h * 3600, L);
    const d = z[z.length - 1][0] - h * 3600;
    a = Math.min(a, d);
    b = Math.max(b, d);
  }
  return [a, b];
}
