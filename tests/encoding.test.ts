import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression: Beim Bearbeiten mit Windows PowerShell 5.1 wurden UTF-8-Dateien als Windows-1252 gelesen und
 * doppelt kodiert zurückgeschrieben ("ProjektgerÃ¼st"). Alle Textdateien müssen sauberes UTF-8 ohne BOM sein.
 */
const ORDNER = ["src", "tests", "scripts", "docs", "e2e", ".github", "public/data"];
const DATEIEN = ["README.md", "annahmen.md", "fortschritt.md", "CLAUDE.md", "index.html", "package.json", "tsconfig.json", "vite.config.ts", "playwright.config.ts"];
const ENDUNGEN = /\.(ts|mjs|json|md|yml|html|css)$/;

function sammle(pfad: string, out: string[]): void {
  for (const n of readdirSync(pfad)) {
    const p = join(pfad, n);
    if (statSync(p).isDirectory()) sammle(p, out);
    else if (ENDUNGEN.test(n)) out.push(p);
  }
}

describe("Textdateien", () => {
  const dateien = [...DATEIEN];
  for (const o of ORDNER) sammle(o, dateien);
  it("sind UTF-8 ohne BOM und ohne doppelte Kodierung", () => {
    expect(dateien.length).toBeGreaterThan(20);
    const fehler: string[] = [];
    for (const f of dateien) {
      const b = readFileSync(f);
      if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) fehler.push(`${f}: BOM`);
      const s = b.toString("utf8");
      if (s.includes(String.fromCharCode(0xfffd))) fehler.push(`${f}: ungültiges UTF-8`);
      if (/Ã[\u0080-¿]|Ã¼|Ã¤|Ã¶|ÃŸ|â€/.test(s) && !f.endsWith("encoding.test.ts")) fehler.push(`${f}: doppelt kodiert`);
    }
    expect(fehler).toEqual([]);
  });
});
