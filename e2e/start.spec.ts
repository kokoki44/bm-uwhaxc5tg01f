import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

// Oberflächentests der Web-Version. Derselbe Test prüft nach der Veröffentlichung die Pages-Adresse (E2E_BASE_URL).

async function neuesSpielMitTastatur(page: Page) {
  await page.goto("./");
  await expect(page).toHaveTitle("Bus-Manager");
  const setup = page.getByTestId("setup");
  await expect(setup).toBeVisible();
  // Nur Tastatur: der Fokus steht im Firmennamen, Enter schickt das Formular ab
  await expect(page.locator("#s-name")).toBeFocused();
  await page.keyboard.type("Nordbus Test");
  await page.keyboard.press("Enter");
  await expect(page.locator("#kopfleiste")).toBeVisible({ timeout: 30000 });
  // Beim Start: Fenster mit den Katalogfehlern (der Katalog enthält zwei Zeilen ohne Länge) und die Standortliste
  await expect(page.getByTestId("fenster-katalog")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("fenster-standorte")).toBeVisible();
}

/** Schließt die beiden Startfenster mit Esc (zuletzt geöffnetes zuerst). */
async function startfensterSchliessen(page: Page) {
  await page.getByTestId("fenster-standorte").focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("fenster-standorte")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("fenster-katalog")).toHaveCount(0);
}

test("Einrichtung prüft Eingaben und zeigt Fehler als Text", async ({ page }) => {
  await page.goto("./");
  await page.locator("#s-kapital").fill("0");
  await page.getByTestId("setup-starten").click();
  await expect(page.locator("#f-kapital")).toBeVisible();
  await expect(page.locator("#f-kapital")).toContainText("Startkapital");
  await expect(page.locator("#f-name")).toContainText("Firmennamen");
  // Esc schließt den Pflichtdialog nicht
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("setup")).toBeVisible();
});

test("Web-Version startet: Norderstedt laden, Karte, Zeit, Tasten, Fenster", async ({ page }, info) => {
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await neuesSpielMitTastatur(page);
  await startfensterSchliessen(page);
  // Der Testzugang zum Vorspulen gibt es nur mit "?test" in der Adresse
  expect(await page.evaluate(() => "__spieltest" in window)).toBe(false);

  // Testansicht (Statuszeile): standardmäßig aus, F3 schaltet sie ein
  const status = page.getByTestId("status");
  await expect(status).toBeHidden();
  await page.keyboard.press("F3");
  await expect(status).toBeVisible();
  await expect(status).toContainText("IndexedDB (Browser)");
  await expect(status).toContainText(/Testdatensatz Norderstedt: \d+ Elemente/);
  await expect(status).toContainText(/Norderstedt: \d+ Haltestellen, \d+ Straßenabschnitte, \d+ Ampeln/);
  await expect(status).toContainText("Simulation:");
  const ticks = async () => Number(/(\d+) Takte/.exec(await status.innerText())![1]);
  const a = await ticks();
  await expect.poll(ticks).toBeGreaterThan(a);

  // Regression: MapLibre-Worker fehlte im Bundle, die Karte blieb leer. Die Karte muss Straßen zeichnen.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const m = (document.getElementById("map") as unknown as { __karte: { queryRenderedFeatures(o: { layers: string[] }): unknown[] } }).__karte;
        return m.queryRenderedFeatures({ layers: ["strassen-haupt", "strassen-rand", "grenze"] }).length;
      }),
    )
    .toBeGreaterThan(100);

  // Kopfleiste
  await expect(page.getByTestId("kontostand")).toHaveText(/2\.000\.000,00\s€/);
  await expect(page.getByTestId("uhrzeit")).toHaveText(/^(Mo|Di|Mi|Do|Fr|Sa|So) \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
  await expect(page.getByTestId("tempo-1")).toHaveAttribute("aria-pressed", "true");

  // Tasten: Leertaste pausiert, nochmal weiter, 1 bis 5 wählen 1-, 10-, 60-, 240- und 600-fach
  await page.locator("#map canvas").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(" ");
  await expect(page.getByTestId("tempo-0")).toHaveAttribute("aria-pressed", "true");
  const stand = await ticks();
  await page.waitForTimeout(500);
  expect(await ticks()).toBe(stand);
  await page.keyboard.press(" ");
  await expect(page.getByTestId("tempo-1")).toHaveAttribute("aria-pressed", "true");
  for (const [taste, tempo] of [["2", 10], ["3", 60], ["4", 240], ["5", 600]] as const) {
    await page.keyboard.press(taste);
    await expect(page.getByTestId(`tempo-${tempo}`)).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText(`Geschwindigkeit ${tempo}-fach`);
  }
  await page.keyboard.press("F3");
  await expect(status).toBeHidden();

  // Karte: Zoomen mit dem Mausrad, Verschieben mit gedrückter Maustaste
  const karte = page.locator("#map");
  await expect(karte).toHaveAttribute("data-zoom", /\d/);
  const zoom0 = Number(await karte.getAttribute("data-zoom"));
  const box = (await karte.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -600);
  await expect.poll(async () => Number(await karte.getAttribute("data-zoom"))).toBeGreaterThan(zoom0);
  const mitte0 = await karte.getAttribute("data-mitte");
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 80, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => karte.getAttribute("data-mitte")).not.toBe(mitte0);

  // Hilfe-Fenster per Tastatur öffnen und mit Esc schließen
  await page.getByTestId("hilfe").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("fenster-hilfe")).toBeVisible();
  await expect(page.getByTestId("fenster-hilfe")).toContainText("Leertaste");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("fenster-hilfe")).toHaveCount(0);

  await page.screenshot({ path: info.outputPath("karte.png") });
  expect(fehler).toEqual([]);
});

