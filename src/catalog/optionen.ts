import ExcelJS from "exceljs";
import type { OptionenConfig } from "../config";
import { zellWert, type Wert } from "./reader";

/** Spalten des Blatts Optionen: Namen und Reihenfolge sind fest. */
export const OPTIONEN_SPALTEN = [
  "option_id",
  "gruppe",
  "name",
  "aufpreis_eur",
  "nur_antrieb",
  "standard",
  "serie_neukauf",
  "freischaltung",
  "gebraucht_anteil",
  "wirkung_zufriedenheit",
  "wirkung_verbrauch_prozent",
  "wirkung_teilebedarf_prozent",
  "wirkung_wartung_prozent",
  "quelle",
  "bemerkung",
] as const;
export type OptionenSpalte = (typeof OPTIONEN_SPALTEN)[number];

/** Erlaubte Werte für nur_antrieb (wie die Antriebe im Fahrzeugkatalog). */
export const OPTIONEN_ANTRIEBE = ["Diesel", "Elektro", "Hybrid", "Erdgas", "Wasserstoff"] as const;

export interface Option {
  option_id: string;
  /** Gruppe sich ausschließender Optionen, null bei einer einzelnen Option. */
  gruppe: string | null;
  name: string;
  aufpreis_eur: number;
  /** Nur für diesen Antrieb, null für alle. */
  nur_antrieb: string | null;
  standard: boolean;
  serie_neukauf: boolean;
  /** cfg.frei oder Name der Technologie, die die Option im Neukauf freischaltet. */
  freischaltung: string;
  gebraucht_anteil: number;
  wirkung_zufriedenheit: number | null;
  wirkung_verbrauch_prozent: number | null;
  wirkung_teilebedarf_prozent: number | null;
  wirkung_wartung_prozent: number | null;
  quelle: string | null;
  bemerkung: string | null;
  /** Zeilennummer in der Datei. */
  zeile: number;
}

export const OPTIONEN_MELDUNG_CODES = [
  "dateiUnlesbar",
  "blattFehlt",
  "spaltenzahlFalsch",
  "spalteFehlt",
  "spalteUnerwartet",
  "spalteVerschoben",
  "pflichtfeldLeer",
  "keineZahl",
  "keinJaNein",
  "wertNichtErlaubt",
  "optionIdUngueltig",
  "optionIdDoppelt",
  "gruppeOhneStandard",
  "gruppeMehrereStandard",
  "gruppeGemischterAntrieb",
] as const;
export type OptionenMeldungCode = (typeof OPTIONEN_MELDUNG_CODES)[number];

/** Wie Meldung aus katalog.ts, aber mit den Codes der Optionsdatei. */
export interface OptionenMeldung {
  schwere: "fehler" | "hinweis";
  code: OptionenMeldungCode;
  zeile?: number;
  spalte?: string;
  modellId?: string;
  wert?: string;
}

export interface OptionenErgebnis {
  optionen: Option[];
  meldungen: OptionenMeldung[];
}

const PFLICHT: readonly OptionenSpalte[] = [
  "option_id", "name", "aufpreis_eur", "standard", "serie_neukauf", "freischaltung", "gebraucht_anteil",
];
const ZAHLEN: readonly OptionenSpalte[] = [
  "aufpreis_eur", "gebraucht_anteil", "wirkung_zufriedenheit", "wirkung_verbrauch_prozent",
  "wirkung_teilebedarf_prozent", "wirkung_wartung_prozent",
];
const JA_NEIN: readonly OptionenSpalte[] = ["standard", "serie_neukauf"];
const OPTION_ID_MUSTER = /^[a-z0-9_]+$/;

function text(v: ExcelJS.CellValue): string {
  const w = zellWert(v);
  return w === null ? "" : String(w);
}

/** Prüft die Kopfzeile nach Namen. */
export function pruefeOptionenKopf(kopf: string[]): { missing: string[]; unexpected: string[]; moved: string[] } {
  const soll = OPTIONEN_SPALTEN as readonly string[];
  return {
    missing: soll.filter((c) => !kopf.includes(c)),
    unexpected: kopf.filter((c) => !soll.includes(c)),
    moved: soll.filter((c, i) => kopf.includes(c) && kopf[i] !== c),
  };
}

