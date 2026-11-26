import { expect, it } from "vitest";
import rwRaw from "../regelwerk/de.json";
import { config } from "../src/config";
import { pruefeTag } from "../src/dienste/pruefung";
import { ladeRegelwerk } from "../src/dienste/regelwerk";
import { grosseFlotte } from "./helpers/grosse-flotte";

/**
 * Leistungstest Kriterium 13 (A3c-12*): 1.000 Dienste einer Tagesart in unter 200 ms. Läuft über `npm test` allein nach
 * den übrigen Tests (scripts/test.mjs, LEISTUNG=1), damit parallel laufende Testdateien die Zeit nicht verfälschen.
 * Gemessen wird die Rechenzeit des Prozesses (CPU-Zeit), bester von fünf Läufen nach einem Aufwärmlauf.
 */
it("1.000 Dienste prüfen in unter 200 ms", () => {
  const rw = ladeRegelwerk(rwRaw).regelwerk!;
  const a = grosseFlotte();
  pruefeTag(a, rw, config.dienste);
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const c0 = process.cpuUsage();
    const t = pruefeTag(a, rw, config.dienste);
    const c = process.cpuUsage(c0);
    best = Math.min(best, (c.user + c.system) / 1000);
    expect(t.dienste).toHaveLength(1000);
  }
  console.log(`Prüfung von 1.000 Diensten: ${best.toFixed(0)} ms Rechenzeit`);
  expect(best).toBeLessThan(200);
});
