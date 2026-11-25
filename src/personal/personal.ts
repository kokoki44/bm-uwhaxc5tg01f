/**
 * Personal (Etappe 3a): Lohntabelle, Stellen ausschreiben, Bewerber, Einstellen, Kündigen, Lohnabrechnung.
 * Reine Spiellogik ohne Oberfläche. Alle Zahlenwerte stehen in config.personal.
 * Zeitpunkte sind CivilMs (siehe src/calendar/civil.ts).
 */
import { config, type PersonalArt, type PersonalConfig } from "../config/index";
import { addMonate, civil, parts, type CivilMs } from "../calendar/civil";
import { ganzzahl, gewichtet, ja, poisson, waehle, zufall, type Zufall } from "../game/zufall";
import namen from "./namen.json";

const TAG_MS = 86400000;

export interface Bewerber {
  id: number;
  name: string;
  /** Jahre Erfahrung beim Erscheinen (ganzzahlig). */
  erfahrungJahre: number;
  zufriedenheit: number;
  gesundheit: number;
  qualifikationen: string[];
  /** Ab diesem Zeitpunkt ist der Bewerber sichtbar. */
  ankunft: CivilMs;
}

export interface Ausschreibung {
  id: number;
  art: PersonalArt;
  wochenstunden: number;
  erstellt: CivilMs;
  /** Ab diesem Zeitpunkt ist die Ausschreibung beendet. */
  ende: CivilMs;
  bewerber: Bewerber[];
}

export interface Person {
  id: number;
  name: string;
  art: PersonalArt;
  wochenstunden: number;
  erfahrungJahreBeiEintritt: number;
  eintritt: CivilMs;
  zufriedenheit: number;
  gesundheit: number;
  qualifikationen: string[];
  /** Beginn des ersten Tages ohne Arbeitsverhältnis (00:00), null solange nicht gekündigt. */
  austritt: CivilMs | null;
}

export interface Personal {
  version: 1;
  lohntabelle: Record<PersonalArt, number[]>;
  personen: Person[];
  ausschreibungen: Ausschreibung[];
  naechsteId: number;
}

export type SchreibeAusErgebnis = { ok: true; ausschreibung: Ausschreibung } | { ok: false; fehler: "wochenstunden" };
export type StelleEinErgebnis =
  | { ok: true; person: Person }
  | { ok: false; fehler: "ausschreibungUnbekannt" | "bewerberUnbekannt" | "nichtSichtbar" };
export type KuendigeErgebnis = { ok: true; austritt: CivilMs } | { ok: false; fehler: "unbekannt" | "schonGekuendigt" };
export interface Lohnabrechnung {
  summeEur: number;
  posten: { personId: number; eur: number }[];
}

// Kalenderhilfen

function tagesbeginn(ms: CivilMs): CivilMs {
  const p = parts(ms);
  return civil(p.jahr, p.monat, p.tag);
}


export { addMonate };

/** Dienstjahre als Kommazahl: volle Jahre bis zum letzten Jahrestag plus Anteil des laufenden Jahres. */
export function dienstjahre(eintritt: CivilMs, jetzt: CivilMs): number {
  if (jetzt <= eintritt) return 0;
  let n = parts(jetzt).jahr - parts(eintritt).jahr;
  while (n > 0 && addMonate(eintritt, 12 * n) > jetzt) n--;
  const a = addMonate(eintritt, 12 * n);
  const b = addMonate(eintritt, 12 * (n + 1));
  return n + (jetzt - a) / (b - a);
}

// Lohntabelle und Stufen

export function neuesPersonal(cfg: PersonalConfig = config.personal): Personal {
  const lohntabelle = {} as Record<PersonalArt, number[]>;
  for (const art of cfg.arten) lohntabelle[art] = [...cfg.marktlohnEurH[art]];
  return { version: 1, lohntabelle, personen: [], ausschreibungen: [], naechsteId: 1 };
}

/** Mittel über die Stufen von Unternehmenslohn durch Marktlohn. */
export function marktlohnVerhaeltnis(personal: Personal, art: PersonalArt, cfg: PersonalConfig = config.personal): number {
  const markt = cfg.marktlohnEurH[art];
  const eigen = personal.lohntabelle[art];
  let summe = 0;
  for (let i = 0; i < markt.length; i++) summe += eigen[i] / markt[i];
  return summe / markt.length;
}

