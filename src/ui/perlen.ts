import { config } from "../config";
import { t, type TextKey } from "../i18n";
import { entfernePerle, ersetzeHalt, fuegeHaltEin, fuegeWegpunktEin, loescheHaltestelle, neueHaltestelle, setzeStandzeit, verschiebePerle } from "../linien/linien";
import type { VariantenPlan } from "../linien/plan";
import type { HaltId, Perle } from "../linien/typen";
import type { LonLat } from "../world/geo";
import { h } from "./dom";
import { HaltIndex } from "../linien/richtung";
import { freigeschaltet, lageText, linienUi, setzeWerkzeug, werkzeug, type Werkzeug } from "./linienbereich";

const L = config.linien;
/** Werte aus der Konfiguration für Platzhalter in Texten. */
const W = { radius: config.stops.fangradiusM, beginn: L.betriebstagBeginnH };

export interface PerlenOptionen {
  /** Fenster, zu dem der Editor gehört (testid-Präfix und Ende des Werkzeugs). */
  fenster: string;
  perlen: Perle[];
  plan(): VariantenPlan | undefined;
  /** Standzeiten an Zwischenhalten einstellbar (in Varianten). */
  mitStandzeit: boolean;
  /** Nach jeder Änderung: neu berechnen und zeichnen. */
  geaendert(): void;
  melde(text: string, ok?: boolean): void;
}

/**
 * Perlenkette bearbeiten (Konzept: Linie als Perlenkette): Haltestellen und Wegpunkte per Klick auf die Karte oder per
 * Suche einfügen, verschieben, entfernen, eine Haltestelle ersetzen (zum Beispiel die Gegenhaltestelle), Standzeiten.
 * Neue Haltestellen und Wegpunkte lassen sich auch ohne Maus in der Kartenmitte setzen (Karte mit Pfeiltasten verschieben).
 */
