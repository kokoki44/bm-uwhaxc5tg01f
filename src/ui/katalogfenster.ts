import type { KatalogErgebnis, Meldung } from "../catalog/katalog";
import type { OptionenErgebnis, OptionenMeldung } from "../catalog/optionen";
import { config } from "../config";
import { t, type TextKey } from "../i18n";
import { h } from "./dom";
import { oeffneFenster } from "./windows";

/** Text einer Katalogmeldung aus der Sprachdatei. */
export function katalogMeldungText(m: Meldung): string {
  // Eine leere Kopfzelle hat keinen Namen: lesbar statt leer melden
  const spalte = m.spalte === "" ? t("katalog.leererName") : (m.spalte ?? "");
  return t(`katalog.${m.code}` as TextKey, { zeile: m.zeile ?? "", spalte, modell: m.modellId ?? "", wert: m.wert ?? "", soll: config.catalog.columnCount });
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

/** Text einer Meldung der Optionsdatei. */
export function optionenMeldungText(m: OptionenMeldung): string {
  const spalte = m.spalte === "" ? t("katalog.leererName") : (m.spalte ?? "");
  return t(`optionen.${m.code}` as TextKey, { zeile: m.zeile ?? "", spalte, option: m.modellId ?? "", wert: m.wert ?? "", datei: config.optionen.fileName });
}

/** Zeilen der Testansicht (F3) zur Optionsdatei. */
export function optionenStatus(o: OptionenErgebnis, max = 10): string[] {
  const f = o.meldungen.filter((m) => m.schwere === "fehler").map(optionenMeldungText);
  const kopf = t("status.optionen", { optionen: o.optionen.length, fehler: f.length, datei: config.optionen.fileName });
  return [kopf, ...(f.length > max ? [...f.slice(0, max), t("status.katalogMehr", { n: f.length - max })] : f)];
}

/** Fenster beim Start, nur wenn die Optionsdatei Fehler enthält (wie beim Katalog). */
export function zeigeOptionenFehler(o: OptionenErgebnis): boolean {
  const fehler = o.meldungen.filter((m) => m.schwere === "fehler");
  if (!fehler.length) return false;
  oeffneFenster(
    "optionen",
    t("optionen.fenster.titel"),
    h("div", {},
      h("p", { text: t("optionen.fenster.text", { optionen: o.optionen.length, datei: config.optionen.fileName }) }),
      h("ul", { class: "rollen kurz", "data-testid": "optionen-fehler" }, ...fehler.map((m) => h("li", { text: optionenMeldungText(m) }))),
    ),
  );
  return true;
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
