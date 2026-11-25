import { expect, test, type Page } from "@playwright/test";

// Oberflächentest Etappe 2: Katalogfehler beim Start, Standort wählen, Grundstück kaufen, Betriebshof im Editor bauen.

async function starte(page: Page) {
  await page.goto("./");
  await expect(page.locator("#s-name")).toBeFocused();
  await page.keyboard.type("Hofbau Test");
  await page.keyboard.press("Enter");
  await expect(page.locator("#kopfleiste")).toBeVisible({ timeout: 30000 });
}

/** Baut per Eingabefeldern (nur Tastatur). */
async function baueMitEingabe(page: Page, typ: string, r: { x: number; y: number; b: number; t: number }) {
  await page.getByTestId(`werkzeug-${typ}`).check();
  for (const [id, v] of [["e-x", r.x], ["e-y", r.y], ["e-b", r.b], ["e-t", r.t]] as const) await page.getByTestId(id).fill(String(v));
  await page.getByTestId("e-t").press("Enter");
}

/** Bildschirmpunkt eines Hofpunkts (m) in der Draufsicht. */
async function hofPunkt(page: Page, x: number, y: number) {
  return page.getByTestId("editor-flaeche").evaluate((svg, [px, py]) => {
    const m = (svg as SVGSVGElement).getScreenCTM()!;
    const p = new DOMPoint(px, py).matrixTransform(m);
    return { x: p.x, y: p.y };
  }, [x, y] as const);
}

