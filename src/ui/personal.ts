import { addDays } from "../calendar/civil";
import { config, type PersonalArt } from "../config";
import { t, tOder, type TextKey } from "../i18n";
import {
  erfahrungJahre, inProbezeit, kuendige, monatskostenVoll, schreibeAus, setzeLohn, sichtbareBewerber, stelleEin, stufeDerPerson, stufeFuer, stundenlohn, type Bewerber,
} from "../personal/personal";
import { h } from "./dom";
import { datum, euro, euroRund, zahl } from "./format";
import { beobachte, type SpielUi } from "./spielui";
import { oeffneFenster } from "./windows";

const p = config.personal;
export const artName = (a: PersonalArt) => t(`personal.art.${a}` as TextKey);
const qualiName = (q: string) => tOder(`personal.quali.${q}`, q);

const monatskosten = (eurH: number, wochenstunden: number) => monatskostenVoll(eurH, wochenstunden, p);

/** Personal: Personen, Stellen ausschreiben, Bewerber einstellen, kündigen, Lohntabelle. */
export function oeffnePersonal(ui: SpielUi): void {
  const meldung = h("p", { class: "meldung", "data-testid": "personal-meldung", role: "status" });
  const melde = (text: string, ok = false) => ((meldung.className = ok ? "erfolg" : "meldung"), (meldung.textContent = text));
  const personen = h("div", {});
  const ausschreibungen = h("div", {});
  const lohn = h("div", {});
  const bestaetige = new Set<number>();

  // Stelle ausschreiben
  const art = h("select", { id: "p-art", "data-testid": "personal-art" }, ...p.arten.map((a) => h("option", { value: a, text: artName(a) })));
  const stunden = h("input", { id: "p-stunden", type: "number", min: p.wochenstundenMin, max: p.wochenstundenMax, step: 1, value: p.wochenstundenStandard, "data-testid": "personal-stunden" });
  const ausschreiben = h("button", { type: "button", class: "primaer", "data-testid": "personal-ausschreiben", text: t("personal.ausschreiben") });
  ausschreiben.addEventListener("click", () => {
    const e = schreibeAus(ui.spiel.personal, art.value as PersonalArt, Number(stunden.value), ui.spiel.zeit, ui.spiel.zufall, p);
    if (!e.ok) return melde(t("personal.fehler.wochenstunden", { min: p.wochenstundenMin, max: p.wochenstundenMax }));
    melde(t("personal.ausgeschrieben", { art: artName(e.ausschreibung.art), min: p.bewerbung.wartezeitTageMin, max: p.bewerbung.wartezeitTageMax }), true);
    zeichne();
  });

  function zeichnePersonen() {
    const liste = ui.spiel.personal.personen;
    const jetzt = ui.spiel.zeit;
    personen.replaceChildren(
      h("h3", { text: t("personal.personen", { n: liste.length }) }),
      liste.length
        ? h("div", { class: "rollen kurz" }, h("table", { class: "tabelle", "data-testid": "personal-tabelle" },
          h("thead", {}, h("tr", {}, ...(["personal.spalte.name", "personal.spalte.art", "personal.spalte.erfahrung", "personal.spalte.lohn", "personal.spalte.stunden",
            "personal.spalte.kosten", "personal.spalte.eintritt", "personal.spalte.zufriedenheit", "personal.spalte.gesundheit", "personal.spalte.quali",
            "personal.spalte.status", "personal.spalte.aktion"] as TextKey[]).map((x) => h("th", { text: t(x) })))),
          h("tbody", {}, ...liste.map((x) => {
            const eurH = stundenlohn(ui.spiel.personal, x, jetzt, p);
            const status = x.austritt !== null ? t("personal.gekuendigtZum", { datum: datum(addDays(x.austritt, -1)) }) : inProbezeit(x, jetzt, p) ? t("personal.probezeit") : t("personal.aktiv");
            const knopf = h("button", { type: "button", "data-testid": `personal-kuendigen-${x.id}`, disabled: x.austritt !== null, text: t(bestaetige.has(x.id) ? "personal.kuendigenJa" : "personal.kuendigen") });
            knopf.addEventListener("click", () => {
              if (!bestaetige.has(x.id)) return (bestaetige.add(x.id), zeichne());
              bestaetige.delete(x.id);
              const e = kuendige(ui.spiel.personal, x.id, ui.spiel.zeit, p);
              melde(e.ok ? t("personal.gekuendigt", { name: x.name, datum: datum(addDays(e.austritt, -1)) }) : t(`personal.fehler.${e.fehler}` as TextKey), e.ok);
              zeichne();
            });
            return h("tr", { "data-testid": `person-${x.id}` },
              h("td", { text: x.name }),
              h("td", { text: artName(x.art) }),
              h("td", { text: t("personal.erfahrung", { jahre: Math.floor(erfahrungJahre(x, jetzt)), stufe: stufeDerPerson(x, jetzt, p) }) }),
              h("td", { class: "zahl", text: t("personal.eurH", { n: euro(eurH) }) }),
              h("td", { class: "zahl", text: String(x.wochenstunden) }),
              h("td", { class: "zahl", text: euroRund(monatskosten(eurH, x.wochenstunden)) }),
              h("td", { text: datum(x.eintritt) }),
              h("td", { class: "zahl", text: t("personal.prozent", { n: x.zufriedenheit }) }),
              h("td", { class: "zahl", text: t("personal.prozent", { n: x.gesundheit }) }),
              h("td", { class: "hilfe", text: x.qualifikationen.map(qualiName).join(", ") }),
              h("td", { text: status }),
              h("td", {}, knopf),
            );
          }))))
        : h("p", { class: "hilfe", text: t("personal.keine") }),
    );
  }

  function bewerberZeile(aId: number, a: PersonalArt, std: number, b: Bewerber) {
    const stufe = stufeFuer(b.erfahrungJahre, a, p);
    const eurH = ui.spiel.personal.lohntabelle[a][stufe - 1];
    const knopf = h("button", { type: "button", class: "primaer", "data-testid": `bewerber-einstellen-${b.id}`, text: t("personal.einstellen") });
    knopf.addEventListener("click", () => {
      const e = stelleEin(ui.spiel.personal, aId, b.id, ui.spiel.zeit);
      melde(e.ok ? t("personal.eingestellt", { name: e.person.name, art: artName(e.person.art) }) : t(`personal.fehler.${e.fehler}` as TextKey), e.ok);
      zeichne();
    });
    return h("tr", { "data-testid": `bewerber-${b.id}` },
      h("td", { text: b.name }),
      h("td", { text: t("personal.erfahrung", { jahre: b.erfahrungJahre, stufe }) }),
      h("td", { class: "zahl", text: t("personal.eurH", { n: euro(eurH) }) }),
      h("td", { class: "zahl", text: euroRund(monatskosten(eurH, std)) }),
      h("td", { class: "zahl", text: t("personal.prozent", { n: b.zufriedenheit }) }),
      h("td", { class: "zahl", text: t("personal.prozent", { n: b.gesundheit }) }),
      h("td", { class: "hilfe", text: b.qualifikationen.map(qualiName).join(", ") }),
      h("td", {}, knopf),
    );
  }

  function zeichneAusschreibungen() {
    const jetzt = ui.spiel.zeit;
    const liste = ui.spiel.personal.ausschreibungen;
    ausschreibungen.replaceChildren(
      h("h3", { text: t("personal.stellen") }),
      h("div", { class: "zweispaltig" },
        h("label", { for: "p-art", text: t("personal.art") }), art,
        h("label", { for: "p-stunden", text: t("personal.wochenstunden", { min: p.wochenstundenMin, max: p.wochenstundenMax }) }), stunden),
      h("div", { class: "aktionen" }, ausschreiben),
      ...liste.map((a) => {
        const sichtbar = sichtbareBewerber(a, jetzt);
        return h("div", { "data-testid": `ausschreibung-${a.id}` },
          h("p", { class: "fett", text: t("personal.ausschreibung", { art: artName(a.art), stunden: a.wochenstunden, bis: datum(addDays(a.ende, -1)), n: sichtbar.length }) }),
          sichtbar.length
            ? h("table", { class: "tabelle" },
              h("thead", {}, h("tr", {}, ...(["personal.spalte.name", "personal.spalte.erfahrung", "personal.spalte.lohn", "personal.spalte.kosten", "personal.spalte.zufriedenheit", "personal.spalte.gesundheit", "personal.spalte.quali", "personal.spalte.aktion"] as TextKey[]).map((x) => h("th", { text: t(x) })))),
              h("tbody", {}, ...sichtbar.map((b) => bewerberZeile(a.id, a.art, a.wochenstunden, b))))
            : h("p", { class: "hilfe", text: t("personal.nochKeineBewerber") }),
        );
      }),
    );
  }

  function zeichneLohn() {
    const zeilen = p.arten.map((a) => {
      const felder = ui.spiel.personal.lohntabelle[a].map((eurH, i) => {
        const inp = h("input", { type: "number", min: 0.01, step: 0.01, value: eurH, "data-testid": `lohn-${a}-${i + 1}`, "aria-label": t("personal.lohnFeld", { art: artName(a), stufe: i + 1 }), style: "width:70px" });
        inp.addEventListener("change", () => {
          const ok = setzeLohn(ui.spiel.personal, a, i + 1, Number(inp.value), p);
          melde(ok ? t("personal.lohnGesetzt", { art: artName(a), stufe: i + 1, n: euro(Number(inp.value)) }) : t("personal.fehler.lohn"), ok);
          zeichne();
        });
        return h("td", {}, inp);
      });
      return h("tr", {}, h("td", { text: artName(a) }), ...felder);
    });
    lohn.replaceChildren(
      h("h3", { text: t("personal.lohntabelle") }),
      h("p", { class: "hilfe", text: t("personal.lohnHilfe", { anteil: zahl(p.arbeitgeberAnteil * 100), sonder: euroRund(p.jahressonderzahlungEur) }) }),
      h("div", { class: "rollen kurz" }, h("table", { class: "tabelle", "data-testid": "lohntabelle" },
        h("thead", {}, h("tr", {}, h("th", { text: t("personal.spalte.art") }), ...p.stufeAbJahren.map((j, i) => h("th", { text: t("personal.stufeKopf", { stufe: i + 1, jahre: j }) })))),
        h("tbody", {}, ...zeilen))),
    );
  }

  function zeichne() {
    zeichnePersonen();
    zeichneAusschreibungen();
    zeichneLohn();
  }
  zeichne();
  oeffneFenster("personal", t("personal.titel"), h("div", {}, personen, ausschreibungen, meldung, lohn), { links: true, breit: true });
  // Neue Bewerber erscheinen mit der Spielzeit (nicht während der Bedienung, siehe aktualisiereFenster)
  beobachte("personal", () => (zeichnePersonen(), zeichneAusschreibungen()));
}
