import ExcelJS from "exceljs";
import type { CatalogConfig } from "../config";
import { CATALOG_COLUMNS } from "./columns";

export interface HeaderCheck {
  ok: boolean;
  missing: string[];
  unexpected: string[];
  /** Spalten, die vorhanden sind, aber an anderer Stelle stehen als erwartet. */
  moved: string[];
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  return String(v);
}

/** Liest nur die Kopfzeile des Blattes (Datei wird ausschließlich gelesen). */
export async function readCatalogHeader(file: string | ArrayBuffer | Uint8Array, sheetName: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  if (typeof file === "string") await wb.xlsx.readFile(file);
  else await wb.xlsx.load(file as ArrayBuffer);
  const sheet = wb.getWorksheet(sheetName);
  if (!sheet) throw new Error(`Blatt "${sheetName}" fehlt im Fahrzeugkatalog`);
  return kopfzeile(sheet, 1);
}

/** Meldet falsche oder fehlende Spaltennamen. */
export function checkHeader(header: string[]): HeaderCheck {
  const expected = CATALOG_COLUMNS as readonly string[];
  const missing = expected.filter((c) => !header.includes(c));
  const unexpected = header.filter((c) => !expected.includes(c));
  const moved = expected.filter((c, i) => header.includes(c) && header[i] !== c);
  return { ok: !missing.length && !unexpected.length && !moved.length, missing, unexpected, moved };
}

/** Ein Zellwert nach dem Einlesen. Leere Texte und Formeln ohne Ergebnis sind null. */
export type Wert = string | number | boolean | null;

export interface RohZeile {
  /** Zeilennummer im Blatt (wie in Excel, Kopfzeile ist 1). */
  zeile: number;
  /** Werte nach Spaltenname aus der Kopfzeile. */
  werte: Record<string, Wert>;
}

/** Eine Zeile aus dem Blatt Spalten. */
export interface SpaltenRegel {
  spalte: string;
  gruppe: string;
  bedeutung: string;
  /** Inhalt von "Einheit oder erlaubte Werte". */
  einheit: string;
  /** "ja", "nein", "nur Elektro" oder "automatisch". */
  pflicht: string;
  /** Inhalt von "Wenn leer". */
  wennLeer: string;
}

export interface KatalogRoh {
  /** Kopfzeile des Blattes Busse, null wenn das Blatt fehlt. */
  kopf: string[] | null;
  /** Datenzeilen mit mindestens einem Wert. */
  zeilen: RohZeile[];
  /** Regeln aus dem Blatt Spalten nach Spaltenname, null wenn das Blatt fehlt. */
  spaltenRegeln: Record<string, SpaltenRegel> | null;
  /** Standardwerte je Klasse ("Bauart|Antrieb"), null wenn das Blatt fehlt. */
  standardwerte: Record<string, Record<string, Wert>> | null;
  /** Spaltennamen der Kopfzeile im Blatt Standardwerte. */
  standardwerteSpalten: string[];
  /** Namen der fehlenden Blätter. */
  fehlendeBlaetter: string[];
}

/** Wandelt einen Zellwert in einen einfachen Wert: Formel nimmt das gespeicherte Ergebnis, Rich Text wird Text. */
export function zellWert(v: ExcelJS.CellValue | undefined): Wert {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("formula" in v || "sharedFormula" in v || "result" in v) {
      return zellWert((v as { result?: ExcelJS.CellValue }).result);
    }
    if ("richText" in v) return zellWert(v.richText.map((r) => r.text).join(""));
    if ("error" in v) return null;
    if ("text" in v) return zellWert((v as { text: ExcelJS.CellValue }).text);
  }
  return null;
}

