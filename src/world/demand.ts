import type { DemandConfig } from "../config";
import type { OsmElement, OsmExtract } from "../data/osm";
import { LocalProj, pointInRing, ringAreaM2, ringCentroid, type LonLat } from "./geo";

/** Eine Zelle des Nachfragegitters. */
export interface DemandCell {
  i: number;
  j: number;
  center: LonLat;
  einwohner: number;
  arbeitsplaetze: number;
  /** Orte von Interesse je Kategorie (Schule, Einkauf, Freizeit, Versorgung). */
  orte: Record<string, number>;
  /** Gebiet (Gemeinde oder Subdivision), zu dem die Zelle gehört; wird in world.ts gesetzt. */
  gebiet: string;
}

export interface DemandGrid {
  zellgroesseM: number;
  cells: DemandCell[];
  summe: { einwohner: number; arbeitsplaetze: number; orte: Record<string, number> };
  /** Aufschlüsselung nach Nutzung (Gebäudefläche, Einwohner, Arbeitsplätze), zur Prüfung der Schätzung. */
  nachNutzung: Record<string, { flaecheM2: number; einwohner: number; arbeitsplaetze: number; gebaeude: number }>;
}

const closedRing = (e: OsmElement): LonLat[] | null => {
  const g = e.geometry;
  if (!g || g.length < 4 || g.some((p) => !p)) return null;
  const r: LonLat[] = g.map((p) => [p!.lon, p!.lat]);
  return r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r : null;
};

/** Grobe Gitter-Suche für Landnutzungsflächen, damit nicht jedes Gebäude alle Flächen prüft. */
class PolygonIndex {
  private readonly cells = new Map<string, number[]>();
  constructor(
    readonly polys: { ring: LonLat[]; art: string }[],
    private readonly proj: LocalProj,
    private readonly size: number,
  ) {
    polys.forEach((p, n) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of p.ring) {
        const [x, y] = proj.toXY(c);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      for (let i = Math.floor(x0 / size); i <= Math.floor(x1 / size); i++)
        for (let j = Math.floor(y0 / size); j <= Math.floor(y1 / size); j++) {
          const k = `${i},${j}`;
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k)!.push(n);
        }
    });
  }
  find(p: LonLat): string | null {
    const [x, y] = this.proj.toXY(p);
    for (const n of this.cells.get(`${Math.floor(x / this.size)},${Math.floor(y / this.size)}`) ?? [])
      if (pointInRing(p, this.polys[n].ring)) return this.polys[n].art;
    return null;
  }
}

function geschosse(t: Record<string, string>, art: string, cfg: DemandConfig): number {
  const v = Number.parseFloat(t["building:levels"] ?? "");
  if (v > 0 && v < 100) return v;
  return cfg.geschosseStandard[art] ?? cfg.geschosseStandard.yes;
}

/** Kategorie eines Ortes von Interesse nach der Konfiguration, oder null. */
export function poiKategorie(t: Record<string, string> | undefined, cfg: DemandConfig): string | null {
  if (!t) return null;
  for (const [kat, regeln] of Object.entries(cfg.poiKategorien))
    for (const [key, werte] of Object.entries(regeln)) if (t[key] && (werte.includes("*") || werte.includes(t[key]))) return kat;
  return null;
}

/**
 * Nachfragegitter: Einwohner und Arbeitsplätze geschätzt aus Gebäudeflächen, Geschossen und Landnutzung,
 * dazu Orte von Interesse. Rein deterministisch (gleiche Eingabe, gleiches Ergebnis).
 */
