import { t } from "../i18n";
import { h } from "./dom";

/** Fenster über der Karte. Esc schließt das zuletzt geöffnete. */
const offen: { id: string; el: HTMLElement; zurueck: Element | null; geschlossen?: () => void }[] = [];

let ebene = 10;

export function oeffneFenster(id: string, titel: string, inhalt: Node, opt: { links?: boolean; breit?: boolean; mittel?: boolean; geschlossen?: () => void } = {}): HTMLElement {
  schliesseFenster(id);
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
  offen.push({ id, el, zurueck, geschlossen: opt.geschlossen });
  el.focus();
  return el;
}

export function schliesseFenster(id?: string): boolean {
  const i = id === undefined ? offen.length - 1 : offen.findIndex((f) => f.id === id);
  if (i < 0) return false;
  const [f] = offen.splice(i, 1);
  f.el.remove();
  f.geschlossen?.();
  if (f.zurueck instanceof HTMLElement) f.zurueck.focus();
  return true;
}

export function istOffen(id: string): boolean {
  return offen.some((f) => f.id === id);
}

export function offeneFenster(): number {
  return offen.length;
}
