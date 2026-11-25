import type { GrundstueckConfig } from "../config";
import type { OsmExtract } from "../data/osm";
import { seitenverhaeltnisOk, type Betriebshof, type Grundstueck, type Kasse } from "../depot/hof";
import type { Seite } from "../depot/rechteck";
import { inArea, type AdminArea } from "./boundaries";
import type { DemandCell } from "./demand";
import { haversine, LocalProj, pointInRing, projectOnLine, ringAreaM2, ringCentroid, type LonLat, type XY } from "./geo";
import type { RoadNetwork } from "./roads";
import { EdgeIndex } from "./stops";

/** Möglicher Standort für einen Betriebshof: eine Gewerbe- oder Industriefläche aus OSM. */
export interface Standort {
  /** OSM-ID des Weges. */
  id: number;
  name: string;
  landnutzung: string;
  ring: LonLat[];
  /** Verfügbare Fläche: begrenzt nur das Startgrundstück. */
  flaecheM2: number;
  zentrum: LonLat;
  /** Einwohner und Arbeitsplätze im Umkreis: Maß für die Lage. */
  dichte: number;
  preisEurM2: number;
  /** Entfernung zur nächsten Straße, die ein Bus befahren darf. */
  anbindungM: number;
  /** Name dieser Straße (leer, wenn OSM keinen hat). */
  strasse: string;
  /** Vorschlag für die Lage des Startgrundstücks in Standardgröße (Nordwestecke). */
  startLage: LonLat;
}

/** Lage eines Punktes des Hofs (Meter, x Osten, y Süden) auf der Karte. */
export function hofZuGeo(ursprung: LonLat, x: number, y: number): LonLat {
  return new LocalProj(ursprung[0], ursprung[1]).toLonLat([x, -y]);
}

/** Ecken eines nach Norden ausgerichteten Rechtecks (Nordwestecke nw, Breite b nach Osten, Tiefe t nach Süden). */
export function rechteckRing(nw: LonLat, b: number, t: number): LonLat[] {
  const p = new LocalProj(nw[0], nw[1]);
  return [[0, 0], [b, 0], [b, -t], [0, -t], [0, 0]].map((q) => p.toLonLat(q as XY));
}