export function buildDemandGrid(extract: OsmExtract, cfg: DemandConfig, proj: LocalProj): DemandGrid {
  const landuse: { ring: LonLat[]; art: string }[] = [];
  for (const e of extract.elements) {
    const lu = e.type === "way" ? e.tags?.landuse : undefined;
    if (!lu) continue;
    const ring = closedRing(e);
    if (!ring) continue;
    if (cfg.landnutzungWohnen.includes(lu)) landuse.push({ ring, art: "wohnen" });
    else if (cfg.landnutzungArbeit[lu]) landuse.push({ ring, art: cfg.landnutzungArbeit[lu] });
  }
  const luIndex = new PolygonIndex(landuse, proj, 250);

  const cells = new Map<string, DemandCell>();
  const nachNutzung: DemandGrid["nachNutzung"] = {};
  const size = cfg.zellgroesseM;
  const cellAt = (p: LonLat): DemandCell => {
    const [x, y] = proj.toXY(p);
    const i = Math.floor(x / size), j = Math.floor(y / size);
    const k = `${i},${j}`;
    let c = cells.get(k);
    if (!c) {
      c = { i, j, center: proj.toLonLat([(i + 0.5) * size, (j + 0.5) * size]), einwohner: 0, arbeitsplaetze: 0, orte: {}, gebiet: "" };
      cells.set(k, c);
    }
    return c;
  };
  const addOrt = (p: LonLat, kat: string) => {
    const c = cellAt(p);
    c.orte[kat] = (c.orte[kat] ?? 0) + 1;
  };

  for (const e of extract.elements) {
    const t = e.tags;
    if (!t) continue;
    if (e.type === "node" && e.lat !== undefined && e.lon !== undefined) {
      const kat = poiKategorie(t, cfg);
      if (kat) addOrt([e.lon, e.lat], kat);
      continue;
    }
    if (e.type !== "way") continue;
    const ring = closedRing(e);
    if (!t.building) {
      // Flächen mit Ortsfunktion ohne Gebäude (zum Beispiel Parks, Sportplätze)
      const kat = ring ? poiKategorie(t, cfg) : null;
      if (kat && ring) addOrt(ringCentroid(ring), kat);
      continue;
    }
    if (!ring || cfg.nebengebaeude.includes(t.building) || cfg.nebenAmenity.includes(t.amenity ?? "")) continue;
    const flaeche = ringAreaM2(ring, proj);
    if (flaeche < cfg.mindestflaecheM2) continue;
    const mitte = ringCentroid(ring);
    const c = cellAt(mitte);
    const kat = poiKategorie(t, cfg);
    if (kat) c.orte[kat] = (c.orte[kat] ?? 0) + 1;

    // Nutzung bestimmen: Gebäudeart, sonst Ortsfunktion, sonst Landnutzung
    let nutzung: string;
    if (cfg.wohngebaeude.includes(t.building)) nutzung = "wohnen";
    else if (t.building !== "yes") nutzung = t.building;
    else if (t.amenity || t.shop) nutzung = t.shop ? "retail" : t.amenity;
    else nutzung = luIndex.find(mitte) ?? "unbekannt";

    const wohnFlaeche = (anteil: number, art: string) =>
      (flaeche * geschosse(t, art, cfg) * cfg.wohnanteilGeschossflaeche * anteil) / cfg.wohnflaecheProEinwohnerM2;
    let ew = 0, ap = 0;
    if (nutzung === "wohnen") ew = wohnFlaeche(1, t.building);
    else if (nutzung === "unbekannt") ew = wohnFlaeche(cfg.unbekanntWohnanteil, "yes");
    else {
      const proAp = cfg.flaecheProArbeitsplatzM2[nutzung] ?? cfg.flaecheProArbeitsplatzM2.sonstige;
      ap = (flaeche * geschosse(t, "arbeit", cfg)) / proAp;
    }
    c.einwohner += ew;
    c.arbeitsplaetze += ap;
    const n = (nachNutzung[nutzung] ??= { flaecheM2: 0, einwohner: 0, arbeitsplaetze: 0, gebaeude: 0 });
    n.flaecheM2 += flaeche;
    n.einwohner += ew;
    n.arbeitsplaetze += ap;
    n.gebaeude++;
  }

  const list = [...cells.values()]
    .filter((c) => c.einwohner > 0 || c.arbeitsplaetze > 0 || Object.keys(c.orte).length)
    .sort((a, b) => a.j - b.j || a.i - b.i);
  const summe = { einwohner: 0, arbeitsplaetze: 0, orte: {} as Record<string, number> };
  for (const c of list) {
    c.einwohner = Math.round(c.einwohner);
    c.arbeitsplaetze = Math.round(c.arbeitsplaetze);
    summe.einwohner += c.einwohner;
    summe.arbeitsplaetze += c.arbeitsplaetze;
    for (const [k, v] of Object.entries(c.orte)) summe.orte[k] = (summe.orte[k] ?? 0) + v;
  }
  for (const n of Object.values(nachNutzung)) {
    n.flaecheM2 = Math.round(n.flaecheM2);
    n.einwohner = Math.round(n.einwohner);
    n.arbeitsplaetze = Math.round(n.arbeitsplaetze);
  }
  return { zellgroesseM: size, cells: list, summe, nachNutzung };
}
