import { addDays } from "../calendar/civil";
import type { Bus } from "../catalog/katalog";
import {
  batterien, kaufeGebraucht, kaufeNeu, neupreis, neuKaufbar, plaetzeMitBatterie, pruefeKonfig, standardKonfig, type Angebot, type Konfiguration,
  type MarktOption,
} from "../fleet/fuhrpark";
import { inspiziere } from "../fleet/markt";
import { kaufKontext } from "../game/spiel";
import { t, tOder, type TextKey } from "../i18n";
import { h } from "./dom";
import { datum, euro, euroRund, zahl } from "./format";
import { beobachte, modellName, reihenName, reihenSchluessel, type SpielUi } from "./spielui";
import { oeffneFenster } from "./windows";

type Reiter = "neu" | "gebraucht";

/** Text zu einem Platz im Hof. */
export const platzText = (p: { art: "stellplatz" | "halle"; id: number }) => t(p.art === "halle" ? "platz.halle" : "platz.stellplatz", { nr: p.id });

/** Meldung zu einem Kauffehler. */
export const kaufFehlerText = (f: string) => t(`markt.fehler.${f}` as TextKey);

const optionName = (o: MarktOption) => o.name ?? o.id;
const passt = (o: MarktOption, m: Bus) => o.nurAntrieb === null || o.nurAntrieb === m.antrieb;

/** Daten aus dem Katalog für die Ansicht (Maße, Plätze mit Batterie, Antrieb, Verbrauch, Reichweite). */
function modellWerte(m: Bus, batterieKwh: number | null, ui: SpielUi): HTMLElement {
  const p = plaetzeMitBatterie(m, batterieKwh, ui.k.markt.katalog);
  const zeile = (k: TextKey, v: string) => [h("dt", { text: t(k) }), h("dd", { text: v })];
  const leer = t("markt.keineAngabe");
  const werte = [
    ...zeile("markt.wert.bauart", `${m.bauart ?? leer}, ${m.flurtyp ?? leer}`),
    ...zeile("markt.wert.antrieb", m.antrieb ?? leer),
    ...zeile("markt.wert.masse", t("markt.masse", { l: zahl(m.laenge_mm! / 1000), b: zahl(m.breite_mm! / 1000), hoehe: m.hoehe_mm ? zahl(m.hoehe_mm / 1000) : leer })),
    ...zeile("markt.wert.tueren", m.tueren !== null ? String(m.tueren) : leer),
    ...zeile("markt.wert.plaetze", t("markt.plaetze", { sitz: p.sitzplaetze ?? leer, steh: p.stehplaetze ?? leer })),
  ];
  if (m.antrieb === "Elektro") {
    werte.push(...zeile("markt.wert.reichweite", m.reichweite_km !== null ? t("markt.km", { n: zahl(m.reichweite_km) }) : leer));
    werte.push(...zeile("markt.wert.ladeleistung", m.ladeleistung_kw !== null ? t("markt.kw", { n: zahl(m.ladeleistung_kw) }) : leer));
  } else {
    werte.push(...zeile("markt.wert.verbrauch", m.verbrauch_pro_100km !== null ? t("markt.verbrauch", { n: zahl(m.verbrauch_pro_100km), einheit: m.verbrauchseinheit ?? "" }) : leer));
  }
  return h("dl", { class: "werte", "data-testid": "markt-werte" }, ...werte);
}

/** Fahrzeugmarkt: Neukauf mit Konfiguration und Gebrauchtangebote. */
export function oeffneFahrzeugmarkt(ui: SpielUi, start: Reiter = "neu"): void {
  let reiter: Reiter = start;
  const inhalt = h("div", {});
  const knopf = (r: Reiter) => {
    const b = h("button", { type: "button", "data-testid": `markt-reiter-${r}`, "aria-pressed": String(reiter === r), text: t(`markt.reiter.${r}` as TextKey) });
    b.addEventListener("click", () => ((reiter = r), zeichne()));
    return b;
  };
  // Zustand des Neukaufs bleibt beim Umschalten erhalten
  const neu = neukauf(ui);
  const gebraucht = gebrauchtmarkt(ui);
  function zeichne() {
    inhalt.replaceChildren(h("div", { class: "reiter", role: "group" }, knopf("neu"), knopf("gebraucht")), reiter === "neu" ? neu.el : gebraucht.el);
    if (reiter === "gebraucht") gebraucht.zeichne();
  }
  zeichne();
  oeffneFenster("fahrzeugmarkt", t("markt.titel"), inhalt, { links: true, breit: true });
  beobachte("fahrzeugmarkt", () => reiter === "gebraucht" && gebraucht.zeichne());
}

