/** Lädt einen gzip-komprimierten Overpass-JSON-Auszug (gleiche Funktion in Browser, App und Tests). */
export interface OsmExtract {
  osm3s?: { timestamp_osm_base?: string; copyright?: string };
  elements: { type: string; id: number; tags?: Record<string, string> }[];
}

/**
 * Manche Server (zum Beispiel der Vite-Server) senden .gz mit "Content-Encoding: gzip", dann hat der
 * Browser die Daten schon entpackt. Andere (GitHub Pages) senden die rohen gzip-Bytes. Beides wird gelesen.
 */
export async function parseOsmGz(bytes: ArrayBuffer): Promise<OsmExtract> {
  const kopf = new Uint8Array(bytes, 0, 2);
  const istGzip = kopf[0] === 0x1f && kopf[1] === 0x8b;
  const text = istGzip
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
    : new TextDecoder().decode(bytes);
  return JSON.parse(text) as OsmExtract;
}

export async function loadOsmExtract(url: string): Promise<OsmExtract> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return parseOsmGz(await res.arrayBuffer());
}
