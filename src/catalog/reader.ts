import ExcelJS from "exceljs";
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
  const out: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (c) => out.push(cellText(c.value).trim()));
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/** Meldet falsche oder fehlende Spaltennamen. */
export function checkHeader(header: string[]): HeaderCheck {
  const expected = CATALOG_COLUMNS as readonly string[];
  const missing = expected.filter((c) => !header.includes(c));
  const unexpected = header.filter((c) => !expected.includes(c));
  const moved = expected.filter((c, i) => header.includes(c) && header[i] !== c);
  return { ok: !missing.length && !unexpected.length && !moved.length, missing, unexpected, moved };
}
