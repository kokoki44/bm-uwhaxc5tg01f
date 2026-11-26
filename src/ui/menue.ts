import { t, type TextKey } from "../i18n";
import { h } from "./dom";

/** Bereiche der Menüleiste, die es schon gibt (Konzept: Oberfläche und Bedienung). Weitere kommen mit ihren Etappen. */
export type Bereich = "linien" | "dienste" | "fahrzeuge" | "fahrzeugmarkt" | "personal" | "betriebshof";
const BEREICHE: Bereich[] = ["linien", "dienste", "fahrzeuge", "fahrzeugmarkt", "personal", "betriebshof"];

/** Menüleiste am Rand. Alle Knöpfe sind normale Schaltflächen und damit per Tastatur erreichbar. */
export function baueMenueleiste(aktion: (b: Bereich) => void): void {
  const nav = document.getElementById("menueleiste")!;
  nav.setAttribute("aria-label", t("menue.titel"));
  nav.replaceChildren(
    ...BEREICHE.map((b) => {
      const k = h("button", { type: "button", "data-testid": `menu-${b}` }, h("span", { "aria-hidden": "true", text: `${t(`menue.zeichen.${b}` as TextKey)} ` }), t(`menue.${b}` as TextKey));
      k.addEventListener("click", () => aktion(b));
      return k;
    }),
  );
}