const kreuzen = (a: XY, b: XY, c: XY, d: XY): boolean => {
  const o = (p: XY, q: XY, r: XY) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

/** Liegt das Rechteck ganz in der Fläche? Ecken innen, keine Kante der Fläche schneidet hinein. */
export function rechteckInFlaeche(ring: LonLat[], nw: LonLat, b: number, t: number): boolean {
  const p = new LocalProj(nw[0], nw[1]);
  const r = ring.map((q) => p.toXY(q));
  const ecken: XY[] = [[0, 0], [b, 0], [b, -t], [0, -t]];
  if (!ecken.every((e) => pointInRing(e, r))) return false;
  for (let i = 1; i < r.length; i++) {
    const [x, y] = r[i];
    if (x > 0 && x < b && y < 0 && y > -t) return false;
    for (let k = 0; k < 4; k++) if (kreuzen(r[i - 1], r[i], ecken[k], ecken[(k + 1) % 4])) return false;
  }
  return true;
}

/** Sucht eine Lage für ein Rechteck b × t in der Fläche, möglichst nah an ihrer Mitte. */
export function findeLage(ring: LonLat[], b: number, t: number, schrittM: number): LonLat | null {
  const z = ringCentroid(ring);
  const p = new LocalProj(z[0], z[1]);
  const xy = ring.map((q) => p.toXY(q));
  const minX = Math.min(...xy.map((q) => q[0])), maxX = Math.max(...xy.map((q) => q[0]));
  const minY = Math.min(...xy.map((q) => q[1])), maxY = Math.max(...xy.map((q) => q[1]));
  const kand: [number, number, number][] = [];
  for (let x = minX; x + b <= maxX; x += schrittM)
    for (let y = maxY; y - t >= minY; y -= schrittM) kand.push([Math.hypot(x + b / 2, y - t / 2), x, y]);
  kand.sort((a, c) => a[0] - c[0]);
  for (const [, x, y] of kand) {
    const nw = p.toLonLat([x, y]);
    if (rechteckInFlaeche(ring, nw, b, t)) return nw;
  }
  return null;
}

const indexCache = new WeakMap<RoadNetwork, { proj: LocalProj; index: EdgeIndex }>();
function edgeIndex(net: RoadNetwork, zelleM: number): { proj: LocalProj; index: EdgeIndex } {
  let e = indexCache.get(net);
  if (!e) {
    const c = net.nodeCoords[0] ?? [0, 0];
    const proj = new LocalProj(c[0], c[1]);
    e = { proj, index: new EdgeIndex(net, proj, zelleM) };
    indexCache.set(net, e);
  }
  return e;
}

/** Punkte entlang eines Rings im Abstand von höchstens abstandM (Ecken eingeschlossen). */
export function verdichte(ring: LonLat[], abstandM: number): LonLat[] {
  const out: LonLat[] = [];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    const n = Math.max(1, Math.ceil(haversine(a, b) / abstandM));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(ring[ring.length - 1]);
  return out;
}

/** Nächster Punkt des Busnetzes zu einem der Punkte. */
export function naechsteStrasse(net: RoadNetwork, punkte: LonLat[], radiusM: number, zelleM: number): { edge: number; distM: number; punkt: LonLat; strasse: string } | null {
  const { proj, index } = edgeIndex(net, zelleM);
  let best: { edge: number; distM: number; punkt: LonLat; strasse: string } | null = null;
  for (const q of punkte)
    for (const id of index.near(q, radiusM)) {
      const pr = projectOnLine(q, net.edges[id].coords, proj);
      if (pr.dist <= radiusM && (!best || pr.dist < best.distM)) best = { edge: id, distM: pr.dist, punkt: pr.point, strasse: net.edges[id].name };
    }
  return best;
}

/**
 * Standorte für Betriebshöfe: Gewerbe- und Industrieflächen in der Gemeinde. Der Preis je m² steigt mit der Lage,
 * gemessen an Einwohnern und Arbeitsplätzen im Umkreis, von der Randlage (billig) bis zur zentralen Lage (teuer).
 */
export function buildStandorte(extract: OsmExtract, gemeinde: AdminArea, net: RoadNetwork, zellen: DemandCell[], cfg: GrundstueckConfig): Standort[] {
  const roh: Omit<Standort, "preisEurM2">[] = [];
  for (const e of extract.elements) {
    if (e.type !== "way" || !cfg.landnutzung.includes(e.tags?.landuse ?? "") || !e.geometry || e.geometry.length < 4 || !e.geometry.every(Boolean)) continue;
    const ring = e.geometry.map((p) => [p!.lon, p!.lat] as LonLat);
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) continue;
    const zentrum = ringCentroid(ring);
    if (!inArea(zentrum, gemeinde)) continue;
    const flaecheM2 = ringAreaM2(ring, new LocalProj(zentrum[0], zentrum[1]));
    if (flaecheM2 < cfg.mindestflaecheM2) continue;
    const startLage = findeLage(ring, cfg.startBreiteM, cfg.startTiefeM, cfg.lageSuchschrittM);
    if (!startLage) continue;
    // Anbindung entlang der ganzen Grenze messen, nicht nur an den Ecken
    const str = naechsteStrasse(net, verdichte(ring, cfg.anbindungStuetzabstandM), cfg.anbindungSuchradiusM, cfg.indexZelleM);
    if (!str) continue;
    let dichte = 0;
    for (const c of zellen) if (haversine(c.center, zentrum) <= cfg.dichteRadiusM) dichte += c.einwohner + c.arbeitsplaetze;
    roh.push({ id: e.id, name: e.tags?.name ?? "", landnutzung: e.tags!.landuse!, ring, flaecheM2: Math.round(flaecheM2), zentrum, dichte: Math.round(dichte), anbindungM: Math.round(str.distM), strasse: str.strasse, startLage });
  }
  const maxDichte = Math.max(0, ...roh.map((s) => s.dichte));
  return roh
    .map((s) => ({ ...s, preisEurM2: bodenpreis(s.dichte, maxDichte, cfg) }))
    .sort((a, b) => a.preisEurM2 - b.preisEurM2 || a.id - b.id);
}

