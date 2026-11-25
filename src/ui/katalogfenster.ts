import type { KatalogErgebnis, Meldung } from "../catalog/katalog";
import { t, type TextKey } from "../i18n";
import { h } from "./dom";
import { oeffneFenster } from "./windows";

/** Text einer Katalogmeldung aus der Sprachdatei. */
export function katalogMeldungText(m: Meldung): string {
  return t(`katalog.${m.code}` as TextKey, { zeile: m.zeile ?? "", spalte: m.spalte ?? "", modell: m.modellId ?? "", wert: m.wert ?? "" });
}

/** Zeile für die Testansicht (F3). */
export function katalogStatus(k: KatalogErgebnis): string {
  const fehler = k.meldungen.filter((m) => m.schwere === "fehler").length;
  const hinweise = k.meldungen.length - fehler;
  return t("status.katalog", { modelle: k.modelle.length, zeilen: k.zeilenGesamt, fehler, hinweise });
}

/** Fehler der Testansicht: höchstens einige Zeilen, damit sie lesbar bleibt. */
export function katalogFehlerZeilen(k: KatalogErgebnis, max = 10): string[] {
  const f = k.meldungen.filter((m) => m.schwere === "fehler").map(katalogMeldungText);
  return f.length > max ? [...f.slice(0, max), t("status.katalogMehr", { n: f.length - max })] : f;
}

/** Fenster beim Start, nur wenn der Katalog Fehler enthält. Hinweise stehen nur in der Testansicht. */
export function zeigeKatalogFehler(k: KatalogErgebnis): boolean {
  const fehler = k.meldungen.filter((m) => m.schwere === "fehler");
  if (!fehler.length) return false;
  oeffneFenster(
    "katalog",
    t("katalog.fenster.titel"),
    h("div", {},
      h("p", { text: t("katalog.fenster.text", { modelle: k.modelle.length, zeilen: k.zeilenGesamt }) }),
      h("ul", { class: "rollen kurz", "data-testid": "katalog-fehler" }, ...fehler.map((m) => h("li", { text: katalogMeldungText(m) }))),
    ),
  );
  return true;
}
