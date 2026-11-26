import { expect, test } from "@playwright/test";
import { beispiellinie, spielMitHofUndBus } from "./hilfen";

// Oberflächentest Etappe 3c-1: Dienste von Hand planen, Prüfung nach dem Regelwerk, freie Fahrten, Beispiel D1, D2, D3,
// Bedienung ohne Maus (Auswahllisten und Knöpfe), Dienst im Fahrplan, Speichern und Weiterspielen.

test("Dienst anlegen: D1 bis zur Ablösung, D2 als Rest des Umlaufs, D3 (ganzer Umlauf) nicht speicherbar, freie Fahrten", async ({ page }, info) => {
  test.setTimeout(240000);
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await spielMitHofUndBus(page, "Dienst Test");
  const ed = await beispiellinie(page);

  // Fahrplan: Ausrücken und Einrücken je Umlauf (echte Hofwerte für den Bericht)
  await ed.getByTestId("linie-fahrplan").click();
  const fp = page.getByTestId("fenster-fahrplan");
  await expect(fp.getByTestId("umlauf-0-ausruecken")).toContainText("ab Betriebshof");
  await expect(fp.getByTestId("umlauf-0-einruecken")).toContainText("an Betriebshof");
  console.log("Hofwerte:", await fp.getByTestId("umlauf-0-ausruecken").textContent(), "|", await fp.getByTestId("umlauf-0-einruecken").textContent());
  await fp.getByTestId("fenster-schliessen").click();
  await ed.getByTestId("fenster-schliessen").click();

  // Dienstplan per Tastatur öffnen, Werktag wählen: alle 84 Fahrten frei
  await page.getByTestId("menu-dienste").focus();
  await page.keyboard.press("Enter");
  const plan = page.getByTestId("fenster-dienste");
  await plan.getByTestId("dienste-tag").selectOption("werktag");
  await expect(plan.getByTestId("dienste-frei")).toContainText("84 von 84 Fahrten haben noch keinen Dienst", { timeout: 20000 });
  await expect(plan.getByTestId("dienste-regelwerk")).toContainText("Deutschland");
  const linieId = (await plan.locator("[data-testid^='zeitzeile-'][data-testid$='-0-frei']").first().getAttribute("data-testid"))!.split("-")[1];

  // D1: Umlauf 1 bis zur Ablösung 12:26:20 am Wilhelm-Busch-Platz, nur mit Auswahllisten und Knöpfen
  await plan.getByTestId("dienst-neu").click();
  const d = page.getByTestId("fenster-dienst");
  await expect(d.getByTestId("dienst-nummer")).toHaveValue("1");
  await d.getByTestId("dienst-umlauf").selectOption("0");
  await d.getByTestId("dienst-abloesung").selectOption({ label: "12:26:20 an Harksheide, Wilhelm-Busch-Platz" });
  await d.getByTestId("dienst-bis-abloesung").focus();
  await page.keyboard.press("Enter");
  await expect(d.getByTestId("dienst-stuecke")).toContainText("Umlauf 1: 20 Fahrten, 06:00 ab Harksheide, Wilhelm-Busch-Platz bis 12:26:20 an Harksheide, Wilhelm-Busch-Platz");
  await expect(d.getByTestId("dienst-ergebnis")).toContainText("regelgerecht", { timeout: 20000 });
  await expect(d.getByTestId("dienst-art")).toHaveText("Frühdienst");
  await expect(d.getByTestId("dienst-regel")).toContainText("Sechstelregel (FPersV § 1 Abs. 3 Nr. 2)");
  console.log("D1:", await d.getByTestId("dienst-zeit").textContent(), "Lenkzeit", await d.getByTestId("dienst-lenkzeit").textContent(), "Arbeitszeit", await d.getByTestId("dienst-arbeitszeit").textContent());
  await page.screenshot({ path: info.outputPath("dienst-d1.png") });
  await d.getByTestId("dienst-speichern").click();
  await expect(d.getByTestId("dienst-meldung")).toHaveText("Dienst 1 gespeichert.");

  // D2: Rest des Umlaufs in neuen Dienst (ab 12:40), Spätdienst
  await d.getByTestId("dienst-rest").click();
  await expect(d.getByTestId("dienst-stuecke")).toContainText("Umlauf 1: 22 Fahrten, 12:40 ab Harksheide, Wilhelm-Busch-Platz");
  await expect(d.getByTestId("dienst-nummer")).toHaveValue("2");
  await expect(d.getByTestId("dienst-ergebnis")).toContainText("regelgerecht", { timeout: 20000 });
  await expect(d.getByTestId("dienst-art")).toHaveText("Spätdienst");
  // Regression Prüfung 3c-1, Befund 1: Auch im ersetzten Editor wählt ein Klick auf eine Fahrt der Zeitleiste sie aus
  await plan.getByTestId(`balken-${linieId}-1-3`).click({ force: true });
  await expect(d.getByTestId("dienst-umlauf")).toHaveValue("1");
  await expect(d.getByTestId("dienst-von")).toHaveValue("3");
  await d.getByTestId("dienst-umlauf").selectOption("0");
  console.log("D2:", await d.getByTestId("dienst-zeit").textContent(), "Lenkzeit", await d.getByTestId("dienst-lenkzeit").textContent(), "Arbeitszeit", await d.getByTestId("dienst-arbeitszeit").textContent());
  await d.getByTestId("dienst-speichern").click();
  await expect(d.getByTestId("dienst-meldung")).toHaveText("Dienst 2 gespeichert.");
  await d.getByTestId("fenster-schliessen").click();
  await expect(plan.getByTestId("dienste-frei")).toContainText("42 von 84", { timeout: 20000 });

  // D3: ganzer Umlauf 2 in einem Dienst: Arbeitszeit über 10 h, nicht speicherbar, Begründung mit Regel, Wert, Grenze, Quelle
  await plan.getByTestId("dienst-neu").click();
  await d.getByTestId("dienst-umlauf").selectOption("1");
  await d.getByTestId("dienst-ganzer-umlauf").click();
  await expect(d.getByTestId("dienst-ergebnis")).toContainText("lässt sich nicht speichern", { timeout: 20000 });
  await expect(d.getByTestId("dienst-verstoesse")).toContainText(/Arbeitszeit \d+:\d\d(:\d\d)? h, erlaubt 10:00 h \(ArbZG § 3\)/);
  await d.getByTestId("dienst-speichern").click();
  await expect(d.getByTestId("dienst-meldung")).toContainText("Nicht gespeichert: Arbeitszeit");
  console.log("D3:", await d.getByTestId("dienst-verstoesse").textContent());
  await page.screenshot({ path: info.outputPath("dienst-d3.png") });
  // Regression Prüfung 3c-1, Befund 2: "Neuer Dienst" ersetzt einen Entwurf mit ungespeicherten Änderungen nicht stumm
  await plan.getByTestId("dienst-neu").click();
  await expect(d.getByTestId("dienst-meldung")).toContainText("Ungespeicherte Änderungen");
  await expect(d.getByTestId("dienst-stuecke")).toContainText("Umlauf 2: 42 Fahrten");
  // Schließen mit ungespeicherten Änderungen: erst Hinweis, beim zweiten Mal verworfen (Esc wie ✕)
  await d.getByTestId("dienst-nummer").fill("3");
  await d.getByTestId("dienst-nummer").press("Escape");
  await expect(d.getByTestId("dienst-meldung")).toContainText("Ungespeicherte Änderungen");
  await page.keyboard.press("Escape");
  await expect(d).toHaveCount(0);

  // Kriterium 12 nur mit der Tastatur: Neuer Dienst mit Enter, Tab bis "Ganzen Umlauf übernehmen", Enter. Die Auswahl in
  // nativen Listen bedient jedes System selbst (Pfeiltasten unter Windows, unter macOS öffnen sie die Liste); deshalb hier
  // der vorgewählte Umlauf 1.
  await plan.getByTestId("dienst-neu").focus();
  await page.keyboard.press("Enter");
  await expect(d).toBeVisible();
  await d.getByTestId("dienst-umlauf").focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  await expect(d.getByTestId("dienst-ganzer-umlauf")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(d.getByTestId("dienst-stuecke")).toContainText("Umlauf 1: 42 Fahrten");
  // Umlauf 1 ist schon mit D1 und D2 belegt: die Prüfung meldet es
  await expect(d.getByTestId("dienst-verstoesse")).toContainText("Eine Fahrt gehört schon zu Dienst", { timeout: 20000 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(d).toHaveCount(0);

  // Dienstliste, Zeitleiste mit freien Fahrten
  await expect(plan.getByTestId("dienste-tabelle").locator("tbody tr")).toHaveCount(2);
  await expect(plan.getByTestId("dienste-tabelle")).toContainText("Frühdienst");
  await expect(plan.getByTestId("dienste-tabelle")).toContainText("Spätdienst");
  await expect(plan.getByTestId(`zeitzeile-${linieId}-0-frei`)).toHaveText("alle Fahrten belegt");
  await expect(plan.getByTestId(`zeitzeile-${linieId}-1-frei`)).toContainText("frei: 42 Fahrten (06:00 bis 19:45:50)");
  await page.screenshot({ path: info.outputPath("dienstplan.png") });

  // Fahrplan zeigt den Dienst je Fahrt
  await page.getByTestId("menu-linien").click();
  const liste = page.getByTestId("fenster-linien");
  await liste.locator("[data-testid$='-fahrplan']").first().click();
  const fp2 = page.getByTestId("fenster-fahrplan");
  const ersteHin = fp2.locator("[data-testid$='-t21600-dienst']");
  await expect(ersteHin.first()).toHaveText(/^(1|frei)$/);
  await expect(fp2.locator("[data-testid$='-dienst']").filter({ hasText: /^1$/ })).toHaveCount(20);
  await expect(fp2.locator("[data-testid$='-dienst']").filter({ hasText: /^2$/ })).toHaveCount(22);
  await expect(fp2.locator("[data-testid$='-dienst']").filter({ hasText: /^frei$/ })).toHaveCount(42);

  // Speichern und Weiterspielen: Dienste bleiben
  await page.evaluate(() => (window as unknown as { __spieltest: { speichern(): Promise<boolean> } }).__spieltest.speichern());
  await page.reload();
  await page.getByTestId("setup-weiter").click();
  await expect(page.locator("#kopfleiste")).toBeVisible({ timeout: 30000 });
  await page.getByTestId("menu-dienste").click();
  const plan2 = page.getByTestId("fenster-dienste");
  await plan2.getByTestId("dienste-tag").selectOption("werktag");
  await expect(plan2.getByTestId("dienste-tabelle").locator("tbody tr")).toHaveCount(2);
  await expect(plan2.getByTestId("dienste-frei")).toContainText("42 von 84", { timeout: 20000 });
  expect(fehler).toEqual([]);
});
