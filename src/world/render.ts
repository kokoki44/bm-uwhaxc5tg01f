import type { OsmElement, OsmExtract } from "../data/osm";
import type { LonLat } from "./geo";
import type { World } from "./world";

/** GeoJSON-Ebenen für die Kartendarstellung, erzeugt im Welt-Worker. */
export interface RenderLayers {
  strassen: GeoJSON.FeatureCollection;
  gebaeude: GeoJSON.FeatureCollection;
  gruen: GeoJSON.FeatureCollection;
  wasser: GeoJSON.FeatureCollection;
  gewaesser: GeoJSON.FeatureCollection;
  haltestellen: GeoJSON.FeatureCollection;
  grenze: GeoJSON.FeatureCollection;
}

/** Straßenklasse für die Darstellung, nach Bedeutung gestaffelt. */
export function strassenKlasse(hw: string): "autobahn" | "haupt" | "neben" | "service" | null {
  if (/^(motorway|trunk)(_link)?$/.test(hw)) return "autobahn";
  if (/^(primary|secondary)(_link)?$/.test(hw)) return "haupt";
  if (/^(tertiary|tertiary_link|unclassified|residential|living_street|road|busway)$/.test(hw)) return "neben";
  if (hw === "service") return "service";
  return null;
}

const GRUEN_LANDUSE = new Set(["forest", "grass", "meadow", "recreation_ground", "allotments", "cemetery", "village_green", "orchard", "farmland", "greenfield"]);
const GRUEN_NATURAL = new Set(["wood", "scrub", "grassland", "heath", "wetland"]);
const GRUEN_LEISURE = new Set(["park", "garden", "pitch", "playground", "golf_course", "nature_reserve", "common"]);

const line = (e: OsmElement): LonLat[] | null =>
  e.geometry && e.geometry.length >= 2 && e.geometry.every(Boolean) ? e.geometry.map((p) => [p!.lon, p!.lat]) : null;
const ring = (e: OsmElement): LonLat[] | null => {
  const l = line(e);
  return l && l.length >= 4 && l[0][0] === l[l.length - 1][0] && l[0][1] === l[l.length - 1][1] ? l : null;
};
const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });

export function buildRenderLayers(extract: OsmExtract, world: World): RenderLayers {
  const strassen: GeoJSON.Feature[] = [];
  const gebaeude: GeoJSON.Feature[] = [];
  const gruen: GeoJSON.Feature[] = [];
  const wasser: GeoJSON.Feature[] = [];
  const gewaesser: GeoJSON.Feature[] = [];
  for (const e of extract.elements) {
    if (e.type !== "way" || !e.tags) continue;
    const t = e.tags;
    if (t.highway) {
      const k = strassenKlasse(t.highway);
      const l = line(e);
      if (k && l) strassen.push({ type: "Feature", properties: { klasse: k }, geometry: { type: "LineString", coordinates: l } });
      continue;
    }
    if (t.waterway) {
      const l = line(e);
      if (l) gewaesser.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: l } });
      continue;
    }
    const r = ring(e);
    if (!r) continue;
    const poly: GeoJSON.Polygon = { type: "Polygon", coordinates: [r] };
    if (t.building) gebaeude.push({ type: "Feature", properties: {}, geometry: poly });
    else if (t.natural === "water" || t.landuse === "reservoir" || t.landuse === "basin") wasser.push({ type: "Feature", properties: {}, geometry: poly });
    else if (GRUEN_LANDUSE.has(t.landuse ?? "") || GRUEN_NATURAL.has(t.natural ?? "") || GRUEN_LEISURE.has(t.leisure ?? ""))
      gruen.push({ type: "Feature", properties: {}, geometry: poly });
  }
  const haltestellen: GeoJSON.Feature[] = world.stops.map((s) => ({
    type: "Feature",
    properties: { id: s.id, name: s.name },
    geometry: { type: "Point", coordinates: s.coord },
  }));
  const grenze: GeoJSON.Feature[] = world.gemeinde.rings.map((r) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r } }));
  return { strassen: fc(strassen), gebaeude: fc(gebaeude), gruen: fc(gruen), wasser: fc(wasser), gewaesser: fc(gewaesser), haltestellen: fc(haltestellen), grenze: fc(grenze) };
}