/** Bodenpreis je m²: linear zwischen Randlage und zentraler Lage nach der Dichte im Umkreis. */
export function bodenpreis(dichte: number, maxDichte: number, cfg: GrundstueckConfig): number {
  const anteil = maxDichte > 0 ? dichte / maxDichte : 0;
  return Math.round(cfg.bodenpreisMinEurM2 + (cfg.bodenpreisMaxEurM2 - cfg.bodenpreisMinEurM2) * anteil);
}

export type StartFehler = "ungueltigeMasse" | "zuKlein" | "zuGross" | "seitenverhaeltnis" | "nichtInFlaeche" | "geldFehlt";

/** Prüft das Startgrundstück: Rechteck in der OSM-Fläche, mindestens Mindestgröße, höchstens 10 Hektar, Seitenverhältnis höchstens 1 zu 10. */
export function pruefeStartgrundstueck(s: Standort, nw: LonLat, b: number, t: number, cfg: GrundstueckConfig): StartFehler | null {
  if (!Number.isInteger(b) || !Number.isInteger(t) || b <= 0 || t <= 0) return "ungueltigeMasse";
  if (b * t < cfg.mindestflaecheM2 || Math.min(b, t) < cfg.mindestSeiteM) return "zuKlein";
  if (b * t > cfg.hoechstflaecheM2) return "zuGross";
  if (!seitenverhaeltnisOk({ b, t }, cfg.maxSeitenverhaeltnis)) return "seitenverhaeltnis";
  if (!rechteckInFlaeche(s.ring, nw, b, t)) return "nichtInFlaeche";
  return null;
}

/** Kauft das Startgrundstück. Nur mit ausreichendem Kontostand. */
export function kaufeStartgrundstueck(kasse: Kasse, s: Standort, nw: LonLat, b: number, t: number, cfg: GrundstueckConfig): { ok: true; grundstueck: Grundstueck } | { ok: false; fehler: StartFehler } {
  const f = pruefeStartgrundstueck(s, nw, b, t, cfg);
  if (f) return { ok: false, fehler: f };
  const preis = Math.round(b * t * s.preisEurM2 * 100) / 100;
  if (kasse.kontostandEur < preis) return { ok: false, fehler: "geldFehlt" };
  kasse.kontostandEur = Math.round((kasse.kontostandEur - preis) * 100) / 100;
  return {
    ok: true,
    grundstueck: { standortId: s.id, standortName: s.name, ursprung: nw, flaeche: { x: 0, y: 0, b, t }, preisEurM2: s.preisEurM2, kaufpreisEur: preis },
  };
}

/** Anbindung des Tors an die nächste Busstraße: Mitte der Torseite am Grundstücksrand. */
export function torAnbindung(hof: Betriebshof, torId: number, seite: Seite, net: RoadNetwork, cfg: GrundstueckConfig) {
  const t = hof.bauteile.find((b) => b.id === torId);
  if (!t) return null;
  const [x, y] =
    seite === "n" ? [t.x + t.b / 2, t.y] : seite === "s" ? [t.x + t.b / 2, t.y + t.t] : seite === "w" ? [t.x, t.y + t.t / 2] : [t.x + t.b, t.y + t.t / 2];
  const geo = hofZuGeo(hof.grundstueck.ursprung, x, y);
  const s = naechsteStrasse(net, [geo], cfg.anbindungSuchradiusM, cfg.indexZelleM);
  return s ? { ...s, tor: geo } : null;
}