test("Simulations-Worker schafft 600-fach ohne Stocken", async ({ page }, info) => {
  await neuesSpielMitTastatur(page);
  await startfensterSchliessen(page);
  await page.locator("#map canvas").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("5");
  await expect(page.getByTestId("tempo-600")).toHaveAttribute("aria-pressed", "true");
  // Regression (macOS, 25.11.2026): Der Knopf zeigt 600-fach, bevor der Worker umgestellt hat. Erst messen, wenn der
  // Worker selbst 600-fach meldet, sonst zählen einzelne Takte mit 1-fach mit (102 Takte, aber nur 6000,2 s).
  await expect(page.getByTestId("status")).toContainText("Geschwindigkeit 600-fach", { timeout: 10000 });
  // Statusmeldungen des Workers mitschreiben: Takt und Spielzeit je Meldung mit Zeitstempel
  const messung = await page.evaluate(async () => {
    const status = document.getElementById("status")!;
    const proben: { t: number; takte: number; spiel: number }[] = [];
    const lese = () => {
      const m = /(\d+) Takte, Spielzeit ([\d.]+) s/.exec(status.textContent ?? "");
      if (m) proben.push({ t: performance.now(), takte: Number(m[1]), spiel: Number(m[2]) });
    };
    const beobachter = new MutationObserver(lese);
    beobachter.observe(status, { childList: true, characterData: true, subtree: true });
    lese();
    await new Promise((r) => setTimeout(r, 10000));
    beobachter.disconnect();
    const a = proben[0], z = proben[proben.length - 1];
    let maxLuecke = 0;
    for (let i = 1; i < proben.length; i++) maxLuecke = Math.max(maxLuecke, proben[i].t - proben[i - 1].t);
    return { dauerMs: z.t - a.t, takte: z.takte - a.takte, spielS: z.spiel - a.spiel, meldungen: proben.length, maxLueckeMs: maxLuecke };
  });
  const sollTakte = messung.dauerMs / 100;
  info.annotations.push({ type: "messung-600-fach", description: JSON.stringify(messung) });
  console.log("Messung 600-fach:", JSON.stringify(messung));
  // Fester Takt: mindestens 95 Prozent der Solltakte, Spielzeit = 600 mal Echtzeit, keine Lücke über 1 s
  expect(messung.takte).toBeGreaterThanOrEqual(sollTakte * 0.95);
  expect(messung.spielS).toBeCloseTo(messung.takte * 60, 0);
  expect(messung.spielS / (messung.dauerMs / 1000)).toBeGreaterThan(600 * 0.95);
  expect(messung.maxLueckeMs).toBeLessThan(1000);
});

