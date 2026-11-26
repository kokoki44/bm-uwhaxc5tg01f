import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { LonLat } from "../world/geo";

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });

function quelle(map: MapLibreMap, id: string, daten: GeoJSON.FeatureCollection): boolean {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  if (src) {
    src.setData(daten);
    return false;
  }
  map.addSource(id, { type: "geojson", data: daten });
  return true;
}

const vorHaltestellen = (map: MapLibreMap) => (map.getLayer("haltestellen") ? "haltestellen" : undefined);

export interface Rechteck {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Innenabstand für den Zoom auf eine Linie, damit sie neben den Fenstern über der Karte sichtbar ist.
 * Ein Fenster, dessen Mitte links der Kartenmitte liegt, verdeckt den linken Rand, sonst den rechten.
 * Bleibt dazwischen weniger als die Mindestbreite frei, bleibt nur die linke Seite frei (dort steht der Linieneditor),
 * danach nur die rechte, zuletzt gilt der einfache Rand (die Linie liegt dann teils unter einem Fenster).
 */
export function freierRand(karte: Rechteck, verdeckt: Rechteck[], randPx: number, mindestBreitePx: number): { top: number; bottom: number; left: number; right: number } {
  let left = randPx, right = randPx;
  const mitte = (karte.left + karte.right) / 2;
  for (const r of verdeckt) {
    if (r.right <= karte.left || r.left >= karte.right || r.bottom <= karte.top || r.top >= karte.bottom || r.right <= r.left) continue;
    if ((r.left + r.right) / 2 < mitte) left = Math.max(left, r.right - karte.left + randPx);
    else right = Math.max(right, karte.right - r.left + randPx);
  }
  const breite = karte.right - karte.left;
  const wahl = [[left, right], [left, randPx], [randPx, right]].find(([l, r]) => breite - l - r >= mindestBreitePx) ?? [randPx, randPx];
  return { top: randPx, bottom: randPx, left: wahl[0], right: wahl[1] };
}

/** Anteil der Punkte, die im Kartenbild liegen und von keinem Fenster verdeckt sind (0 bis 1). */
export function sichtbarerAnteil(punkte: [number, number][], karte: Rechteck, verdeckt: Rechteck[]): number {
  if (!punkte.length) return 0;
  const innen = (p: [number, number], r: Rechteck) => p[0] >= r.left && p[0] <= r.right && p[1] >= r.top && p[1] <= r.bottom;
  return punkte.filter((p) => innen(p, karte) && !verdeckt.some((r) => innen(p, r))).length / punkte.length;
}

export interface LinieAufKarte {
  nummer: string;
  farbe: string;
  aktiv: boolean;
  /** Routen der Varianten. */
  routen: LonLat[][];
}

/**
 * Linien in ihrer Farbe auf der Karte. Deaktivierte Linien sind gestrichelt und blasser, damit der Zustand nicht nur über
 * die Farbe erkennbar ist (Konzept: Barrierefreiheit).
 */
export function zeigeLinien(map: MapLibreMap, linien: LinieAufKarte[]): void {
  const daten = fc(
    linien.flatMap((l) =>
      l.routen.filter((r) => r.length >= 2).map((r) => ({ type: "Feature" as const, properties: { nummer: l.nummer, farbe: l.farbe, aktiv: l.aktiv }, geometry: { type: "LineString" as const, coordinates: r } })),
    ),
  );
  if (!quelle(map, "linien", daten)) return;
  const breite = ["interpolate", ["linear"], ["zoom"], 11, 2, 17, 7] as unknown as number;
  const aktiv = ["==", ["get", "aktiv"], true] as never;
  const inaktiv = ["==", ["get", "aktiv"], false] as never;
  map.addLayer({ id: "linien-rand", type: "line", source: "linien", filter: aktiv, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 4, 17, 11] as unknown as number } }, vorHaltestellen(map));
  map.addLayer({ id: "linien", type: "line", source: "linien", filter: aktiv, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "farbe"] as unknown as string, "line-width": breite } }, vorHaltestellen(map));
  map.addLayer({ id: "linien-inaktiv", type: "line", source: "linien", filter: inaktiv, paint: { "line-color": ["get", "farbe"] as unknown as string, "line-width": breite, "line-opacity": 0.55, "line-dasharray": [1.5, 1.5] } }, vorHaltestellen(map));
}

/** Hervorhebung der Linie im Editor: Route der gewählten Variante und ihre Perlen (Wegpunkte als Kreise). */
export function zeigeAuswahl(map: MapLibreMap, route: LonLat[] | null, perlen: { coord: LonLat; art: "halt" | "weg" }[], farbe: string): void {
  const daten = fc([
    ...(route && route.length >= 2 ? [{ type: "Feature" as const, properties: { art: "route" }, geometry: { type: "LineString" as const, coordinates: route } }] : []),
    ...perlen.map((p, i) => ({ type: "Feature" as const, properties: { art: p.art, nr: i + 1 }, geometry: { type: "Point" as const, coordinates: p.coord } })),
  ]);
  const neu = quelle(map, "auswahl", daten);
  if (neu) {
    map.addLayer({ id: "auswahl-route", type: "line", source: "auswahl", filter: ["==", ["get", "art"], "route"] as never, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": farbe, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 4, 17, 11] as unknown as number } }, vorHaltestellen(map));
    map.addLayer({ id: "auswahl-weg", type: "circle", source: "auswahl", filter: ["==", ["get", "art"], "weg"] as never, paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#1b1b1b", "circle-stroke-width": 3 } });
    map.addLayer({ id: "auswahl-halt", type: "circle", source: "auswahl", filter: ["==", ["get", "art"], "halt"] as never, paint: { "circle-radius": 11, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#1b1b1b", "circle-stroke-width": 3 } });
  }
  map.setPaintProperty("auswahl-route", "line-color", farbe);
}

/** Haltestellen auf der Karte neu setzen (vorhandene und neue, Namen nach Umbenennung). */
export function zeigeHaltestellen(map: MapLibreMap, halte: { id: string; name: string; coord: LonLat; neu: boolean }[]): void {
  quelle(map, "haltestellen", fc(halte.map((h) => ({ type: "Feature", properties: { id: h.id, name: h.name, neu: h.neu }, geometry: { type: "Point", coordinates: h.coord } }))));
}

let klick: ((p: LonLat) => void) | null = null;
const angemeldet = new WeakSet<MapLibreMap>();

/**
 * Klick auf die Karte für die Werkzeuge des Linieneditors (neue Haltestelle, Wegpunkt). Ein Klick auf eine Haltestelle
 * gilt der Haltestelle und kommt hier nicht an.
 */
export function setzeKartenklick(map: MapLibreMap, f: ((p: LonLat) => void) | null): void {
  klick = f;
  map.getCanvas().style.cursor = f ? "crosshair" : "";
  if (angemeldet.has(map)) return;
  angemeldet.add(map);
  map.on("click", (e) => {
    if (!klick) return;
    if (map.getLayer("haltestellen") && map.queryRenderedFeatures(e.point, { layers: ["haltestellen"] }).length) return;
    klick([e.lngLat.lng, e.lngLat.lat]);
  });
}

export const kartenklickAktiv = (): boolean => klick !== null;