/** Erfahrungsstufe (1 bis Zahl der Lohnstufen der Art) aus Jahren Erfahrung. */
export function stufeFuer(erfahrungJahre: number, art: PersonalArt, cfg: PersonalConfig = config.personal): number {
  let stufe = 1;
  for (let i = 0; i < cfg.stufeAbJahren.length; i++) if (erfahrungJahre >= cfg.stufeAbJahren[i]) stufe = i + 1;
  return Math.min(stufe, cfg.marktlohnEurH[art].length);
}

/** Jahre Erfahrung zum Zeitpunkt jetzt: Erfahrung beim Eintritt plus Dienstjahre. */
export function erfahrungJahre(person: Person, jetzt: CivilMs): number {
  return person.erfahrungJahreBeiEintritt + dienstjahre(person.eintritt, jetzt);
}

export function stufeDerPerson(person: Person, jetzt: CivilMs, cfg: PersonalConfig = config.personal): number {
  return stufeFuer(erfahrungJahre(person, jetzt), person.art, cfg);
}

/** Stundenlohn der Person nach der Lohntabelle des Unternehmens und ihrer aktuellen Stufe. */
export function stundenlohn(personal: Personal, person: Person, jetzt: CivilMs, cfg: PersonalConfig = config.personal): number {
  return personal.lohntabelle[person.art][stufeDerPerson(person, jetzt, cfg) - 1];
}

/** Setzt den Lohn einer Stufe; gilt für alle Personen der Art. Liefert false bei ungültiger Stufe oder Lohn ≤ 0. */
export function setzeLohn(personal: Personal, art: PersonalArt, stufe: number, eurH: number, cfg: PersonalConfig = config.personal): boolean {
  const stufen = cfg.marktlohnEurH[art]?.length ?? 0;
  if (!Number.isInteger(stufe) || stufe < 1 || stufe > stufen) return false;
  if (typeof eurH !== "number" || !Number.isFinite(eurH) || !(eurH > 0)) return false;
  personal.lohntabelle[art][stufe - 1] = eurH;
  return true;
}

// Ausschreibung und Bewerber

function neueId(personal: Personal): number {
  return personal.naechsteId++;
}

function erzeugeBewerber(personal: Personal, art: PersonalArt, erstellt: CivilMs, v: number, z: Zufall, cfg: PersonalConfig): Bewerber {
  const b = cfg.bewerbung;
  const stufen = cfg.marktlohnEurH[art].length;
  const wartezeit = ganzzahl(z, b.wartezeitTageMin, b.wartezeitTageMax);
  const grund = gewichtet(z, b.stufenGewichte) + 1;
  const verschiebung = Math.floor((v - 1) * b.stufenJeLohnanteil + zufall(z));
  const stufe = Math.max(1, Math.min(stufen, grund + verschiebung));
  const schwelle = cfg.stufeAbJahren[stufe - 1];
  const bis = stufe < cfg.stufeAbJahren.length ? cfg.stufeAbJahren[stufe] - 1 : schwelle + cfg.erfahrungSpanneLetzteStufe;
  const jahre = ganzzahl(z, schwelle, bis);
  const name = `${waehle(z, namen.vornamen)} ${waehle(z, namen.nachnamen)}`;
  const zufriedenheit = ganzzahl(z, cfg.zufriedenheitStart[0], cfg.zufriedenheitStart[1]);
  const gesundheit = ganzzahl(z, cfg.gesundheitStart[0], cfg.gesundheitStart[1]);
  const qualifikationen: string[] = [];
  if (art === "fahrer") {
    qualifikationen.push(...cfg.fahrerQualifikationen);
    const p = cfg.einweisungAnteilBasis + cfg.einweisungAnteilJeStufe * (stufe - 1);
    for (const e of cfg.einweisungen) if (ja(z, p)) qualifikationen.push(`einweisung_${e}`);
  } else if (art === "mechaniker") {
    qualifikationen.push(`fachrichtung_${waehle(z, cfg.fachrichtungen)}`);
  }
  return {
    id: neueId(personal),
    name,
    erfahrungJahre: jahre,
    zufriedenheit,
    gesundheit,
    qualifikationen,
    ankunft: erstellt + wartezeit * TAG_MS,
  };
}

