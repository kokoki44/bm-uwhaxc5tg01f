import { expect, test } from "@playwright/test";

// Oberflächentest der Web-Version: Seite startet, Karte, Simulation, Speicher und Testdatensatz laufen.
// Derselbe Test prüft nach der Veröffentlichung die Pages-Adresse (E2E_BASE_URL).
test("Web-Version startet", async ({ page }, info) => {
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.goto("./");
  await expect(page).toHaveTitle("Bus-Manager");
  await expect(page.locator("#map canvas")).toBeVisible();
  const status = page.getByTestId("status");
  await expect(status).toContainText("Simulation:");
  await expect(status).toContainText("IndexedDB (Browser)");
  await expect(status).toContainText(/Testdatensatz Norderstedt: \d+ Elemente/);
  const ticks = async () => Number(/(\d+) Takte/.exec(await status.innerText())![1]);
  const a = await ticks();
  await expect.poll(ticks).toBeGreaterThan(a);
  await page.screenshot({ path: info.outputPath("start.png") });
  expect(fehler).toEqual([]);
});