function neukauf(ui: SpielUi): { el: HTMLElement } {
  const k = ui.k.markt;
  const alle = [...k.modelle.values()].filter((m) => neuKaufbar(m, k.markt));
  const reihen = new Map<string, Bus[]>();
  for (const m of alle) reihen.set(reihenSchluessel(m), [...(reihen.get(reihenSchluessel(m)) ?? []), m]);
  const werteVon = (f: (m: Bus) => string | null) => [...new Set(alle.map(f).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
  const auswahl = (id: string, label: TextKey, werte: string[]) => {
    const s = h("select", { id, "data-testid": id }, h("option", { value: "", text: t("markt.filter.alle") }), ...werte.map((w) => h("option", { value: w, text: w })));
    return { s, el: h("label", {}, `${t(label)} `, s) };
  };
  const fH = auswahl("markt-filter-hersteller", "markt.filter.hersteller", werteVon((m) => m.hersteller));
  const fB = auswahl("markt-filter-bauart", "markt.filter.bauart", werteVon((m) => m.bauart));
  const fA = auswahl("markt-filter-antrieb", "markt.filter.antrieb", werteVon((m) => m.antrieb));
  const liste = h("tbody", {});
  const detail = h("div", { "data-testid": "markt-detail" }, h("p", { class: "hilfe", text: t("markt.waehleModell") }));
  let gewaehlt: string | null = null;

  function zeichneListe() {
    const trifft = (m: Bus) => (!fH.s.value || m.hersteller === fH.s.value) && (!fB.s.value || m.bauart === fB.s.value) && (!fA.s.value || m.antrieb === fA.s.value);
    // Je Reihe nur die Varianten, die zum Filter passen (zum Beispiel nur die Elektro-Variante einer gemischten Reihe)
    const passend = [...reihen.entries()].map(([key, ms]) => [key, ms.filter(trifft)] as const).filter(([, ms]) => ms.length > 0);
    passend.sort((a, b) => reihenName(a[1][0]).localeCompare(reihenName(b[1][0])));
    liste.replaceChildren(
      ...passend.map(([key, ms]) => {
        const ab = Math.min(...ms.map((m) => m.neupreis_eur ?? Infinity));
        const b = h("button", { type: "button", "data-testid": "markt-modell", "aria-pressed": String(key === gewaehlt), text: reihenName(ms[0]) });
        b.addEventListener("click", () => ((gewaehlt = key), zeichneListe(), zeichneDetail(ms[0])));
        return h("tr", { class: key === gewaehlt ? "gewaehlt" : undefined, "aria-selected": String(key === gewaehlt) },
          h("td", {}, b),
          h("td", { text: [...new Set(ms.map((m) => m.bauart))].join(", ") }),
          h("td", { text: [...new Set(ms.map((m) => m.antrieb))].join(", ") }),
          h("td", { class: "zahl", text: Number.isFinite(ab) ? t("markt.ab", { preis: euroRund(ab) }) : "" }),
        );
      }),
    );
  }
  for (const f of [fH, fB, fA]) f.s.addEventListener("change", zeichneListe);

  function zeichneDetail(m: Bus) {
    const reihe = reihen.get(reihenSchluessel(m))!;
    let c: Konfiguration = standardKonfig(m, ui.spiel.firma.farbe, k);
    const meldung = h("p", { class: "meldung", "data-testid": "markt-meldung", role: "status" });
    const preis = h("p", { class: "fett", "data-testid": "markt-preis" });
    const werteBox = h("div", {});
    const kaufen = h("button", { type: "button", class: "primaer", "data-testid": "markt-kaufen", text: t("markt.kaufen") });

    const variante = h("select", { id: "markt-variante", "data-testid": "markt-variante" },
      ...reihe.map((v) => h("option", { value: v.modell_id!, text: v.variante ?? t("markt.standardVariante"), selected: v === m })));
    variante.addEventListener("change", () => zeichneDetail(k.modelle.get(variante.value)!));

    const felder: HTMLElement[] = [h("label", { for: "markt-variante", text: t("markt.variante") }), variante];
    const bat = batterien(m, k.katalog);
    if (bat.length) {
      const s = h("select", { id: "markt-batterie", "data-testid": "markt-batterie" }, ...bat.map((x) => h("option", { value: String(x), text: t("markt.kwh", { n: zahl(x) }), selected: x === c.batterieKwh })));
      s.addEventListener("change", () => ((c = { ...c, batterieKwh: Number(s.value) }), aktualisiere()));
      felder.push(h("label", { for: "markt-batterie", text: t("markt.batterie") }), s);
    }
    const lack = h("input", { id: "markt-lackierung", type: "color", value: c.lackierung, "data-testid": "markt-lackierung" });
    lack.addEventListener("input", () => ((c = { ...c, lackierung: lack.value }), aktualisiere()));
    felder.push(h("label", { for: "markt-lackierung", text: t("markt.lackierung") }), lack);

    const opt = k.optionen.filter((o) => passt(o, m));
    const gesperrt = (o: MarktOption) => o.freischaltung !== k.frei && !k.freigeschaltet.has(o.freischaltung);
    const gruppen = [...new Set(opt.filter((o) => o.gruppe !== null).map((o) => o.gruppe!))];
    for (const g of gruppen) {
      const s = h("select", { id: `markt-gruppe-${g}`, "data-testid": `markt-gruppe-${g}` },
        ...opt.filter((o) => o.gruppe === g).map((o) => h("option", {
          value: o.id, disabled: gesperrt(o), selected: c.optionen.includes(o.id),
          text: gesperrt(o) ? t("markt.optionGesperrt", { name: optionName(o) }) : t("markt.optionPreis", { name: optionName(o), preis: euroRund(o.aufpreisEur) }),
        })));
      s.addEventListener("change", () => {
        c = { ...c, optionen: [...c.optionen.filter((id) => k.optionen.find((o) => o.id === id)?.gruppe !== g), s.value] };
        aktualisiere();
      });
      felder.push(h("label", { for: `markt-gruppe-${g}`, text: tOder(`markt.gruppe.${g}`, g) }), s);
    }
    const einzeln = opt.filter((o) => o.gruppe === null && !o.serieNeukauf).map((o) => {
      const cb = h("input", { type: "checkbox", "data-testid": `markt-option-${o.id}`, disabled: gesperrt(o), checked: c.optionen.includes(o.id) });
      cb.addEventListener("change", () => {
        c = { ...c, optionen: cb.checked ? [...c.optionen, o.id] : c.optionen.filter((x) => x !== o.id) };
        aktualisiere();
      });
      return h("label", { class: gesperrt(o) ? "gesperrt" : undefined }, cb, ` ${gesperrt(o) ? t("markt.optionGesperrt", { name: optionName(o) }) : t("markt.optionPreis", { name: optionName(o), preis: euroRund(o.aufpreisEur) })}`);
    });
    const serie = opt.filter((o) => o.serieNeukauf).map(optionName);

    function aktualisiere() {
      const f = pruefeKonfig(m, c, k);
      const p = neupreis(m, c, k);
      preis.textContent = t("markt.preis", { preis: euro(p) });
      werteBox.replaceChildren(modellWerte(m, c.batterieKwh, ui));
      meldung.className = "meldung";
      meldung.textContent = f ? kaufFehlerText(f) : "";
      kaufen.disabled = !!f;
    }
    kaufen.addEventListener("click", () => {
      const e = kaufeNeu(kaufKontext(ui.spiel, ui.k), m.modell_id!, c);
      if (!e.ok) {
        meldung.className = "meldung";
        meldung.textContent = kaufFehlerText(e.fehler);
        return;
      }
      ui.kontoGeaendert();
      meldung.className = "erfolg";
      meldung.textContent = t("markt.gekauft", { nr: e.bus.flottennummer, kennzeichen: e.bus.kennzeichen, platz: platzText(e.bus.platz), preis: euro(e.bus.kaufpreisEur) });
    });

    detail.replaceChildren(
      ...([
        h("h3", { "data-testid": "markt-titel", text: reihenName(m) }),
        m.variante ? h("p", { class: "hilfe", "data-testid": "markt-titel-variante", text: m.variante }) : null,
        werteBox,
        h("div", { class: "zweispaltig" }, ...felder),
        einzeln.length ? h("div", { class: "optionen" }, h("p", { class: "fett", text: t("markt.ausstattung") }), ...einzeln) : null,
        serie.length ? h("p", { class: "hilfe", text: t("markt.serie", { liste: serie.join(", ") }) }) : null,
        preis,
        h("div", { class: "aktionen" }, kaufen),
        meldung,
      ] as (HTMLElement | null)[]).filter((x): x is HTMLElement => x !== null),
    );
    aktualisiere();
  }

  zeichneListe();
  const el = h("div", {},
    h("div", { class: "filter" }, fH.el, fB.el, fA.el),
    h("div", { class: "spalten2" },
      h("div", { class: "rollen" }, h("table", { class: "tabelle" },
        h("thead", {}, h("tr", {}, ...(["markt.spalte.modell", "markt.spalte.bauart", "markt.spalte.antrieb", "markt.spalte.preis"] as TextKey[]).map((x) => h("th", { text: t(x) })))),
        liste)),
      detail),
  );
  return { el };
}

function gebrauchtmarkt(ui: SpielUi): { el: HTMLElement; zeichne(): void } {
  const k = ui.k.markt;
  const meldung = h("p", { class: "meldung", "data-testid": "gebraucht-meldung", role: "status" });
  const koerper = h("tbody", {});
  const el = h("div", {},
    h("p", { class: "hilfe", text: t("gebraucht.hilfe", { gebuehr: euroRund(k.markt.inspektionEur) }) }),
    h("div", { class: "rollen" }, h("table", { class: "tabelle", "data-testid": "gebraucht-tabelle" },
      h("thead", {}, h("tr", {}, ...(["gebraucht.spalte.modell", "gebraucht.spalte.baujahr", "gebraucht.spalte.km", "gebraucht.spalte.zustand", "gebraucht.spalte.batterie",
        "gebraucht.spalte.hu", "gebraucht.spalte.ausstattung", "gebraucht.spalte.preis", "gebraucht.spalte.aktion"] as TextKey[]).map((x) => h("th", { text: t(x) })))),
      koerper)),
    meldung,
  );
  // Ganze Konfiguration: Bestuhlung, Spiegel und weitere Ausstattung (Konzept: jedes Angebot zeigt eine Konfiguration)
  const ausstattung = (a: Angebot) =>
    a.konfig.optionen.map((id) => k.optionen.find((o) => o.id === id)).filter((o): o is MarktOption => !!o).map(optionName).join(", ") || t("gebraucht.grundausstattung");

  function zeichne() {
    const angebote = [...ui.spiel.fuhrpark.angebote].sort((a, b) => a.id - b.id);
    koerper.replaceChildren(
      ...angebote.map((a) => {
        const m = k.modelle.get(a.modellId)!;
        const insp = h("button", { type: "button", "data-testid": `angebot-inspektion-${a.id}`, disabled: a.inspiziert, text: t("gebraucht.inspektion", { gebuehr: euroRund(k.markt.inspektionEur) }) });
        insp.addEventListener("click", () => {
          const e = inspiziere(ui.spiel.fuhrpark, a.id, ui.spiel, k, ui.spiel.zeit);
          meldung.className = e.ok ? "erfolg" : "meldung";
          meldung.textContent = e.ok ? t("gebraucht.inspiziert", { zustand: a.zustand }) : t(`gebraucht.fehler.${e.fehler}` as TextKey);
          ui.kontoGeaendert();
          zeichne();
        });
        const kauf = h("button", { type: "button", class: "primaer", "data-testid": `angebot-kaufen-${a.id}`, text: t("gebraucht.kaufen") });
        kauf.addEventListener("click", () => {
          const e = kaufeGebraucht(kaufKontext(ui.spiel, ui.k), a.id);
          meldung.className = e.ok ? "erfolg" : "meldung";
          meldung.textContent = e.ok
            ? t("markt.gekauft", { nr: e.bus.flottennummer, kennzeichen: e.bus.kennzeichen, platz: platzText(e.bus.platz), preis: euro(e.bus.kaufpreisEur) })
            : kaufFehlerText(e.fehler);
          if (e.ok) ui.kontoGeaendert();
          zeichne();
        });
        const zustand = a.inspiziert ? t("gebraucht.zustandGenau", { n: a.zustand }) : t("gebraucht.zustandSpanne", { von: a.zustandVon, bis: a.zustandBis });
        const batterie = a.konfig.batterieKwh === null ? "" : a.inspiziert
          ? t("gebraucht.batterieGenau", { kwh: zahl(a.konfig.batterieKwh), n: a.batterieZustand! })
          : t("gebraucht.batterieSpanne", { kwh: zahl(a.konfig.batterieKwh), von: a.batterieVon!, bis: a.batterieBis! });
        return h("tr", { "data-testid": `angebot-${a.id}` },
          h("td", {}, modellName(m), h("br", {}),
            h("span", { class: "farbpunkt", style: `background:${a.konfig.lackierung}`, "aria-hidden": "true" }),
            h("span", { class: "hilfe", text: t("gebraucht.lackierungText", { farbe: a.konfig.lackierung }) }), h("br", {}),
            h("span", { class: "hilfe", text: t("gebraucht.laeuftAb", { datum: datum(addDays(a.ablauf, -1)) }) })),
          h("td", { text: String(a.baujahr) }),
          h("td", { class: "zahl", text: t("markt.km", { n: zahl(a.laufleistungKm) }) }),
          h("td", { "data-testid": `angebot-zustand-${a.id}`, text: zustand }),
          h("td", { text: batterie }),
          h("td", { text: t("gebraucht.huMonate", { n: a.huRestMonate }) }),
          h("td", { class: "hilfe", text: ausstattung(a) }),
          h("td", { class: "zahl", text: euroRund(a.preisEur) }),
          h("td", {}, insp, " ", kauf),
        );
      }),
    );
    if (!angebote.length) koerper.append(h("tr", {}, h("td", { colspan: 9, text: t("gebraucht.keine") })));
  }
  return { el, zeichne };
}