/** Liest und prüft die Optionsdatei. Wirft nie: eine unlesbare Datei ergibt den Fehler dateiUnlesbar. */
export async function ladeOptionen(bytes: ArrayBuffer | Uint8Array, cfg: OptionenConfig): Promise<OptionenErgebnis> {
  const meldungen: OptionenMeldung[] = [];
  const fehler = (m: Omit<OptionenMeldung, "schwere">) => meldungen.push({ schwere: "fehler", ...m });
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as ArrayBuffer);
  } catch (e) {
    fehler({ code: "dateiUnlesbar", wert: e instanceof Error ? e.message : String(e) });
    return { optionen: [], meldungen };
  }
  try {
    return pruefeBlatt(wb, cfg, meldungen, fehler);
  } catch (e) {
    fehler({ code: "dateiUnlesbar", wert: e instanceof Error ? e.message : String(e) });
    return { optionen: [], meldungen };
  }
}

function pruefeBlatt(
  wb: ExcelJS.Workbook,
  cfg: OptionenConfig,
  meldungen: OptionenMeldung[],
  fehler: (m: Omit<OptionenMeldung, "schwere">) => void,
): OptionenErgebnis {
  const blatt = wb.getWorksheet(cfg.sheetName);
  if (!blatt) {
    fehler({ code: "blattFehlt", wert: cfg.sheetName });
    return { optionen: [], meldungen };
  }

  // Kopfzeile
  const kopf: string[] = [];
  blatt.getRow(1).eachCell({ includeEmpty: true }, (c) => kopf.push(text(c.value).trim()));
  while (kopf.length && kopf[kopf.length - 1] === "") kopf.pop();
  if (kopf.length !== OPTIONEN_SPALTEN.length) fehler({ code: "spaltenzahlFalsch", wert: String(kopf.length) });
  const k = pruefeOptionenKopf(kopf);
  for (const s of k.missing) fehler({ code: "spalteFehlt", spalte: s });
  for (const s of k.unexpected) fehler({ code: "spalteUnerwartet", spalte: s });
  for (const s of k.moved) fehler({ code: "spalteVerschoben", spalte: s });
  // Ohne Pflichtspalte ist keine Zeile nutzbar.
  if (PFLICHT.some((s) => k.missing.includes(s))) return { optionen: [], meldungen };

  const gesehen = new Set<string>();
  const gelesen: Option[] = [];
  blatt.eachRow((row, nr) => {
    if (nr === 1) return;
    const w: Record<string, Wert> = {};
    kopf.forEach((name, j) => {
      if (name && !(name in w)) w[name] = zellWert(row.getCell(j + 1).value);
    });
    // Leere Zeilen werden ignoriert.
    if (Object.values(w).every((x) => x === null)) return;
    const id = w.option_id === null || w.option_id === undefined ? undefined : String(w.option_id);
    const ort = { zeile: nr, modellId: id };
    let nutzbar = true;
    const falsch = (m: Omit<OptionenMeldung, "schwere" | "zeile" | "modellId">) => {
      fehler({ ...ort, ...m });
      nutzbar = false;
    };
    const roh = (s: OptionenSpalte): Wert => w[s] ?? null;

    for (const s of PFLICHT) if (roh(s) === null) falsch({ code: "pflichtfeldLeer", spalte: s });

    const z: Record<string, number | null> = {};
    for (const s of ZAHLEN) {
      const v = roh(s);
      z[s] = null;
      if (v === null) continue;
      if (typeof v !== "number" || !Number.isFinite(v)) falsch({ code: "keineZahl", spalte: s, wert: String(v) });
      else z[s] = v;
    }
    if (z.aufpreis_eur !== null && z.aufpreis_eur < 0) falsch({ code: "wertNichtErlaubt", spalte: "aufpreis_eur", wert: String(z.aufpreis_eur) });
    const anteil = z.gebraucht_anteil;
    if (anteil !== null && (anteil < 0 || anteil > 1)) falsch({ code: "wertNichtErlaubt", spalte: "gebraucht_anteil", wert: String(anteil) });

    const b: Record<string, boolean> = {};
    for (const s of JA_NEIN) {
      const v = roh(s);
      b[s] = false;
      if (v === null) continue;
      const t = String(v).trim().toLowerCase();
      if (t === "ja") b[s] = true;
      else if (t !== "nein") falsch({ code: "keinJaNein", spalte: s, wert: String(v) });
    }

    const antrieb = roh("nur_antrieb") === null ? null : String(roh("nur_antrieb"));
    if (antrieb !== null && !(OPTIONEN_ANTRIEBE as readonly string[]).includes(antrieb)) {
      falsch({ code: "wertNichtErlaubt", spalte: "nur_antrieb", wert: antrieb });
    }

    if (id !== undefined) {
      if (!OPTION_ID_MUSTER.test(id)) falsch({ code: "optionIdUngueltig", spalte: "option_id", wert: id });
      if (gesehen.has(id)) falsch({ code: "optionIdDoppelt", spalte: "option_id", wert: id });
      gesehen.add(id);
    }
    if (!nutzbar) return;

    const t = (s: OptionenSpalte) => (roh(s) === null ? null : String(roh(s)));
    gelesen.push({
      option_id: id!,
      gruppe: t("gruppe"),
      name: t("name")!,
      aufpreis_eur: z.aufpreis_eur!,
      nur_antrieb: antrieb,
      standard: b.standard,
      serie_neukauf: b.serie_neukauf,
      freischaltung: t("freischaltung")!,
      gebraucht_anteil: z.gebraucht_anteil!,
      wirkung_zufriedenheit: z.wirkung_zufriedenheit,
      wirkung_verbrauch_prozent: z.wirkung_verbrauch_prozent,
      wirkung_teilebedarf_prozent: z.wirkung_teilebedarf_prozent,
      wirkung_wartung_prozent: z.wirkung_wartung_prozent,
      quelle: t("quelle"),
      bemerkung: t("bemerkung"),
      zeile: nr,
    });
  });

  // Gruppenregeln: genau ein Standard, einheitlicher Antrieb. Sonst fällt die ganze Gruppe weg.
  const unbrauchbar = new Set<string>();
  for (const [gruppe, liste] of gruppenVon(gelesen)) {
    const standards = liste.filter((o) => o.standard);
    if (standards.length === 0) {
      fehler({ code: "gruppeOhneStandard", spalte: "standard", wert: gruppe });
      unbrauchbar.add(gruppe);
    } else if (standards.length > 1) {
      fehler({ code: "gruppeMehrereStandard", spalte: "standard", wert: gruppe, zeile: standards[1].zeile });
      unbrauchbar.add(gruppe);
    }
    if (new Set(liste.map((o) => o.nur_antrieb)).size > 1) {
      fehler({ code: "gruppeGemischterAntrieb", spalte: "nur_antrieb", wert: gruppe });
      unbrauchbar.add(gruppe);
    }
  }
  const optionen = gelesen.filter((o) => o.gruppe === null || !unbrauchbar.has(o.gruppe));
  return { optionen, meldungen };
}

