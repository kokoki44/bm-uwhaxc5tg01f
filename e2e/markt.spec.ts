import { expect, test, type Page } from "@playwright/test";

// Oberflächentest Etappe 3a: Menüleiste, Neukauf mit Konfiguration, Gebrauchtkauf, Fahrzeugliste, Verkauf, Personal.

const euroZahl = (s: string) => Number(s.replace(/[^\d,-]/g, "").replace(",", "."));

async function spielMitHof(page: Page) {
  await page.goto("./?test");
  await expect(page.locator("#s-name")).toBeFocused();
  await page.keyboard.type("Markt Test");
  await page.keyboard.press("Enter");
  await expect(page.locator("#kopfleiste")).toBeVisible({ timeout: 30000 });
  const kat = page.getByTestId("fenster-katalog");
  await expect(kat).toBeVisible({ timeout: 30000 });
  await kat.getByTestId("fenster-schliessen").click();
  // Optionsdatei ohne Fehler: kein Fenster, aber Zeile in der Testansicht
  await expect(page.getByTestId("fenster-optionen")).toHaveCount(0);
  await expect(page.getByTestId("status")).toContainText(/Optionsdatei optionen\.xlsx: \d+ Optionen, 0 Fehler/);
  const liste = page.getByTestId("fenster-standorte");
  await liste.locator("tbody button").first().click();
  await page.getByTestId("fenster-grundstueck").getByTestId("grundstueck-kaufen").click();
  await expect(page.getByTestId("editor")).toBeVisible();
  const bau = async (typ: string, r: [number, number, number, number]) => {
    await page.getByTestId(`werkzeug-${typ}`).check();
    for (const [id, v] of [["e-x", r[0]], ["e-y", r[1]], ["e-b", r[2]], ["e-t", r[3]]] as const) await page.getByTestId(id).fill(String(v));
    await page.getByTestId("e-t").press("Enter");
  };
  await bau("tor", [0, 16, 4, 7]);
  await bau("fahrweg", [4, 16, 46, 7]);
  for (const x of [4, 8, 12, 16]) await bau("stellplatz", [x, 2, 4, 14]);
  await bau("werkstatt", [4, 23, 5, 15]);
  await bau("buero", [27, 23, 4, 4]);
  await expect(page.getByTestId("editor-betrieb")).toHaveText(/✔ Betriebsbereit/);
  await page.getByTestId("editor-schliessen").click();
}

