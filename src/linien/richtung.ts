import type { RoadNetwork } from "../world/roads";
import { turnAllowed, type Snap } from "../world/router";
import type { HaltId } from "./typen";

export interface HaltLage {
  id: HaltId;
  name: string;
  snaps: Snap[];
}

/** Lage einer Haltestelle für Suche und Listen: Straße und nächste Haltestelle in Fahrtrichtung. */
export type Lage =
  | { art: "beide"; strasse: string }
  | { art: "richtung"; strasse: string; naechste: string }
  | { art: "strasse"; strasse: string };

/** Haltestellen je gerichtetem Abschnitt mit ihrer Lage t, für die Suche nach der nächsten Haltestelle. */
export class HaltIndex {
  private readonly jeKante = new Map<number, { t: number; id: HaltId; name: string }[]>();
  constructor(halte: readonly HaltLage[]) {
    for (const h of halte)
      for (const s of h.snaps) {
        const l = this.jeKante.get(s.edge) ?? [];
        l.push({ t: s.t, id: h.id, name: h.name });
        this.jeKante.set(s.edge, l);
      }
    for (const l of this.jeKante.values()) l.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  }
  auf(edge: number) {
    return this.jeKante.get(edge) ?? [];
  }
}

/**
 * Nächste Haltestelle in Fahrtrichtung, auf dem Netz vorwärts gesucht (Abbiegeregeln gelten, Wenden nur in Sackgassen).
 * Zuerst nur auf Abschnitten mit demselben Straßennamen, sonst auf allen Straßen. Haltestellen mit demselben Namen wie
 * die Start-Haltestelle (Gegenhaltestelle, zweiter Bussteig) zählen nicht. Gesucht wird höchstens `maxM` Meter weit.
 * Liefert den Namen oder null.
 */
export function naechsteHaltestelle(net: RoadNetwork, index: HaltIndex, start: HaltLage, maxM: number, nurStrasse: boolean): string | null {
  const s = start.snaps[0];
  if (!s) return null;
  const strasse = net.edges[s.edge].name;
  if (nurStrasse && !strasse) return null;
  const passt = (e: number) => !nurStrasse || net.edges[e].name === strasse;
  const fremd = (x: { name: string }) => x.name !== start.name && x.name !== "";
  // Auf dem Startabschnitt hinter dem Start
  const vorn = index.auf(s.edge).find((x) => x.t > s.t && fremd(x));
  if (vorn) return vorn.name;
  // Dijkstra über Abschnitte nach Entfernung
  const dist = new Map<number, number>([[s.edge, (1 - s.t) * net.edges[s.edge].lengthM]]);
  const offen: [number, number][] = [[dist.get(s.edge)!, s.edge]];
  let best: { d: number; name: string; id: HaltId } | null = null;
  while (offen.length) {
    offen.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const [d, e] = offen.shift()!;
    if (d > (dist.get(e) ?? Infinity) || d > maxM || (best && d >= best.d)) continue;
    for (const o of net.outEdges[net.edges[e].to]) {
      // Keine Umkehr (zum Beispiel durch einen Kreisverkehr zurück): Gegenrichtung schon befahrener Abschnitte bleibt zu
      const tw = net.edges[o].twin;
      if (!turnAllowed(net, e, o) || !passt(o) || (tw >= 0 && dist.has(tw))) continue;
      const h = index.auf(o).find(fremd);
      if (h) {
        const dh = d + h.t * net.edges[o].lengthM;
        if (dh <= maxM && (!best || dh < best.d || (dh === best.d && h.id < best.id))) best = { d: dh, name: h.name, id: h.id };
      }
      const nd = d + net.edges[o].lengthM;
      if (nd < (dist.get(o) ?? Infinity)) {
        dist.set(o, nd);
        offen.push([nd, o]);
      }
    }
  }
  return best?.name ?? null;
}

/** Lage einer Haltestelle: "beide Richtungen", "weiter Richtung X" (gleiche Straße, sonst nächste auf dem Netz) oder nur die Straße. */
export function haltLage(net: RoadNetwork, index: HaltIndex, h: HaltLage, maxM: number): Lage {
  const strasse = net.edges[h.snaps[0]?.edge]?.name ?? "";
  if (h.snaps.length > 1) return { art: "beide", strasse };
  const naechste = naechsteHaltestelle(net, index, h, maxM, true) ?? naechsteHaltestelle(net, index, h, maxM, false);
  return naechste ? { art: "richtung", strasse, naechste } : { art: "strasse", strasse };
}
