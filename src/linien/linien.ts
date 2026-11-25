import { PLAN_TAGE, type LinienConfig, type PlanTag } from "../config";
import { haversine, type LonLat } from "../world/geo";
import type { Snap } from "../world/router";
import type { Stop } from "../world/stops";
import { grundtagVon, taktAbfahrten, taktQuelle, verwaisteAenderungen, type Grundtag } from "./fahrplan";
import type { PlanAnfrage } from "./plan";
import type { FahrtAenderung, HaltDaten, HaltId, Linie, Netz, NeueHaltestelle, Perle, PerleAufgeloest, TaktZeile, Variante, VariantenArt } from "./typen";

/* ---------- Haltestellen ---------- */

export const osmHaltId = (osm: number): HaltId => `o${osm}`;

/** Verzeichnis aller Haltestellen: vorhandene aus OSM und neue aus dem Spielstand, mit Namen nach Umbenennung. */
export class Haltestellen {
  private readonly osm = new Map<HaltId, Stop>();
  constructor(
    stops: readonly Stop[],
    private readonly netz: Netz,
  ) {
    for (const s of stops) this.osm.set(osmHaltId(s.id), s);
  }
  hole(id: HaltId): HaltDaten | null {
    const s = this.osm.get(id);
    if (s) return { id, name: this.netz.namen[id] ?? s.name, coord: s.coord, snaps: s.snaps };
    const n = this.netz.neueHaltestellen.find((x) => x.id === id);
    return n ? { id, name: this.netz.namen[id] ?? n.name, coord: n.coord, snaps: n.snaps } : null;
  }
  alle(): HaltDaten[] {
    return [...[...this.osm.keys()].map((id) => this.hole(id)!), ...this.netz.neueHaltestellen.map((n) => this.hole(n.id)!)];
  }
  istNeu(id: HaltId): boolean {
    return this.netz.neueHaltestellen.some((n) => n.id === id);
  }
}

export type HaltFehler = "nameLeer" | "nameZuLang" | "ohneNetz" | "gesperrt" | "unbekannt";

const pruefeName = (name: string, cfg: LinienConfig): HaltFehler | null => (!name.trim() ? "nameLeer" : name.trim().length > cfg.nameMaxLaenge ? "nameZuLang" : null);

/**
 * Neue Haltestelle (Konzept: Haltestellen festlegen). Nur in freigeschalteten Gebieten und nur, wenn sie innerhalb des
 * Fangradius an einer Busstraße liegt. In Phase 1 kostenlos (F1); die Ausstattung kommt in Etappe 7a.
 */
export function neueHaltestelle(netz: Netz, name: string, coord: LonLat, snaps: Snap[], freigeschaltet: boolean, cfg: LinienConfig): { ok: true; halt: NeueHaltestelle } | { ok: false; fehler: HaltFehler } {
  const f = pruefeName(name, cfg);
  if (f) return { ok: false, fehler: f };
  if (!freigeschaltet) return { ok: false, fehler: "gesperrt" };
  if (!snaps.length) return { ok: false, fehler: "ohneNetz" };
  const halt: NeueHaltestelle = { id: `n${netz.naechsteHaltestelleId++}`, name: name.trim(), coord, snaps };
  netz.neueHaltestellen.push(halt);
  return { ok: true, halt };
}

/** Umbenennen einer vorhandenen oder neuen Haltestelle. */
export function benenneHaltestelle(netz: Netz, halte: Haltestellen, id: HaltId, name: string, cfg: LinienConfig): HaltFehler | null {
  if (!halte.hole(id)) return "unbekannt";
  const f = pruefeName(name, cfg);
  if (f) return f;
  netz.namen[id] = name.trim();
  return null;
}

/** Neue Haltestelle löschen, solange keine Linie sie nutzt. */
export function loescheHaltestelle(netz: Netz, id: HaltId): "unbekannt" | "benutzt" | null {
  const i = netz.neueHaltestellen.findIndex((n) => n.id === id);
  if (i < 0) return "unbekannt";
  const nutzt = (p: Perle[]) => p.some((x) => x.art === "halt" && x.halt === id);
  if (netz.linien.some((l) => nutzt(l.perlen) || l.varianten.some((v) => nutzt(v.perlen)))) return "benutzt";
  netz.neueHaltestellen.splice(i, 1);
  delete netz.namen[id];
  return null;
}