/** Schreibt eine Stelle aus. Die Bewerber werden sofort mit dem Zufall erzeugt und erscheinen nach ihrer Wartezeit. */
export function schreibeAus(
  personal: Personal,
  art: PersonalArt,
  wochenstunden: number,
  jetzt: CivilMs,
  z: Zufall,
  cfg: PersonalConfig = config.personal,
): SchreibeAusErgebnis {
  if (!Number.isInteger(wochenstunden) || wochenstunden < cfg.wochenstundenMin || wochenstunden > cfg.wochenstundenMax) {
    return { ok: false, fehler: "wochenstunden" };
  }
  const b = cfg.bewerbung;
  const v = marktlohnVerhaeltnis(personal, art, cfg);
  const ausschreibung: Ausschreibung = {
    id: neueId(personal),
    art,
    wochenstunden,
    erstellt: jetzt,
    ende: jetzt + b.laufzeitTage * TAG_MS,
    bewerber: [],
  };
  const anzahl = Math.min(b.hoechstens, poisson(z, b.mittelBeiMarktlohn[art] * Math.pow(v, b.lohnExponent)));
  for (let i = 0; i < anzahl; i++) ausschreibung.bewerber.push(erzeugeBewerber(personal, art, jetzt, v, z, cfg));
  ausschreibung.bewerber.sort((x, y) => x.ankunft - y.ankunft || x.id - y.id);
  personal.ausschreibungen.push(ausschreibung);
  return { ok: true, ausschreibung };
}

export function ausschreibungBeendet(a: Ausschreibung, jetzt: CivilMs): boolean {
  return jetzt >= a.ende;
}

/** Bewerber, die angekommen sind, solange die Ausschreibung läuft. */
export function sichtbareBewerber(a: Ausschreibung, jetzt: CivilMs): Bewerber[] {
  if (ausschreibungBeendet(a, jetzt)) return [];
  return a.bewerber.filter((b) => b.ankunft <= jetzt);
}

/** Stellt einen sichtbaren Bewerber ein. Die Ausschreibung ist damit beendet und wird entfernt. */
export function stelleEin(personal: Personal, ausschreibungId: number, bewerberId: number, jetzt: CivilMs): StelleEinErgebnis {
  const idx = personal.ausschreibungen.findIndex((a) => a.id === ausschreibungId);
  if (idx < 0) return { ok: false, fehler: "ausschreibungUnbekannt" };
  const a = personal.ausschreibungen[idx];
  const b = a.bewerber.find((x) => x.id === bewerberId);
  if (!b) return { ok: false, fehler: "bewerberUnbekannt" };
  if (!sichtbareBewerber(a, jetzt).includes(b)) return { ok: false, fehler: "nichtSichtbar" };
  const person: Person = {
    id: neueId(personal),
    name: b.name,
    art: a.art,
    wochenstunden: a.wochenstunden,
    erfahrungJahreBeiEintritt: b.erfahrungJahre,
    eintritt: jetzt,
    zufriedenheit: b.zufriedenheit,
    gesundheit: b.gesundheit,
    qualifikationen: [...b.qualifikationen],
    austritt: null,
  };
  personal.personen.push(person);
  personal.ausschreibungen.splice(idx, 1);
  return { ok: true, person };
}

/** Entfernt beendete Ausschreibungen ohne Einstellung. Liefert die Zahl der entfernten. */
export function raeumeAuf(personal: Personal, jetzt: CivilMs): number {
  const vorher = personal.ausschreibungen.length;
  personal.ausschreibungen = personal.ausschreibungen.filter((a) => !ausschreibungBeendet(a, jetzt));
  return vorher - personal.ausschreibungen.length;
}

// Probezeit und Kündigung (TV-N SH § 20)

export function inProbezeit(person: Person, jetzt: CivilMs, cfg: PersonalConfig = config.personal): boolean {
  return jetzt < addMonate(person.eintritt, cfg.probezeitMonate);
}

/**
 * Austrittszeitpunkt (00:00 des ersten Tages ohne Arbeitsverhältnis) bei einer Kündigung durch den Spieler am Tag jetzt.
 * Die Frist richtet sich nach der Betriebszugehörigkeit am Tag der Kündigung.
 */
