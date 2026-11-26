import { expect, test } from "@playwright/test";
import { spielMitHofUndBus, sucheHalt, taktZeile } from "./hilfen";

// Oberflächentest Etappe 3b: Linie als Perlenkette, Richtungen, Kurzläufer, Takt, Fahrplan, Bus zuweisen, Bedarf,
// neue Haltestelle und Wegpunkt per Tastatur (Kartenmitte), Busse in der Linienfarbe, Autosave und Weiterspielen.

test("Linie anlegen, Takt setzen, Fahrplan erzeugen, Bus zuweisen, Weiterspielen nach dem Neuladen", async ({ page }, info) => {
  test.setTimeout(240000);
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await spielMitHofUndBus(page);

  // Menüpunkt "Linien" per Tastatur
  await expect(page.locator("#menueleiste").getByRole("button")).toHaveCount(6);
  await page.getByTestId("menu-linien").focus();
  await page.keyboard.press("Enter");
  const liste = page.getByTestId("fenster-linien");
  await expect(liste).toBeVisible();
  await expect(liste.getByTestId("linien-heute")).toContainText("gilt der Fahrplan für");

  // Neue Linie: doppelte Nummer wird abgelehnt
  await liste.getByTestId("neu-nummer").fill("1");
  await liste.getByTestId("neu-name").fill("Harksheide nach Glashütte");
  await liste.getByTestId("linie-anlegen").click();
  const ed = page.getByTestId("fenster-linie");
  await expect(ed).toBeVisible();

  // Grundlinie über die Suche: drei vorhandene Haltestellen an der Segeberger Chaussee; die Suche zeigt die nächste
  // Haltestelle in Fahrtrichtung (Nachtrag 3b), damit gleichnamige Haltestellen beider Straßenseiten unterscheidbar sind
  await ed.getByTestId("linie-suche").fill("Wilhelm-Busch");
  await expect(ed.getByTestId("linie-treffer-o333727165")).toContainText("Segeberger Chaussee, weiter Richtung Harksheide, Kielort");
  await expect(ed.getByTestId("linie-treffer-o334310462")).toContainText("Segeberger Chaussee, weiter Richtung Harksheide, Heidehofweg (West)");
  await ed.getByTestId("linie-treffer-o333727165").click();
  await sucheHalt(ed, "linie", "Kielort", "o333727166");
  await sucheHalt(ed, "linie", "Glashütter Kirchenweg", "o333727173");
  await expect(ed.getByTestId("linie-perlen").locator("li")).toHaveCount(3);
  await ed.getByTestId("linie-richtungen").click();
  const varianten = ed.getByTestId("varianten-tabelle");
  await expect(varianten.locator("tbody tr")).toHaveCount(2);
  await expect(varianten).toContainText("Harksheide, Wilhelm-Busch-Platz nach Glashütte, Glashütter Kirchenweg");
  await expect(varianten.locator("tbody tr").first()).toContainText("✔ vollständig", { timeout: 20000 });
  await expect(varianten.locator("tbody tr").nth(1)).toContainText("✔ vollständig");
  // Fahrzeit Werktag der Hinrichtung (Handrechnung im Bericht: 6:30 min um 7 Uhr)
  await expect(varianten.locator("[data-testid$='-fahrzeit']").first()).toContainText("6:30 min");

  // Kurzläufer Wilhelm-Busch-Platz bis Kielort
  await ed.getByTestId("kurz-von").selectOption("0");
  await ed.getByTestId("kurz-bis").selectOption("1");
  await ed.getByTestId("kurz-anlegen").click();
  await expect(varianten.locator("tbody tr")).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("linieneditor.png") });

  // Der Editor hat die Liste ersetzt; über den Menüpunkt kommt sie wieder (oben). Nummer doppelt wird abgelehnt.
  await expect(liste).toHaveCount(0);
  await page.getByTestId("menu-linien").click();
  await liste.getByTestId("neu-nummer").fill("1");
  await liste.getByTestId("neu-name").fill("Doppelt");
  await liste.getByTestId("linie-anlegen").click();
  await expect(liste.getByTestId("linien-meldung")).toHaveText("Diese Liniennummer gibt es schon.");
  await liste.getByTestId("fenster-schliessen").click();

  // Takt der Hinrichtung: Werktag 6 bis 20 Uhr alle 20 Minuten
  await varianten.locator("[data-testid$='-bearbeiten']").first().click();
  const v = page.getByTestId("fenster-variante");
  await expect(v).toBeVisible();
  await taktZeile(v, "werktag", "06:00", "20:00", "20");
  await expect(v.getByTestId("variante-meldung")).toContainText("Takt Werktag übernommen");
  // Fahrzeit an der Probe: 7 Uhr Werktag 6:30 min
  await expect(v.getByTestId("probe-gesamt")).toHaveText("6:30 min");
  // Ungültiger Takt wird gemeldet
  await v.getByTestId("takt-werktag-0-takt").fill("1");
  await v.getByTestId("takt-werktag-0-takt").press("Tab");
  await expect(v.getByTestId("variante-meldung")).toContainText("ganze Zahl von 2 bis 240");
  await v.getByTestId("takt-werktag-0-takt").fill("20");
  await v.getByTestId("takt-werktag-0-takt").press("Tab");
  await expect(v.getByTestId("variante-meldung")).toContainText("übernommen");
  // Ferien übernehmen den Werktag, solange kein eigener Ferientakt gesetzt ist
  await expect(v.getByTestId("takt-bereich")).toContainText("In den Schulferien gilt derselbe Fahrplan wie am Werktag");
  await page.screenshot({ path: info.outputPath("variante-takt.png") });
  await v.getByTestId("fenster-schliessen").click();

  // Rückrichtung: Takt per Vorlage, dann auf 6 bis 20 Uhr alle 20 min geändert
  await varianten.locator("[data-testid$='-bearbeiten']").nth(1).click();
  await taktZeile(page.getByTestId("fenster-variante"), "werktag", "06:00", "20:00", "20");
  await page.getByTestId("fenster-variante").getByTestId("fenster-schliessen").click();

  // Bus zuweisen; Bedarf Werktag 2 Busse (Handrechnung: Umlauf 23:10 min, Takt 20 min), es fehlt ein Bus
  await ed.getByTestId("bus-wahl").selectOption({ index: 1 });
  await ed.getByTestId("bus-zuweisen").click();
  await expect(ed.getByTestId("bus-meldung")).toContainText("Bus 1 fährt jetzt auf Linie 1");
  await expect(ed.getByTestId("bedarf-werktag-busse")).toHaveText("2", { timeout: 20000 });
  await expect(ed.getByTestId("bedarf-werktag")).toContainText("Es fehlt 1 Bus.");
  await expect(ed.getByTestId("bedarf-samstag-busse")).toHaveText("0");

  // Fahrplan: 84 Fahrten Werktag, streichen, verschieben, zusätzliche Fahrt auf dem Kurzläufer
  await ed.getByTestId("linie-fahrplan").click();
  const fp = page.getByTestId("fenster-fahrplan");
  await expect(fp.getByTestId("fahrplan-tabelle").locator("tbody tr")).toHaveCount(84);
  const hinId = (await varianten.locator("tbody tr").first().getAttribute("data-testid"))!.replace("variante-", "");
  const kurzId = (await varianten.locator("tbody tr").nth(2).getAttribute("data-testid"))!.replace("variante-", "");
  await fp.getByTestId(`fahrt-${hinId}-t${6 * 3600 + 20 * 60}-streichen`).click();
  await expect(fp.getByTestId(`fahrt-${hinId}-t${6 * 3600 + 20 * 60}-status`)).toHaveText("gestrichen");
  await fp.getByTestId(`fahrt-${hinId}-t${7 * 3600}-zeit`).fill("07:05");
  await fp.getByTestId(`fahrt-${hinId}-t${7 * 3600}-verschieben`).click();
  await expect(fp.getByTestId(`fahrt-${hinId}-t${7 * 3600}-status`)).toHaveText("verschoben (Takt 07:00)");
  await fp.getByTestId("neu-fahrt-variante").selectOption(kurzId);
  await fp.getByTestId("neu-fahrt-zeit").fill("07:35");
  await fp.getByTestId("neu-fahrt").click();
  await expect(fp.getByTestId("fahrplan-meldung")).toContainText("Zusätzliche Fahrt 07:35");
  await expect(fp.getByTestId("fahrplan-tabelle").locator("tbody tr")).toHaveCount(85);
  await expect(fp.getByTestId("fahrplan-tabelle")).toContainText("zusätzlich");
  // Umläufe mit Ausrückzeit vom Betriebshof
  await expect(fp.getByTestId("umlauf-0-ausruecken")).toContainText("ab Betriebshof");
  // Fahrt aufklappen: Zeiten je Haltestelle auf 10 s
  await fp.getByTestId(`fahrt-${hinId}-t${6 * 3600}`).click();
  await expect(fp.getByTestId("fahrt-detail")).toContainText("06:01:30");
  await page.screenshot({ path: info.outputPath("fahrplan.png") });
  await fp.getByTestId("fenster-schliessen").click();

  // Neue Haltestelle und Wegpunkt ohne Maus: Karte auf die Segeberger Chaussee, Werkzeug wählen, Kartenmitte
  const kirchenweg = await page.evaluate(() => {
    type Karte = { jumpTo(o: { center: [number, number]; zoom: number }): void };
    const m = (document.getElementById("map") as unknown as { __karte: Karte }).__karte;
    m.jumpTo({ center: [10.0421, 53.6912], zoom: 17 });
    return true;
  });
  expect(kirchenweg).toBe(true);
  await ed.getByTestId("linie-werkzeug-neu").check();
  await ed.getByTestId("linie-neu-name").fill("Kirchenweg Nord");
  await ed.getByTestId("linie-kartenmitte").click();
  await expect(ed.getByTestId("linie-meldung")).toContainText("Haltestelle Kirchenweg Nord angelegt");
  await expect(ed.getByTestId("linie-perlen").locator("li").filter({ hasText: "Kirchenweg Nord" })).toHaveCount(1);
  await ed.getByTestId("linie-werkzeug-weg").check();
  await ed.getByTestId("linie-kartenmitte").click();
  await expect(ed.getByTestId("linie-meldung")).toHaveText("Wegpunkt gesetzt.");
  // beide wieder entfernen (Wegpunkt ist die letzte Perle, dann die neue Haltestelle)
  await ed.getByTestId("linie-perle-4-entfernen").click();
  await ed.getByTestId("linie-perle-3-entfernen").click();
  await expect(ed.getByTestId("linie-perlen").locator("li")).toHaveCount(3);
  await ed.getByTestId("linie-werkzeug-aus").check();
  await ed.getByTestId("fenster-schliessen").click();
  // Linie in ihrer Farbe auf der Karte (Ebene "linien"), Kartenausschnitt über der ganzen Strecke
  const gezeichnet = await page.evaluate(async () => {
    type Karte = { jumpTo(o: { center: [number, number]; zoom: number }): void; once(ev: string, f: () => void): void; queryRenderedFeatures(o: { layers: string[] }): { properties: { farbe: string; nummer: string } }[] };
    const m = (document.getElementById("map") as unknown as { __karte: Karte }).__karte;
    await new Promise<void>((r) => {
      m.once("idle", () => r());
      m.jumpTo({ center: [10.027, 53.687], zoom: 14.5 });
    });
    return { linien: m.queryRenderedFeatures({ layers: ["linien"] }).map((f) => `${f.properties.nummer} ${f.properties.farbe}`), auswahl: m.queryRenderedFeatures({ layers: ["auswahl-halt", "auswahl-route"] }).length };
  });
  expect(gezeichnet.linien.length).toBeGreaterThan(0);
  expect(new Set(gezeichnet.linien)).toEqual(new Set(["1 #e30613"]));
  // Regression: Nach dem Schließen des Editors bleibt keine Hervorhebung der Perlen stehen
  expect(gezeichnet.auswahl).toBe(0);
  await page.screenshot({ path: info.outputPath("karte-linie.png") });

  // Linienliste: Bedarf und Hinweis
  await page.getByTestId("menu-linien").click();
  await expect(liste.getByTestId("linien-tabelle")).toContainText("Harksheide nach Glashütte");
  // Nach den Änderungen 3 Busse: Der zusätzliche Kurzläufer 7:35 endet am Kielort, für die Hinfahrt 7:40 braucht es einen weiteren Bus
  await expect(liste.locator("[data-testid$='-bedarf']").first()).toHaveText("3");
  await expect(liste.getByTestId("linien-fuhrpark-warnung")).toContainText("Es fehlen 2 Busse");

  // Betriebshof-Editor: der Bus steht in der Linienfarbe mit Liniennummer
  await liste.getByTestId("fenster-schliessen").click();
  await page.getByTestId("menu-betriebshof").click();
  await expect(page.getByTestId("bus-im-hof")).toHaveCount(1);
  await expect(page.getByTestId("bus-im-hof").locator("rect")).toHaveAttribute("fill", "#e30613");
  await expect(page.getByTestId("bus-im-hof")).toContainText("1 (1)");
  await page.screenshot({ path: info.outputPath("editor-linienfarbe.png") });
  await page.getByTestId("editor-schliessen").click();

  // Autosave, Neuladen, Weiterspielen: Linie, Takt und Fahrtänderungen sind wieder da
  await page.evaluate(() => (window as unknown as { __spieltest: { speichern(): Promise<boolean> } }).__spieltest.speichern());
  await page.reload();
  await expect(page.getByTestId("setup-stand")).toContainText("Linien Test in Norderstedt");
  // Regression A3b-23: Ein neues Spiel überschreibt den gespeicherten Stand erst nach Rückfrage, Vorgabe ist Abbrechen
  await page.locator("#s-name").fill("Neues Spiel");
  await page.locator("#s-name").press("Enter");
  const rueckfrage = page.getByTestId("ueberschreiben");
  await expect(rueckfrage).toBeVisible();
  await expect(rueckfrage).toContainText("Gespeicherten Stand wirklich überschreiben?");
  await expect(rueckfrage.getByTestId("ueberschreiben-abbrechen")).toBeFocused();
  await page.screenshot({ path: info.outputPath("rueckfrage-ueberschreiben.png") });
  await page.keyboard.press("Enter");
  await expect(rueckfrage).toHaveCount(0);
  await expect(page.getByTestId("setup")).toBeVisible();
  // Esc bricht ebenfalls ab
  await page.locator("#s-name").press("Enter");
  await expect(rueckfrage).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(rueckfrage).toHaveCount(0);
  await expect(page.getByTestId("setup-stand")).toContainText("Linien Test in Norderstedt");
  await page.getByTestId("setup-weiter").click();
  await expect(page.locator("#kopfleiste")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("fenster-standorte")).toHaveCount(0);
  await page.getByTestId("menu-linien").click();
  const liste2 = page.getByTestId("fenster-linien");
  await expect(liste2.locator("[data-testid$='-bedarf']").first()).toHaveText("3", { timeout: 20000 });
  await liste2.locator("[data-testid$='-fahrplan']").first().click();
  const fp2 = page.getByTestId("fenster-fahrplan");
  await expect(fp2.getByTestId("fahrplan-tabelle").locator("tbody tr")).toHaveCount(85);
  await expect(fp2.getByTestId(`fahrt-${hinId}-t${6 * 3600 + 20 * 60}-status`)).toHaveText("gestrichen");
  await page.screenshot({ path: info.outputPath("nach-neuladen.png") });
  await fp2.getByTestId("fenster-schliessen").click();
  await liste2.getByTestId("fenster-schliessen").click();

  // Lücke in einer Variante: Ein Wegpunkt, dessen Netzanschluss nicht zur Karte passt, fällt beim Laden weg (A3b-31).
  // Die Rückrichtung erzeugt dann keine Fahrten; Linienliste und Linienkopf zeigen das deutlich, die Hinrichtung fährt.
  await page.evaluate(() => (window as unknown as { __spieltest: { speichern(): Promise<boolean> } }).__spieltest.speichern());
  await page.reload();
  await expect(page.getByTestId("setup-stand")).toBeVisible();
  // Im Einrichtungsdialog läuft kein Spiel, das automatisch speichern könnte
  const rueckName = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open("busmanager", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("spielstaende", "readwrite");
          const s = tx.objectStore("spielstaende");
          const g = s.get("autosave");
          g.onsuccess = () => {
            const rec = g.result;
            const v = rec.payload.netz.linien[0].varianten[1];
            const p = v.perlen[0].art === "halt" ? [10.03, 53.69] : v.perlen[0].coord;
            v.perlen.splice(1, 0, { art: "weg", coord: p, snaps: [{ edge: 0, t: 0.5, dist: 0, point: p }] });
            s.put(rec, "autosave");
            tx.oncomplete = () => resolve(v.name);
          };
        };
      }),
  );
  await page.reload();
  await page.getByTestId("setup-weiter").click();
  await expect(page.locator("#kopfleiste")).toBeVisible({ timeout: 30000 });
  // Das Fenster mit den Katalogfehlern vom Start schließen, damit rechts nichts die Linie verdeckt
  await page.getByTestId("fenster-katalog").getByTestId("fenster-schliessen").click();
  await page.getByTestId("menu-linien").click();
  const liste3 = page.getByTestId("fenster-linien");
  await expect(liste3.locator("[data-testid$='-hinweis']").first()).toContainText(`Keine Fahrten auf ${rueckName}: Die Route hat eine Lücke.`, { timeout: 20000 });
  // Karte weit weg schieben; beim Öffnen der Linie zoomt die Karte auf die Linie, neben dem Fenster sichtbar
  await page.evaluate(() => {
    const m = (document.getElementById("map") as unknown as { __karte: { jumpTo(o: { center: [number, number]; zoom: number }): void } }).__karte;
    m.jumpTo({ center: [9.96, 53.74], zoom: 17 });
  });
  await liste3.locator("[data-testid$='-bearbeiten']").first().click();
  const ed3 = page.getByTestId("fenster-linie");
  await expect(ed3.getByTestId("linie-luecke-hinweis")).toBeVisible();
  await expect(ed3.getByTestId("linie-luecke-hinweis")).toContainText(`Keine Fahrten auf ${rueckName}`);
  await expect(ed3.getByTestId("varianten-tabelle").locator("tbody tr").nth(1)).toContainText("Lücke, keine Fahrten");
  await expect(ed3.getByTestId("varianten-tabelle").locator("tbody tr").first()).toContainText("✔ vollständig");
  const sichtbar = await page.evaluate(() => (window as unknown as { __spieltest: { linieSichtbar(id: number): number } }).__spieltest.linieSichtbar(1));
  // Warten, bis die Karte im neuen Ausschnitt fertig gezeichnet ist
  await page.evaluate(() => {
    const m = (document.getElementById("map") as unknown as { __karte: { once(ev: string, f: () => void): void; triggerRepaint(): void } }).__karte;
    return new Promise<void>((r) => {
      m.once("idle", () => r());
      m.triggerRepaint();
      setTimeout(r, 5000);
    });
  });
  await page.screenshot({ path: info.outputPath("linie-luecke-zoom.png") });
  expect(sichtbar).toBeGreaterThanOrEqual(0.95);
  expect(fehler).toEqual([]);
});
