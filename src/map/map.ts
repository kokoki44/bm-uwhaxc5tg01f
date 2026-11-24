import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre sucht seinen Worker sonst neben der eigenen Moduldatei, die es im gebauten Bundle nicht gibt.
// Ohne Worker werden GeoJSON-Daten nie verarbeitet und die Karte bleibt leer (Regressionstest in e2e).
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
void setWorkerUrl(maplibreWorkerUrl);
import { config } from "../config";
import { t } from "../i18n";
import type { RenderLayers } from "../world/render";

const F = config.map.farben;

/** Kartenrahmen mit ruhigem, hellem Grundstil. Daten kommen erst mit der geladenen Welt hinzu. */
export function createMap(container: string | HTMLElement): MapLibreMap {
  const map = new MapLibreMap({
    container,
    center: config.map.center,
    zoom: config.map.zoom,
    minZoom: config.map.minZoom,
    maxZoom: config.map.maxZoom,
    attributionControl: { compact: true, customAttribution: "© OpenStreetMap-Mitwirkende (ODbL)" },
    style: {
      version: 8,
      sources: {},
      layers: [{ id: "hintergrund", type: "background", paint: { "background-color": F.hintergrund } }],
    },
  });
  map.getCanvas().setAttribute("aria-label", t("karte.beschriftung"));
  // Kartenausschnitt als Attribute, damit Oberflächentests Verschieben und Zoomen prüfen können
  const merken = () => {
    const el = map.getContainer();
    el.dataset.zoom = map.getZoom().toFixed(3);
    el.dataset.mitte = map.getCenter().toArray().map((v) => v.toFixed(6)).join(",");
  };
  map.on("moveend", merken);
  map.on("load", merken);
  Object.defineProperty(map.getContainer(), "__karte", { value: map, enumerable: false });
  return map;
}

/** Haltestellensymbol: blaues Schild mit weißem H. Form und Buchstabe tragen die Information, nicht nur die Farbe. */
function haltestellenSymbol(): ImageData {
  const s = 32;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, s, s);
  g.fillStyle = F.haltestelle;
  g.fillRect(2, 2, s - 4, s - 4);
  g.fillStyle = "#ffffff";
  // "H" aus Rechtecken, unabhängig von Schriften
  g.fillRect(9, 8, 4, 16);
  g.fillRect(19, 8, 4, 16);
  g.fillRect(9, 14, 14, 4);
  return g.getImageData(0, 0, s, s);
}

const ws = (z0: number, w0: number, z1: number, w1: number) => ["interpolate", ["exponential", 1.6], ["zoom"], z0, w0, z1, w1] as unknown as number;

export function zeigeWelt(map: MapLibreMap, r: RenderLayers, bbox: [number, number, number, number], onHaltestelle: (p: { id: number; name: string }) => void): void {
  const add = (id: string, data: GeoJSON.FeatureCollection) => {
    const src = map.getSource(id) as GeoJSONSource | undefined;
    if (src) src.setData(data);
    else map.addSource(id, { type: "geojson", data });
  };
  add("gruen", r.gruen);
  add("wasser", r.wasser);
  add("gewaesser", r.gewaesser);
  add("gebaeude", r.gebaeude);
  add("strassen", r.strassen);
  add("grenze", r.grenze);
  add("haltestellen", r.haltestellen);
  if (!map.hasImage("haltestelle")) map.addImage("haltestelle", haltestellenSymbol(), { pixelRatio: 2 });

  if (!map.getLayer("gruen")) {
    const m = config.map;
    const klasse = (k: string) => ["==", ["get", "klasse"], k] as unknown as boolean;
    map.addLayer({ id: "gruen", type: "fill", source: "gruen", paint: { "fill-color": F.gruen } });
    map.addLayer({ id: "wasser", type: "fill", source: "wasser", paint: { "fill-color": F.wasser } });
    map.addLayer({ id: "gewaesser", type: "line", source: "gewaesser", paint: { "line-color": F.wasser, "line-width": ws(12, 1, 18, 6) } });
    map.addLayer({ id: "gebaeude", type: "fill", source: "gebaeude", minzoom: m.zoomGebaeude, paint: { "fill-color": F.gebaeude, "fill-outline-color": F.gebaeudeRand } });
    // Ränder unter den Straßenflächen, damit weiße Nebenstraßen auf hellem Grund lesbar bleiben
    map.addLayer({ id: "strassen-rand", type: "line", source: "strassen", filter: ["!=", ["get", "klasse"], "service"] as never, minzoom: m.minZoom, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": F.strasseRand, "line-width": ws(10, 1, 18, 18) } });
    map.addLayer({ id: "strassen-service", type: "line", source: "strassen", filter: klasse("service") as never, minzoom: m.zoomServicewege, paint: { "line-color": F.nebenstrasse, "line-width": ws(15, 1, 18, 5) } });
    map.addLayer({ id: "strassen-neben", type: "line", source: "strassen", filter: klasse("neben") as never, minzoom: m.zoomNebenstrassen, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": F.nebenstrasse, "line-width": ws(13, 1, 18, 14) } });
    map.addLayer({ id: "strassen-haupt", type: "line", source: "strassen", filter: klasse("haupt") as never, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": F.hauptstrasse, "line-width": ws(10, 1.5, 18, 18) } });
    map.addLayer({ id: "strassen-autobahn", type: "line", source: "strassen", filter: klasse("autobahn") as never, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": F.autobahn, "line-width": ws(10, 2, 18, 22) } });
    map.addLayer({ id: "grenze", type: "line", source: "grenze", paint: { "line-color": F.grenze, "line-width": 2, "line-dasharray": [3, 2] } });
    map.addLayer({ id: "haltestellen", type: "symbol", source: "haltestellen", minzoom: m.zoomHaltestellen, layout: { "icon-image": "haltestelle", "icon-size": ws(13, 0.8, 18, 1.5), "icon-allow-overlap": true } });
    map.on("click", "haltestellen", (e) => {
      const f = e.features?.[0];
      if (f) onHaltestelle({ id: Number(f.properties?.id), name: String(f.properties?.name ?? "") });
    });
    map.on("mouseenter", "haltestellen", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "haltestellen", () => (map.getCanvas().style.cursor = ""));
  }
  const bounds: LngLatBoundsLike = [[bbox[0], bbox[1]], [bbox[2], bbox[3]]];
  map.fitBounds(bounds, { padding: 40, duration: 0 });
}
