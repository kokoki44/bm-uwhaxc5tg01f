import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { config } from "../../src/config";

/** Bytes der echten Optionsdatei (nur gelesen). */
export function echteOptionenBytes(): Uint8Array {
  return new Uint8Array(readFileSync(config.optionen.fileName));
}

/**
 * Baut eine veränderte Kopie der Optionsdatei im Speicher. Die Datei auf der Platte bleibt unberührt.
 * `aendern` bekommt die geladene Arbeitsmappe und darf sie beliebig verändern.
 */
export async function veraenderteOptionen(aendern: (wb: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(echteOptionenBytes() as unknown as ArrayBuffer);
  aendern(wb);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export function optionenBlatt(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  const s = wb.getWorksheet(config.optionen.sheetName);
  if (!s) throw new Error("Blatt Optionen fehlt");
  return s;
}

/** Spaltennummer (ab 1) einer Spalte im Blatt Optionen. */
export function optSpaltenNr(wb: ExcelJS.Workbook, name: string): number {
  let nr = 0;
  optionenBlatt(wb)
    .getRow(1)
    .eachCell((c, i) => {
      if (c.value === name) nr = i;
    });
  if (!nr) throw new Error(`Spalte ${name} fehlt`);
  return nr;
}

/** Zeilennummer einer Option im Blatt Optionen. */
export function optZeilenNr(wb: ExcelJS.Workbook, optionId: string): number {
  let nr = 0;
  optionenBlatt(wb).eachRow((r, i) => {
    if (r.getCell(1).value === optionId) nr = i;
  });
  if (!nr) throw new Error(`Option ${optionId} fehlt`);
  return nr;
}

/** Setzt den Wert einer Zelle (Option, Spalte). */
export function setzeOptWert(wb: ExcelJS.Workbook, optionId: string, spalte: string, wert: ExcelJS.CellValue): void {
  optionenBlatt(wb).getRow(optZeilenNr(wb, optionId)).getCell(optSpaltenNr(wb, spalte)).value = wert;
}

/** Tauscht zwei ganze Spalten (Kopf und alle Werte) im Blatt Optionen. */
export function tauscheOptSpalten(wb: ExcelJS.Workbook, a: string, b: string): void {
  const s = optionenBlatt(wb);
  const na = optSpaltenNr(wb, a);
  const nb = optSpaltenNr(wb, b);
  s.eachRow({ includeEmpty: true }, (r) => {
    const va = r.getCell(na).value;
    r.getCell(na).value = r.getCell(nb).value;
    r.getCell(nb).value = va;
  });
}
