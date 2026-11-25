import katalogUrl from "../fahrzeugkatalog.xlsx?url";
import optionenUrl from "../optionen.xlsx?url";
import { jetztCivil, parts } from "./calendar/civil";
import type { KatalogErgebnis } from "./catalog/katalog";
import type { OptionenErgebnis } from "./catalog/optionen";
import { belegung, busMass, kreisVon, marktOptionen } from "./fleet/fuhrpark";
import { fortschreiben, starteMarkt, type SpielKontext } from "./game/spiel";
import { oeffneFahrzeuge } from "./ui/fahrzeuge";
import { oeffneFahrzeugmarkt } from "./ui/fahrzeugmarkt";
import { baueMenueleiste } from "./ui/menue";
import { oeffnePersonal } from "./ui/personal";
import { aktualisiereFenster, type SpielUi } from "./ui/spielui";
import { config } from "./config";
import { analysiereHof } from "./depot/analyse";
import { busMasseAusKatalog, type HofKontext } from "./depot/hof";
import { standorteSichtbar, zeigeGrundstueck, zeigeStandorte } from "./map/map";
import { oeffneEditor } from "./ui/editor";
import { katalogFehlerZeilen, katalogStatus, optionenStatus, zeigeKatalogFehler, zeigeOptionenFehler } from "./ui/katalogfenster";
import { oeffneStandortliste, standortKlick, type StandortKontext } from "./ui/standortwahl";
import { hofZuGeo, rechteckRing, torAnbindung } from "./world/standorte";
import { neuesSpiel, type SpielZustand } from "./game/setup";
import { t, type TextKey } from "./i18n";
import { createMap, zeigeWelt } from "./map/map";
import { startSimulation } from "./sim/client";
import { createStore } from "./storage";
import { h } from "./ui/dom";
import { baueKopfleiste } from "./ui/header";
import { aktionFuer, Zeitsteuerung } from "./ui/keys";
import { zeigeLaden, zeigeSetup } from "./ui/setup";
import { oeffneFenster, schliesseFenster } from "./ui/windows";
import type { WeltAntwort, WeltAuftrag } from "./world/worker";
import type { World } from "./world/world";

document.title = t("app.titel");
const status = document.getElementById("status")!;
const zeilen: Record<string, string> = { welt: "", daten: "", katalog: "", sim: "", speicher: "" };

// Fahrzeugkatalog direkt aus der xlsx-Datei lesen (in App und Web gleich), parallel zur Einrichtung
const katalogLaden: Promise<KatalogErgebnis> = fetch(katalogUrl)
  .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
  // ExcelJS ist groß, deshalb als eigenes Teilpaket nachgeladen
  .then(async (b) => (await import("./catalog/katalog")).ladeKatalog(b, config.catalog))
  .catch((e: unknown) => ({ modelle: [], meldungen: [{ schwere: "fehler" as const, code: "dateiUnlesbar" as const, wert: String(e) }], zeilenGesamt: 0 }));
// Optionsdatei (Ausstattung beim Neukauf), genauso direkt gelesen
const optionenLaden: Promise<OptionenErgebnis> = fetch(optionenUrl)
  .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then(async (b) => (await import("./catalog/optionen")).ladeOptionen(b, config.optionen))
  .catch((e: unknown) => ({ optionen: [], meldungen: [{ schwere: "fehler" as const, code: "dateiUnlesbar" as const, wert: String(e) }] }));
const zeigen = () => (status.innerText = Object.values(zeilen).filter(Boolean).join("\n"));

const map = createMap("map");

// Testansicht (Statuszeile) standardmäßig aus, F3 schaltet sie jederzeit um, auch im Einrichtungsdialog
document.addEventListener("keydown", (e) => {
  if (aktionFuer({ key: e.key })?.art !== "testansicht") return;
  e.preventDefault();
  status.hidden = !status.hidden;
});

createStore().then((store) => {
  zeilen.speicher = t("status.speicher", { art: t(store.kind === "sqlite" ? "status.speicher.desktop" : "status.speicher.browser") });
  zeigen();
});

/** Lädt die Welt im Worker; die Oberfläche bleibt dabei bedienbar. */
function ladeWelt(auftrag: WeltAuftrag, laden: ReturnType<typeof zeigeLaden>): Promise<{ world: World; antwort: Extract<WeltAntwort, { type: "fertig" }> } | null> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./world/worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WeltAntwort>) => {
      const m = e.data;
      if (m.type === "fortschritt") laden.setze(t(m.schritt), m.anteil);
      else {
        worker.terminate();
        if (m.type === "fertig") resolve({ world: m.world, antwort: m });
        else {
          laden.fehler(m.key === "fehler.laden" ? t("fehler.laden", { grund: m.grund }) : t(m.key), () => void starteEinrichtung());
          resolve(null);
        }
      }
    };
    worker.postMessage(auftrag, auftrag.quelle.art === "bytes" ? [auftrag.quelle.bytes] : []);
  });
}

