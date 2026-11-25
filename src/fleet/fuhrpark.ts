import { addMonate, parts, type CivilMs } from "../calendar/civil";
import { batterieOptionen } from "../catalog/batterie";
import type { Bus } from "../catalog/katalog";
import type { Option } from "../catalog/optionen";
import type { BetriebshofConfig, CatalogConfig, FahrzeugmarktConfig } from "../config";
import type { HofAnalyse } from "../depot/analyse";
import type { Betriebshof, BusMass, Kasse } from "../depot/hof";
import { ganzzahl, waehle, type Zufall } from "../game/zufall";
import { freiePlaetze, platzFrei, type Belegung, type PlatzRef } from "./plaetze";

/** Ausstattungsoption, wie sie der Fahrzeugmarkt braucht (aus der Optionsdatei). */
export interface MarktOption {
  id: string;
  name?: string;
  /** Optionen derselben Gruppe schließen sich aus, genau eine ist gewählt. null = einzeln an- und abwählbar. */
  gruppe: string | null;
  aufpreisEur: number;
  /** null = alle Antriebe. */
  nurAntrieb: string | null;
  standard: boolean;
  /** Beim Neukauf immer enthalten, ohne Aufpreis. */
  serieNeukauf: boolean;
  /** "frei" oder Name der Technologie, die die Option im Neukauf freischaltet. */
  freischaltung: string;
  gebrauchtAnteil: number;
}

export interface Konfiguration {
  /** Gewählte Batteriegröße (nur Elektro mit Batterieangabe), sonst null. */
  batterieKwh: number | null;
  /** Lackierung als Hex-Farbe. */
  lackierung: string;
  /** Gewählte Optionen (je Gruppe genau eine, dazu einzelne Optionen und Serienausstattung). */
  optionen: string[];
}

export interface EigenerBus {
  id: number;
  modellId: string;
  flottennummer: string;
  kennzeichen: string;
  herkunft: "neu" | "gebraucht";
  baujahr: number;
  /** Alter beim Kauf in Jahren (neu: 0). */
  alterBeiKaufJahre: number;
  kaufzeit: CivilMs;
  kaufpreisEur: number;
  /** Neupreis dieser Konfiguration (Grundlage für den Wert). */
  neupreisKonfigEur: number;
  laufleistungKm: number;
  /** Zustand 0 bis 100. In Phase 1 kein Verschleiß. */
  zustand: number;
  /** Batteriezustand in Prozent der Nennkapazität (nur Elektro), sonst null. */
  batterieZustand: number | null;
  /** Ende der gültigen Hauptuntersuchung. */
  huBis: CivilMs;
  konfig: Konfiguration;
  sitzplaetze: number | null;
  stehplaetze: number | null;
  platz: PlatzRef;
}

export interface Angebot {
  id: number;
  modellId: string;
  baujahr: number;
  alterJahre: number;
  laufleistungKm: number;
  /** Wahrer Zustand, vor der Inspektion nicht angezeigt. */
  zustand: number;
  zustandVon: number;
  zustandBis: number;
  batterieZustand: number | null;
  batterieVon: number | null;
  batterieBis: number | null;
  huRestMonate: number;
  konfig: Konfiguration;
  neupreisKonfigEur: number;
  preisEur: number;
  erstellt: CivilMs;
  ablauf: CivilMs;
  inspiziert: boolean;
}

export interface Fuhrpark {
  version: 1;
  busse: EigenerBus[];
  angebote: Angebot[];
  naechsteBusId: number;
  naechsteFlottennummer: number;
  naechsteAngebotId: number;
}

/** Alles, was Kauf und Verkauf brauchen. */
export interface MarktKontext {
  modelle: Map<string, Bus>;
  optionen: MarktOption[];
  markt: FahrzeugmarktConfig;
  katalog: CatalogConfig;
  hofCfg: BetriebshofConfig;
  /** Freigeschaltete Technologien (bis Etappe 7b leer). */
  freigeschaltet: Set<string>;
  frei: string;
  /** Unterscheidungszeichen der Startgemeinde für Kennzeichen. */
  kreis: string;
}