function kopfzeile(sheet: ExcelJS.Worksheet, zeile: number): string[] {
  const out: string[] = [];
  sheet.getRow(zeile).eachCell({ includeEmpty: true }, (c) => out.push(cellText(c.value).trim()));
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

function leer(w: Wert): boolean {
  return w === null || w === false;
}

const SPALTEN_KOPF = {
  spalte: "Spalte",
  gruppe: "Gruppe",
  bedeutung: "Bedeutung",
  einheit: "Einheit oder erlaubte Werte",
  pflicht: "Pflicht",
  wennLeer: "Wenn leer",
} as const;

function leseSpaltenRegeln(sheet: ExcelJS.Worksheet): Record<string, SpaltenRegel> {
  const kopf = kopfzeile(sheet, 1);
  const felder = Object.keys(SPALTEN_KOPF) as (keyof typeof SPALTEN_KOPF)[];
  // Zuordnung nach Überschrift, ersatzweise nach Position.
  const index = Object.fromEntries(
    felder.map((f, i) => {
      const j = kopf.indexOf(SPALTEN_KOPF[f]);
      return [f, (j >= 0 ? j : i) + 1];
    }),
  ) as Record<keyof typeof SPALTEN_KOPF, number>;
  const out: Record<string, SpaltenRegel> = {};
  sheet.eachRow((row, nr) => {
    if (nr === 1) return;
    const text = (f: keyof typeof SPALTEN_KOPF) => {
      const w = zellWert(row.getCell(index[f]).value);
      return w === null ? "" : String(w);
    };
    const spalte = text("spalte");
    if (!spalte || out[spalte]) return;
    out[spalte] = {
      spalte,
      gruppe: text("gruppe"),
      bedeutung: text("bedeutung"),
      einheit: text("einheit"),
      pflicht: text("pflicht"),
      wennLeer: text("wennLeer"),
    };
  });
  return out;
}

function leseStandardwerte(sheet: ExcelJS.Worksheet, kopfZeile: number) {
  const kopf = kopfzeile(sheet, kopfZeile);
  const werte: Record<string, Record<string, Wert>> = {};
  sheet.eachRow((row, nr) => {
    if (nr <= kopfZeile) return;
    const z: Record<string, Wert> = {};
    kopf.forEach((name, j) => {
      if (name && !(name in z)) z[name] = zellWert(row.getCell(j + 1).value);
    });
    if (z.bauart === null || z.bauart === undefined) return;
    const schluessel =
      typeof z.schluessel === "string" && z.schluessel ? z.schluessel : `${z.bauart ?? ""}|${z.antrieb ?? ""}`;
    if (!werte[schluessel]) werte[schluessel] = z;
  });
  return { kopf, werte };
}

/**
 * Liest den ganzen Fahrzeugkatalog aus den Bytes der Datei (Browser und Node).
 * Wirft eine Ausnahme, wenn die Bytes kein lesbares xlsx sind.
 */
export async function leseKatalogDatei(bytes: ArrayBuffer | Uint8Array, cfg: CatalogConfig): Promise<KatalogRoh> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as ArrayBuffer);
  const roh: KatalogRoh = {
    kopf: null,
    zeilen: [],
    spaltenRegeln: null,
    standardwerte: null,
    standardwerteSpalten: [],
    fehlendeBlaetter: [],
  };

  const busse = wb.getWorksheet(cfg.sheetName);
  if (!busse) roh.fehlendeBlaetter.push(cfg.sheetName);
  else {
    const kopf = kopfzeile(busse, 1);
    roh.kopf = kopf;
    busse.eachRow((row, nr) => {
      if (nr === 1) return;
      const werte: Record<string, Wert> = {};
      kopf.forEach((name, j) => {
        if (name && !(name in werte)) werte[name] = zellWert(row.getCell(j + 1).value);
      });
      // Zeilen ohne jeden Wert (zum Beispiel nur vorbereitete Formeln) zählen nicht.
      if (Object.values(werte).every(leer)) return;
      roh.zeilen.push({ zeile: nr, werte });
    });
  }

  const spalten = wb.getWorksheet(cfg.spaltenBlatt);
  if (!spalten) roh.fehlendeBlaetter.push(cfg.spaltenBlatt);
  else roh.spaltenRegeln = leseSpaltenRegeln(spalten);

  const std = wb.getWorksheet(cfg.standardwerteBlatt);
  if (!std) roh.fehlendeBlaetter.push(cfg.standardwerteBlatt);
  else {
    const { kopf, werte } = leseStandardwerte(std, cfg.standardwerteKopfZeile);
    roh.standardwerte = werte;
    roh.standardwerteSpalten = kopf;
  }
  return roh;
}
