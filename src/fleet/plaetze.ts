import type { BetriebshofConfig } from "../config";
import { analysiereHof, hallenPlaetze, type HofAnalyse } from "../depot/analyse";
import { passtBus, platzbedarf, type Betriebshof, type BusMass, type HofKontext } from "../depot/hof";
import { SEITEN, seitenTiefe } from "../depot/rechteck";

/** Platz eines Busses im Betriebshof: ein Stellplatz (ein Bus) oder ein Platz in einer Halle. */
export interface PlatzRef {
  art: "stellplatz" | "halle";
  /** Id des Bauteils. */
  id: number;
}

export interface Belegung {
  busId: number;
  platz: PlatzRef;
  mass: BusMass;
}

export interface FreierPlatz {
  platz: PlatzRef;
  /** Fläche des Platzes in m² (Hallenplatz: Platzbreite des Busses mal Hallentiefe). Bestimmt "kleinster passender Platz". */
  flaecheM2: number;
}

const gleich = (a: PlatzRef, b: PlatzRef) => a.art === b.art && a.id === b.id;

/** Größte Maße einer Gruppe von Bussen (für die Halle: alle Plätze nebeneinander in der Breite des größten). */
function groesste(busse: BusMass[]): BusMass {
  return { laengeM: Math.max(...busse.map((b) => b.laengeM)), breiteM: Math.max(...busse.map((b) => b.breiteM)) };
}

/** Tiefe der Halle auf der Seite mit Zufahrt, die für diesen Bus reicht (kleinste solche Tiefe). */
function hallenTiefe(halle: { x: number; y: number; b: number; t: number }, a: HofAnalyse, id: number, bus: BusMass, cfg: BetriebshofConfig): number {
  const p = platzbedarf(bus, cfg);
  const zug = a.zugang.get(id) ?? [];
  const tiefen = SEITEN.filter((s) => zug.some((k) => k.seite === s) && seitenTiefe(halle, s) >= p.lang - 1e-9).map((s) => seitenTiefe(halle, s));
  return tiefen.length ? Math.min(...tiefen) : Math.max(halle.b, halle.t);
}

/**
 * Freie Plätze, auf die der Bus passt, kleinster zuerst (Annahme A3-20).
 * Stellplatz: erreichbar, frei, Bus passt (passtBus). Halle: erreichbar und nach dem Einstellen reichen die Plätze
 * für alle Busse darin, gerechnet mit den größten Maßen der Busse in der Halle (Annahme A3-21).
 */
export function freiePlaetze(hof: Betriebshof, a: HofAnalyse, belegung: Belegung[], bus: BusMass, cfg: BetriebshofConfig, ohneBusId?: number): FreierPlatz[] {
  const andere = belegung.filter((b) => b.busId !== ohneBusId);
  const out: FreierPlatz[] = [];
  for (const b of hof.bauteile) {
    if (!a.verbunden.has(b.id)) continue;
    if (b.typ === "stellplatz") {
      if (andere.some((x) => gleich(x.platz, { art: "stellplatz", id: b.id }))) continue;
      if (passtBus(bus, b, cfg)) out.push({ platz: { art: "stellplatz", id: b.id }, flaecheM2: b.b * b.t });
    } else if (b.typ === "halle") {
      const drin = andere.filter((x) => gleich(x.platz, { art: "halle", id: b.id })).map((x) => x.mass);
      const alle = [...drin, bus];
      if (hallenPlaetze(b, a.zugang.get(b.id) ?? [], groesste(alle), cfg) >= alle.length) {
        out.push({ platz: { art: "halle", id: b.id }, flaecheM2: platzbedarf(bus, cfg).kurz * hallenTiefe(b, a, b.id, bus, cfg) });
      }
    }
  }
  return out.sort((p, q) => p.flaecheM2 - q.flaecheM2 || p.platz.id - q.platz.id);
}

/** Ist der Platz für diesen Bus frei und passend? */
export function platzFrei(hof: Betriebshof, a: HofAnalyse, belegung: Belegung[], bus: BusMass, platz: PlatzRef, cfg: BetriebshofConfig, ohneBusId?: number): boolean {
  return freiePlaetze(hof, a, belegung, bus, cfg, ohneBusId).some((f) => gleich(f.platz, platz));
}

/**
 * Haben nach einer Änderung des Hofs noch alle Busse einen gültigen Platz? Prüft jeden Bus gegen den Hof ohne ihn
 * selbst. Wird vor dem Abriss verwendet: Ein Bauteil, ohne das ein Bus keinen gültigen Platz mehr hätte, bleibt stehen.
 */
export function alleBusseHabenPlatz(hof: Betriebshof, a: HofAnalyse, belegung: Belegung[], cfg: BetriebshofConfig): boolean {
  return belegung.every((b) => platzFrei(hof, a, belegung, b.mass, b.platz, cfg, b.busId));
}

/** Darf das Bauteil abgerissen werden? Nein, wenn danach ein Bus keinen gültigen Platz mehr hätte (Annahme A3-22). */
export function abrissErlaubt(hof: Betriebshof, bauteilId: number, belegung: Belegung[], ctx: HofKontext): boolean {
  if (!belegung.length) return true;
  const probe: Betriebshof = { ...hof, bauteile: hof.bauteile.filter((x) => x.id !== bauteilId) };
  return alleBusseHabenPlatz(probe, analysiereHof(probe, ctx), belegung, ctx.cfg);
}
