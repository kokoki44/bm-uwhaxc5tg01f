import { tagesInfo } from "../calendar/calendar";
import { parts, type CivilMs } from "../calendar/civil";
import { config, schulferien } from "../config";
import { t, type TextKey } from "../i18n";
import { h } from "./dom";

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const zwei = (n: number) => String(n).padStart(2, "0");

/** Datum und Uhrzeit im Format "Di 24.11.2026 14:05". */
export function formatZeit(ms: CivilMs): string {
  const p = parts(ms);
  return `${t(`wochentag.${p.wochentag}` as TextKey)} ${zwei(p.tag)}.${zwei(p.monat)}.${p.jahr} ${zwei(p.stunde)}:${zwei(p.minute)}`;
}

export interface Kopfleiste {
  setzeZeit(ms: CivilMs): void;
  setzeTempo(tempo: number): void;
  setzeKontostand(eur: number): void;
}

/** Kopfleiste (Konzept: Kontostand, Datum und Uhrzeit, Zeitsteuerung). */
export function baueKopfleiste(
  firma: { name: string; farbe: string },
  region: string | null,
  suedhalbkugel: boolean,
  aktionen: { tempo(stufe: 0 | 1 | 2 | 3 | 4): void; hilfe(): void },
): Kopfleiste {
  const root = document.getElementById("kopfleiste")!;
  root.replaceChildren();
  const konto = h("span", { "data-testid": "kontostand" });
  const zeit = h("span", { "data-testid": "uhrzeit" });
  const tagText = h("span", { class: "klein", "data-testid": "tagesinfo" });
  const knoepfe = config.sim.speeds.map((s, i) => {
    const b = h("button", {
      type: "button",
      "data-testid": `tempo-${s}`,
      "aria-pressed": "false",
      title: i === 0 ? t("kopf.pause.hilfe") : t("kopf.tempo.hilfe", { tempo: s, taste: i }),
      text: i === 0 ? `⏸ ${t("kopf.pause")}` : `▶ ${t("kopf.tempo", { tempo: s })}`,
    });
    b.addEventListener("click", () => aktionen.tempo(i as 0 | 1 | 2 | 3 | 4));
    return b;
  });
  const hilfe = h("button", { type: "button", "data-testid": "hilfe", text: `? ${t("kopf.hilfe")}` });
  hilfe.addEventListener("click", aktionen.hilfe);
  root.append(
    h("div", { class: "firma" }, h("span", { class: "farbfeld", style: `background:${firma.farbe}`, "aria-hidden": "true" }), firma.name),
    h("div", { class: "feld" }, h("span", { class: "klein", text: t("kopf.kontostand") }), konto),
    h("div", { class: "feld" }, zeit, tagText),
    h("div", { id: "zeitsteuerung", role: "group", "aria-label": t("kopf.zeitsteuerung") }, ...knoepfe),
    h("div", { style: "margin-left:auto" }, hilfe),
  );
  document.body.classList.add("im-spiel");

  let letzterTag = "";
  return {
    setzeZeit(ms) {
      zeit.textContent = formatZeit(ms);
      const info = tagesInfo(ms, region, schulferien, suedhalbkugel);
      if (info.datum === letzterTag) return;
      letzterTag = info.datum;
      const teile = [t(`jahreszeit.${info.jahreszeit}` as TextKey)];
      if (info.feiertag) teile.push(t("kopf.feiertag", { name: info.feiertag }));
      if (info.schulferien) teile.push(t("kopf.ferien", { name: info.schulferien }));
      tagText.textContent = teile.join(" · ");
    },
    setzeTempo(tempo) {
      knoepfe.forEach((b, i) => b.setAttribute("aria-pressed", String(config.sim.speeds[i] === tempo)));
      zeit.title = tempo === 0 ? t("kopf.pausiert") : "";
    },
    setzeKontostand(eur) {
      konto.textContent = euro.format(eur);
    },
  };
}