/** Optionen nach Gruppe (nur Optionen mit Gruppe), in Dateireihenfolge. */
export function gruppenVon(optionen: readonly Option[]): Map<string, Option[]> {
  const out = new Map<string, Option[]>();
  for (const o of optionen) {
    if (o.gruppe === null) continue;
    const liste = out.get(o.gruppe);
    if (liste) liste.push(o);
    else out.set(o.gruppe, [o]);
  }
  return out;
}

/** Ist die Option im Neukauf wählbar (ohne Forschung frei oder ihre Technologie erforscht)? */
export function imNeukaufWaehlbar(o: Option, freigeschaltet: ReadonlySet<string>, cfg: OptionenConfig): boolean {
  return o.freischaltung === cfg.frei || freigeschaltet.has(o.freischaltung);
}

/** Passt die Option zum Antrieb des Busses? */
export function passtZuAntrieb(o: Option, antrieb: string): boolean {
  return o.nur_antrieb === null || o.nur_antrieb === antrieb;
}

/** Summe der Aufpreise der gewählten Optionen beim Neukauf. Serienausstattung kostet nichts, unbekannte ids zählen 0. */
export function aufpreisNeukauf(ids: readonly string[], optionen: readonly Option[]): number {
  const nachId = new Map(optionen.map((o) => [o.option_id, o]));
  let summe = 0;
  for (const id of new Set(ids)) {
    const o = nachId.get(id);
    if (o && !o.serie_neukauf) summe += o.aufpreis_eur;
  }
  return summe;
}

/** Voreinstellung beim Neukauf: Standard jeder passenden Gruppe plus alle passende Serienausstattung (option_ids). */
export function standardAuswahl(optionen: readonly Option[], antrieb: string): string[] {
  const out: string[] = [];
  for (const liste of gruppenVon(optionen).values()) {
    const std = liste.find((o) => o.standard && passtZuAntrieb(o, antrieb));
    if (std) out.push(std.option_id);
  }
  for (const o of optionen) if (o.serie_neukauf && passtZuAntrieb(o, antrieb) && !out.includes(o.option_id)) out.push(o.option_id);
  return out;
}