/** Kleiner Auszug im Overpass-Format: Gemeindegrenze, eine Straße, eine Haltestelle. */
function kleineDatei(): string {
  const p = (x: number, y: number) => ({ lat: 54 + y * 0.001, lon: 10 + x * 0.001 });
  return JSON.stringify({
    elements: [
      { type: "node", id: 3, lat: 54.0001, lon: 10.001, tags: { highway: "bus_stop", name: "Dorfplatz" } },
      { type: "way", id: 10, nodes: [1, 2], geometry: [p(0, 0), p(2, 0)], tags: { highway: "residential" } },
      {
        type: "relation", id: 20,
        members: [
          { type: "way", ref: 11, role: "outer", geometry: [p(-1, -1), p(3, -1), p(3, 1)] },
          { type: "way", ref: 12, role: "outer", geometry: [p(3, 1), p(-1, 1), p(-1, -1)] },
        ],
        tags: { type: "boundary", boundary: "administrative", admin_level: "8", name: "Testdorf" },
      },
    ],
  });
}

test("Eigene Datei im selben Format laden, falsche Datei mit Meldung ablehnen", async ({ page }) => {
  await page.goto("./");
  await page.locator("#g-datei").check();
  await page.locator("#g-dateiwahl").setInputFiles({ name: "falsch.json", mimeType: "application/json", buffer: Buffer.from("kein json") });
  await page.locator("#s-name").fill("Dorfbus");
  await page.getByTestId("setup-starten").click();
  await expect(page.getByTestId("laden")).toContainText("nicht das erwartete Format");
  await page.getByRole("button", { name: "Zurück zur Einrichtung" }).click();

  await page.locator("#g-datei").check();
  await page.locator("#g-dateiwahl").setInputFiles({ name: "testdorf.json", mimeType: "application/json", buffer: Buffer.from(kleineDatei()) });
  await page.locator("#s-name").fill("Dorfbus");
  await page.getByTestId("setup-starten").click();
  await expect(page.locator("#kopfleiste")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("status")).toContainText("Datei testdorf.json");
  await expect(page.getByTestId("status")).toContainText("Testdorf: 1 Haltestellen");
});

test("Haltestelle anklicken zeigt ihren Namen", async ({ page }) => {
  await neuesSpielMitTastatur(page);
  await startfensterSchliessen(page);
  const karte = page.locator("#map");
  // Feste Haltestelle aus dem Datensatz im Projekt (deterministisch, unabhängig von Fenstergröße und Zoom)
  const daten = JSON.parse(gunzipSync(readFileSync("public/data/norderstedt/norderstedt.osm.json.gz")).toString("utf8")) as {
    elements: { type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string> }[];
  };
  const halt = daten.elements
    .filter((e) => e.type === "node" && e.tags?.highway === "bus_stop" && e.tags.name)
    .sort((a, b) => a.id - b.id)[0];
  const koordinate: [number, number] = [halt.lon!, halt.lat!];
  const ziel = await page.evaluate(async (c) => {
    type Karte = {
      jumpTo(o: { center: [number, number]; zoom: number }): void;
      once(ev: string, f: () => void): void;
      queryRenderedFeatures(o: { layers: string[] }): { properties: { name: string; id: number } }[];
      project(c: [number, number]): { x: number; y: number };
    };
    const m = (document.getElementById("map") as unknown as { __karte: Karte }).__karte;
    await new Promise<void>((r) => {
      m.once("idle", () => r());
      m.jumpTo({ center: c, zoom: 17 });
    });
    const p = m.project(c);
    return { x: p.x, y: p.y, sichtbar: m.queryRenderedFeatures({ layers: ["haltestellen"] }).length };
  }, koordinate);
  expect(ziel.sichtbar, "Haltestellensymbole sichtbar").toBeGreaterThan(0);
  const box = (await karte.boundingBox())!;
  await page.mouse.click(box.x + ziel!.x, box.y + ziel!.y);
  const fenster = page.getByTestId("fenster-haltestelle");
  await expect(fenster).toBeVisible();
  await expect(fenster).toContainText(halt.tags!.name);
  await page.keyboard.press("Escape");
  await expect(fenster).toHaveCount(0);
});
