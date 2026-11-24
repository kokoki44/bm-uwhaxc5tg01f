import { config } from "./config";
import { loadOsmExtract } from "./data/osm";
import { t } from "./i18n";
import { createMap } from "./map/map";
import { startSimulation } from "./sim/client";
import { createStore } from "./storage";

document.title = t("app.titel");
const status = document.getElementById("status")!;
const zeilen: Record<string, string> = { sim: "", speicher: "", daten: "" };
const zeigen = () => (status.innerText = [t("app.titel"), ...Object.values(zeilen)].filter(Boolean).join("\n"));

createMap("map");

startSimulation((s) => {
  zeilen.sim = t("status.simulation", { ticks: s.ticks, sekunden: s.gameSeconds.toFixed(1), tempo: s.speed });
  zeigen();
});

createStore().then((store) => {
  zeilen.speicher = t("status.speicher", {
    art: t(store.kind === "sqlite" ? "status.speicher.desktop" : "status.speicher.browser"),
  });
  zeigen();
});

loadOsmExtract(import.meta.env.BASE_URL + config.data.norderstedtPath)
  .then((d) => (zeilen.daten = t("status.daten", { anzahl: d.elements.length })))
  .catch(() => (zeilen.daten = t("status.daten.fehler")))
  .finally(zeigen);

zeigen();
