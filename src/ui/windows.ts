import { t } from "../i18n";
import { h } from "./dom";

/** Fenster über der Karte. Esc schließt das zuletzt geöffnete. */
const offen: { id: string; el: HTMLElement; zurueck: Element | null }[] = [];

export function oeffneFenster(id: string, titel: string, inhalt: Node, opt: { links?: boolean } = {}): HTMLElement {
  schliesseFenster(id);
  const zurueck = document.activeElement;
  const schliessen = h("button", { type: "button", "aria-label": t("fenster.schliessen"), title: t("fenster.schliessen"), "data-testid": "fenster-schliessen", text: "✕" });
  const el = h("section", { class: opt.links ? "fenster links" : "fenster", role: "dialog", "aria-labelledby": `${id}-titel`, "data-testid": `fenster-${id}`, tabindex: -1 },
    h("header", {}, h("h2", { id: `${id}-titel`, text: titel }), schliessen),
    inhalt,
  );
  schliessen.addEventListener("click", () => schliesseFenster(id));
  document.body.append(el);
  offen.push({ id, el, zurueck });
  el.focus();
  return el;
}

export function schliesseFenster(id?: string): boolean {
  const i = id === undefined ? offen.length - 1 : offen.findIndex((f) => f.id === id);
  if (i < 0) return false;
  const [f] = offen.splice(i, 1);
  f.el.remove();
  if (f.zurueck instanceof HTMLElement) f.zurueck.focus();
  return true;
}

export function istOffen(id: string): boolean {
  return offen.some((f) => f.id === id);
}

export function offeneFenster(): number {
  return offen.length;
}