/** Optionen aus der Optionsdatei für den Fahrzeugmarkt. */
export function marktOptionen(liste: readonly Option[]): MarktOption[] {
  return liste.map((o) => ({
    id: o.option_id, name: o.name, gruppe: o.gruppe, aufpreisEur: o.aufpreis_eur, nurAntrieb: o.nur_antrieb, standard: o.standard,
    serieNeukauf: o.serie_neukauf, freischaltung: o.freischaltung, gebrauchtAnteil: o.gebraucht_anteil,
  }));
}

export const JAHR_MS = 365.25 * 86400000;
const cent = (x: number) => Math.round(x * 100) / 100;

export function neuerFuhrpark(cfg: FahrzeugmarktConfig): Fuhrpark {
  return { version: 1, busse: [], angebote: [], naechsteBusId: 1, naechsteFlottennummer: cfg.flottennummer.start, naechsteAngebotId: 1 };
}

export const busMass = (m: Pick<Bus, "laenge_mm" | "breite_mm">): BusMass => ({ laengeM: m.laenge_mm! / 1000, breiteM: m.breite_mm! / 1000 });

export function belegung(f: Fuhrpark, modelle: Map<string, Bus>): Belegung[] {
  return f.busse.map((b) => ({ busId: b.id, platz: b.platz, mass: busMass(modelle.get(b.modellId)!) }));
}

/** Kann dieses Modell überhaupt gekauft werden (Fahrzeugart)? O-Busse erst mit dem Infrastruktur-Modul, Straßenbahnen mit dem Straßenbahn-Modul. */
export const fahrzeugartKaufbar = (m: Bus, cfg: FahrzeugmarktConfig) => !cfg.ausgeschlosseneFahrzeugarten.includes(m.fahrzeugart ?? "");

/** Neu kaufbar: im_neukauf = ja, Fahrzeugart kaufbar. Alle Bauarten bis Etappe 7b. */
export const neuKaufbar = (m: Bus, cfg: FahrzeugmarktConfig) => m.im_neukauf === "ja" && fahrzeugartKaufbar(m, cfg);

/** Wählbare Batteriegrößen (leer bei Bussen ohne Batterieangabe). */
export const batterien = (m: Bus, katalog: CatalogConfig) => (m.antrieb === "Elektro" ? batterieOptionen(m, katalog.batterieStandardSchrittKwh) : []);

const kleinsteBatterie = (m: Bus, katalog: CatalogConfig): number | null => batterien(m, katalog)[0] ?? null;

/**
 * Sitz- und Stehplätze mit der gewählten Batterie. Die Katalogplätze gelten für die kleinste Batterie, jede zusätzliche
 * Batterieeinheit nimmt plaetze_je_batterieeinheit_weniger Plätze weg, zuerst Stehplätze (Koko, 25.11.2026).
 */
export function plaetzeMitBatterie(m: Bus, kwh: number | null, katalog: CatalogConfig): { sitzplaetze: number | null; stehplaetze: number | null; weniger: number } {
  const je = m.plaetze_je_batterieeinheit_weniger ?? 0;
  // Jede wählbare Größe über der kleinsten ist eine Batterieeinheit mehr (auch wenn das Maximum kein volles Vielfaches ist)
  const einheiten = kwh === null ? 0 : Math.max(0, batterien(m, katalog).findIndex((x) => Math.abs(x - kwh) < 1e-9));
  const weniger = einheiten * je;
  let steh = m.stehplaetze;
  let sitz = m.sitzplaetze;
  const ausSteh = Math.min(weniger, steh ?? 0);
  if (steh !== null) steh -= ausSteh;
  if (sitz !== null) sitz = Math.max(0, sitz - (weniger - ausSteh));
  return { sitzplaetze: sitz, stehplaetze: steh, weniger };
}

const passt = (o: MarktOption, antrieb: string | null) => o.nurAntrieb === null || o.nurAntrieb === antrieb;
const neuWaehlbar = (o: MarktOption, k: MarktKontext) => o.freischaltung === k.frei || k.freigeschaltet.has(o.freischaltung);

/** Standardkonfiguration beim Neukauf: kleinste Batterie, Firmenfarbe, Standard je Gruppe, Serienausstattung. */
export function standardKonfig(m: Bus, farbe: string, k: MarktKontext): Konfiguration {
  const optionen = k.optionen.filter((o) => passt(o, m.antrieb) && ((o.gruppe !== null && o.standard) || o.serieNeukauf)).map((o) => o.id);
  return { batterieKwh: kleinsteBatterie(m, k.katalog), lackierung: farbe, optionen };
}

