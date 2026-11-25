import type { StopsConfig } from "../config";
import type { OsmExtract } from "../data/osm";
import { haversine, LocalProj, projectOnLine, type LonLat } from "./geo";
import type { RoadNetwork } from "./roads";
import type { Snap } from "./router";

export interface Stop {
  /** OSM-Knoten-ID. */
  id: number;
  name: string;
  coord: LonLat;
  /** Zuordnung zum Straßennetz: ein oder zwei gerichtete Abschnitte (bei Haltestellen direkt auf der Straße). */
  snaps: Snap[];
}

/** Vorhandene Haltestellen aus OSM: highway=bus_stop, dazu Bussteige ohne eigenen bus_stop-Knoten in der Nähe. */
export function extractStops(extract: OsmExtract, cfg: StopsConfig): Stop[] {
  const busStops: Stop[] = [];
  const platforms: Stop[] = [];
  for (const e of extract.elements) {
    if (e.type !== "node" || e.lat === undefined || e.lon === undefined || !e.tags) continue;
    const s: Stop = { id: e.id, name: e.tags.name ?? "", coord: [e.lon, e.lat], snaps: [] };
    if (e.tags.highway === "bus_stop") busStops.push(s);
    else if (e.tags.public_transport === "platform" && e.tags.bus === "yes") platforms.push(s);
  }
  const extra = platforms.filter((p) => !busStops.some((b) => haversine(b.coord, p.coord) <= cfg.dublettenRadiusM));
  return [...busStops, ...extra].sort((a, b) => a.id - b.id);
}

/** Räumlicher Index der Abschnitte in einem Gitter, damit die Zuordnung nicht alle Abschnitte durchsucht. */
export class EdgeIndex {
  private readonly cells = new Map<string, number[]>();
  constructor(
    net: RoadNetwork,
    private readonly proj: LocalProj,
    private readonly size: number,
  ) {
    for (const e of net.edges) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of e.coords) {
        const [x, y] = proj.toXY(c);
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      for (let i = Math.floor(x0 / size); i <= Math.floor(x1 / size); i++)
        for (let j = Math.floor(y0 / size); j <= Math.floor(y1 / size); j++) {
          const k = `${i},${j}`;
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k)!.push(e.id);
        }
    }
  }
  near(p: LonLat, radius: number): number[] {
    const [x, y] = this.proj.toXY(p);
    const out = new Set<number>();
    for (let i = Math.floor((x - radius) / this.size); i <= Math.floor((x + radius) / this.size); i++)
      for (let j = Math.floor((y - radius) / this.size); j <= Math.floor((y + radius) / this.size); j++)
        for (const e of this.cells.get(`${i},${j}`) ?? []) out.add(e);
    return [...out].sort((a, b) => a - b);
  }
}

/**
 * Ordnet jede Haltestelle dem nächsten Busabschnitt zu. Liegt sie neben der Straße, gilt die Fahrtrichtung,
 * auf deren Seite sie liegt (Rechtsverkehr: rechte Seite). Liegt sie auf der Straße, gelten beide Richtungen.
 */
export function snapStops(net: RoadNetwork, stops: Stop[], cfg: StopsConfig, proj: LocalProj): void {
  const index = new EdgeIndex(net, proj, 100);
  for (const s of stops) {
    const cand = index
      .near(s.coord, cfg.fangradiusM)
      .map((id) => ({ id, p: projectOnLine(s.coord, net.edges[id].coords, proj) }))
      .filter((c) => c.p.dist <= cfg.fangradiusM);
    if (!cand.length) {
      s.snaps = [];
      continue;
    }
    const dmin = Math.min(...cand.map((c) => c.p.dist));
    let nah = cand.filter((c) => c.p.dist <= dmin + cfg.gleichAbstandToleranzM);
    if (dmin > cfg.aufLinieToleranzM) {
      const richtigeSeite = nah.filter((c) => (cfg.verkehrsseite === "rechts" ? c.p.side < 0 : c.p.side > 0));
      if (richtigeSeite.length) nah = richtigeSeite;
    }
    s.snaps = nah.map((c) => ({ edge: c.id, t: c.p.t, dist: c.p.dist, point: c.p.point }));
  }
}
