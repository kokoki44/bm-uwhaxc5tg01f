import { jetztCivil } from "./calendar/civil";
import { config } from "./config";
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
const zeilen: Record<string, string> = { welt: "", daten: "", sim: "", speicher: "" };
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

  const zeitsteuerung = new Zeitsteuerung(config.sim.speeds, config.sim.startSpeed);
  const kopf = baueKopfleiste(spiel.firma, world.gemeinde.region, world.bbox[1] < 0, {
    tempo: (stufe) => setzeTempo(stufe === 0 ? zeitsteuerung.pause() : zeitsteuerung.setzeStufe(stufe)),
    hilfe: zeigeHilfe,
  });
  map.resize();
  kopf.setzeKontostand(spiel.kontostandEur);
  kopf.setzeZeit(spiel.startZeit);

  const startZeit = spiel.startZeit;
  const sim = startSimulation((s) => {
    zeilen.sim = t("status.simulation", { ticks: s.ticks, sekunden: s.gameSeconds.toFixed(1), tempo: s.speed });
    kopf.setzeZeit(startZeit + Math.floor(s.gameSeconds) * 1000);
    zeigen();
  });
  const setzeTempo = (tempo: number) => {
    sim.setSpeed(tempo);
    kopf.setzeTempo(tempo);
  };
  setzeTempo(zeitsteuerung.tempo);

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
