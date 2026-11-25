import type { StopsConfig } from "../config";
import { LocalProj, projectOnLine, type LonLat } from "../world/geo";
import type { RoadNetwork } from "../world/roads";
import type { Snap } from "../world/router";
import { EdgeIndex, snapStops } from "../world/stops";

/** Räumlicher Index und Projektion für das Einrasten von Punkten auf das Busnetz. */
export interface FangIndex {
  index: EdgeIndex;
  proj: LocalProj;
}

export function fangIndex(net: RoadNetwork, mitte: LonLat): FangIndex {
  const proj = new LocalProj(mitte[0], mitte[1]);
  return { index: new EdgeIndex(net, proj, 100), proj };
}

/**
 * Rastet einen Punkt auf das Busnetz ein. Neue Haltestelle: gleiche Regel wie bei den OSM-Haltestellen (nächster
 * Busabschnitt im Fangradius, neben der Straße die rechte Fahrbahnseite, A3b-10). Wegpunkt: nächster Abschnitt in beiden
 * Richtungen, weil die Richtung aus der Route folgt.
 */
export function fange(net: RoadNetwork, f: FangIndex, punkt: LonLat, art: "halt" | "weg", cfg: StopsConfig): Snap[] {
  if (art === "halt") {
    const s = { id: 0, name: "", coord: punkt, snaps: [] as Snap[] };
    snapStops(net, [s], cfg, f.proj, f.index);
    return s.snaps;
  }
  const cand = f.index
    .near(punkt, cfg.fangradiusM)
    .map((id) => ({ id, p: projectOnLine(punkt, net.edges[id].coords, f.proj) }))
    .filter((c) => c.p.dist <= cfg.fangradiusM);
  if (!cand.length) return [];
  const dmin = Math.min(...cand.map((c) => c.p.dist));
  return cand.filter((c) => c.p.dist <= dmin + cfg.gleichAbstandToleranzM).map((c) => ({ edge: c.id, t: c.p.t, dist: c.p.dist, point: c.p.point }));
}