function zeigeHilfe(): void {
  const li = (k: TextKey) => h("li", { text: t(k) });
  oeffneFenster(
    "hilfe",
    t("hilfe.titel"),
    h("div", {},
      h("h3", { text: t("hilfe.tasten") }),
      h("ul", {}, li("hilfe.taste.leertaste"), li("hilfe.taste.zahlen"), li("hilfe.taste.speichern"), li("hilfe.taste.esc"), li("hilfe.taste.f3")),
      h("h3", { text: t("hilfe.karte") }),
      h("p", { text: t("hilfe.karte.text") }),
      h("p", { text: t("hilfe.haltestelle") }),
      h("p", { text: t("hilfe.betriebshof") }),
      h("p", { text: t("hilfe.menue") }),
    ),
  );
}

let spiel: SpielZustand | null = null;

async function starteEinrichtung(): Promise<void> {
  const { werte, datei } = await zeigeSetup();
  const laden = zeigeLaden();
  const auftrag: WeltAuftrag = datei
    ? { type: "laden", quelle: { art: "bytes", bytes: datei } }
    : { type: "laden", quelle: { art: "url", url: new URL(import.meta.env.BASE_URL + config.data.norderstedtPath, location.href).href } };
  const ergebnis = await ladeWelt(auftrag, laden);
  if (!ergebnis) return;
  const { world, antwort } = ergebnis;
  laden.setze(t("laden.karte"), 0.98);
  zeigeWelt(map, antwort.render, world.bbox, (s) =>
    oeffneFenster("haltestelle", t("haltestelle.titel"), h("div", {}, h("p", { text: s.name || t("haltestelle.ohneName") }), h("p", { class: "klein", text: t("haltestelle.osm", { id: s.id }) }))),
  );
  laden.schliessen();

  spiel = neuesSpiel(werte, world, jetztCivil());
  zeilen.daten = werte.gemeinde.art === "norderstedt" ? t("status.daten", { anzahl: antwort.elemente }) : t("status.datenDatei", { datei: werte.gemeinde.dateiname, anzahl: antwort.elemente });
  zeilen.welt = t("status.welt", {
    gemeinde: world.gemeinde.name,
    haltestellen: world.stops.length,
    abschnitte: world.network.edges.length,
    ampeln: world.network.signalNodes,
    einwohner: world.gemeinde.einwohner.toLocaleString("de-DE"),
    arbeitsplaetze: world.gemeinde.arbeitsplaetze.toLocaleString("de-DE"),
  });
  zeigen();

  const katalog = await katalogLaden;
  const optionen = await optionenLaden;
  zeilen.katalog = [katalogStatus(katalog), ...katalogFehlerZeilen(katalog), ...optionenStatus(optionen)].join("\n");
  zeigen();
  const hofKontext: HofKontext = { cfg: config.betriebshof, busse: busMasseAusKatalog(katalog.modelle) };
  const sp = spiel;
  const modelle = new Map(katalog.modelle.map((m) => [m.modell_id!, m]));
  const spielKontext: SpielKontext = {
    markt: {
      modelle,
      optionen: marktOptionen(optionen.optionen),
      markt: config.fahrzeugmarkt,
      katalog: config.catalog,
      hofCfg: config.betriebshof,
      freigeschaltet: new Set(), // Technologiebaum folgt mit Etappe 7b
      frei: config.optionen.frei,
      kreis: kreisVon(world.gemeinde.kreisschluessel, config.fahrzeugmarkt),
    },
    hof: hofKontext,
    region: world.gemeinde.region,
  };
  starteMarkt(sp, spielKontext);

  const zeitsteuerung = new Zeitsteuerung(config.sim.speeds, config.sim.startSpeed);
  const kopf = baueKopfleiste(spiel.firma, world.gemeinde.region, world.bbox[1] < 0, {
    tempo: (stufe) => setzeTempo(stufe === 0 ? zeitsteuerung.pause() : zeitsteuerung.setzeStufe(stufe)),
    hilfe: zeigeHilfe,
  });
  const ui: SpielUi = {
    spiel: sp,
    k: spielKontext,
    kontoGeaendert: () => kopf.setzeKontostand(sp.kontostandEur),
    betriebshof: () => (sp.betriebshof ? hofEditor() : oeffneStandortliste(standortKontext)),
  };
  baueMenueleiste((b) => {
    if (b === "betriebshof") ui.betriebshof();
    else if (b === "fahrzeuge") oeffneFahrzeuge(ui);
    else if (b === "fahrzeugmarkt") oeffneFahrzeugmarkt(ui);
    else oeffnePersonal(ui);
  });

  // Standortwahl und Betriebshof
  const standortKontext: StandortKontext = {
    map,
    world,
    spiel: sp,
    kontoGeaendert: () => kopf.setzeKontostand(sp.kontostandEur),
    gekauft: () => hofEditor(),
  };
  const hofAufKarte = () => {
    const hof = sp.betriebshof;
    if (!hof) return;
    const f = hof.grundstueck.flaeche;
    const a = analysiereHof(hof, hofKontext);
    const linie = [...a.torSeite].map(([id, s]) => torAnbindung(hof, id, s, world.network, config.grundstueck)).find(Boolean);
    zeigeGrundstueck(map, rechteckRing(hofZuGeo(hof.grundstueck.ursprung, f.x, f.y), f.b, f.t), sp.firma.farbe, linie ? [linie.tor, linie.punkt] : null);
  };
  const hofEditor = () => {
    if (!hofKontext.busse.length) {
      oeffneFenster("hinweis", t("editor.titel"), h("p", { text: t("editor.ohneKatalog") }));
      return;
    }
    standorteSichtbar(map, false);
    oeffneEditor({
      spiel: sp,
      ctx: hofKontext,
      world,
      kontoGeaendert: () => kopf.setzeKontostand(sp.kontostandEur),
      geschlossen: () => (hofAufKarte(), map.resize()),
      belegung: () => belegung(sp.fuhrpark, modelle),
      busse: () => sp.fuhrpark.busse.map((b) => ({ platz: b.platz, ...busMass(modelle.get(b.modellId)!), farbe: b.konfig.lackierung, flottennummer: b.flottennummer })),
    });
  };
  zeigeStandorte(map, antwort.render.standorte, (id, p) => standortKlick(standortKontext, id, p));
  map.resize();
  kopf.setzeKontostand(spiel.kontostandEur);
  kopf.setzeZeit(spiel.startZeit);

  const startZeit = spiel.startZeit;
  let letzterTag = parts(startZeit).tag;
  const sim = startSimulation((s) => {
    zeilen.sim = t("status.simulation", { ticks: s.ticks, sekunden: s.gameSeconds.toFixed(1), tempo: s.speed });
    const jetzt = startZeit + Math.floor(s.gameSeconds) * 1000;
    kopf.setzeZeit(jetzt);
    // Ereignisse der Spielzeit (Wochenwechsel, Monatsende) genau einmal, auch bei 600-fach
    const ereignisse = fortschreiben(sp, jetzt, spielKontext);
    if (ereignisse.length) kopf.setzeKontostand(sp.kontostandEur);
    // neue Bewerber erscheinen tageweise: offene Fenster beim Tageswechsel und nach Ereignissen neu zeichnen
    const tag = parts(jetzt).tag;
    if (ereignisse.length || tag !== letzterTag) aktualisiereFenster();
    letzterTag = tag;
    zeigen();
  });
  // Nur für Oberflächentests: Spielzeit der Spielregeln vorspulen (Bewerber erscheinen erst nach Tagen)
  (window as unknown as { __spieltest: unknown }).__spieltest = {
    vorspulenTage: (tage: number) => {
      fortschreiben(sp, sp.zeit + tage * 86400000, spielKontext);
      kopf.setzeKontostand(sp.kontostandEur);
      aktualisiereFenster();
    },
  };
  const setzeTempo = (tempo: number) => {
    sim.setSpeed(tempo);
    kopf.setzeTempo(tempo);
  };
  setzeTempo(zeitsteuerung.tempo);

  // Beim Start: Katalogfehler (nur wenn es welche gibt), dann die Suche nach dem ersten Standort
  zeigeKatalogFehler(katalog);
  zeigeOptionenFehler(optionen);
  oeffneStandortliste(standortKontext);

  document.addEventListener("keydown", (e) => {
    const ziel = e.target as HTMLElement;
    const inEingabe = ziel.matches?.("input, textarea, select, [contenteditable]") ?? false;
    // Leertaste auf einem Knopf löst den Knopf aus, nicht die Pause
    if (e.key === " " && ziel.matches?.("button")) return;
    const a = aktionFuer({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, inEingabe });
    if (!a) return;
    if (a.art === "fensterSchliessen") {
      if (schliesseFenster()) e.preventDefault();
    } else if (a.art === "speichern") {
      e.preventDefault(); // Speichern folgt mit Etappe 4b
    } else if (a.art === "pauseUmschalten") {
      e.preventDefault();
      setzeTempo(zeitsteuerung.umschalten());
    } else if (a.art === "tempo") {
      setzeTempo(zeitsteuerung.setzeStufe(a.stufe));
    }
  });
}

zeigen();
void starteEinrichtung();