export function perlenEditor(o: PerlenOptionen): { el: HTMLElement; zeichne(): void } {
  const u = linienUi();
  const id = o.fenster;
  let einfuegenNach: number | "ende" = "ende";
  let ersetzen: number | null = null;
  let art: Werkzeug = "halt";
  const frei = (hd: { coord: LonLat }) => freigeschaltet(u, hd.coord);

  const index = () => (einfuegenNach === "ende" ? o.perlen.length : einfuegenNach + 1);
  const nachEinfuegen = () => {
    if (einfuegenNach !== "ende") einfuegenNach++;
  };
  const fehlerText = (f: string) => t(`perle.fehler.${f}` as TextKey, W);

  function fuegeHalt(hid: HaltId) {
    if (ersetzen !== null) {
      const f = ersetzeHalt(o.perlen, ersetzen, u.halte, hid, frei);
      if (f) return o.melde(fehlerText(f));
      o.melde(t("perle.ersetzt", { name: u.halte.hole(hid)!.name }), true);
      ersetzen = null;
    } else {
      const f = fuegeHaltEin(o.perlen, u.halte, hid, frei, L, index());
      if (f) return o.melde(fehlerText(f));
      nachEinfuegen();
      o.melde(t("perle.eingefuegt", { name: u.halte.hole(hid)!.name || t("haltestelle.ohneName") }), true);
    }
    o.geaendert();
  }

  async function setzePunkt(p: LonLat) {
    if (art === "weg") {
      const snaps = await u.sim.fange(p, "weg");
      const f = fuegeWegpunktEin(o.perlen, snaps[0]?.point ?? p, snaps, index());
      if (f) return o.melde(fehlerText(f));
      nachEinfuegen();
      o.melde(t("perle.wegpunktGesetzt"), true);
      return o.geaendert();
    }
    if (art !== "neu") return;
    const snaps = await u.sim.fange(p, "halt");
    const strasse = snaps.length ? u.world.network.edges[snaps[0].edge].name : "";
    const name = neuName.value.trim() || strasse || t("haltestelle.neuName", { n: u.spiel.netz.naechsteHaltestelleId });
    const r = neueHaltestelle(u.spiel.netz, name, p, snaps, freigeschaltet(u, p), L);
    if (!r.ok) return o.melde(t(`haltestelle.fehler.${r.fehler}` as TextKey, W));
    neuName.value = "";
    const f = fuegeHaltEin(o.perlen, u.halte, r.halt.id, frei, L, index());
    if (f) {
      // Keine verwaiste neue Haltestelle zurücklassen
      loescheHaltestelle(u.spiel.netz, r.halt.id);
      return o.melde(fehlerText(f));
    }
    nachEinfuegen();
    o.melde(t("haltestelle.angelegt", { name: r.halt.name }), true);
    o.geaendert();
  }

  const aktiviere = () => setzeWerkzeug({ fenster: id, werkzeug: art, halt: fuegeHalt, punkt: (p) => void setzePunkt(p) });

  // Werkzeug für Klicks auf die Karte
  const werkzeuge = h("fieldset", { class: "werkzeuge-linie" }, h("legend", { text: t("perle.werkzeug") }));
  for (const w of ["halt", "neu", "weg", "aus"] as const) {
    const r = h("input", { type: "radio", name: `${id}-werkzeug`, id: `${id}-werkzeug-${w}`, value: w, checked: w === art, "data-testid": `${id}-werkzeug-${w}` });
    r.addEventListener("change", () => {
      art = w;
      ersetzen = null;
      aktiviere();
      zeichne();
    });
    werkzeuge.append(h("label", { class: "option", for: `${id}-werkzeug-${w}` }, r, t(`perle.werkzeug.${w}` as TextKey)));
  }
  const neuName = h("input", { type: "text", id: `${id}-neu-name`, "data-testid": `${id}-neu-name`, maxlength: L.nameMaxLaenge, autocomplete: "off" });
  const mitte = h("button", { type: "button", "data-testid": `${id}-kartenmitte`, text: t("perle.kartenmitte") });
  mitte.addEventListener("click", () => {
    const c = u.map.getCenter();
    void setzePunkt([c.lng, c.lat]);
  });
  const position = h("select", { id: `${id}-position`, "data-testid": `${id}-position` });
  position.addEventListener("change", () => (einfuegenNach = position.value === "ende" ? "ende" : Number(position.value)));
  const suche = h("input", { type: "search", id: `${id}-suche`, "data-testid": `${id}-suche`, autocomplete: "off", "aria-describedby": `${id}-suche-hilfe` });
  const treffer = h("ul", { class: "treffer", "data-testid": `${id}-treffer` });
  suche.addEventListener("input", () => zeigeTreffer());
  const liste = h("ol", { class: "perlen", "data-testid": `${id}-perlen` });
  const hinweis = h("p", { class: "hilfe", "aria-live": "polite", "data-testid": `${id}-hinweis` });

  function zeigeTreffer() {
    const q = suche.value.trim().toLowerCase();
    if (q.length < 2) return treffer.replaceChildren();
    const alle = u.halte.alle().filter((x) => x.name.toLowerCase().includes(q) && x.snaps.length);
    alle.sort((a, b) => a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id));
    const index = new HaltIndex(u.halte.alle());
    treffer.replaceChildren(
      ...alle.slice(0, 8).map((x) => {
        const k = h("button", { type: "button", class: "listeneintrag", "data-testid": `${id}-treffer-${x.id}`, text: `${x.name} (${lageText(u, x, index)}, ${x.id.startsWith("n") ? t("haltestelle.neu") : t("haltestelle.vorhanden")})` });
        k.addEventListener("click", () => fuegeHalt(x.id));
        return h("li", {}, k);
      }),
    );
    if (!alle.length) treffer.append(h("li", { class: "hilfe", text: t("perle.keineTreffer") }));
  }

  function zeichne() {
    const plan = o.plan();
    const halte = o.perlen.map((p, i) => (p.art === "halt" ? i : -1)).filter((i) => i >= 0);
    position.replaceChildren(
      h("option", { value: "ende", text: t("perle.amEnde"), selected: einfuegenNach === "ende" }),
      ...o.perlen.map((p, i) => h("option", { value: String(i), selected: einfuegenNach === i, text: t("perle.nach", { nr: i + 1, name: perlenName(p) }) })),
    );
    if (einfuegenNach !== "ende" && einfuegenNach >= o.perlen.length) einfuegenNach = "ende";
    hinweis.textContent = ersetzen !== null ? t("perle.ersetzenHinweis", { nr: ersetzen + 1 }) : t(`perle.hinweis.${art}` as TextKey, W);
    liste.replaceChildren(
      ...o.perlen.map((p, i) => {
        const knopf = (zeichen: string, label: TextKey, f: () => void, an = true) => {
          const k = h("button", { type: "button", "aria-label": t(label, { nr: i + 1 }), title: t(label, { nr: i + 1 }), disabled: !an, "data-testid": `${id}-perle-${i}-${label.split(".").pop()}`, text: zeichen });
          k.addEventListener("click", f);
          return k;
        };
        const zeile = h("li", { "data-testid": `${id}-perle-${i}` },
          h("span", { class: "perlensymbol", "aria-hidden": "true", text: t(p.art === "halt" ? "perle.symbolHalt" : "perle.symbolWeg") }),
          h("span", { class: "perlenname", text: p.art === "halt" ? perlenName(p) : t("perle.wegpunkt") }),
        );
        if (plan?.strecke.ohneNetz.includes(i)) zeile.append(h("span", { class: "schlecht", text: ` ⚠ ${t("perle.ohneNetz")}` }));
        if (p.art === "halt" && o.mitStandzeit) {
          const k = halte.indexOf(i);
          if (k > 0 && k < halte.length - 1) {
            const st = h("input", { type: "number", min: 0, max: L.standzeitMaxS, step: L.rundungS, value: p.standzeitS, class: "kurzzahl", "aria-label": t("perle.standzeit", { nr: i + 1 }), "data-testid": `${id}-standzeit-${i}` });
            st.addEventListener("change", () => {
              if (!setzeStandzeit(o.perlen, i, Number(st.value), L)) return o.melde(t("perle.standzeitFehler", { max: L.standzeitMaxS }));
              o.geaendert();
            });
            zeile.append(h("label", { class: "standzeit" }, t("perle.standzeitKurz"), st, t("perle.sekunden")));
          } else if (halte.length > 1) zeile.append(h("span", { class: "hilfe", text: ` ${t(k === 0 ? "perle.start" : "perle.endpunkt")}` }));
        }
        zeile.append(
          h("span", { class: "perlenknoepfe" },
            knopf("↑", "perle.hoch", () => (verschiebePerle(o.perlen, i, -1), o.geaendert()), i > 0),
            knopf("↓", "perle.runter", () => (verschiebePerle(o.perlen, i, 1), o.geaendert()), i < o.perlen.length - 1),
            p.art === "halt" ? knopf("⇄", "perle.ersetzen", () => ((ersetzen = i), (art = "halt"), aktiviere(), zeichne())) : null,
            knopf("✕", "perle.entfernen", () => {
              entfernePerle(o.perlen, i);
              if (einfuegenNach !== "ende" && einfuegenNach >= i) einfuegenNach = einfuegenNach > 0 ? einfuegenNach - 1 : "ende";
              o.geaendert();
            }),
          ),
        );
        const out: HTMLElement[] = [zeile];
        if (plan?.strecke.fehlt.includes(i)) out.push(h("li", { class: "schlecht lueckenzeile", "data-testid": `${id}-luecke-${i}`, text: `⚠ ${t("perle.keineRoute")}` }));
        return out;
      }).flat(),
    );
    if (!o.perlen.length) liste.append(h("li", { class: "hilfe", text: t("perle.leer") }));
    for (const w of ["halt", "neu", "weg", "aus"] as const) (werkzeuge.querySelector(`#${id}-werkzeug-${w}`) as HTMLInputElement).checked = w === art;
    mitte.disabled = art !== "neu" && art !== "weg";
  }

  function perlenName(p: Perle): string {
    if (p.art === "weg") return t("perle.wegpunkt");
    return u.halte.hole(p.halt)?.name || t("haltestelle.ohneName");
  }

  // Werkzeug sofort aktiv, solange kein anderes Fenster es benutzt
  if (!werkzeug()) aktiviere();
  const el = h("div", { class: "perleneditor" },
    werkzeuge,
    hinweis,
    h("div", { class: "zweispaltig breit-links" },
      h("label", { for: `${id}-position`, text: t("perle.position") }), position,
      h("label", { for: `${id}-neu-name`, text: t("perle.neuName") }), neuName,
    ),
    h("div", { class: "aktionen links" }, mitte),
    h("label", { for: `${id}-suche`, class: "fett", text: t("perle.suche") }), suche,
    h("p", { class: "hilfe", id: `${id}-suche-hilfe`, text: t("perle.sucheHilfe") }),
    treffer,
    liste,
  );
  el.addEventListener("focusin", () => {
    if (werkzeug()?.fenster !== id) aktiviere();
  });
  zeichne();
  return { el, zeichne };
}
