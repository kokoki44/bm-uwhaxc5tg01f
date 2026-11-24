import { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { config } from "../config";

/** Leerer Kartenrahmen: nur Hintergrundfläche, keine Kartendaten (diese folgen in Etappe 1). */
export function createMap(container: string | HTMLElement): MapLibreMap {
  return new MapLibreMap({
    container,
    center: config.map.center,
    zoom: config.map.zoom,
    style: {
      version: 8,
      sources: {},
      layers: [{ id: "hintergrund", type: "background", paint: { "background-color": config.map.backgroundColor } }],
    },
  });
}
