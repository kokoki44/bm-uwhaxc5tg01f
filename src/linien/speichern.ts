import { PLAN_TAGE, type PlanTag } from "../config";
import { projectOnLine, type LocalProj, type LonLat } from "../world/geo";
import type { RoadNetwork } from "../world/roads";
import type { Snap } from "../world/router";
import type { FahrtAenderung, Linie, Netz, NeueHaltestelle, Perle, TaktZeile, Variante } from "./typen";

/** Laden des Liniennetzes aus dem Spielstand. Wirft bei jedem Fehler NetzLadeFehler. */
export class NetzLadeFehler extends Error {}

const zahl = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ganz = (v: unknown): v is number => Number.isInteger(v);
const text = (v: unknown): v is string => typeof v === "string";
const fehler = (was: string, o: unknown): never => {
  throw new NetzLadeFehler(`${was} ungültig: ${JSON.stringify(o)?.slice(0, 200)}`);
};

function punkt(p: unknown): LonLat {
  if (!Array.isArray(p) || p.length !== 2 || !zahl(p[0]) || !zahl(p[1])) fehler("Koordinate", p);
  return [(p as number[])[0], (p as number[])[1]];
}

function snaps(s: unknown): Snap[] {
  if (!Array.isArray(s)) fehler("Netzanschluss", s);
  return (s as Snap[]).map((x) => {
    if (!x || !ganz(x.edge) || !zahl(x.t) || !zahl(x.dist)) fehler("Netzanschluss", x);
    return { edge: x.edge, t: x.t, dist: x.dist, point: punkt(x.point) };
  });
}

function perle(p: Perle): Perle {
  if (p?.art === "halt" && text(p.halt) && ganz(p.standzeitS) && p.standzeitS >= 0) return { art: "halt", halt: p.halt, standzeitS: p.standzeitS };
  if (p?.art === "weg") return { art: "weg", coord: punkt(p.coord), snaps: snaps(p.snaps) };
  return fehler("Perle", p);
}

function taktZeile(z: TaktZeile): TaktZeile {
  if (!z || !ganz(z.vonMin) || !ganz(z.bisMin) || !ganz(z.taktMin) || z.taktMin <= 0) fehler("Taktzeile", z);
  return { vonMin: z.vonMin, bisMin: z.bisMin, taktMin: z.taktMin };
}

function aenderung(a: FahrtAenderung): FahrtAenderung {
  if (!a || !PLAN_TAGE.includes(a.tag)) fehler("Fahrtänderung", a);
  if (a.art === "verschieben" && ganz(a.ursprungS) && ganz(a.neuS)) return { art: a.art, tag: a.tag, ursprungS: a.ursprungS, neuS: a.neuS };
  if (a.art === "streichen" && ganz(a.ursprungS)) return { art: a.art, tag: a.tag, ursprungS: a.ursprungS };
  if (a.art === "zusatz" && ganz(a.id) && ganz(a.abfahrtS)) return { art: a.art, tag: a.tag, id: a.id, abfahrtS: a.abfahrtS };
  return fehler("Fahrtänderung", a);
}

function variante(v: Variante): Variante {
  if (!v || !ganz(v.id) || !["hin", "rueck", "kurz"].includes(v.art) || !text(v.name) || !Array.isArray(v.perlen) || !ganz(v.wendezeitS) || !v.takt || !v.eigenerFerientakt || !Array.isArray(v.aenderungen)) fehler("Variante", v);
  const takt = {} as Record<PlanTag, TaktZeile[]>;
  for (const t of PLAN_TAGE) {
    if (!Array.isArray(v.takt[t])) fehler("Takt", v.takt);
    takt[t] = v.takt[t].map(taktZeile);
  }
  const e = v.eigenerFerientakt;
  if (![e.werktag, e.samstag, e.sonnFeiertag].every((x) => typeof x === "boolean")) fehler("Ferientakt", e);
  return { id: v.id, art: v.art, name: v.name, perlen: v.perlen.map(perle), wendezeitS: v.wendezeitS, takt, eigenerFerientakt: { werktag: e.werktag, samstag: e.samstag, sonnFeiertag: e.sonnFeiertag }, aenderungen: v.aenderungen.map(aenderung) };
}