export function kuendigungsTermin(eintritt: CivilMs, jetzt: CivilMs, cfg: PersonalConfig = config.personal): CivilMs {
  const k = cfg.kuendigung;
  const tag = tagesbeginn(jetzt);
  let fristEnde: CivilMs;
  let zumQuartal: boolean;
  if (jetzt < addMonate(eintritt, cfg.probezeitMonate)) {
    fristEnde = tag + k.probezeitWochen * 7 * TAG_MS;
    zumQuartal = false;
  } else if (jetzt <= addMonate(eintritt, 12)) {
    fristEnde = addMonate(tag, k.bisEinJahrMonate);
    zumQuartal = false;
  } else {
    let monate = 0;
    for (const [abJahren, m] of [...k.staffelJahreMonate].sort((x, y) => x[0] - y[0])) {
      if (jetzt >= addMonate(eintritt, 12 * abJahren)) monate = m;
    }
    fristEnde = monate > 0 ? addMonate(tag, monate) : tag + k.abEinJahrWochen * 7 * TAG_MS;
    zumQuartal = true;
  }
  const p = parts(fristEnde);
  return zumQuartal ? civil(p.jahr, Math.ceil(p.monat / 3) * 3 + 1, 1) : civil(p.jahr, p.monat + 1, 1);
}

export function kuendige(personal: Personal, personId: number, jetzt: CivilMs, cfg: PersonalConfig = config.personal): KuendigeErgebnis {
  const person = personal.personen.find((p) => p.id === personId);
  if (!person) return { ok: false, fehler: "unbekannt" };
  if (person.austritt !== null) return { ok: false, fehler: "schonGekuendigt" };
  person.austritt = kuendigungsTermin(person.eintritt, jetzt, cfg);
  return { ok: true, austritt: person.austritt };
}

// Lohnabrechnung

const aufCent = (x: number): number => Math.round(x * 100) / 100;

/**
 * Lohnkosten eines Monats (Abbuchung am Monatsende). Je Person: Stundenlohn × Wochenstunden × wochenFaktor
 * plus anteilige Jahressonderzahlung, mal (1 + Arbeitgeberanteil), anteilig nach beschäftigten Kalendertagen.
 */
/**
 * Kosten eines vollen Monats: (Stundenlohn × Wochenstunden × Wochenfaktor + Jahressonderzahlung anteilig / 12)
 * × (1 + Arbeitgeberanteil). Der Arbeitgeberanteil fällt auch auf die Sonderzahlung an (A3-18).
 */
export function monatskostenVoll(eurH: number, wochenstunden: number, cfg: PersonalConfig = config.personal): number {
  return (eurH * wochenstunden * cfg.wochenFaktor + (cfg.jahressonderzahlungEur * (wochenstunden / cfg.wochenstundenMax)) / 12) * (1 + cfg.arbeitgeberAnteil);
}

export function monatslohn(personal: Personal, jahr: number, monat: number, cfg: PersonalConfig = config.personal): Lohnabrechnung {
  const anfang = civil(jahr, monat, 1);
  const ende = civil(jahr, monat + 1, 1);
  const tageMonat = Math.round((ende - anfang) / TAG_MS);
  const posten: { personId: number; eur: number }[] = [];
  for (const person of personal.personen) {
    const von = Math.max(tagesbeginn(person.eintritt), anfang);
    const bis = Math.min(person.austritt ?? ende, ende);
    const tage = Math.round((bis - von) / TAG_MS);
    if (tage <= 0) continue;
    // Stufe am Monatsende bzw. am letzten Arbeitstag (letzter Augenblick vor dem Stichtag).
    const voll = monatskostenVoll(stundenlohn(personal, person, bis - 1, cfg), person.wochenstunden, cfg);
    posten.push({ personId: person.id, eur: aufCent((voll * tage) / tageMonat) });
  }
  return { summeEur: aufCent(posten.reduce((s, p) => s + p.eur, 0)), posten };
}

/** Entfernt nach der Lohnabrechnung eines Monats die Personen, deren Austritt bis zum Monatsende liegt. */
export function entferneAusgetreteneNachMonat(personal: Personal, jahr: number, monat: number): Person[] {
  const ende = civil(jahr, monat + 1, 1);
  const weg = personal.personen.filter((p) => p.austritt !== null && p.austritt <= ende);
  personal.personen = personal.personen.filter((p) => !(p.austritt !== null && p.austritt <= ende));
  return weg;
}

// Speichern und Laden. Das Format trägt eine Version, damit alte Stände ladbar bleiben.

export class PersonalLadeFehler extends Error {}

export function serialisierePersonal(p: Personal): string {
  return JSON.stringify(p);
}

