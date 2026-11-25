import type { Bus } from "../catalog/katalog";
import type { BetriebshofConfig, GrundstueckConfig } from "../config";
import type { LonLat } from "../world/geo";
import { enthaelt, flaecheM2, kurzLang, ueberlappt, type Rechteck, type Seite } from "./rechteck";

/** Alle Bauteile der Bauteiltabelle im Konzept. Alle sind von Anfang an baubar. */
export const BAUTEIL_TYPEN = [
  "tor", "fahrweg", "stellplatz", "halle", "werkstatt", "waschanlage", "lager",
  "buero", "tankstelle", "ladeplatz", "toilette", "kueche", "pausenraum",
] as const;
export type BauteilTyp = (typeof BAUTEIL_TYPEN)[number];

/** Flächen, auf denen Busse fahren. */
export const BEFAHRBAR: readonly BauteilTyp[] = ["tor", "fahrweg"];
/** Ein Bus pro Platz, Zufahrt über eine Stirnseite (kurze Seite). */
export const BUSPLATZ: readonly BauteilTyp[] = ["stellplatz", "ladeplatz"];
/** Gebäude und Anlagen, in die ein Bus hineinfährt. */
export const BUSANLAGE: readonly BauteilTyp[] = ["werkstatt", "waschanlage", "tankstelle"];
/** Räume ohne Busverkehr; sie hängen an Fahrweg, Tor oder an einem verbundenen Gebäude. */
export const RAUM: readonly BauteilTyp[] = ["buero", "lager", "toilette", "kueche", "pausenraum"];
/** Gebäude, an die Räume anschließen dürfen. */
export const GEBAEUDE: readonly BauteilTyp[] = ["halle", "werkstatt", "waschanlage", ...RAUM];

export interface Bauteil extends Rechteck {
  id: number;
  typ: BauteilTyp;
  /** Nur beim Ladeplatz: vom Spieler eingestellte Ladeleistung. */
  ladeleistungKw?: number;
}

export interface Grundstueck {
  /** OSM-ID der Gewerbe- oder Industriefläche, auf der das Startgrundstück liegt. */
  standortId: number;
  standortName: string;
  /** Geografische Lage des Hofpunkts (0, 0). Das Grundstück ist nach Norden ausgerichtet. */
  ursprung: LonLat;
  flaeche: Rechteck;
  preisEurM2: number;
  /** Summe aller Grundstückskäufe. */
  kaufpreisEur: number;
}

export interface Betriebshof {
  version: 1;
  grundstueck: Grundstueck;
  bauteile: Bauteil[];
  naechsteId: number;
}

/** Maße eines Busses aus dem Katalog, in Metern. */
export interface BusMass {
  laengeM: number;
  breiteM: number;
  bauart?: string;
}

export interface HofKontext {
  cfg: BetriebshofConfig;
  /** Nutzbare Busse aus dem Katalog (nur Maße). Bestimmen die Mindestmaße von Stell- und Ladeplätzen. */
  busse: BusMass[];
}

/** Konto des Spielers. Käufe sind nur mit ausreichendem Kontostand möglich (Konto darf durch Käufe nicht ins Minus). */
export interface Kasse {
  kontostandEur: number;
}

const cent = (x: number) => Math.round(x * 100) / 100;

/** Maße der nutzbaren Katalogmodelle in Metern (Straßenbahnen ausgenommen, sie stehen nicht im Betriebshof). */
export function busMasseAusKatalog(modelle: Pick<Bus, "laenge_mm" | "breite_mm" | "bauart" | "fahrzeugart">[]): BusMass[] {
  return modelle
    .filter((m) => m.fahrzeugart !== "Tram" && m.laenge_mm && m.breite_mm)
    .map((m) => ({ laengeM: m.laenge_mm! / 1000, breiteM: m.breite_mm! / 1000, bauart: m.bauart ?? "" }));
}

