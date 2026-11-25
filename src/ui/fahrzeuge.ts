import { belegung, busMass, busWert, lackiereUm, setzeUm, verkaufserloes } from "../fleet/fuhrpark";
import { freiePlaetze } from "../fleet/plaetze";
import { linieVonBus } from "../linien/linien";
import { kaufKontext, verkaufeBus } from "../game/spiel";
import { t, type TextKey } from "../i18n";
import { h } from "./dom";
import { datum, euro, euroRund, zahl } from "./format";
import { platzText } from "./fahrzeugmarkt";
import { beobachte, modellName, reihenName, type SpielUi } from "./spielui";
import { oeffneFenster } from "./windows";

/** Fahrzeugliste: eigene Busse mit Platz, Umsetzen, Umlackieren, Verkauf an den Händler. */
export function oeffneFahrzeuge(ui: SpielUi): void {
  const k = ui.k.markt;
  const koerper = h("tbody", {});
  const detail = h("div", { "data-testid": "fahrzeug-detail" });
  const meldung = h("p", { class: "meldung", "data-testid": "fahrzeug-meldung", role: "status" });
  let gewaehlt: number | null = null;
  const melde = (text: string, ok = false) => ((meldung.className = ok ? "erfolg" : "meldung"), (meldung.textContent = text));

  function zeichne() {
    const busse = ui.spiel.fuhrpark.busse;
    if (gewaehlt !== null && !busse.some((b) => b.id === gewaehlt)) gewaehlt = null;
    koerper.replaceChildren(
      ...busse.map((b) => {
        const m = k.modelle.get(b.modellId)!;
        const knopf = h("button", { type: "button", "data-testid": `fahrzeug-${b.id}`, "aria-pressed": String(b.id === gewaehlt), text: b.flottennummer });
        knopf.addEventListener("click", () => ((gewaehlt = b.id), zeichne()));
        return h("tr", { class: b.id === gewaehlt ? "gewaehlt" : undefined, "aria-selected": String(b.id === gewaehlt) },
          h("td", {}, knopf),
          h("td", { title: t("fahrzeuge.lackierungText", { farbe: b.konfig.lackierung }) }, h("span", { class: "farbpunkt", style: `background:${b.konfig.lackierung}`, "aria-hidden": "true" }), b.kennzeichen),
          h("td", { text: modellName(m) }),
          h("td", { text: String(b.baujahr) }),
          h("td", { text: t("fahrzeuge.zustand", { n: b.zustand }) }),
          h("td", { text: b.konfig.batterieKwh !== null ? t("fahrzeuge.batterie", { kwh: zahl(b.konfig.batterieKwh), n: b.batterieZustand ?? 100 }) : "" }),
          h("td", { "data-testid": `fahrzeug-platz-${b.id}`, text: platzText(b.platz) }),
          h("td", { class: "zahl", text: euroRund(busWert(b, ui.spiel.zeit, k)) }),
        );
      }),
    );
    if (!busse.length) koerper.append(h("tr", {}, h("td", { colspan: 8, text: t("fahrzeuge.keine") })));
    zeichneDetail();
  }

  function zeichneDetail() {
    const b = ui.spiel.fuhrpark.busse.find((x) => x.id === gewaehlt);
    if (!b) {
      detail.replaceChildren();
      return;
    }
    const m = k.modelle.get(b.modellId)!;
    const kk = kaufKontext(ui.spiel, ui.k);
    const frei = kk.hof && kk.analyse ? freiePlaetze(kk.hof, kk.analyse, belegung(kk.fuhrpark, k.modelle), busMass(m), k.hofCfg, b.id) : [];
    const ziele = frei.filter((f) => !(f.platz.art === b.platz.art && f.platz.id === b.platz.id));
    const umsetzen = h("select", { id: "fahrzeug-umsetzen", "data-testid": "fahrzeug-umsetzen" },
      h("option", { value: "", text: t("fahrzeuge.umsetzenWaehlen") }), ...ziele.map((f) => h("option", { value: `${f.platz.art}:${f.platz.id}`, text: platzText(f.platz) })));
    umsetzen.addEventListener("change", () => {
      if (!umsetzen.value) return;
      const [art, id] = umsetzen.value.split(":");
      const ok = setzeUm(kaufKontext(ui.spiel, ui.k), b.id, { art: art as "stellplatz" | "halle", id: Number(id) });
      melde(ok ? t("fahrzeuge.umgesetzt", { platz: platzText(b.platz) }) : t("fahrzeuge.umsetzenFehler"), ok);
      zeichne();
    });
    const farbe = h("input", { id: "fahrzeug-farbe", type: "color", value: b.konfig.lackierung, "data-testid": "fahrzeug-farbe" });
    const lackieren = h("button", { type: "button", "data-testid": "fahrzeug-lackieren", text: t("fahrzeuge.lackieren", { preis: euroRund(k.markt.umlackierenEur) }) });
    lackieren.addEventListener("click", () => {
      const e = lackiereUm(kaufKontext(ui.spiel, ui.k), b.id, farbe.value);
      melde(e.ok ? t("fahrzeuge.lackiert") : t(`fahrzeuge.fehler.${e.fehler}` as TextKey), e.ok);
      if (e.ok) ui.kontoGeaendert();
      zeichne();
    });
    const erloes = verkaufserloes(b, ui.spiel.zeit, k);
    const verkaufen = h("button", { type: "button", "data-testid": "fahrzeug-verkaufen", text: t("fahrzeuge.verkaufen", { preis: euro(erloes) }) });
    const bestaetigen = h("button", { type: "button", class: "primaer", "data-testid": "fahrzeug-verkaufen-ja", "data-halten": true, hidden: true, text: t("fahrzeuge.verkaufenJa", { preis: euro(erloes) }) });
    verkaufen.addEventListener("click", () => ((bestaetigen.hidden = false), bestaetigen.focus()));
    bestaetigen.addEventListener("click", () => {
      // Ein verkaufter Bus fährt keine Linie mehr (in der Spiellogik)
      const r = verkaufeBus(ui.spiel, ui.k, b.id);
      melde(r.ok ? t("fahrzeuge.verkauft", { nr: b.flottennummer, preis: euro(r.erloesEur) }) : t("fahrzeuge.fehler.unbekannt"), r.ok);
      if (r.ok) ui.kontoGeaendert();
      zeichne();
    });
    const linie = linieVonBus(ui.spiel.netz, b.id);
    const opt = b.konfig.optionen.map((id) => k.optionen.find((o) => o.id === id)?.name ?? id).join(", ");
    detail.replaceChildren(
      h("h3", { text: t("fahrzeuge.detailTitel", { nr: b.flottennummer, modell: reihenName(m) }) }),
      h("p", { class: "hilfe", text: m.variante ?? "" }),
      h("dl", { class: "werte" },
        h("dt", { text: t("fahrzeuge.kennzeichen") }), h("dd", { text: b.kennzeichen }),
        h("dt", { text: t("fahrzeuge.lackierung") }), h("dd", {}, h("span", { class: "farbpunkt", style: `background:${b.konfig.lackierung}`, "aria-hidden": "true" }), t("fahrzeuge.lackierungText", { farbe: b.konfig.lackierung })),
        h("dt", { text: t("fahrzeuge.herkunft") }), h("dd", { text: t(`fahrzeuge.herkunft.${b.herkunft}` as TextKey, { datum: datum(b.kaufzeit), preis: euro(b.kaufpreisEur) }) }),
        h("dt", { text: t("fahrzeuge.laufleistung") }), h("dd", { text: t("markt.km", { n: zahl(b.laufleistungKm) }) }),
        h("dt", { text: t("fahrzeuge.plaetze") }), h("dd", { text: t("markt.plaetze", { sitz: b.sitzplaetze ?? t("markt.keineAngabe"), steh: b.stehplaetze ?? t("markt.keineAngabe") }) }),
        h("dt", { text: t("fahrzeuge.hu") }), h("dd", { text: datum(b.huBis) }),
        h("dt", { text: t("fahrzeuge.ausstattung") }), h("dd", { text: opt }),
        h("dt", { text: t("fahrzeuge.linie") }), h("dd", { "data-testid": "fahrzeug-linie", text: linie ? t("fahrzeuge.linieText", { nummer: linie.nummer, name: linie.name }) : t("fahrzeuge.keineLinie") }),
      ),
      h("div", { class: "zweispaltig" },
        h("label", { for: "fahrzeug-umsetzen", text: t("fahrzeuge.umsetzen") }), umsetzen,
        h("label", { for: "fahrzeug-farbe", text: t("fahrzeuge.farbe") }), farbe,
      ),
      h("div", { class: "aktionen" }, lackieren, verkaufen, bestaetigen),
    );
  }

  zeichne();
  oeffneFenster("fahrzeuge", t("fahrzeuge.titel"), h("div", {},
    h("div", { class: "rollen kurz" }, h("table", { class: "tabelle", "data-testid": "fahrzeug-tabelle" },
      h("thead", {}, h("tr", {}, ...(["fahrzeuge.spalte.nr", "fahrzeuge.spalte.kennzeichen", "fahrzeuge.spalte.modell", "fahrzeuge.spalte.baujahr", "fahrzeuge.spalte.zustand",
        "fahrzeuge.spalte.batterie", "fahrzeuge.spalte.platz", "fahrzeuge.spalte.wert"] as TextKey[]).map((x) => h("th", { text: t(x) })))),
      koerper)),
    detail,
    meldung,
    h("p", { class: "hilfe", text: t("fahrzeuge.hilfe", { abschlag: Math.round(k.markt.haendlerAbschlag * 100) }) }),
  ), { links: true, breit: true });
  beobachte("fahrzeuge", zeichne);
}