function linie(l: Linie): Linie {
  if (!l || !ganz(l.id) || !text(l.nummer) || !text(l.name) || !/^#[0-9a-f]{6}$/i.test(l.farbe) || typeof l.aktiv !== "boolean" || !Array.isArray(l.perlen) || !Array.isArray(l.varianten) || !Array.isArray(l.busse) || !l.busse.every(ganz))
    fehler("Linie", l);
  return { id: l.id, nummer: l.nummer, name: l.name, farbe: l.farbe, aktiv: l.aktiv, perlen: l.perlen.map(perle), varianten: l.varianten.map(variante), busse: [...l.busse] };
}

function neueHalt(h: NeueHaltestelle): NeueHaltestelle {
  if (!h || !text(h.id) || !/^n\d+$/.test(h.id) || !text(h.name)) fehler("Haltestelle", h);
  return { id: h.id, name: h.name, coord: punkt(h.coord), snaps: snaps(h.snaps) };
}

/**
 * Prüft gespeicherte Netzanschlüsse (Wegpunkte, neue Haltestellen) gegen das geladene Straßennetz. Karten werden nur
 * referenziert; passt ein Anschluss nicht mehr (Abschnitt fehlt oder liegt weiter als der Fangradius vom gespeicherten
 * Punkt), fällt er weg. Die Perle gilt dann als "nicht am Busnetz" und der Editor meldet es. Liefert die Zahl der
 * entfernten Anschlüsse.
 */
export function bereinigeAnschluesse(netz: Netz, net: RoadNetwork, proj: LocalProj, fangradiusM: number): number {
  let weg = 0;
  const pruefe = (s: Snap[]): Snap[] => {
    const ok = s.filter((x) => {
      const e = net.edges[x.edge];
      return !!e && projectOnLine(x.point, e.coords, proj).dist <= fangradiusM;
    });
    weg += s.length - ok.length;
    return ok;
  };
  for (const h of netz.neueHaltestellen) h.snaps = pruefe(h.snaps);
  for (const l of netz.linien) for (const p of [l.perlen, ...l.varianten.map((v) => v.perlen)]) for (const x of p) if (x.art === "weg") x.snaps = pruefe(x.snaps);
  return weg;
}

/**
 * Lädt und prüft das Liniennetz. Mit `busIds` werden Zuweisungen auf Busse entfernt, die es nicht mehr gibt.
 * Eindeutigkeit von Ids, Liniennummern und Busszuweisungen wird geprüft.
 */
export function ladeNetz(o: unknown, busIds?: ReadonlySet<number>): Netz {
  const n = o as Netz;
  if (n?.version !== 1) throw new NetzLadeFehler(`Unbekannte Version des Liniennetzes: ${String(n?.version)}`);
  if (!Array.isArray(n.linien) || !Array.isArray(n.neueHaltestellen) || !n.namen || typeof n.namen !== "object") throw new NetzLadeFehler("Liniennetz unvollständig");
  if (![n.naechsteLinieId, n.naechsteVarianteId, n.naechsteHaltestelleId, n.naechsteZusatzId].every(ganz)) throw new NetzLadeFehler("Zähler fehlen");
  const linien = n.linien.map(linie);
  const halte = n.neueHaltestellen.map(neueHalt);
  const namen: Record<string, string> = {};
  for (const [k, v] of Object.entries(n.namen)) {
    if (!text(v)) fehler("Name", v);
    namen[k] = v;
  }
  const eindeutig = (xs: unknown[]) => new Set(xs).size === xs.length;
  if (!eindeutig(linien.map((l) => l.id)) || linien.some((l) => l.id >= n.naechsteLinieId)) throw new NetzLadeFehler("Linien-Ids doppelt oder zu groß");
  if (!eindeutig(linien.map((l) => l.nummer.toLowerCase()))) throw new NetzLadeFehler("Liniennummer doppelt");
  const varianten = linien.flatMap((l) => l.varianten.map((v) => v.id));
  if (!eindeutig(varianten) || varianten.some((id) => id >= n.naechsteVarianteId)) throw new NetzLadeFehler("Varianten-Ids doppelt oder zu groß");
  if (!eindeutig(halte.map((h) => h.id)) || halte.some((h) => Number(h.id.slice(1)) >= n.naechsteHaltestelleId)) throw new NetzLadeFehler("Haltestellen-Ids doppelt oder zu groß");
  const zusatz = linien.flatMap((l) => l.varianten.flatMap((v) => v.aenderungen.flatMap((a) => (a.art === "zusatz" ? [a.id] : []))));
  if (!eindeutig(zusatz) || zusatz.some((id) => id >= n.naechsteZusatzId)) throw new NetzLadeFehler("Ids zusätzlicher Fahrten doppelt oder zu groß");
  if (busIds) for (const l of linien) l.busse = l.busse.filter((b) => busIds.has(b));
  if (!eindeutig(linien.flatMap((l) => l.busse))) throw new NetzLadeFehler("Bus mehreren Linien zugewiesen");
  return { version: 1, linien, neueHaltestellen: halte, namen, naechsteLinieId: n.naechsteLinieId, naechsteVarianteId: n.naechsteVarianteId, naechsteHaltestelleId: n.naechsteHaltestelleId, naechsteZusatzId: n.naechsteZusatzId };
}
