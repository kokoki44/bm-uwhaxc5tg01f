import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { config } from "../../src/config";

/** Bytes der echten Katalogdatei (nur gelesen). */
export function echteKatalogBytes(): Uint8Array {
  return new Uint8Array(readFileSync(config.catalog.fileName));
}

/**
 * Baut eine veränderte Kopie des Katalogs im Speicher. Die Datei auf der Platte bleibt unberührt.
 * `aendern` bekommt die geladene Arbeitsmappe und darf sie beliebig verändern.
 */
export async function veraenderterKatalog(aendern: (wb: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(echteKatalogBytes() as unknown as ArrayBuffer);
  aendern(wb);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export function busse(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  const s = wb.getWorksheet(config.catalog.sheetName);
  if (!s) throw new Error("Blatt Busse fehlt");
  return s;
}

/** Spaltennummer (ab 1) einer Katalogspalte im Blatt Busse. */
export function spaltenNr(wb: ExcelJS.Workbook, name: string): number {
  let nr = 0;
  busse(wb)
    .getRow(1)
    .eachCell((c, i) => {
      if (c.value === name) nr = i;
    });
  if (!nr) throw new Error(`Spalte ${name} fehlt`);
  return nr;
}

/** Zeilennummer eines Modells im Blatt Busse. */
export function zeilenNr(wb: ExcelJS.Workbook, modellId: string): number {
  let nr = 0;
  busse(wb).eachRow((r, i) => {
    if (r.getCell(1).value === modellId) nr = i;
  });
  if (!nr) throw new Error(`Modell ${modellId} fehlt`);
  return nr;
}

export function entferneBlatt(wb: ExcelJS.Workbook, name: string): void {
  const s = wb.getWorksheet(name);
  if (!s) throw new Error(`Blatt ${name} fehlt`);
  wb.removeWorksheet(s.id);
}

/** Tauscht zwei ganze Spalten (Kopf und alle Werte) im Blatt Busse. */
export function tauscheSpalten(wb: ExcelJS.Workbook, a: string, b: string): void {
  const s = busse(wb);
  const na = spaltenNr(wb, a);
  const nb = spaltenNr(wb, b);
  s.eachRow({ includeEmpty: true }, (r) => {
    const va = r.getCell(na).value;
    r.getCell(na).value = r.getCell(nb).value;
    r.getCell(nb).value = va;
  });
}
