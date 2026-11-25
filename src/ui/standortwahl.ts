import type { Map as MapLibreMap } from "maplibre-gl";
import { config } from "../config";
import { neuerHof } from "../depot/hof";
import type { SpielZustand } from "../game/setup";
import { t, type TextKey } from "../i18n";
import { zeigeGrundstueck } from "../map/map";
import type { LonLat } from "../world/geo";
import { pointInRing } from "../world/geo";
import { findeLage, hofZuGeo, kaufeStartgrundstueck, pruefeStartgrundstueck, rechteckRing, type Standort } from "../world/standorte";
import type { World } from "../world/world";
import { h } from "./dom";
import { euro, zahl } from "./format";
import { istOffen, oeffneFenster, schliesseFenster } from "./windows";

export interface StandortKontext {
  map: MapLibreMap;
  world: World;
  spiel: SpielZustand;
  kontoGeaendert(): void;
  /** Nach dem Kauf: Editor öffnen. */
  gekauft(): void;
}

const g = config.grundstueck;

/** Name eines Standorts für Listen: OSM-Name, sonst Art der Fläche und nächste Straße. */
export function standortName(s: Standort): string {
  const art = t(`standort.art.${s.landnutzung}` as TextKey);
  if (s.name) return `${s.name} (${art})`;
  return s.strasse ? t("standort.anStrasse", { art, strasse: s.strasse }) : art;
}

/** Liste aller Standorte, nach Preis sortiert. Per Tastatur bedienbar; ein Klick auf die Karte geht ebenso. */
export function oeffneStandortliste(k: StandortKontext): void {
  const zeilen = k.world.standorte.map((s) => {
    const b = h("button", { type: "button", "data-testid": `standort-${s.id}`, text: standortName(s) });
    b.addEventListener("click", () => oeffneGrundstueck(k, s));
    return h("tr", {},
      h("td", {}, b),
      h("td", { class: "zahl", text: t("einheit.eurM2", { n: s.preisEurM2 }) }),
      h("td", { class: "zahl", text: t("einheit.m2", { n: zahl(s.flaecheM2) }) }),
      h("td", { class: "zahl", text: t("einheit.m", { n: zahl(s.anbindungM) }) }),
    );
  });
  oeffneFenster(
    "standorte",
    t("standort.liste.titel"),
    h("div", {},
      h("p", { text: t("standort.liste.text") }),
      h("div", { class: "rollen" },
        h("table", { class: "tabelle" },
          h("thead", {}, h("tr", {}, h("th", { text: t("standort.spalte.lage") }), h("th", { text: t("standort.spalte.preis") }), h("th", { text: t("standort.spalte.flaeche") }), h("th", { text: t("standort.spalte.anbindung") }))),
          h("tbody", {}, ...zeilen),
        ),
      ),
    ),
    { links: true },
  );
}

let aktiv: { s: Standort; lage: LonLat | null; aktualisieren(): void } | null = null;

/** Klick auf eine Standortfläche der Karte: Grundstück dort anlegen (oder verschieben, wenn sie schon gewählt ist). */
export function standortKlick(k: StandortKontext, id: number, punkt: LonLat): void {
  if (k.spiel.betriebshof) return;
  const s = k.world.standorte.find((x) => x.id === id);
  if (!s) return;
  if (aktiv?.s.id === id && istOffen("grundstueck")) {
    aktiv.lage = punkt;
    aktiv.aktualisieren();
  } else oeffneGrundstueck(k, s, punkt);
}