/** Kleinster Bus: kürzeste Länge und schmalste Breite im Katalog. */
export function kleinsterBus(busse: BusMass[]): BusMass {
  if (!busse.length) throw new Error("Keine Busse im Katalog");
  return { laengeM: Math.min(...busse.map((b) => b.laengeM)), breiteM: Math.min(...busse.map((b) => b.breiteM)) };
}

/** Größte Maße je Bauart (für die Anzeige der Hallenplätze). */
export function groessterJeBauart(busse: BusMass[]): Record<string, BusMass> {
  const out: Record<string, BusMass> = {};
  for (const b of busse) {
    const k = b.bauart ?? "";
    const o = out[k];
    out[k] = { bauart: k, laengeM: Math.max(o?.laengeM ?? 0, b.laengeM), breiteM: Math.max(o?.breiteM ?? 0, b.breiteM) };
  }
  return out;
}

/** Platzbedarf eines Busses auf einem Stell- oder Ladeplatz: Länge plus Rangierraum, Breite plus Seitenabstand. */
export const platzbedarf = (bus: BusMass, cfg: BetriebshofConfig): { kurz: number; lang: number } => ({
  kurz: bus.breiteM + cfg.seitenabstandM,
  lang: bus.laengeM + cfg.rangierraumM,
});

/** Mindestmaß (kurze, lange Seite) eines Bauteils. */
export function mindestmass(typ: BauteilTyp, ctx: HofKontext): { kurz: number; lang: number } {
  const bt = ctx.cfg.bauteile[typ];
  if (bt.nachBus) return platzbedarf(kleinsterBus(ctx.busse), ctx.cfg);
  return { kurz: bt.minA, lang: bt.minB };
}

/** Passt Bus X auf Stell- oder Ladeplatz Y? Nur die Maße; ob der Platz frei und erreichbar ist, prüft der Aufrufer. */
export function passtBus(bus: BusMass, platz: { b: number; t: number }, cfg: BetriebshofConfig): boolean {
  const [kurz, lang] = kurzLang(platz);
  const p = platzbedarf(bus, cfg);
  return p.kurz <= kurz + 1e-9 && p.lang <= lang + 1e-9;
}

export function baukostenEur(typ: BauteilTyp, r: { b: number; t: number }, cfg: BetriebshofConfig): number {
  return cent(r.b * r.t * cfg.bauteile[typ].kostenEurM2);
}

export function neuerHof(g: Grundstueck): Betriebshof {
  return { version: 1, grundstueck: g, bauteile: [], naechsteId: 1 };
}

export type BauFehler = "ungueltigeMasse" | "zuKlein" | "ausserhalb" | "ueberlappung" | "geldFehlt";

/** Prüft, ob ein Bauteil an dieser Stelle gebaut werden darf (ohne Geld). */
export function pruefeLage(hof: Betriebshof, typ: BauteilTyp, r: Rechteck, ctx: HofKontext, ohneId?: number): BauFehler | null {
  // Ganze Meter: die kleinste Rastergröße ist 1 m
  if (![r.x, r.y, r.b, r.t].every(Number.isInteger) || r.b <= 0 || r.t <= 0) return "ungueltigeMasse";
  const min = mindestmass(typ, ctx);
  const [kurz, lang] = kurzLang(r);
  if (kurz < min.kurz - 1e-9 || lang < min.lang - 1e-9) return "zuKlein";
  if (!enthaelt(hof.grundstueck.flaeche, r)) return "ausserhalb";
  if (hof.bauteile.some((b) => b.id !== ohneId && ueberlappt(b, r))) return "ueberlappung";
  return null;
}

export type BauErgebnis = { ok: true; bauteil: Bauteil; kostenEur: number } | { ok: false; fehler: BauFehler };

