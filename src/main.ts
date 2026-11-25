import katalogUrl from "../fahrzeugkatalog.xlsx?url";
import optionenUrl from "../optionen.xlsx?url";
import { jetztCivil } from "./calendar/civil";
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
import { neuesSpiel, type GemeindeQuelle, type SpielZustand } from "./game/setup";
import { ladeSpielstand, SpielstandFehler, spielstandDaten, spielstandInfo, type SpielstandDaten } from "./game/spielstand";
import { linieVonBus } from "./linien/linien";
import type { SaveRecord, SaveStore } from "./storage/types";
import { oeffneHaltestelle, oeffneLinien } from "./ui/linien";
import { baueLinienUi, berechne, haltKlick, zeichneKarte, type LinienUi } from "./ui/linienbereich";
import type { GespeicherterStand } from "./ui/setup";
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

const speicher: Promise<SaveStore | null> = createStore()
  .then((store) => {
    zeilen.speicher = t("status.speicher", { art: t(store.kind === "sqlite" ? "status.speicher.desktop" : "status.speicher.browser") });
    zeigen();
    return store;
  })
  .catch((e: unknown) => {
    zeilen.speicher = t("status.speicherFehler", { grund: String(e) });
    zeigen();
    return null;
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

/** Automatisch gespeicherter Stand, falls vorhanden und lesbar (Version wird geprüft). */
async function gespeicherterStand(store: SaveStore | null): Promise<{ rec: SaveRecord; info: GespeicherterStand } | { fehler: string } | null> {
  if (!store) return null;
  try {
    const rec = await store.load(config.storage.autosaveSlot);
    const info = spielstandInfo(rec);
    return rec && info ? { rec, info } : null;
  } catch (e) {
    return { fehler: t("setup.standUnlesbar", { grund: String(e instanceof Error ? e.message : e) }) };
  }
}

async function starteEinrichtung(hinweis = ""): Promise<void> {
  const store = await speicher;
  const gespeichert = await gespeicherterStand(store);
  const stand = gespeichert && "rec" in gespeichert ? gespeichert : null;
  const wahl = await zeigeSetup(stand?.info ?? null, hinweis || (gespeichert && "fehler" in gespeichert ? gespeichert.fehler : ""));
  const weiter = "weiter" in wahl && stand ? stand.rec : null;
  const quelle: GemeindeQuelle = weiter ? (weiter.payload as SpielstandDaten).gemeinde.quelle : "werte" in wahl ? wahl.werte.gemeinde : { art: "norderstedt" };
  const laden = zeigeLaden();
  const auftrag: WeltAuftrag = wahl.datei
    ? { type: "laden", quelle: { art: "bytes", bytes: wahl.datei } }
    : { type: "laden", quelle: { art: "url", url: new URL(import.meta.env.BASE_URL + config.data.norderstedtPath, location.href).href } };
  const ergebnis = await ladeWelt(auftrag, laden);
  if (!ergebnis) return;
  const { world, antwort } = ergebnis;

  // Spielstand laden (Weiterspielen) oder neues Spiel. Der Katalog muss dafür bekannt sein.
  const katalog = await katalogLaden;
  const optionen = await optionenLaden;
  if (weiter) {
    try {
      if (world.gemeinde.name !== (weiter.payload as SpielstandDaten).gemeinde.name) throw new SpielstandFehler(t("setup.andereGemeinde", { gemeinde: world.gemeinde.name }));
      spiel = ladeSpielstand(weiter, new Set(katalog.modelle.map((m) => m.modell_id!)));
    } catch (e) {
      laden.fehler(t("setup.ladenFehler", { grund: String(e instanceof Error ? e.message : e) }), () => void starteEinrichtung());
      return;
    }
  } else if ("werte" in wahl) spiel = neuesSpiel(wahl.werte, world, jetztCivil());
  else return;

  laden.setze(t("laden.karte"), 0.98);
  let linienUiRef: LinienUi | null = null;
  zeigeWelt(map, antwort.render, world.bbox, (s) => {
    if (!linienUiRef || haltKlick(s.id)) return;
    oeffneHaltestelle(linienUiRef, s.id);
  });
  laden.schliessen();

  zeilen.daten = quelle.art === "norderstedt" ? t("status.daten", { anzahl: antwort.elemente }) : t("status.datenDatei", { datei: quelle.dateiname, anzahl: antwort.elemente });
  zeilen.welt = t("status.welt", {
    gemeinde: world.gemeinde.name,
    haltestellen: world.stops.length,
    abschnitte: world.network.edges.length,
    ampeln: world.network.signalNodes,
    einwohner: world.gemeinde.einwohner.toLocaleString("de-DE"),
    arbeitsplaetze: world.gemeinde.arbeitsplaetze.toLocaleString("de-DE"),
  });
  zeigen();

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
  // Neues Spiel: Gebrauchtmarkt füllen; ein geladener Stand bringt seine Angebote mit
  if (!weiter) starteMarkt(sp, spielKontext);

  // Simulations-Worker: bekommt das Straßennetz einmal und rechnet Linien ohne Netzzugriff (Kriterium 13)
  const basisZeit = sp.zeit;
  let letzteStunde = Math.floor(basisZeit / 3600000);
  const sim = startSimulation((s) => {
    zeilen.sim = t("status.simulation", { ticks: s.ticks, sekunden: s.gameSeconds.toFixed(1), tempo: s.speed });
    const jetzt = basisZeit + Math.floor(s.gameSeconds) * 1000;
    kopf.setzeZeit(jetzt);
    // Ereignisse der Spielzeit (Wochenwechsel, Monatsende) genau einmal, auch bei 600-fach
    const ereignisse = fortschreiben(sp, jetzt, spielKontext);
    if (ereignisse.length) kopf.setzeKontostand(sp.kontostandEur);
    // Bewerber erscheinen im Lauf des Tages: offene Fenster zu jeder vollen Spielstunde und nach Ereignissen neu zeichnen
    const stunde = Math.floor(jetzt / 3600000);
    if (ereignisse.length || stunde !== letzteStunde) aktualisiereFenster();
    letzteStunde = stunde;
    zeigen();
  });
  sim.setzeNetz(world.network, [(world.bbox[0] + world.bbox[2]) / 2, (world.bbox[1] + world.bbox[3]) / 2]);

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
  const lu = baueLinienUi({ ...ui, map, world, sim, modelle });
  linienUiRef = lu;
  baueMenueleiste((b) => {
    if (b === "betriebshof") ui.betriebshof();
    else if (b === "linien") oeffneLinien();
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
      // Busse in der Farbe ihrer Linie (Konzept: Optik), sonst in ihrer Lackierung; die Liniennummer steht dabei
      busse: () =>
        sp.fuhrpark.busse.map((b) => {
          const l = linieVonBus(sp.netz, b.id);
          return { platz: b.platz, ...busMass(modelle.get(b.modellId)!), farbe: l?.farbe ?? b.konfig.lackierung, flottennummer: l ? `${b.flottennummer} (${l.nummer})` : b.flottennummer };
        }),
    });
  };
  zeigeStandorte(map, antwort.render.standorte, (id, p) => standortKlick(standortKontext, id, p));
  map.resize();
  kopf.setzeKontostand(spiel.kontostandEur);
  kopf.setzeZeit(sp.zeit);
  zeichneKarte();
  void berechne();

  // Automatisch speichern (minimaler Autosave bis Etappe 4b, ohne eigene Oberfläche): in festen Abständen und beim Verlassen
  let letzterSpeicherstand = "";
  const speichern = async (): Promise<boolean> => {
    if (!store) return false;
    const daten = spielstandDaten(sp);
    const text = JSON.stringify(daten);
    if (text === letzterSpeicherstand) return true;
    try {
      await store.save(config.storage.autosaveSlot, daten);
      letzterSpeicherstand = text;
      const d = new Date();
      zeilen.speicher = t("status.gespeichert", { art: t(store.kind === "sqlite" ? "status.speicher.desktop" : "status.speicher.browser"), zeit: d.toLocaleTimeString("de-DE") });
    } catch (e) {
      zeilen.speicher = t("status.speicherFehler", { grund: String(e) });
    }
    zeigen();
    return true;
  };
  void speichern();
  setInterval(() => void speichern(), config.storage.autosaveSekunden * 1000);
  addEventListener("pagehide", () => void speichern());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void speichern();
  });

  // Nur für Oberflächentests und nur mit "?test" in der Adresse: Spielzeit der Spielregeln vorspulen
  // (Bewerber erscheinen erst nach Tagen) und sofort speichern. Im normalen Spiel gibt es diesen Zugang nicht.
  if (new URLSearchParams(location.search).has("test")) {
    (window as unknown as { __spieltest: unknown }).__spieltest = {
      vorspulenTage: (tage: number) => {
        fortschreiben(sp, sp.zeit + tage * 86400000, spielKontext);
        kopf.setzeKontostand(sp.kontostandEur);
        aktualisiereFenster();
      },
      speichern,
    };
  }
  const setzeTempo = (tempo: number) => {
    sim.setSpeed(tempo);
    kopf.setzeTempo(tempo);
  };
  setzeTempo(zeitsteuerung.tempo);

  // Beim Start: Katalogfehler (nur wenn es welche gibt), dann die Suche nach dem ersten Standort (nur ohne Betriebshof)
  zeigeKatalogFehler(katalog);
  zeigeOptionenFehler(optionen);
  if (sp.betriebshof) {
    standorteSichtbar(map, false);
    hofAufKarte();
  } else oeffneStandortliste(standortKontext);

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