export function ladePersonal(json: string | unknown, cfg: PersonalConfig = config.personal): Personal {
  let o: Personal;
  try {
    o = (typeof json === "string" ? JSON.parse(json) : json) as Personal;
  } catch {
    throw new PersonalLadeFehler("Personal: kein gültiges JSON");
  }
  const fehler = (msg: string): never => {
    throw new PersonalLadeFehler(`Personal: ${msg}`);
  };
  const zahl = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const ganz = (v: unknown): v is number => zahl(v) && Number.isInteger(v);
  const text = (v: unknown): v is string => typeof v === "string";
  const texte = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
  if (!o || typeof o !== "object") fehler("keine Daten");
  if (o.version !== 1) fehler(`unbekannte Version ${String(o.version)}`);
  if (!ganz(o.naechsteId) || o.naechsteId < 1) fehler("naechsteId");
  if (!o.lohntabelle || typeof o.lohntabelle !== "object") fehler("Lohntabelle fehlt");
  const lohntabelle = {} as Record<PersonalArt, number[]>;
  for (const art of cfg.arten) {
    const l = o.lohntabelle[art];
    if (!Array.isArray(l) || l.length !== cfg.marktlohnEurH[art].length || !l.every((x) => zahl(x) && x > 0)) fehler(`Lohntabelle ${art}`);
    lohntabelle[art] = [...l];
  }
  const ids = new Set<number>();
  const neueIdPruefen = (id: unknown): number => {
    if (!ganz(id) || id < 1 || id >= o.naechsteId || ids.has(id)) fehler(`ungültige Id ${String(id)}`);
    ids.add(id as number);
    return id as number;
  };
  const wochenstundenOk = (w: unknown) => ganz(w) && w >= cfg.wochenstundenMin && w <= cfg.wochenstundenMax;
  if (!Array.isArray(o.personen)) fehler("Personen fehlen");
  const personen: Person[] = o.personen.map((p) => {
    if (!p || !cfg.arten.includes(p.art) || !text(p.name) || !wochenstundenOk(p.wochenstunden)) fehler(`Person ungültig: ${JSON.stringify(p)}`);
    if (!zahl(p.erfahrungJahreBeiEintritt) || p.erfahrungJahreBeiEintritt < 0 || !zahl(p.eintritt) || !zahl(p.zufriedenheit) || !zahl(p.gesundheit)) fehler(`Person ungültig: ${JSON.stringify(p)}`);
    if (!texte(p.qualifikationen) || !(p.austritt === null || zahl(p.austritt))) fehler(`Person ungültig: ${JSON.stringify(p)}`);
    return {
      id: neueIdPruefen(p.id),
      name: p.name,
      art: p.art,
      wochenstunden: p.wochenstunden,
      erfahrungJahreBeiEintritt: p.erfahrungJahreBeiEintritt,
      eintritt: p.eintritt,
      zufriedenheit: p.zufriedenheit,
      gesundheit: p.gesundheit,
      qualifikationen: [...p.qualifikationen],
      austritt: p.austritt,
    };
  });
  if (!Array.isArray(o.ausschreibungen)) fehler("Ausschreibungen fehlen");
  const ausschreibungen: Ausschreibung[] = o.ausschreibungen.map((a) => {
    if (!a || !cfg.arten.includes(a.art) || !wochenstundenOk(a.wochenstunden) || !zahl(a.erstellt) || !zahl(a.ende) || a.ende < a.erstellt || !Array.isArray(a.bewerber)) {
      fehler(`Ausschreibung ungültig: ${JSON.stringify(a)}`);
    }
    const id = neueIdPruefen(a.id);
    const bewerber: Bewerber[] = a.bewerber.map((b) => {
      if (!b || !text(b.name) || !zahl(b.erfahrungJahre) || b.erfahrungJahre < 0 || !zahl(b.zufriedenheit) || !zahl(b.gesundheit) || !texte(b.qualifikationen) || !zahl(b.ankunft)) {
        fehler(`Bewerber ungültig: ${JSON.stringify(b)}`);
      }
      return {
        id: neueIdPruefen(b.id),
        name: b.name,
        erfahrungJahre: b.erfahrungJahre,
        zufriedenheit: b.zufriedenheit,
        gesundheit: b.gesundheit,
        qualifikationen: [...b.qualifikationen],
        ankunft: b.ankunft,
      };
    });
    return { id, art: a.art, wochenstunden: a.wochenstunden, erstellt: a.erstellt, ende: a.ende, bewerber };
  });
  return { version: 1, lohntabelle, personen, ausschreibungen, naechsteId: o.naechsteId };
}
