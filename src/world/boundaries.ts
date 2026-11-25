import type { OsmElement, OsmExtract } from "../data/osm";
import { assembleRings, pointInRings, type LonLat } from "./geo";

export interface AdminArea {
  id: string;
  name: string;
  adminLevel: number;
  rings: LonLat[][];
  tags: Record<string, string>;
}

/** Bundesland aus dem amtlichen Gemeindeschlüssel (erste zwei Stellen). */
const AGS_LAND: Record<string, string> = {
  "01": "DE-SH", "02": "DE-HH", "03": "DE-NI", "04": "DE-HB", "05": "DE-NW", "06": "DE-HE", "07": "DE-RP", "08": "DE-BW",
  "09": "DE-BY", "10": "DE-SL", "11": "DE-BE", "12": "DE-BB", "13": "DE-MV", "14": "DE-SN", "15": "DE-ST", "16": "DE-TH",
};

function toArea(r: OsmElement): AdminArea | null {
  const parts: LonLat[][] = [];
  for (const m of r.members ?? []) {
    if (m.type !== "way" || (m.role !== "outer" && m.role !== "" && m.role !== "inner") || !m.geometry) continue;
    if (m.geometry.some((p) => !p)) continue;
    parts.push(m.geometry.map((p) => [p!.lon, p!.lat]));
  }
  const rings = assembleRings(parts);
  if (!rings.length) return null;
  return { id: `r${r.id}`, name: r.tags?.name ?? "", adminLevel: Number(r.tags?.admin_level), rings, tags: r.tags ?? {} };
}

/** Verwaltungsgrenzen im Auszug. Die Gemeinde ist die Grenze mit der höchsten Ebene bis 8, Subdivisionen liegen darunter. */
export function extractBoundaries(extract: OsmExtract): { gemeinde: AdminArea | null; unterteilungen: AdminArea[] } {
  const areas = extract.elements
    .filter((e) => e.type === "relation" && e.tags?.boundary === "administrative" && Number(e.tags.admin_level) > 0)
    .map(toArea)
    .filter((a): a is AdminArea => a !== null);
  const kandidaten = areas.filter((a) => a.adminLevel <= 8).sort((a, b) => b.adminLevel - a.adminLevel);
  const gemeinde = kandidaten[0] ?? null;
  if (!gemeinde) return { gemeinde: null, unterteilungen: [] };
  const tiefer = areas.filter((a) => a.adminLevel > gemeinde.adminLevel);
  const naechste = Math.min(...tiefer.map((a) => a.adminLevel));
  return { gemeinde, unterteilungen: tiefer.filter((a) => a.adminLevel === naechste).sort((a, b) => a.name.localeCompare(b.name)) };
}

/** ISO-3166-2-Code der Region (zum Beispiel DE-SH) aus der Grenze, oder null. */
export function regionOf(area: AdminArea | null): string | null {
  if (!area) return null;
  const iso = area.tags["ISO3166-2"];
  if (iso && /^[A-Z]{2}-[A-Z0-9]+$/.test(iso)) return iso;
  const ags = area.tags["de:amtlicher_gemeindeschluessel"] ?? area.tags["de:regionalschluessel"];
  if (ags && AGS_LAND[ags.slice(0, 2)]) return AGS_LAND[ags.slice(0, 2)];
  return null;
}

/** Kreisschlüssel (erste fünf Stellen des amtlichen Gemeindeschlüssels), zum Beispiel 01060 für den Kreis Segeberg. */
export function kreisschluesselOf(area: AdminArea | null): string | null {
  const ags = area?.tags["de:amtlicher_gemeindeschluessel"] ?? area?.tags["de:regionalschluessel"];
  return ags && /^\d{5}/.test(ags) ? ags.slice(0, 5) : null;
}

export function inArea(p: LonLat, a: AdminArea): boolean {
  return pointInRings(p, a.rings);
}
