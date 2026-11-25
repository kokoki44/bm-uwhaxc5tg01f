import type { BetriebshofConfig } from "../config";
import type { HofAnalyse } from "./analyse";
import { BEFAHRBAR, BUSANLAGE, BUSPLATZ, type Bauteil, type Betriebshof } from "./hof";
import { seitenTiefe } from "./rechteck";

/** Weg eines Busses vom Tor zu einem Bauteil, auf dem 1-m-Raster über Tor und Fahrwege. */
export interface Weg {
  laengeM: number;
  fahrzeitS: number;
  /** Punkte in Hofkoordinaten (m), vom Tor (Grundstücksrand) bis zur Mitte des Bauteils. */
  punkte: [number, number][];
}

/** Pauschalwerte für hohen Zeitraffer: mittlere Fahrzeit vom Tor je Art des Ziels (null, wenn es keins gibt). */
export interface HofPauschal {
  zumAbstellplatzS: number | null;
  zurWerkstattS: number | null;
  zurWaschanlageS: number | null;
  zurTankstelleS: number | null;
  zumLadeplatzS: number | null;
}

export interface HofWege {
  je: Map<number, Weg>;
  pauschal: HofPauschal;
}

const SQRT2 = Math.SQRT2;

/** Kleiner Binärheap für Dijkstra. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.k, v = this.v;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Busse folgen echten Wegen auf dem Raster: kürzeste Wege vom Tor über Tor- und Fahrwegflächen (8 Richtungen). */
export function berechneWege(hof: Betriebshof, a: HofAnalyse, cfg: BetriebshofConfig): HofWege {
  const f = hof.grundstueck.flaeche;
  const W = f.b, H = f.t;
  // Je Rasterzelle die Fahrfläche, zu der sie gehört (0 = nicht befahrbar)
  const fahrbar = new Int32Array(W * H);
  for (const d of hof.bauteile) {
    if (!BEFAHRBAR.includes(d.typ) || !a.verbunden.has(d.id)) continue;
    for (let j = d.y - f.y; j < d.y - f.y + d.t; j++) for (let i = d.x - f.x; i < d.x - f.x + d.b; i++) fahrbar[j * W + i] = d.id;
  }
  // Übergang zwischen zwei Fahrflächen nur, wenn sie breit genug verbunden sind (wie in der Prüfung des Layouts)
  const verbundenPaar = new Set<string>();
  for (const [id, ns] of a.fahrNachbarn) for (const n of ns) verbundenPaar.add(`${id},${n}`);
  const darf = (p: number, q: number) => fahrbar[p] === fahrbar[q] || verbundenPaar.has(`${fahrbar[p]},${fahrbar[q]}`);
  const dist = new Float64Array(W * H).fill(Infinity);
  const vor = new Int32Array(W * H).fill(-1);
  const heap = new Heap();
  // Start: Rasterzellen des Tors am Grundstücksrand (halbe Zelle vom Rand)
  for (const [id, s] of a.torSeite) {
    const t = hof.bauteile.find((b) => b.id === id)!;
    const zellen: [number, number][] = [];
    const i0 = t.x - f.x, j0 = t.y - f.y;
    if (s === "n" || s === "s") for (let i = i0; i < i0 + t.b; i++) zellen.push([i, s === "n" ? j0 : j0 + t.t - 1]);
    else for (let j = j0; j < j0 + t.t; j++) zellen.push([s === "w" ? i0 : i0 + t.b - 1, j]);
    for (const [i, j] of zellen) {
      const n = j * W + i;
      if (dist[n] > 0.5) {
        dist[n] = 0.5;
        heap.push(0.5, n);
      }
    }
  }
  while (heap.size) {
    const [d, n] = heap.pop();
    if (d > dist[n]) continue;
    const i = n % W, j = (n - i) / W;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const x = i + di, y = j + dj;
        if (x < 0 || y < 0 || x >= W || y >= H || !fahrbar[y * W + x]) continue;
        const m = y * W + x;
        if (!darf(n, m)) continue;
        // diagonal nur, wenn beide Nachbarzellen befahrbar und erlaubt sind (keine Ecken schneiden)
        const a1 = j * W + x, a2 = y * W + i;
        if (di && dj && (!fahrbar[a1] || !fahrbar[a2] || !darf(n, a1) || !darf(n, a2) || !darf(a1, m) || !darf(a2, m))) continue;
        const nd = d + (di && dj ? SQRT2 : 1);
        if (nd < dist[m] - 1e-12) {
          dist[m] = nd;
          vor[m] = n;
          heap.push(nd, m);
        }
      }
  }

  const ms = cfg.hofGeschwindigkeitKmh / 3.6;
  const je = new Map<number, Weg>();
  for (const b of hof.bauteile) {
    if (!a.verbunden.has(b.id) || !(BUSPLATZ.includes(b.typ) || BUSANLAGE.includes(b.typ) || b.typ === "halle")) continue;
    const w = wegZu(b);
    if (w) je.set(b.id, w);
  }

  function wegZu(b: Bauteil): Weg | null {
    let best = Infinity, bestZelle = -1, bestTiefe = 0, bestSeite = "n";
    for (const k of a.zugang.get(b.id) ?? []) {
      // Stell- und Ladeplätze nur über die Stirnseite
      if (BUSPLATZ.includes(b.typ) && (b.b < b.t ? k.seite === "w" || k.seite === "o" : b.b > b.t ? k.seite === "n" || k.seite === "s" : false)) continue;
      const tiefe = seitenTiefe(b, k.seite);
      for (let p = Math.round(k.von); p < Math.round(k.bis); p++) {
        const i = k.seite === "n" || k.seite === "s" ? p - f.x : k.seite === "w" ? b.x - f.x - 1 : b.x + b.b - f.x;
        const j = k.seite === "w" || k.seite === "o" ? p - f.y : k.seite === "n" ? b.y - f.y - 1 : b.y + b.t - f.y;
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const d = dist[j * W + i] + 0.5 + tiefe / 2;
        if (d < best) (best = d), (bestZelle = j * W + i), (bestTiefe = tiefe), (bestSeite = k.seite);
      }
    }
    if (!Number.isFinite(best)) return null;
    const punkte: [number, number][] = [];
    for (let n = bestZelle; n >= 0; n = vor[n]) punkte.push([f.x + (n % W) + 0.5, f.y + Math.floor(n / W) + 0.5]);
    punkte.reverse();
    // Anfang am Grundstücksrand, Ende in der Mitte des Bauteils
    const [sx, sy] = punkte[0];
    const s0 = [...a.torSeite.values()].length ? nahesterRand(sx, sy) : null;
    if (s0) punkte.unshift(s0);
    const [ex, ey] = punkte[punkte.length - 1];
    const halbe = 0.5 + bestTiefe / 2;
    punkte.push(bestSeite === "n" ? [ex, ey + halbe] : bestSeite === "s" ? [ex, ey - halbe] : bestSeite === "w" ? [ex + halbe, ey] : [ex - halbe, ey]);
    return { laengeM: best, fahrzeitS: best / ms, punkte };
  }

  function nahesterRand(x: number, y: number): [number, number] {
    const opts: [number, [number, number]][] = [
      [y - f.y, [x, f.y]], [f.y + f.t - y, [x, f.y + f.t]], [x - f.x, [f.x, y]], [f.x + f.b - x, [f.x + f.b, y]],
    ];
    return opts.sort((p, q) => p[0] - q[0])[0][1];
  }

  const mittel = (typen: string[]) => {
    const z = hof.bauteile.filter((b) => typen.includes(b.typ) && je.has(b.id)).map((b) => je.get(b.id)!.fahrzeitS);
    return z.length ? z.reduce((s, v) => s + v, 0) / z.length : null;
  };
  return {
    je,
    pauschal: {
      zumAbstellplatzS: mittel(["stellplatz", "halle"]),
      zurWerkstattS: mittel(["werkstatt"]),
      zurWaschanlageS: mittel(["waschanlage"]),
      zurTankstelleS: mittel(["tankstelle"]),
      zumLadeplatzS: mittel(["ladeplatz"]),
    },
  };
}
