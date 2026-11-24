import { readFileSync } from "node:fs";
import { config } from "../../src/config";
import { parseOsmGz, type OsmExtract } from "../../src/data/osm";

/** Lädt den festen Norderstedt-Datensatz aus dem Projekt. Tests fragen nie live bei Overpass an. */
export async function ladeNorderstedt(): Promise<OsmExtract> {
  const b = readFileSync("public/" + config.data.norderstedtPath);
  return parseOsmGz(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}

/** Sperrt das Netz für die Dauer eines Tests: jeder fetch-Aufruf schlägt fehl. */
export function netzSperren(): () => void {
  const orig = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("Netz im Test gesperrt"))) as typeof fetch;
  return () => (globalThis.fetch = orig);
}