test("Betriebshof: Katalogfehler, Standort wählen, Grundstück kaufen, Layout bauen und prüfen", async ({ page }, info) => {
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await starte(page);

  // Katalogfehler nur, weil es Fehler gibt: zwei Zeilen ohne Länge; Schließen-Knopf
  const kat = page.getByTestId("fenster-katalog");
  await expect(kat).toBeVisible({ timeout: 30000 });
  await expect(kat).toContainText("altas_novus_cityline");
  await expect(kat).toContainText("altas_novus_ecoline");
  await expect(kat.getByTestId("katalog-fehler").locator("li")).toHaveCount(2);
  // auch in der Testansicht (F3)
  await page.keyboard.press("F3");
  await expect(page.getByTestId("status")).toContainText(/Fahrzeugkatalog: 206 von 208 Zeilen nutzbar, 2 Fehler/);
  await page.keyboard.press("F3");
  await kat.getByTestId("fenster-schliessen").click();
  await expect(kat).toHaveCount(0);

  // Standortliste: Preis, Fläche, Anbindung je Standort; Auswahl per Tastatur
  const liste = page.getByTestId("fenster-standorte");
  await expect(liste).toBeVisible();
  await expect(liste.locator("tbody tr").first()).toContainText("€/m²");
  const ersterStandort = liste.locator("tbody button").first();
  await ersterStandort.focus();
  await page.keyboard.press("Enter");
  const gs = page.getByTestId("fenster-grundstueck");
  await expect(gs).toBeVisible();
  await expect(gs.getByTestId("grundstueck-preis")).toHaveText(/\d+ €\/m²/);
  await expect(gs.getByTestId("grundstueck-kosten")).toContainText("2.000 m²");
  // Vorschau des Grundstücks auf der Karte
  await expect
    .poll(() => page.evaluate(() => (document.getElementById("map") as unknown as { __karte: { querySourceFeatures(s: string): unknown[] } }).__karte.querySourceFeatures("grundstueck").length))
    .toBeGreaterThan(0);
  // zu klein wird abgelehnt
  await gs.getByTestId("grundstueck-breite").fill("30");
  await expect(gs.getByTestId("grundstueck-meldung")).toContainText("mindestens");
  await expect(gs.getByTestId("grundstueck-kaufen")).toBeDisabled();
  await gs.getByTestId("grundstueck-breite").fill("50");
  await expect(gs.getByTestId("grundstueck-kaufen")).toBeEnabled();
  const vorher = await page.getByTestId("kontostand").innerText();
  await gs.getByTestId("grundstueck-kaufen").click();
  await expect(page.getByTestId("kontostand")).not.toHaveText(vorher);

  // Editor öffnet sich als eigene Ansicht
  const editor = page.getByTestId("editor");
  await expect(editor).toBeVisible();
  await expect(page.getByTestId("editor-grundstueck")).toContainText("50 × 40 m");
  await expect(page.getByTestId("editor-gueltig")).toContainText("ungültig");
  await expect(page.getByTestId("editor-fehler")).toContainText("kein Tor");

  // Bauen mit Eingabe (Tastatur)
  await baueMitEingabe(page, "stellplatz", { x: 4, y: 2, b: 4, t: 14 });
  await expect(page.getByTestId("editor-meldung")).toContainText("gebaut");
  await expect(page.getByTestId("editor-gueltig")).toContainText("ungültig");
  await baueMitEingabe(page, "tor", { x: 0, y: 16, b: 4, t: 7 });
  await baueMitEingabe(page, "fahrweg", { x: 4, y: 16, b: 46, t: 7 });
  await expect(page.getByTestId("editor-gueltig")).toContainText("Layout gültig");
  await expect(page.getByTestId("editor-betrieb")).toContainText("Werkstatt");
  await baueMitEingabe(page, "werkstatt", { x: 4, y: 23, b: 5, t: 15 });
  await baueMitEingabe(page, "buero", { x: 27, y: 23, b: 4, t: 4 });
  await expect(page.getByTestId("editor-betrieb")).toHaveText(/✔ Betriebsbereit/);
  // nur ein Tor und ein schmaler Fahrweg mit Stellplätzen: Warnung, Layout bleibt gültig
  await expect(page.getByTestId("editor-warnungen")).toContainText("keine Wendemöglichkeit");
  await expect(page.getByTestId("editor-gueltig")).toContainText("Layout gültig");
  // Überlappung wird abgelehnt
  await baueMitEingabe(page, "lager", { x: 5, y: 17, b: 4, t: 4 });
  await expect(page.getByTestId("editor-meldung")).toContainText("überlappt");

  // Mit der Maus einen zweiten Stellplatz aufziehen
  await page.getByTestId("werkzeug-stellplatz").check();
  const a = await hofPunkt(page, 8, 2), b = await hofPunkt(page, 12, 16);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("editor-meldung")).toContainText("Stellplatz");
  await expect(page.getByTestId("sum-abstellplaetze")).toContainText("2 (2 Stellplätze");

  // Prüfanzeige: Klick auf den ersten Stellplatz zeigt Weg vom Tor und Fahrzeit
  await page.getByTestId("werkzeug-auswahl").check();
  const p = await hofPunkt(page, 6, 9);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("auswahl-weg")).toHaveText("Weg vom Tor: 12 m, Fahrzeit 4,3 s bei 10 km/h");
  await expect(page.getByTestId("weg-linie")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("editor.png") });

  // Auswahl auch per Tastatur über die Bauteilliste: Tor zeigt die Anbindung an die Straße
  await page.getByTestId("editor-liste").locator("button", { hasText: "Zufahrt und Tor" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("auswahl-anbindung")).toContainText(/Anbindung: [\d,.]+ m/);
  // Zukauf an der Torseite (Westen) warnt vorher
  await page.getByTestId("zukauf-seite").selectOption("w");
  await expect(page.getByTestId("zukauf-info")).toContainText("Tor");
  await page.getByTestId("zukauf-seite").selectOption("o");
  await expect(page.getByTestId("zukauf-info")).not.toContainText("Tor");
  await page.getByTestId("zukauf-kaufen").click();
  await expect(page.getByTestId("editor-grundstueck")).toContainText("60 × 40 m");

  // Zurück zur Karte: Betriebshof ist eingezeichnet, Menü öffnet den Editor wieder
  await page.getByTestId("editor-schliessen").click();
  await expect(editor).toHaveCount(0);
  await page.getByTestId("menu-betriebshof").click();
  await expect(editor).toBeVisible();
  await expect(page.getByTestId("editor-liste").locator("button")).toHaveCount(6);
  expect(fehler).toEqual([]);
});
