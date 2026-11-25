import type { RoadEdge, RoadNetwork } from "../../src/world/roads";
import type { Snap } from "../../src/world/router";
import type { Stop } from "../../src/world/stops";

/**
 * Kleines Netz mit genau bekannten Werten für Handrechnungen: Knoten 0 bis n-1 auf einer Geraden, je zwei Knoten durch
 * einen Abschnitt in beide Richtungen verbunden. Standard: 400 m bei 36 km/h (10 m/s), also 40 s reine Fahrzeit.
 * Vorwärtsabschnitt i: Knoten i nach i+1 (Id 2i), Rückwärtsabschnitt i: Knoten i+1 nach i (Id 2i+1).
 */
export function geradenNetz(n: number, opt: { laengeM?: number; kmh?: number; signale?: Record<number, number>; kreuzung?: number[]; klasse?: Record<number, string>; tempo?: Record<number, number> } = {}): RoadNetwork {
  const laenge = opt.laengeM ?? 400;
  const nodeCoords: [number, number][] = Array.from({ length: n }, (_, i) => [10 + i * 0.006, 53.7]);
  const edges: RoadEdge[] = [];
  for (let i = 0; i + 1 < n; i++) {
    for (const r of [0, 1]) {
      const id = 2 * i + r;
      const [a, b] = r === 0 ? [i, i + 1] : [i + 1, i];
      edges.push({
        id, from: a, to: b, wayId: 100 + i, cls: opt.klasse?.[id] ?? "residential", name: `Weg ${i}`, lengthM: laenge, speedKmh: opt.tempo?.[id] ?? opt.kmh ?? 36,
        signals: opt.signale?.[id] ?? 0, junctionAtEnd: opt.kreuzung?.includes(id) ?? false, twin: r === 0 ? id + 1 : id - 1, coords: [nodeCoords[a], nodeCoords[b]],
      });
    }
  }
  const outEdges: number[][] = nodeCoords.map(() => []);
  for (const e of edges) outEdges[e.from].push(e.id);
  return { nodeOsm: nodeCoords.map((_, i) => 1000 + i), nodeCoords, edges, outEdges, forbidden: {}, signalNodes: 0, restrictions: { applied: 0, skipped: 0 } };
}

/** Haltestelle auf Vorwärtsabschnitt i beim Anteil t (direkt auf der Straße: beide Richtungen). */
export function halt(net: RoadNetwork, id: number, name: string, i: number, t: number): Stop {
  const f = net.edges[2 * i], b = net.edges[2 * i + 1];
  const point: [number, number] = [f.coords[0][0] + (f.coords[1][0] - f.coords[0][0]) * t, f.coords[0][1]];
  const snaps: Snap[] = [
    { edge: f.id, t, dist: 0, point },
    { edge: b.id, t: 1 - t, dist: 0, point },
  ];
  return { id, name, coord: point, snaps };
}
