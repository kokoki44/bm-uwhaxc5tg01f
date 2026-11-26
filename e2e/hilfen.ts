import { expect, type Locator, type Page } from "@playwright/test";

/** Neues Spiel mit Betriebshof (Tor, Fahrweg, Stellplätze, Werkstatt, Büro) und einem gekauften Elektrobus. */
export async function spielMitHofUndBus(page: Page, firma = "Linien Test") {
  await page.goto("./?test");
  await expect(page.locator("#s-name")).toBeFocused();
  await page.keyboard.type(firma);
  await page.keyboard.press("Enter");
  await expect(page.locator("#kopfleiste")).toBeVisible({ timeout: 30000 });
  const kat = page.getByTestId("fenster-katalog");
  await expect(kat).toBeVisible({ timeout: 30000 });
  await kat.getByTestId("fenster-schliessen").click();
  await page.getByTestId("fenster-standorte").locator("tbody button").first().click();
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
  await page.getByTestId("menu-fahrzeugmarkt").click();
  const markt = page.getByTestId("fenster-fahrzeugmarkt");
  await markt.getByTestId("markt-filter-hersteller").selectOption("MAN");
  await markt.getByTestId("markt-filter-antrieb").selectOption("Elektro");
  await markt.getByTestId("markt-modell").filter({ hasText: /^MAN Lion's City E 12$/ }).click();
  await markt.getByTestId("markt-kaufen").click();
  await expect(markt.getByTestId("markt-meldung")).toContainText("Gekauft: Bus 1");
  await markt.getByTestId("fenster-schliessen").click();
}

/** Haltestelle über die Suche einfügen (Tastaturweg). */
export async function sucheHalt(fenster: Locator, prefix: string, text: string, id: string) {
  await fenster.getByTestId(`${prefix}-suche`).fill(text);
  await fenster.getByTestId(`${prefix}-treffer-${id}`).click();
}

export async function taktZeile(v: Locator, tag: string, von: string, bis: string, takt: string) {
  await v.getByTestId(`takt-${tag}-zeile`).click();
  const n = (await v.locator(`[data-testid^='takt-${tag}-'][data-testid$='-von']`).count()) - 1;
  await v.getByTestId(`takt-${tag}-${n}-von`).fill(von);
  await v.getByTestId(`takt-${tag}-${n}-von`).press("Tab");
  await v.getByTestId(`takt-${tag}-${n}-bis`).fill(bis);
  await v.getByTestId(`takt-${tag}-${n}-bis`).press("Tab");
  await v.getByTestId(`takt-${tag}-${n}-takt`).fill(takt);
  await v.getByTestId(`takt-${tag}-${n}-takt`).press("Tab");
}

/** Beispiellinie 1 (Bericht 3b): Wilhelm-Busch-Platz, Kielort, Kirchenweg; Hin und Rück Werktag 6 bis 20 Uhr alle 20 min, Bus 1 zugewiesen. */
export async function beispiellinie(page: Page) {
  await page.getByTestId("menu-linien").click();
  const liste = page.getByTestId("fenster-linien");
  await liste.getByTestId("neu-nummer").fill("1");
  await liste.getByTestId("neu-name").fill("Harksheide nach Glashütte");
  await liste.getByTestId("linie-anlegen").click();
  const ed = page.getByTestId("fenster-linie");
  await sucheHalt(ed, "linie", "Wilhelm-Busch", "o333727165");
  await sucheHalt(ed, "linie", "Kielort", "o333727166");
  await sucheHalt(ed, "linie", "Glashütter Kirchenweg", "o333727173");
  await ed.getByTestId("linie-richtungen").click();
  const varianten = ed.getByTestId("varianten-tabelle");
  await expect(varianten.locator("tbody tr").nth(1)).toContainText("✔ vollständig", { timeout: 20000 });
  for (const i of [0, 1]) {
    await varianten.locator("[data-testid$='-bearbeiten']").nth(i).click();
    await taktZeile(page.getByTestId("fenster-variante"), "werktag", "06:00", "20:00", "20");
    await page.getByTestId("fenster-variante").getByTestId("fenster-schliessen").click();
  }
  await ed.getByTestId("bus-wahl").selectOption({ index: 1 });
  await ed.getByTestId("bus-zuweisen").click();
  await expect(ed.getByTestId("bedarf-werktag-busse")).toHaveText("2", { timeout: 20000 });
  return ed;
}