export type KonfigFehler = "batterie" | "lackierung" | "option" | "gruppe";

/** Prüft eine Neukauf-Konfiguration: Batterie aus den Optionen, je Gruppe genau eine wählbare Option, Serie enthalten. */
export function pruefeKonfig(m: Bus, c: Konfiguration, k: MarktKontext): KonfigFehler | null {
  const bat = batterien(m, k.katalog);
  if (bat.length ? !bat.some((x) => Math.abs(x - (c.batterieKwh ?? NaN)) < 1e-9) : c.batterieKwh !== null) return "batterie";
  if (!/^#[0-9a-fA-F]{6}$/.test(c.lackierung)) return "lackierung";
  const gewaehlt = new Set(c.optionen);
  if (gewaehlt.size !== c.optionen.length) return "option";
  for (const id of gewaehlt) {
    const o = k.optionen.find((x) => x.id === id);
    if (!o || !passt(o, m.antrieb) || !neuWaehlbar(o, k)) return "option";
  }
  for (const o of k.optionen) if (o.serieNeukauf && passt(o, m.antrieb) && !gewaehlt.has(o.id)) return "option";
  const gruppen = new Set(k.optionen.filter((o) => o.gruppe !== null && passt(o, m.antrieb)).map((o) => o.gruppe!));
  for (const g of gruppen) if (k.optionen.filter((o) => o.gruppe === g && gewaehlt.has(o.id)).length !== 1) return "gruppe";
  return null;
}

/** Aufpreis der Optionen beim Neukauf (Serienausstattung ohne Aufpreis). */
export const optionenAufpreis = (ids: string[], optionen: MarktOption[]) =>
  ids.reduce((s, id) => {
    const o = optionen.find((x) => x.id === id);
    return s + (o && !o.serieNeukauf ? o.aufpreisEur : 0);
  }, 0);

/** Neupreis einer Konfiguration: neupreis_eur (kleinste Batterie) plus Batterieaufpreis je kWh plus Optionen. */
export function neupreis(m: Bus, c: Konfiguration, k: MarktKontext): number {
  const min = kleinsteBatterie(m, k.katalog);
  const mehrKwh = c.batterieKwh !== null && min !== null ? Math.max(0, c.batterieKwh - min) : 0;
  return cent((m.neupreis_eur ?? 0) + mehrKwh * k.markt.batterieAufpreisEurKwh + optionenAufpreis(c.optionen, k.optionen));
}

/** Restwertanteil nach Alter: linear von 100 % auf restwertMin über die Lebensdauer, danach restwertMin (A3-11). */
export function restwert(alterJahre: number, lebensdauer: number, cfg: FahrzeugmarktConfig): number {
  if (!(lebensdauer > 0)) return cfg.restwertMin;
  return Math.max(cfg.restwertMin, 1 - (1 - cfg.restwertMin) * (Math.max(0, alterJahre) / lebensdauer));
}

/** Wert ohne Streuung: Neupreis der Konfiguration × Restwert nach Alter × Zustandsfaktor. */
export function wert(neupreisKonfig: number, alterJahre: number, lebensdauer: number, zustand: number, cfg: FahrzeugmarktConfig): number {
  const z = cfg.zustandPreisBasis + (1 - cfg.zustandPreisBasis) * (zustand / 100);
  return cent(neupreisKonfig * restwert(alterJahre, lebensdauer, cfg) * z);
}

export const alterJahre = (b: EigenerBus, jetzt: CivilMs) => b.alterBeiKaufJahre + Math.max(0, jetzt - b.kaufzeit) / JAHR_MS;

/** Aktueller Wert eines eigenen Busses (ohne Streuung). */
export function busWert(b: EigenerBus, jetzt: CivilMs, k: MarktKontext): number {
  const m = k.modelle.get(b.modellId)!;
  return wert(b.neupreisKonfigEur, alterJahre(b, jetzt), m.lebensdauer_jahre ?? 0, b.zustand, k.markt);
}

/** Erlös beim Verkauf an den Händler: Wert ohne Streuung abzüglich Abschlag. */
export const verkaufserloes = (b: EigenerBus, jetzt: CivilMs, k: MarktKontext) => cent(busWert(b, jetzt, k) * (1 - k.markt.haendlerAbschlag));

/** Flottennummer nach Schema, zum Beispiel "{nr}" oder "{jahr}{nr}". */
export function flottennummer(nr: number, jetzt: CivilMs, schema: string): string {
  return schema.replace("{jahr}", String(parts(jetzt).jahr)).replace("{nr}", String(nr));
}

/** Unterscheidungszeichen aus dem Kreisschlüssel der Startgemeinde (vorläufig, Details zurückgestellt). */
export const kreisVon = (kreisschluessel: string | null, cfg: FahrzeugmarktConfig) =>
  (kreisschluessel && cfg.kennzeichen.kreisNachSchluessel[kreisschluessel]) || cfg.kennzeichen.ersatzKreis;

/** Kennzeichen aus Unterscheidungszeichen und Zufallsrest, eindeutig im Fuhrpark. */
export function neuesKennzeichen(f: Fuhrpark, kreis: string, z: Zufall, cfg: FahrzeugmarktConfig): string {
  const k = cfg.kennzeichen;
  for (;;) {
    const n = ganzzahl(z, k.buchstabenMin, k.buchstabenMax);
    let b = "";
    for (let i = 0; i < n; i++) b += waehle(z, [...k.buchstaben]);
    const s = k.schema.replace("{kreis}", kreis).replace("{buchstaben}", b).replace("{zahl}", String(ganzzahl(z, k.zahlMin, k.zahlMax)));
    if (!f.busse.some((x) => x.kennzeichen === s)) return s;
  }
}

export interface KaufKontext extends MarktKontext {
  fuhrpark: Fuhrpark;
  hof: Betriebshof | null;
  analyse: HofAnalyse | null;
  kasse: Kasse;
  zufall: Zufall;
  jetzt: CivilMs;
}

export type KaufFehler = "nichtKaufbar" | KonfigFehler | "keinHof" | "keinPlatz" | "geldFehlt" | "unbekannt";

/** Kleinster passender freier Platz für ein Modell, oder null. */
export function platzFuer(m: Bus, k: KaufKontext, ohneBusId?: number): PlatzRef | null {
  if (!k.hof || !k.analyse) return null;
  return freiePlaetze(k.hof, k.analyse, belegung(k.fuhrpark, k.modelle), busMass(m), k.hofCfg, ohneBusId)[0]?.platz ?? null;
}

function stelleEin(k: KaufKontext, m: Bus, daten: Omit<EigenerBus, "id" | "flottennummer" | "kennzeichen" | "platz" | "sitzplaetze" | "stehplaetze">, platz: PlatzRef): EigenerBus {
  const f = k.fuhrpark;
  const p = plaetzeMitBatterie(m, daten.konfig.batterieKwh, k.katalog);
  const bus: EigenerBus = {
    id: f.naechsteBusId++,
    flottennummer: flottennummer(f.naechsteFlottennummer++, k.jetzt, k.markt.flottennummer.schema),
    kennzeichen: neuesKennzeichen(f, k.kreis, k.zufall, k.markt),
    ...daten,
    sitzplaetze: p.sitzplaetze,
    stehplaetze: p.stehplaetze,
    platz,
  };
  f.busse.push(bus);
  k.kasse.kontostandEur = cent(k.kasse.kontostandEur - daten.kaufpreisEur);
  return bus;
}

/** Neukauf: Bus steht sofort auf dem kleinsten passenden freien Platz. Nur mit Platz und ausreichendem Kontostand. */
export function kaufeNeu(k: KaufKontext, modellId: string, c: Konfiguration): { ok: true; bus: EigenerBus } | { ok: false; fehler: KaufFehler } {
  const m = k.modelle.get(modellId);
  if (!m) return { ok: false, fehler: "unbekannt" };
  if (!neuKaufbar(m, k.markt)) return { ok: false, fehler: "nichtKaufbar" };
  const f = pruefeKonfig(m, c, k);
  if (f) return { ok: false, fehler: f };
  if (!k.hof) return { ok: false, fehler: "keinHof" };
  const platz = platzFuer(m, k);
  if (!platz) return { ok: false, fehler: "keinPlatz" };
  const preis = neupreis(m, c, k);
  if (k.kasse.kontostandEur < preis) return { ok: false, fehler: "geldFehlt" };
  const jahr = parts(k.jetzt).jahr;
  const bus = stelleEin(k, m, {
    modellId, herkunft: "neu", baujahr: jahr, alterBeiKaufJahre: 0, kaufzeit: k.jetzt, kaufpreisEur: preis, neupreisKonfigEur: preis,
    laufleistungKm: 0, zustand: 100, batterieZustand: c.batterieKwh !== null ? 100 : null,
    huBis: addMonate(k.jetzt, m.intervall_hu_monate ?? k.markt.huMonateStandard), konfig: { ...c, optionen: [...c.optionen] },
  }, platz);
  return { ok: true, bus };
}

/** Gebrauchtkauf: dieselben Bedingungen wie beim Neukauf; der Bus startet mit seinem Zustand und der Lackierung des Vorbesitzers. */
export function kaufeGebraucht(k: KaufKontext, angebotId: number): { ok: true; bus: EigenerBus } | { ok: false; fehler: KaufFehler } {
  const a = k.fuhrpark.angebote.find((x) => x.id === angebotId);
  const m = a && k.modelle.get(a.modellId);
  if (!a || !m || a.ablauf <= k.jetzt) return { ok: false, fehler: "unbekannt" };
  if (!k.hof) return { ok: false, fehler: "keinHof" };
  const platz = platzFuer(m, k);
  if (!platz) return { ok: false, fehler: "keinPlatz" };
  if (k.kasse.kontostandEur < a.preisEur) return { ok: false, fehler: "geldFehlt" };
  k.fuhrpark.angebote = k.fuhrpark.angebote.filter((x) => x.id !== a.id);
  const bus = stelleEin(k, m, {
    modellId: a.modellId, herkunft: "gebraucht", baujahr: a.baujahr, alterBeiKaufJahre: a.alterJahre, kaufzeit: k.jetzt, kaufpreisEur: a.preisEur,
    neupreisKonfigEur: a.neupreisKonfigEur, laufleistungKm: a.laufleistungKm, zustand: a.zustand, batterieZustand: a.batterieZustand,
    huBis: addMonate(k.jetzt, a.huRestMonate), konfig: { ...a.konfig, optionen: [...a.konfig.optionen] },
  }, platz);
  return { ok: true, bus };
}

/** Verkauf an den Händler: Wert ohne Streuung abzüglich Abschlag, der Bus verschwindet, der Platz wird frei. */
export function verkaufe(k: KaufKontext, busId: number): { ok: true; erloesEur: number } | { ok: false; fehler: "unbekannt" } {
  const b = k.fuhrpark.busse.find((x) => x.id === busId);
  if (!b) return { ok: false, fehler: "unbekannt" };
  const erloes = verkaufserloes(b, k.jetzt, k);
  k.fuhrpark.busse = k.fuhrpark.busse.filter((x) => x.id !== busId);
  k.kasse.kontostandEur = cent(k.kasse.kontostandEur + erloes);
  return { ok: true, erloesEur: erloes };
}

/** Umsetzen auf einen anderen freien Platz, auf den der Bus passt. */
export function setzeUm(k: KaufKontext, busId: number, ziel: PlatzRef): boolean {
  const b = k.fuhrpark.busse.find((x) => x.id === busId);
  if (!b || !k.hof || !k.analyse) return false;
  const m = k.modelle.get(b.modellId)!;
  if (!platzFrei(k.hof, k.analyse, belegung(k.fuhrpark, k.modelle), busMass(m), ziel, k.hofCfg, b.id)) return false;
  b.platz = { ...ziel };
  return true;
}

/** Umlackieren gegen Bezahlung (nur mit ausreichendem Kontostand). */
export function lackiereUm(k: KaufKontext, busId: number, farbe: string): { ok: true } | { ok: false; fehler: "unbekannt" | "lackierung" | "geldFehlt" } {
  const b = k.fuhrpark.busse.find((x) => x.id === busId);
  if (!b) return { ok: false, fehler: "unbekannt" };
  if (!/^#[0-9a-fA-F]{6}$/.test(farbe)) return { ok: false, fehler: "lackierung" };
  if (k.kasse.kontostandEur < k.markt.umlackierenEur) return { ok: false, fehler: "geldFehlt" };
  b.konfig.lackierung = farbe.toLowerCase();
  k.kasse.kontostandEur = cent(k.kasse.kontostandEur - k.markt.umlackierenEur);
  return { ok: true };
}
