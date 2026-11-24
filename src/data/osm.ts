/**
 * OSM-Auszug im Overpass-JSON-Format ("out geom"). Dasselbe Format gilt für den Norderstedt-Datensatz
 * und für vom Spieler gewählte Dateien (gzip-komprimiert oder unkomprimiert).
 */
export interface OsmPoint {
  lat: number;
  lon: number;
}

export interface OsmMember {
  type: "node" | "way" | "relation";
  ref: number;
  role: string;
  geometry?: (OsmPoint | null)[];
  lat?: number;
  lon?: number;
}

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: (OsmPoint | null)[];
  members?: OsmMember[];
  tags?: Record<string, string>;
}

export interface OsmExtract {
  osm3s?: { timestamp_osm_base?: string; copyright?: string };
  elements: OsmElement[];
}

export class OsmFormatError extends Error {}

/**
 * Manche Server (zum Beispiel der Vite-Server) senden .gz mit "Content-Encoding: gzip", dann hat der
 * Browser die Daten schon entpackt. Andere (GitHub Pages) senden die rohen gzip-Bytes. Beides wird gelesen.
 */
export async function parseOsmGz(bytes: ArrayBuffer): Promise<OsmExtract> {
  const kopf = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  const istGzip = kopf[0] === 0x1f && kopf[1] === 0x8b;
  const text = istGzip
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
    : new TextDecoder().decode(bytes);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new OsmFormatError("Die Datei ist kein JSON.");
  }
  const d = data as OsmExtract;
  if (!d || !Array.isArray(d.elements)) throw new OsmFormatError("Die Datei enthält keine OSM-Elemente.");
  return d;
}

export async function loadOsmExtract(url: string): Promise<OsmExtract> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return parseOsmGz(await res.arrayBuffer());
}
