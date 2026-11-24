import type { Config } from "../config";
import type { OsmExtract } from "../data/osm";
import type { TextKey } from "../i18n";
import { extractBoundaries, inArea, regionOf, type AdminArea } from "./boundaries";
import { buildDemandGrid, type DemandGrid } from "./demand";
import { bboxOf, LocalProj, type LonLat } from "./geo";
import { buildRoadNetwork, type RoadNetwork } from "./roads";
import { extractStops, snapStops, type Stop } from "./stops";

/** Spielbares Gebiet: ganze Gemeinde oder, bei großen Städten, eine Subdivision. */
export interface Gebiet {
  id: string;
  name: string;
  rings: LonLat[][];
  einwohner: number;
  arbeitsplaetze: number;
}

export interface World {
  gemeinde: { id: string; name: string; region: string | null; rings: LonLat[][]; einwohner: number; arbeitsplaetze: number };
  /** true, wenn die Gemeinde über dem Schwellenwert liegt und in Subdivisionen geteilt ist. */
  geteilt: boolean;
  gebiete: Gebiet[];
  network: RoadNetwork;
  stops: Stop[];
  demand: DemandGrid;
  osmStand: string | null;
  bbox: [number, number, number, number];
}

export class WorldError extends Error {
  constructor(readonly key: TextKey) {
    super(key);
  }
}

export type Fortschritt = (schritt: TextKey, anteil: number) => void;

/** Baut aus einem OSM-Auszug die Spielwelt: Grenzen, Straßennetz, Haltestellen und Nachfragegitter. */
export function buildWorld(extract: OsmExtract, cfg: Config, fortschritt: Fortschritt = () => {}): World {
  fortschritt("laden.grenzen", 0.1);
  const { gemeinde, unterteilungen } = extractBoundaries(extract);
  if (!gemeinde) throw new WorldError("fehler.keineGemeinde");
  const bb = bboxOf(gemeinde.rings);
  const proj = new LocalProj((bb.minLon + bb.maxLon) / 2, (bb.minLat + bb.maxLat) / 2);

  fortschritt("laden.strassen", 0.25);
  const network = buildRoadNetwork(extract, cfg.roads);
  if (network.edges.length === 0) throw new WorldError("fehler.keineStrassen");

  fortschritt("laden.haltestellen", 0.5);
  const stops = extractStops(extract, cfg.stops).filter((s) => inArea(s.coord, gemeinde));
  snapStops(network, stops, cfg.stops, proj);

  fortschritt("laden.nachfrage", 0.65);
  const demandAlle = buildDemandGrid(extract, cfg.demand, proj);
  const cells = demandAlle.cells.filter((c) => inArea(c.center, gemeinde));
  const demand: DemandGrid = { ...demandAlle, cells, summe: sumUp(cells) };

  fortschritt("laden.gebiete", 0.85);
  const geteilt = demand.summe.einwohner > cfg.world.teilungAbEinwohnern && unterteilungen.length > 0;
  const flaechen: AdminArea[] = geteilt ? unterteilungen : [gemeinde];
  const gebiete: Gebiet[] = flaechen.map((a) => ({ id: a.id, name: a.name, rings: a.rings, einwohner: 0, arbeitsplaetze: 0 }));
  for (const c of demand.cells) {
    const n = flaechen.findIndex((a) => inArea(c.center, a));
    if (n < 0) continue;
    c.gebiet = gebiete[n].id;
    gebiete[n].einwohner += c.einwohner;
    gebiete[n].arbeitsplaetze += c.arbeitsplaetze;
  }

  fortschritt("laden.fertig", 1);
  return {
    gemeinde: {
      id: gemeinde.id,
      name: gemeinde.name,
      region: regionOf(gemeinde),
      rings: gemeinde.rings,
      einwohner: demand.summe.einwohner,
      arbeitsplaetze: demand.summe.arbeitsplaetze,
    },
    geteilt,
    gebiete,
    network,
    stops,
    demand,
    osmStand: extract.osm3s?.timestamp_osm_base ?? null,
    bbox: [bb.minLon, bb.minLat, bb.maxLon, bb.maxLat],
  };
}

function sumUp(cells: DemandGrid["cells"]): DemandGrid["summe"] {
  const s = { einwohner: 0, arbeitsplaetze: 0, orte: {} as Record<string, number> };
  for (const c of cells) {
    s.einwohner += c.einwohner;
    s.arbeitsplaetze += c.arbeitsplaetze;
    for (const [k, v] of Object.entries(c.orte)) s.orte[k] = (s.orte[k] ?? 0) + v;
  }
  return s;
}