/** Baut ein Bauteil sofort (keine Bauzeit) und bucht die Kosten ab. */
export function bauen(hof: Betriebshof, kasse: Kasse, typ: BauteilTyp, r: Rechteck, ctx: HofKontext): BauErgebnis {
  const f = pruefeLage(hof, typ, r, ctx);
  if (f) return { ok: false, fehler: f };
  const kostenEur = baukostenEur(typ, r, ctx.cfg);
  if (kasse.kontostandEur < kostenEur) return { ok: false, fehler: "geldFehlt" };
  const bauteil: Bauteil = { id: hof.naechsteId++, typ, x: r.x, y: r.y, b: r.b, t: r.t };
  if (typ === "ladeplatz") bauteil.ladeleistungKw = ctx.cfg.ladeleistungKw.standard;
  hof.bauteile.push(bauteil);
  kasse.kontostandEur = cent(kasse.kontostandEur - kostenEur);
  return { ok: true, bauteil, kostenEur };
}

/** Reißt ein Bauteil ab und erstattet einen Teil der Baukosten. */
export function abreissen(hof: Betriebshof, kasse: Kasse, id: number, cfg: BetriebshofConfig): number | null {
  const i = hof.bauteile.findIndex((b) => b.id === id);
  if (i < 0) return null;
  const [b] = hof.bauteile.splice(i, 1);
  const erstattung = cent(baukostenEur(b.typ, b, cfg) * cfg.abrissErstattung);
  kasse.kontostandEur = cent(kasse.kontostandEur + erstattung);
  return erstattung;
}

/** Ladeleistung eines Ladeplatzes einstellen. Wirkt nur auf die Ladedauer. */
export function setzeLadeleistung(hof: Betriebshof, id: number, kw: number, cfg: BetriebshofConfig): boolean {
  const b = hof.bauteile.find((x) => x.id === id);
  if (!b || b.typ !== "ladeplatz" || !Number.isFinite(kw) || kw < cfg.ladeleistungKw.min || kw > cfg.ladeleistungKw.max) return false;
  b.ladeleistungKw = Math.round(kw);
  return true;
}

export type ZukaufFehler = "ungueltig" | "zuGross" | "seitenverhaeltnis" | "geldFehlt";

/** Hält das Rechteck das höchste Seitenverhältnis ein (lange Seite höchstens max mal die kurze)? */
export function seitenverhaeltnisOk(r: { b: number; t: number }, max: number): boolean {
  return Math.max(r.b, r.t) <= max * Math.min(r.b, r.t) + 1e-9;
}

/** Neue Grundstücksfläche, wenn Seite s um m Meter verlängert wird. */
export function erweitert(f: Rechteck, s: Seite, m: number): Rechteck {
  if (s === "n") return { x: f.x, y: f.y - m, b: f.b, t: f.t + m };
  if (s === "s") return { x: f.x, y: f.y, b: f.b, t: f.t + m };
  if (s === "w") return { x: f.x - m, y: f.y, b: f.b + m, t: f.t };
  return { x: f.x, y: f.y, b: f.b + m, t: f.t };
}

export function zukaufKostenEur(hof: Betriebshof, s: Seite, m: number): number {
  const f = hof.grundstueck.flaeche;
  return cent((flaecheM2(erweitert(f, s, m)) - flaecheM2(f)) * hof.grundstueck.preisEurM2);
}

