import { t } from "../i18n";
import { h } from "./dom";

/** Fenster über der Karte. Esc schließt das zuletzt geöffnete. */
const offen: { id: string; el: HTMLElement; zurueck: Element | null; geschlossen?: () => void; vorSchliessen?: () => boolean }[] = [];

let ebene = 10;

export function oeffneFenster(
  id: string,
  titel: string,
  inhalt: Node,
  opt: { links?: boolean; breit?: boolean; mittel?: boolean; geschlossen?: () => void; vorSchliessen?: () => boolean } = {},
): HTMLElement {
  schliesseFenster(id, true);
  const zurueck = document.activeElement;
  const schliessen = h("button", { type: "button", "aria-label": t("fenster.schliessen"), title: t("fenster.schliessen"), "data-testid": "fenster-schliessen", text: "✕" });
  const klasse = ["fenster", opt.links ? "links" : "", opt.breit ? "breit" : "", opt.mittel ? "mittel" : ""].filter(Boolean).join(" ");
  const el = h("section", { class: klasse, role: "dialog", "aria-labelledby": `${id}-titel`, "data-testid": `fenster-${id}`, tabindex: -1 },
    h("header", {}, h("h2", { id: `${id}-titel`, text: titel }), schliessen),
    inhalt,
  );
  schliessen.addEventListener("click", () => schliesseFenster(id));
  // Ein Fenster, das angeklickt wird oder den Fokus bekommt, liegt oben
  const nachVorn = () => {
    if (el.style.zIndex !== String(ebene)) el.style.zIndex = String(++ebene);
  };
  el.addEventListener("pointerdown", nachVorn);
  el.addEventListener("focusin", nachVorn);
  nachVorn();
  document.body.append(el);
  offen.push({ id, el, zurueck, geschlossen: opt.geschlossen, vorSchliessen: opt.vorSchliessen });
  el.focus();
  return el;
}

/**
 * Schließt ein Fenster (ohne Id das zuletzt geöffnete). Ein Fenster mit `vorSchliessen` kann das Schließen ablehnen
 * (zum Beispiel ungespeicherte Änderungen: erst nachfragen); `erzwingen` übergeht das.
 */
export function schliesseFenster(id?: string, erzwingen = false): boolean {
  const i = id === undefined ? offen.length - 1 : offen.findIndex((f) => f.id === id);
  if (i < 0) return false;
  if (!erzwingen && offen[i].vorSchliessen && !offen[i].vorSchliessen!()) return true;
  const [f] = offen.splice(i, 1);
  f.el.remove();
  f.geschlossen?.();
  if (f.zurueck instanceof HTMLElement) f.zurueck.focus();
  return true;
}

/** Darf das Fenster ohne Rückfrage ersetzt werden? Zeigt sonst dessen Hinweis (zum Beispiel ungespeicherte Änderungen). */
export function darfErsetzen(id: string): boolean {
  const f = offen.find((x) => x.id === id);
  return !f?.vorSchliessen || f.vorSchliessen();
}

export function istOffen(id: string): boolean {
  return offen.some((f) => f.id === id);
}

export function offeneFenster(): number {
  return offen.length;
}