/** Fenster für ein Startgrundstück: Größe wählen, Lage per Klick, Preis, Kauf. */
export function oeffneGrundstueck(k: StandortKontext, s: Standort, mitte?: LonLat): void {
  const breite = h("input", { id: "g-breite", type: "number", min: g.mindestSeiteM, step: 1, value: g.startBreiteM, "data-testid": "grundstueck-breite" });
  const tiefe = h("input", { id: "g-tiefe", type: "number", min: g.mindestSeiteM, step: 1, value: g.startTiefeM, "data-testid": "grundstueck-tiefe" });
  const kosten = h("p", { "data-testid": "grundstueck-kosten" });
  const meldung = h("p", { class: "meldung", role: "alert", "data-testid": "grundstueck-meldung" });
  const kaufen = h("button", { type: "button", class: "primaer", "data-testid": "grundstueck-kaufen", text: t("grundstueck.kaufen") });
  // mitte = gewünschte Mitte des Grundstücks (Klick), sonst der Vorschlag des Standorts
  let nw: LonLat = s.startLage;
  const state: { s: Standort; lage: LonLat | null; aktualisieren(): void } = { s, lage: mitte ?? null, aktualisieren };
  const masse = () => ({ b: Number(breite.value), t: Number(tiefe.value) });

  function aktualisieren() {
    const { b, t: tt } = masse();
    meldung.textContent = "";
    if (state.lage) {
      const kand = hofZuGeo(state.lage, -b / 2, -tt / 2);
      if (pruefeStartgrundstueck(s, kand, b, tt, g) === null) nw = kand;
      else if (pointInRing(state.lage, s.ring)) meldung.textContent = t("grundstueck.fehler.hierNicht");
      state.lage = null;
    }
    let f = pruefeStartgrundstueck(s, nw, b, tt, g);
    if (f === "nichtInFlaeche") {
      const neu = Number.isInteger(b) && Number.isInteger(tt) ? findeLage(s.ring, b, tt, g.lageSuchschrittM) : null;
      if (neu) (nw = neu), (f = null);
    }
    const preis = b * tt * s.preisEurM2;
    kosten.textContent = t("grundstueck.kosten", { flaeche: zahl(b * tt), preis: euro(preis) });
    if (f) meldung.textContent = t(`grundstueck.fehler.${f}` as TextKey, { min: zahl(g.mindestflaecheM2), seite: g.mindestSeiteM, max: zahl(g.hoechstflaecheM2) });
    else if (k.spiel.kontostandEur < preis) meldung.textContent = t("grundstueck.fehler.geldFehlt");
    kaufen.disabled = !!meldung.textContent && meldung.textContent !== t("grundstueck.fehler.hierNicht");
    zeigeGrundstueck(k.map, f ? null : rechteckRing(nw, b, tt), k.spiel.firma.farbe);
  }

  breite.addEventListener("input", aktualisieren);
  tiefe.addEventListener("input", aktualisieren);
  kaufen.addEventListener("click", () => {
    const { b, t: tt } = masse();
    const e = kaufeStartgrundstueck(k.spiel, s, nw, b, tt, g);
    if (!e.ok) {
      meldung.textContent = t(`grundstueck.fehler.${e.fehler}` as TextKey, { min: zahl(g.mindestflaecheM2), seite: g.mindestSeiteM, max: zahl(g.hoechstflaecheM2) });
      return;
    }
    k.spiel.betriebshof = neuerHof(e.grundstueck);
    aktiv = null;
    schliesseFenster("grundstueck");
    schliesseFenster("standorte");
    k.kontoGeaendert();
    k.gekauft();
  });

  oeffneFenster(
    "grundstueck",
    t("grundstueck.titel"),
    h("div", {},
      h("p", { class: "fett", text: standortName(s) }),
      h("dl", { class: "werte" },
        h("dt", { text: t("standort.spalte.preis") }), h("dd", { "data-testid": "grundstueck-preis", text: t("einheit.eurM2", { n: s.preisEurM2 }) }),
        h("dt", { text: t("grundstueck.verfuegbar") }), h("dd", { text: t("einheit.m2", { n: zahl(s.flaecheM2) }) }),
        h("dt", { text: t("standort.spalte.anbindung") }), h("dd", { text: t("grundstueck.anbindungText", { m: zahl(s.anbindungM), strasse: s.strasse || t("grundstueck.ohneName") }) }),
      ),
      h("p", { class: "hilfe", text: t("grundstueck.hilfe", { min: zahl(g.mindestflaecheM2), max: zahl(g.hoechstflaecheM2), ha: zahl(g.hoechstflaecheM2 / 10000) }) }),
      h("div", { class: "zweispaltig" },
        h("label", { for: "g-breite", text: t("grundstueck.breite") }), breite,
        h("label", { for: "g-tiefe", text: t("grundstueck.tiefe") }), tiefe,
      ),
      kosten,
      meldung,
      h("div", { class: "aktionen" }, kaufen),
    ),
  );
  aktiv = state;
  aktualisieren();
  const lon = s.ring.map((p) => p[0]), lat = s.ring.map((p) => p[1]);
  k.map.fitBounds([[Math.min(...lon), Math.min(...lat)], [Math.max(...lon), Math.max(...lat)]], { padding: 80, duration: 0, maxZoom: 17 });
}