/** Kauft angrenzende Fläche zu: verlängert eine Seite, zum Preis der Lage, bis höchstens zur Höchstfläche (10 Hektar). */
export function zukaufen(hof: Betriebshof, kasse: Kasse, s: Seite, m: number, g: GrundstueckConfig): { ok: true; kostenEur: number } | { ok: false; fehler: ZukaufFehler } {
  if (!Number.isInteger(m) || m < 1) return { ok: false, fehler: "ungueltig" };
  const neu = erweitert(hof.grundstueck.flaeche, s, m);
  if (flaecheM2(neu) > g.hoechstflaecheM2) return { ok: false, fehler: "zuGross" };
  // Abgelehnt wird nur, was die Grenze überschreitet; ein Zukauf, der ein zu schmales Grundstück verbessert, bleibt erlaubt.
  const verhaeltnis = (r: Rechteck) => Math.max(r.b, r.t) / Math.min(r.b, r.t);
  if (!seitenverhaeltnisOk(neu, g.maxSeitenverhaeltnis) && verhaeltnis(neu) >= verhaeltnis(hof.grundstueck.flaeche) - 1e-12)
    return { ok: false, fehler: "seitenverhaeltnis" };
  const kostenEur = zukaufKostenEur(hof, s, m);
  if (kasse.kontostandEur < kostenEur) return { ok: false, fehler: "geldFehlt" };
  hof.grundstueck.flaeche = neu;
  hof.grundstueck.kaufpreisEur = cent(hof.grundstueck.kaufpreisEur + kostenEur);
  kasse.kontostandEur = cent(kasse.kontostandEur - kostenEur);
  return { ok: true, kostenEur };
}

/** Größte Strecke, um die Seite s noch verlängert werden darf, ohne Höchstfläche oder Seitenverhältnis zu überschreiten. */
export function zukaufHoechstM(hof: Betriebshof, s: Seite, g: GrundstueckConfig): number {
  const f = hof.grundstueck.flaeche;
  // Verlängert wird die Ausdehnung senkrecht zur gewählten Seite; die Seite selbst ("quer") bleibt gleich lang.
  const [quer, laenge] = s === "n" || s === "s" ? [f.b, f.t] : [f.t, f.b];
  const nachFlaeche = Math.floor((g.hoechstflaecheM2 - flaecheM2(f)) / quer);
  const nachVerhaeltnis = Math.floor(g.maxSeitenverhaeltnis * quer + 1e-9) - laenge;
  return Math.max(0, Math.min(nachFlaeche, nachVerhaeltnis));
}

// Speichern und Laden (Kriterium 13). Das Format trägt eine Version, damit alte Stände ladbar bleiben.

export class HofLadeFehler extends Error {}

export function serialisiereHof(h: Betriebshof): string {
  return JSON.stringify(h);
}

export function ladeHof(json: string | unknown): Betriebshof {
  const o = (typeof json === "string" ? JSON.parse(json) : json) as Betriebshof;
  const zahl = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const rechteck = (r: Rechteck | undefined) => !!r && zahl(r.x) && zahl(r.y) && zahl(r.b) && zahl(r.t);
  if (o?.version !== 1) throw new HofLadeFehler(`Unbekannte Version des Betriebshofs: ${String(o?.version)}`);
  const g = o.grundstueck;
  if (!g || !rechteck(g.flaeche) || !zahl(g.preisEurM2) || !zahl(g.kaufpreisEur) || !Array.isArray(g.ursprung)) throw new HofLadeFehler("Grundstück fehlt oder ist unvollständig");
  if (!Array.isArray(o.bauteile) || !zahl(o.naechsteId)) throw new HofLadeFehler("Bauteile fehlen");
  const ids = new Set<number>();
  for (const b of o.bauteile) {
    if (!rechteck(b) || !BAUTEIL_TYPEN.includes(b.typ) || !zahl(b.id) || ids.has(b.id) || b.id >= o.naechsteId) throw new HofLadeFehler(`Bauteil ungültig: ${JSON.stringify(b)}`);
    ids.add(b.id);
  }
  return {
    version: 1,
    grundstueck: { standortId: g.standortId, standortName: g.standortName, ursprung: [g.ursprung[0], g.ursprung[1]], flaeche: { ...g.flaeche }, preisEurM2: g.preisEurM2, kaufpreisEur: g.kaufpreisEur },
    bauteile: o.bauteile.map((b) => ({ id: b.id, typ: b.typ, x: b.x, y: b.y, b: b.b, t: b.t, ...(b.ladeleistungKw !== undefined ? { ladeleistungKw: b.ladeleistungKw } : {}) })),
    naechsteId: o.naechsteId,
  };
}