test("Fahrzeugmarkt und Personal: Neukauf, Gebrauchtkauf, Verkauf, Einstellen, Lohn", async ({ page }, info) => {
  test.setTimeout(120000);
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await spielMitHof(page);

  // Menüleiste am Rand, per Tastatur erreichbar
  const menue = page.locator("#menueleiste");
  await expect(menue.getByRole("button")).toHaveCount(4);
  await page.getByTestId("menu-fahrzeugmarkt").focus();
  await page.keyboard.press("Enter");
  const markt = page.getByTestId("fenster-fahrzeugmarkt");
  await expect(markt).toBeVisible();

  // Regression: Bei gemischten Reihen öffnet sich die Variante, die zum Filter passt (Elektro mit Batteriewahl)
  await markt.getByTestId("markt-filter-antrieb").selectOption("Elektro");
  await markt.getByTestId("markt-filter-hersteller").selectOption("Iveco Bus");
  await markt.getByTestId("markt-modell").filter({ hasText: /^Iveco Bus Crossway LE City 12 m$/ }).click();
  await expect(markt.getByTestId("markt-batterie")).toBeVisible();
  await expect(markt.getByTestId("markt-werte")).toContainText("Elektro");
  // Bauart-Filter: nur Reihen mit Gelenkbussen, die Spalte Bauart nennt nur Gelenk
  await markt.getByTestId("markt-filter-hersteller").selectOption("");
  const alleElektro = await markt.getByTestId("markt-modell").count();
  await markt.getByTestId("markt-filter-bauart").selectOption("Gelenk");
  const gelenk = await markt.getByTestId("markt-modell").count();
  expect(gelenk).toBeGreaterThan(0);
  expect(gelenk).toBeLessThan(alleElektro);
  for (const z of await markt.locator("tbody tr td:nth-child(2)").allInnerTexts()) expect(z).toBe("Gelenk");
  await markt.getByTestId("markt-filter-bauart").selectOption("");

  // Neukauf MAN Lion's City E 12 mit 534 kWh: Preis 520.000 + 178 kWh × 700 €, 16 Stehplätze weniger
  await markt.getByTestId("markt-filter-hersteller").selectOption("MAN");
  await markt.getByTestId("markt-filter-antrieb").selectOption("Elektro");
  await markt.getByTestId("markt-modell").filter({ hasText: /^MAN Lion's City E 12$/ }).click();
  await expect(markt.getByTestId("markt-preis")).toHaveText("Preis: 520.000,00 €");
  // Überschrift ohne Variante, Variante als Zusatz (Koko, 25.11.2026)
  await expect(markt.getByTestId("markt-titel")).toHaveText("MAN Lion's City E 12");
  await expect(markt.getByTestId("markt-titel-variante")).toHaveText("2 Türen");
  await expect(markt.getByTestId("markt-werte")).toContainText("44 Sitzplätze, 44 Stehplätze");
  await markt.getByTestId("markt-batterie").selectOption("534");
  await expect(markt.getByTestId("markt-preis")).toHaveText("Preis: 644.600,00 €");
  await expect(markt.getByTestId("markt-werte")).toContainText("44 Sitzplätze, 28 Stehplätze");
  // gesperrte Ausstattung ist nicht wählbar, Assistenten serienmäßig
  await expect(markt.getByTestId("markt-option-klimaanlage")).toBeDisabled();
  await expect(markt.getByTestId("markt-detail")).toContainText("Serienmäßig ohne Aufpreis: Abbiegeassistent, Notbremsassistent");
  const vorher = euroZahl(await page.getByTestId("kontostand").innerText());
  await markt.getByTestId("markt-kaufen").click();
  await expect(markt.getByTestId("markt-meldung")).toContainText("Gekauft: Bus 1 (SE-");
  await expect(markt.getByTestId("markt-meldung")).toContainText("Stellplatz Nr.");
  expect(euroZahl(await page.getByTestId("kontostand").innerText())).toBeCloseTo(vorher - 644600, 2);

  // Gebrauchtmarkt: Zustand als Spanne, Inspektion zeigt den genauen Wert, Kauf eines passenden Busses
  await markt.getByTestId("markt-reiter-gebraucht").click();
  await expect(markt.getByTestId("gebraucht-tabelle").locator("tbody tr")).toHaveCount(12);
  const erste = markt.getByTestId("gebraucht-tabelle").locator("tbody tr").first();
  await expect(erste.locator("[data-testid^='angebot-zustand-']")).toHaveText(/\d+ bis \d+ %/);
  await erste.locator("[data-testid^='angebot-inspektion-']").click();
  await expect(markt.getByTestId("gebraucht-meldung")).toContainText("Inspektion durchgeführt");
  await expect(erste.locator("[data-testid^='angebot-zustand-']")).toHaveText(/\d+ % \(geprüft\)/);
  let gekauft = false;
  for (let i = 0; i < 12 && !gekauft; i++) {
    const knopf = markt.getByTestId("gebraucht-tabelle").locator("tbody tr").nth(i).locator("[data-testid^='angebot-kaufen-']");
    await knopf.click();
    gekauft = (await markt.getByTestId("gebraucht-meldung").innerText()).startsWith("Gekauft: Bus 2");
    if (!gekauft) await expect(markt.getByTestId("gebraucht-meldung")).toContainText(/Kein freier Platz|Kontostand/);
  }
  expect(gekauft, "kein Gebrauchtangebot passte auf einen freien Stellplatz").toBe(true);
  await markt.getByTestId("fenster-schliessen").click();

  // Fahrzeugliste: zwei Busse mit Platz; Verkauf an den Händler macht den Platz frei
  await page.getByTestId("menu-fahrzeuge").click();
  const fz = page.getByTestId("fenster-fahrzeuge");
  await expect(fz.getByTestId("fahrzeug-tabelle").locator("tbody tr")).toHaveCount(2);
  await fz.getByTestId("fahrzeug-1").click();
  await expect(fz.getByTestId("fahrzeug-detail")).toContainText("Bus 1: MAN Lion's City E 12");
  await fz.getByTestId("fahrzeug-umsetzen").selectOption({ index: 1 });
  await expect(fz.getByTestId("fahrzeug-meldung")).toContainText("Umgesetzt auf Stellplatz Nr.");
  await page.screenshot({ path: info.outputPath("fahrzeuge.png") });
  await fz.getByTestId("fahrzeug-2").click();
  const vorVerkauf = euroZahl(await page.getByTestId("kontostand").innerText());
  await fz.getByTestId("fahrzeug-verkaufen").click();
  await fz.getByTestId("fahrzeug-verkaufen-ja").click();
  await expect(fz.getByTestId("fahrzeug-meldung")).toContainText("an den Händler verkauft");
  expect(euroZahl(await page.getByTestId("kontostand").innerText())).toBeGreaterThan(vorVerkauf);
  await expect(fz.getByTestId("fahrzeug-tabelle").locator("tbody tr")).toHaveCount(1);
  await fz.getByTestId("fenster-schliessen").click();

  // Busse im Editor als Rechtecke auf ihren Plätzen
  await page.getByTestId("menu-betriebshof").click();
  await expect(page.getByTestId("bus-im-hof")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("editor-busse.png") });
  await page.getByTestId("editor-schliessen").click();

  // Personal: Fahrer ausschreiben, nach einigen Tagen Bewerber einstellen
  await page.getByTestId("menu-personal").click();
  const pers = page.getByTestId("fenster-personal");
  await expect(pers.getByTestId("lohntabelle")).toContainText("Fahrer");
  await expect(pers.getByTestId("lohn-fahrer-1")).toHaveValue("20.85");
  await pers.getByTestId("personal-art").selectOption("fahrer");
  await pers.getByTestId("personal-stunden").fill("38");
  // höherer Lohn: mehr und erfahrenere Bewerber
  for (let s = 1; s <= 6; s++) await pers.getByTestId(`lohn-fahrer-${s}`).fill("28"), await pers.getByTestId(`lohn-fahrer-${s}`).press("Enter");
  let bewerber = 0;
  for (let versuch = 0; versuch < 5 && bewerber === 0; versuch++) {
    await pers.getByTestId("personal-ausschreiben").click();
    await expect(pers.getByTestId("personal-meldung")).toContainText("ausgeschrieben");
    await page.evaluate(() => (window as unknown as { __spieltest: { vorspulenTage(n: number): void } }).__spieltest.vorspulenTage(15));
    bewerber = await pers.locator("[data-testid^='bewerber-einstellen-']").count();
  }
  expect(bewerber).toBeGreaterThan(0);
  await pers.locator("[data-testid^='bewerber-einstellen-']").first().click();
  await expect(pers.getByTestId("personal-meldung")).toContainText("ist als Fahrer eingestellt");
  await expect(pers.getByTestId("personal-tabelle").locator("tbody tr")).toHaveCount(1);
  await expect(pers.getByTestId("personal-tabelle")).toContainText("in der Probezeit");
  await page.screenshot({ path: info.outputPath("personal.png") });
  // Monatsende: Lohn wird abgebucht
  const vorLohn = euroZahl(await page.getByTestId("kontostand").innerText());
  await page.evaluate(() => (window as unknown as { __spieltest: { vorspulenTage(n: number): void } }).__spieltest.vorspulenTage(32));
  expect(euroZahl(await page.getByTestId("kontostand").innerText())).toBeLessThan(vorLohn);
  // Kündigung in zwei Schritten
  const kuendigen = pers.locator("[data-testid^='personal-kuendigen-']").first();
  await kuendigen.click();
  await kuendigen.click();
  await expect(pers.getByTestId("personal-meldung")).toContainText("ist gekündigt");
  expect(fehler).toEqual([]);
});
