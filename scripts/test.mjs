// Einziger Testbefehl (npm test): Einzeltests und Rauchtest mit Vitest, danach die Leistungstests allein (ohne parallel
// laufende Testdateien, die die Messung verfälschen), danach der Oberflächentest mit Playwright.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const run = (cmd, args, env = {}) => spawnSync(cmd, args, { stdio: "inherit", shell: true, env: { ...process.env, ...env } }).status ?? 1;

if (run("npx", ["vitest", "run"]) !== 0) process.exit(1);
if (run("npx", ["vitest", "run"], { LEISTUNG: "1" }) !== 0) process.exit(1);

// Verständliche Meldung statt des langen Playwright-Fehlers, wenn der Browser fehlt.
if (!existsSync(chromium.executablePath())) {
  console.error(
    "\nDer Browser für den Oberflächentest ist nicht installiert.\n" +
      "Einmalig ausführen: npx playwright install chromium\n" +
      "Danach npm test erneut starten.\n",
  );
  process.exit(1);
}

process.exit(run("npx", ["playwright", "test"]));
