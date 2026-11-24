import type { RoadsConfig } from "../config";
import { sliceLine, type LonLat } from "./geo";
import type { RoadEdge, RoadNetwork } from "./roads";

/** Lage eines Punktes (zum Beispiel einer Haltestelle) auf einem gerichteten Abschnitt. */
export interface Snap {
  edge: number;
  /** Anteil 0..1 entlang des Abschnitts. */
  t: number;
  dist: number;
  point: LonLat;
}

export interface Route {
  edges: number[];
  lengthM: number;
  timeS: number;
  coords: LonLat[];
}

export function fahrzeitS(e: RoadEdge): number {
  return e.lengthM / (e.speedKmh / 3.6);
}

/** Zeit für die volle Durchfahrt inklusive Ampeln und Kreuzung am Ende. */
export function vollzeitS(e: RoadEdge, cfg: RoadsConfig): number {
  return fahrzeitS(e) + e.signals * cfg.ampelZuschlagS + (e.junctionAtEnd ? cfg.kreuzungZuschlagS : 0);
}

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

/** Darf ein Bus von Abschnitt a nach b abbiegen? Wenden nur in Sackgassen, Abbiegeverbote gelten. */
export function turnAllowed(net: RoadNetwork, a: number, b: number): boolean {
  const ea = net.edges[a];
  if (net.forbidden[a]?.includes(b)) return false;
  if (ea.twin === b) {
    // Wenden nur, wenn es keinen anderen Weg gibt
    return net.outEdges[ea.to].every((o) => o === b || net.forbidden[a]?.includes(o));
  }
  return true;
}

/**
 * Schnellste Route zwischen zwei Punkten auf dem Netz (Dijkstra über Abschnitte, damit Abbiegeregeln gelten).
 * Start und Ziel können mehrere mögliche Abschnitte haben (beide Fahrtrichtungen einer Straße).
 */
export function findRoute(net: RoadNetwork, from: Snap[], to: Snap[], cfg: RoadsConfig): Route | null {
  if (!from.length || !to.length) return null;
  const E = net.edges.length;
  const g = new Float64Array(E).fill(Infinity);
  const prev = new Int32Array(E).fill(-1);
  const startOf = new Map<number, Snap>();
  const heap = new Heap();
  for (const s of from) {
    const e = net.edges[s.edge];
    const c = (1 - s.t) * fahrzeitS(e) + e.signals * cfg.ampelZuschlagS + (e.junctionAtEnd ? cfg.kreuzungZuschlagS : 0);
    if (c < g[s.edge]) {
      g[s.edge] = c;
      startOf.set(s.edge, s);
      heap.push(c, s.edge);
    }
  }
  const ziel = new Map<number, Snap>();
  for (const z of to) ziel.set(z.edge, z);

  let best = Infinity;
  let bestEnd: { last: number; snap: Snap; direct?: Snap } | null = null;
  // gleicher Abschnitt, Ziel liegt hinter dem Start
  for (const s of from)
    for (const z of to)
      if (s.edge === z.edge && z.t >= s.t) {
        const c = (z.t - s.t) * fahrzeitS(net.edges[s.edge]);
        if (c < best) {
          best = c;
          bestEnd = { last: -1, snap: z, direct: s };
        }
      }

  while (heap.size) {
    const [c, e] = heap.pop();
    if (c > g[e] || c >= best) continue;
    const edge = net.edges[e];
    for (const o of net.outEdges[edge.to]) {
      if (!turnAllowed(net, e, o)) continue;
      const z = ziel.get(o);
      if (z) {
        const arrive = c + z.t * fahrzeitS(net.edges[o]);
        if (arrive < best) {
          best = arrive;
          bestEnd = { last: e, snap: z };
        }
      }
      const nc = c + vollzeitS(net.edges[o], cfg);
      if (nc < g[o]) {
        g[o] = nc;
        prev[o] = e;
        heap.push(nc, o);
      }
    }
  }
  if (!bestEnd) return null;

  if (bestEnd.direct) {
    const e = net.edges[bestEnd.direct.edge];
    return {
      edges: [e.id],
      lengthM: (bestEnd.snap.t - bestEnd.direct.t) * e.lengthM,
      timeS: best,
      coords: sliceLine(e.coords, bestEnd.direct.t, bestEnd.snap.t),
    };
  }
  const chain: number[] = [];
  for (let e = bestEnd.last; e !== -1; e = prev[e]) chain.unshift(e);
  const s = startOf.get(chain[0])!;
  const zEdge = net.edges[bestEnd.snap.edge];
  let lengthM = (1 - s.t) * net.edges[chain[0]].lengthM + bestEnd.snap.t * zEdge.lengthM;
  const coords: LonLat[] = [...sliceLine(net.edges[chain[0]].coords, s.t, 1)];
  for (let i = 1; i < chain.length; i++) {
    const e = net.edges[chain[i]];
    lengthM += e.lengthM;
    coords.push(...e.coords.slice(1));
  }
  coords.push(...sliceLine(zEdge.coords, 0, bestEnd.snap.t).slice(1));
  return { edges: [...chain, zEdge.id], lengthM, timeS: best, coords };
}
