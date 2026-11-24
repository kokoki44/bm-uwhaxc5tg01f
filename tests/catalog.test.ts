import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG_COLUMNS } from "../src/catalog/columns";
import { checkHeader, readCatalogHeader } from "../src/catalog/reader";
import { config } from "../src/config";

describe("Fahrzeugkatalog", () => {
  it("Kopfzeile des Blattes Busse hat genau die 63 festen Spaltennamen", async () => {
    expect(CATALOG_COLUMNS).toHaveLength(config.catalog.columnCount);
    const header = await readCatalogHeader(config.catalog.fileName, config.catalog.sheetName);
    const r = checkHeader(header);
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    expect(header).toHaveLength(63);
  });
  it("meldet fehlende, falsche und verschobene Spalten", () => {
    const h = [...CATALOG_COLUMNS] as string[];
    expect(checkHeader(h).ok).toBe(true);
    const ohne = checkHeader(h.filter((c) => c !== "neupreis_eur"));
    expect(ohne.ok).toBe(false);
    expect(ohne.missing).toEqual(["neupreis_eur"]);
    const umbenannt = checkHeader(h.map((c) => (c === "modell" ? "Modell" : c)));
    expect(umbenannt.missing).toEqual(["modell"]);
    expect(umbenannt.unexpected).toEqual(["Modell"]);
    expect(checkHeader([h[1], h[0], ...h.slice(2)]).moved).toEqual([h[0], h[1]]);
  });
  it("Datei ist unverändert (Hash). Nach bewusstem Austausch: npm run katalog:hash", () => {
    const soll = readFileSync("fahrzeugkatalog.sha256", "utf8").trim();
    const ist = createHash("sha256").update(readFileSync(config.catalog.fileName)).digest("hex");
    expect(ist, "fahrzeugkatalog.xlsx wurde verändert. Falls bewusst ausgetauscht: npm run katalog:hash").toBe(soll);
  });
});