/**
 * Gegenhaltestelle für die Rückrichtung (F2): Haltestelle mit gleichem Namen im Umkreis, die nächste zuerst.
 * Gibt es keine, bleibt es dieselbe Haltestelle.
 */
export function gegenhaltestelle(id: HaltId, halte: Haltestellen, cfg: LinienConfig): HaltId {
  const h = halte.hole(id);
  if (!h || !h.name) return id;
  let best: { id: HaltId; d: number } | null = null;
  for (const x of halte.alle()) {
    if (x.id === id || x.name !== h.name || !x.snaps.length) continue;
    const d = haversine(h.coord, x.coord);
    if (d <= cfg.gegenhaltestelleRadiusM && (!best || d < best.d || (d === best.d && x.id < best.id))) best = { id: x.id, d };
  }
  return best?.id ?? id;
}

/* ---------- Linien ---------- */

export type LinienFehler = "nummerLeer" | "nummerZuLang" | "nummerDoppelt" | "nameLeer" | "nameZuLang" | "farbe" | "unbekannt";

export interface LinienEingabe {
  nummer: string;
  name: string;
  farbe: string;
}

function pruefeLinie(netz: Netz, e: LinienEingabe, cfg: LinienConfig, ohneId?: number): LinienFehler | null {
  const n = e.nummer.trim();
  if (!n) return "nummerLeer";
  if (n.length > cfg.nummerMaxLaenge) return "nummerZuLang";
  // Eindeutig je Unternehmen, ohne Unterschied zwischen Groß- und Kleinschreibung (F4)
  if (netz.linien.some((l) => l.id !== ohneId && l.nummer.toLowerCase() === n.toLowerCase())) return "nummerDoppelt";
  if (!e.name.trim()) return "nameLeer";
  if (e.name.trim().length > cfg.nameMaxLaenge) return "nameZuLang";
  if (!/^#[0-9a-f]{6}$/i.test(e.farbe)) return "farbe";
  return null;
}

/** Nächste Farbe der Vorschlagspalette, die noch keine Linie hat (sonst reihum). */
export function vorschlagFarbe(netz: Netz, cfg: LinienConfig): string {
  const frei = cfg.farben.find((f) => !netz.linien.some((l) => l.farbe.toLowerCase() === f.toLowerCase()));
  return frei ?? cfg.farben[netz.linien.length % cfg.farben.length];
}

export function legeLinieAn(netz: Netz, e: LinienEingabe, cfg: LinienConfig): { ok: true; linie: Linie } | { ok: false; fehler: LinienFehler } {
  const f = pruefeLinie(netz, e, cfg);
  if (f) return { ok: false, fehler: f };
  const linie: Linie = { id: netz.naechsteLinieId++, nummer: e.nummer.trim(), name: e.name.trim(), farbe: e.farbe.toLowerCase(), aktiv: true, perlen: [], varianten: [], busse: [] };
  netz.linien.push(linie);
  return { ok: true, linie };
}

export function aendereLinie(netz: Netz, id: number, e: LinienEingabe, cfg: LinienConfig): LinienFehler | null {
  const l = netz.linien.find((x) => x.id === id);
  if (!l) return "unbekannt";
  const f = pruefeLinie(netz, e, cfg, id);
  if (f) return f;
  l.nummer = e.nummer.trim();
  l.name = e.name.trim();
  l.farbe = e.farbe.toLowerCase();
  return null;
}

export function setzeAktiv(netz: Netz, id: number, aktiv: boolean): boolean {
  const l = netz.linien.find((x) => x.id === id);
  if (!l) return false;
  l.aktiv = aktiv;
  return true;
}

export function loescheLinie(netz: Netz, id: number): boolean {
  const i = netz.linien.findIndex((x) => x.id === id);
  if (i < 0) return false;
  netz.linien.splice(i, 1);
  return true;
}

/* ---------- Perlenkette ---------- */

export type PerlenFehler = "ohneNetz" | "gesperrt" | "unbekannt" | "doppelt";

/**
 * Haltestelle in eine Perlenkette einfügen (Index = Position, Standard am Ende). Haltestellen ohne Anschluss ans Busnetz
 * und Haltestellen in nicht freigeschalteten Gebieten sind nicht erlaubt (Konzept: Durchfahrt ohne Halt). Dieselbe
 * Haltestelle zweimal direkt hintereinander ist nicht erlaubt.
 */
export function fuegeHaltEin(perlen: Perle[], halte: Haltestellen, id: HaltId, freigeschaltet: (h: HaltDaten) => boolean, cfg: LinienConfig, index = perlen.length): PerlenFehler | null {
  const h = halte.hole(id);
  if (!h) return "unbekannt";
  if (!h.snaps.length) return "ohneNetz";
  if (!freigeschaltet(h)) return "gesperrt";
  const vor = perlen[index - 1], nach = perlen[index];
  if ((vor?.art === "halt" && vor.halt === id) || (nach?.art === "halt" && nach.halt === id)) return "doppelt";
  perlen.splice(Math.max(0, Math.min(index, perlen.length)), 0, { art: "halt", halt: id, standzeitS: cfg.standzeitStandardS });
  return null;
}

/** Wegpunkt einfügen. Wegpunkte dürfen auch in nicht freigeschalteten Gebieten liegen (Durchfahrt ohne Halt). */
export function fuegeWegpunktEin(perlen: Perle[], coord: LonLat, snaps: Snap[], index = perlen.length): PerlenFehler | null {
  if (!snaps.length) return "ohneNetz";
  perlen.splice(Math.max(0, Math.min(index, perlen.length)), 0, { art: "weg", coord, snaps });
  return null;
}

export function entfernePerle(perlen: Perle[], i: number): boolean {
  if (i < 0 || i >= perlen.length) return false;
  perlen.splice(i, 1);
  return true;
}

export function verschiebePerle(perlen: Perle[], i: number, um: -1 | 1): boolean {
  const j = i + um;
  if (i < 0 || i >= perlen.length || j < 0 || j >= perlen.length) return false;
  [perlen[i], perlen[j]] = [perlen[j], perlen[i]];
  return true;
}

/** Haltestelle einer Perle ersetzen (zum Beispiel durch eine andere Gegenhaltestelle). */
export function ersetzeHalt(perlen: Perle[], i: number, halte: Haltestellen, id: HaltId, freigeschaltet: (h: HaltDaten) => boolean): PerlenFehler | null {
  const p = perlen[i];
  const h = halte.hole(id);
  if (!p || p.art !== "halt" || !h) return "unbekannt";
  if (!h.snaps.length) return "ohneNetz";
  if (!freigeschaltet(h)) return "gesperrt";
  p.halt = id;
  return null;
}

/** Perlen für die Berechnung auflösen. Unbekannte Haltestellen (zum Beispiel nach einem neuen OSM-Auszug) liegen ohne Netz. */
export function loesePerlenAuf(perlen: readonly Perle[], halte: Haltestellen): PerleAufgeloest[] {
  return perlen.map((p) => {
    if (p.art === "weg") return { halt: null, coord: p.coord, snaps: p.snaps, standzeitS: 0 };
    const h = halte.hole(p.halt);
    return h ? { halt: h, coord: h.coord, snaps: h.snaps, standzeitS: p.standzeitS } : { halt: { id: p.halt, name: p.halt, coord: [0, 0], snaps: [] }, coord: [0, 0], snaps: [], standzeitS: p.standzeitS };
  });
}

/** Anfrage für die Berechnung einer Linie im Worker. */
export function planAnfrage(l: Linie, halte: Haltestellen, hof: Snap[] | null): PlanAnfrage {
  return {
    linieId: l.id,
    aktiv: l.aktiv,
    varianten: l.varianten.map((v) => ({ id: v.id, wendezeitS: v.wendezeitS, takt: v.takt, eigenerFerientakt: v.eigenerFerientakt, aenderungen: v.aenderungen, perlen: loesePerlenAuf(v.perlen, halte) })),
    hof,
  };
}

/* ---------- Varianten ---------- */

const leererTakt = (): Record<PlanTag, TaktZeile[]> => Object.fromEntries(PLAN_TAGE.map((t) => [t, []])) as unknown as Record<PlanTag, TaktZeile[]>;

function neueVariante(netz: Netz, art: VariantenArt, name: string, perlen: Perle[], cfg: LinienConfig): Variante {
  return { id: netz.naechsteVarianteId++, art, name, perlen, wendezeitS: cfg.wendezeitStandardS, takt: leererTakt(), eigenerFerientakt: { werktag: false, samstag: false, sonnFeiertag: false }, aenderungen: [] };
}

const kopie = (p: Perle): Perle => (p.art === "halt" ? { ...p } : { art: "weg", coord: [...p.coord] as LonLat, snaps: p.snaps.map((s) => ({ ...s, point: [...s.point] as LonLat })) });

/** Name einer Variante aus Start- und Zielhaltestelle, zum Beispiel "Garstedt nach Norderstedt Mitte". */
export function variantenName(perlen: readonly Perle[], halte: Haltestellen, nach: string): string {
  const h = perlen.filter((p): p is Extract<Perle, { art: "halt" }> => p.art === "halt");
  if (!h.length) return "";
  const name = (id: HaltId) => halte.hole(id)?.name || id;
  return `${name(h[0].halt)} ${nach} ${name(h[h.length - 1].halt)}`;
}

/**
 * Hin- und Rückrichtung aus der Grundlinie (F2, F13). Die Hinrichtung übernimmt die Perlen, die Rückrichtung die Perlen
 * in umgekehrter Reihenfolge mit Gegenhaltestellen. Gibt es die Richtung schon, werden nur ihre Perlen ersetzt; Takt,
 * Wendezeit und Fahrtänderungen bleiben.
 */
export function erzeugeRichtungen(netz: Netz, linie: Linie, halte: Haltestellen, cfg: LinienConfig, nach: string): Variante[] {
  const hin = linie.perlen.map(kopie);
  const rueck = [...linie.perlen].reverse().map((p) => (p.art === "halt" ? { ...p, halt: gegenhaltestelle(p.halt, halte, cfg) } : kopie(p)));
  const out: Variante[] = [];
  for (const [art, perlen] of [["hin", hin], ["rueck", rueck]] as const) {
    const da = linie.varianten.find((v) => v.art === art);
    if (da) {
      da.perlen = perlen;
      da.name = variantenName(perlen, halte, nach);
      out.push(da);
    } else {
      const v = neueVariante(netz, art, variantenName(perlen, halte, nach), perlen, cfg);
      linie.varianten.push(v);
      out.push(v);
    }
  }
  linie.varianten.sort((a, b) => ordnung(a) - ordnung(b) || a.id - b.id);
  return out;
}

const ordnung = (v: Variante) => ({ hin: 0, rueck: 1, kurz: 2 })[v.art];

/**
 * Kurzläufer: Teilstrecke einer Variante von Haltestelle `vonHalt` bis Haltestelle `bisHalt` (Indizes der Haltestellen,
 * nicht der Perlen), mit den Wegpunkten dazwischen.
 */
export function legeKurzlaeuferAn(netz: Netz, linie: Linie, basisId: number, vonHalt: number, bisHalt: number, halte: Haltestellen, cfg: LinienConfig, nach: string): { ok: true; variante: Variante } | { ok: false; fehler: "unbekannt" | "bereich" } {
  const b = linie.varianten.find((v) => v.id === basisId);
  if (!b) return { ok: false, fehler: "unbekannt" };
  const idx = b.perlen.map((p, i) => (p.art === "halt" ? i : -1)).filter((i) => i >= 0);
  if (!(vonHalt >= 0 && bisHalt < idx.length && bisHalt > vonHalt)) return { ok: false, fehler: "bereich" };
  const perlen = b.perlen.slice(idx[vonHalt], idx[bisHalt] + 1).map(kopie);
  const v = neueVariante(netz, "kurz", variantenName(perlen, halte, nach), perlen, cfg);
  v.wendezeitS = b.wendezeitS;
  linie.varianten.push(v);
  linie.varianten.sort((a, c) => ordnung(a) - ordnung(c) || a.id - c.id);
  return { ok: true, variante: v };
}

export function loescheVariante(linie: Linie, id: number): boolean {
  const i = linie.varianten.findIndex((v) => v.id === id);
  if (i < 0) return false;
  linie.varianten.splice(i, 1);
  return true;
}

export function benenneVariante(v: Variante, name: string, cfg: LinienConfig): "nameLeer" | "nameZuLang" | null {
  if (!name.trim()) return "nameLeer";
  if (name.trim().length > cfg.nameMaxLaenge) return "nameZuLang";
  v.name = name.trim();
  return null;
}

/** Standzeit an einer Haltestelle der Variante (ganze 10 s, A3b-5). */
export function setzeStandzeit(perlen: Perle[], i: number, s: number, cfg: LinienConfig): boolean {
  const p = perlen[i];
  if (!p || p.art !== "halt" || !Number.isFinite(s) || s < 0 || s > cfg.standzeitMaxS || s % cfg.rundungS !== 0) return false;
  p.standzeitS = s;
  return true;
}

/** Wendezeit am Endpunkt (ganze 10 s, A3b-6). */
export function setzeWendezeit(v: Variante, s: number, cfg: LinienConfig): boolean {
  if (!Number.isFinite(s) || s < 0 || s > cfg.wendezeitMaxS || s % cfg.rundungS !== 0) return false;
  v.wendezeitS = s;
  return true;
}

/* ---------- Takt ---------- */

export type TaktFehler = "zeit" | "bereich" | "takt";

/** Prüft eine Taktzeile: Zeiten im Betriebstag (4 bis 28 Uhr), Ende nach Beginn, Takt in ganzen Minuten (A3b-7). */
export function pruefeTaktZeile(z: TaktZeile, cfg: LinienConfig): TaktFehler | null {
  const a = cfg.betriebstagBeginnH * 60, e = (24 + cfg.betriebstagBeginnH) * 60;
  if (![z.vonMin, z.bisMin].every((x) => Number.isInteger(x) && x >= a && x <= e)) return "zeit";
  if (!(z.bisMin > z.vonMin)) return "bereich";
  if (!Number.isInteger(z.taktMin) || z.taktMin < cfg.taktMinMin || z.taktMin > cfg.taktMaxMin) return "takt";
  return null;
}

/**
 * Setzt den Takt einer Tagesart. Fahrtänderungen, die danach zu keiner Fahrt mehr passen, werden verworfen und
 * zurückgegeben, damit das Spiel sie melden kann (F10).
 */
export function setzeTakt(v: Variante, tag: PlanTag, zeilen: TaktZeile[], cfg: LinienConfig): { ok: true; verworfen: FahrtAenderung[] } | { ok: false; fehler: TaktFehler; zeile: number } {
  for (let i = 0; i < zeilen.length; i++) {
    const f = pruefeTaktZeile(zeilen[i], cfg);
    if (f) return { ok: false, fehler: f, zeile: i };
  }
  v.takt[tag] = zeilen.map((z) => ({ ...z })).sort((a, b) => a.vonMin - b.vonMin || a.bisMin - b.bisMin);
  const verworfen = verwaisteAenderungen(v);
  v.aenderungen = v.aenderungen.filter((a) => !verworfen.includes(a));
  return { ok: true, verworfen };
}

/** Vorlage für den Takt einer Tagesart (A3b-8). */
export function taktVorlage(tag: PlanTag, cfg: LinienConfig): TaktZeile[] {
  return cfg.taktVorlage[grundtagVon(tag)].map(([von, bis, takt]) => ({ vonMin: von * 60, bisMin: bis * 60, taktMin: takt }));
}

/**
 * Eigenen Ferientakt ein- oder ausschalten. Beim Einschalten übernimmt der Ferientag Takt und Änderungen des Tages ohne
 * Ferien als Ausgangspunkt. Beim Ausschalten gilt wieder der Tag ohne Ferien; der eigene Ferientakt wird gelöscht.
 */
export function setzeEigenenFerientakt(netz: Netz, v: Variante, tag: Grundtag, an: boolean): void {
  const ferien = `${tag}Ferien` as PlanTag;
  v.eigenerFerientakt[tag] = an;
  v.aenderungen = v.aenderungen.filter((a) => a.tag !== ferien);
  if (an) {
    v.takt[ferien] = v.takt[tag].map((z) => ({ ...z }));
    for (const a of v.aenderungen.filter((x) => x.tag === tag)) v.aenderungen.push(a.art === "zusatz" ? { ...a, tag: ferien, id: netz.naechsteZusatzId++ } : { ...a, tag: ferien });
  } else v.takt[ferien] = [];
}

/* ---------- Einzelfahrten ---------- */

export type FahrtFehler = "unbekannt" | "zeit";

const imBetriebstag = (s: number, cfg: LinienConfig) => Number.isInteger(s) && s % cfg.rundungS === 0 && s >= cfg.betriebstagBeginnH * 3600 && s < (24 + cfg.betriebstagBeginnH) * 3600;

/** Eine Fahrt aus dem Takt verschieben (an Tagesart, Variante und ursprüngliche Abfahrt gebunden). */
export function verschiebeFahrt(v: Variante, tag: PlanTag, ursprungS: number, neuS: number, cfg: LinienConfig): FahrtFehler | null {
  const q = taktQuelle(v, tag);
  if (!taktAbfahrten(v.takt[q]).includes(ursprungS)) return "unbekannt";
  if (!imBetriebstag(neuS, cfg)) return "zeit";
  v.aenderungen = v.aenderungen.filter((a) => !(a.tag === q && a.art !== "zusatz" && a.ursprungS === ursprungS));
  if (neuS !== ursprungS) v.aenderungen.push({ art: "verschieben", tag: q, ursprungS, neuS });
  return null;
}

export function streicheFahrt(v: Variante, tag: PlanTag, ursprungS: number): FahrtFehler | null {
  const q = taktQuelle(v, tag);
  if (!taktAbfahrten(v.takt[q]).includes(ursprungS)) return "unbekannt";
  v.aenderungen = v.aenderungen.filter((a) => !(a.tag === q && a.art !== "zusatz" && a.ursprungS === ursprungS));
  v.aenderungen.push({ art: "streichen", tag: q, ursprungS });
  return null;
}

/** Verschiebung oder Streichung zurücknehmen: Die Fahrt fährt wieder nach Takt. */
export function stelleFahrtWiederHer(v: Variante, tag: PlanTag, ursprungS: number): boolean {
  const q = taktQuelle(v, tag);
  const vorher = v.aenderungen.length;
  v.aenderungen = v.aenderungen.filter((a) => !(a.tag === q && a.art !== "zusatz" && a.ursprungS === ursprungS));
  return v.aenderungen.length < vorher;
}

/** Zusätzliche Fahrt, zum Beispiel für den Schulbeginn; auch nur auf einem Kurzläufer möglich. */
export function fuegeFahrtHinzu(netz: Netz, v: Variante, tag: PlanTag, abfahrtS: number, cfg: LinienConfig): { ok: true; id: number } | { ok: false; fehler: FahrtFehler } {
  if (!imBetriebstag(abfahrtS, cfg)) return { ok: false, fehler: "zeit" };
  const id = netz.naechsteZusatzId++;
  v.aenderungen.push({ art: "zusatz", tag: taktQuelle(v, tag), id, abfahrtS });
  return { ok: true, id };
}

export function verschiebeZusatz(v: Variante, id: number, neuS: number, cfg: LinienConfig): FahrtFehler | null {
  const a = v.aenderungen.find((x) => x.art === "zusatz" && x.id === id);
  if (!a || a.art !== "zusatz") return "unbekannt";
  if (!imBetriebstag(neuS, cfg)) return "zeit";
  a.abfahrtS = neuS;
  return null;
}

export function entferneZusatz(v: Variante, id: number): boolean {
  const vorher = v.aenderungen.length;
  v.aenderungen = v.aenderungen.filter((a) => !(a.art === "zusatz" && a.id === id));
  return v.aenderungen.length < vorher;
}

/* ---------- Busse ---------- */

/** Weist einen Bus einer Linie zu (Stammlinie). Ein Bus gehört zu höchstens einer Linie, eine frühere Zuweisung endet. */
export function weiseBusZu(netz: Netz, linieId: number, busId: number): boolean {
  const l = netz.linien.find((x) => x.id === linieId);
  if (!l) return false;
  for (const x of netz.linien) x.busse = x.busse.filter((b) => b !== busId);
  l.busse.push(busId);
  l.busse.sort((a, b) => a - b);
  return true;
}

/** Nimmt einen Bus aus seiner Linie (auch nach dem Verkauf). */
export function entferneBus(netz: Netz, busId: number): void {
  for (const x of netz.linien) x.busse = x.busse.filter((b) => b !== busId);
}

export const linieVonBus = (netz: Netz, busId: number): Linie | null => netz.linien.find((l) => l.busse.includes(busId)) ?? null;
