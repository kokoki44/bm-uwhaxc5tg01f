import { config } from "../config";
import { pruefeSetup, type SetupGeprueft } from "../game/setup";
import { t } from "../i18n";
import { h } from "./dom";
import { datum } from "./format";

const datumZeit = (ms: number) => {
  const d = new Date(ms);
  return `${datum(ms)} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export type SetupErgebnis =
  | {
      werte: SetupGeprueft;
      /** Bytes der eigenen Datei; bei Norderstedt null. */
      datei: ArrayBuffer | null;
    }
  | { weiter: true; datei: ArrayBuffer | null };

/** Kurzinfo zum automatisch gespeicherten Stand für "Weiterspielen". */
export interface GespeicherterStand {
  firma: string;
  gemeinde: string;
  zeit: number;
  /** Dateiname des eigenen Auszugs; dann muss die Datei erneut gewählt werden (Karten werden nicht gespeichert). */
  datei: string | null;
}

/** Einrichtungsdialog (Konzept, Spielstart Schritt 1). Liefert die geprüften Eingaben oder "Weiterspielen". */
export function zeigeSetup(stand: GespeicherterStand | null = null, hinweis = ""): Promise<SetupErgebnis> {
  return new Promise((resolve) => {
    const c = config.setup;
    const radioN = h("input", { type: "radio", name: "gemeinde", value: "norderstedt", id: "g-norderstedt", checked: true });
    const radioD = h("input", { type: "radio", name: "gemeinde", value: "datei", id: "g-datei" });
    const datei = h("input", { type: "file", id: "g-dateiwahl", accept: ".json,.gz,application/json,application/gzip", disabled: true, "aria-describedby": "g-datei-hilfe" });
    const kapital = h("input", { type: "number", id: "s-kapital", min: c.startkapitalMin, step: "1", value: c.startkapitalStandard, inputmode: "numeric", "aria-describedby": "s-kapital-hilfe" });
    const name = h("input", { type: "text", id: "s-name", maxlength: c.firmennameMaxLaenge, autocomplete: "off" });
    const farbe = h("input", { type: "color", id: "s-farbe", value: c.firmenfarbeStandard });
    const fehlerEl = (id: string) => h("p", { class: "fehler", id, hidden: true, role: "alert" });
    const f = { gemeinde: fehlerEl("f-gemeinde"), startkapital: fehlerEl("f-kapital"), firmenname: fehlerEl("f-name"), firmenfarbe: fehlerEl("f-farbe") };
    const starten = h("button", { type: "submit", class: "primaer", "data-testid": "setup-starten", text: t("setup.starten") });

    const weiterBereich = h("div", {});
    if (stand) {
      const weiter = h("button", { type: "button", class: "primaer", "data-testid": "setup-weiter", text: t("setup.weiter") });
      const weiterFehler = fehlerEl("f-weiter");
      weiter.addEventListener("click", async () => {
        const gewaehlt = datei.files?.[0] ?? null;
        if (stand.datei && !gewaehlt) {
          radioD.checked = true;
          datei.disabled = false;
          weiterFehler.hidden = false;
          weiterFehler.textContent = t("setup.weiterDatei", { datei: stand.datei });
          return;
        }
        const bytes = stand.datei && gewaehlt ? await gewaehlt.arrayBuffer() : null;
        dlg.close();
        dlg.remove();
        resolve({ weiter: true, datei: bytes });
      });
      weiterBereich.append(
        h("fieldset", { class: "weiterspielen", "data-testid": "setup-stand" },
          h("legend", { text: t("setup.stand") }),
          h("p", { text: t("setup.standText", { firma: stand.firma, gemeinde: stand.gemeinde, datum: datumZeit(stand.zeit) }) }),
          stand.datei ? h("p", { class: "hilfe", text: t("setup.standDatei", { datei: stand.datei }) }) : null,
          h("div", { class: "aktionen" }, weiter),
          weiterFehler,
          h("p", { class: "hilfe", text: t("setup.neuErsetzt") }),
        ),
      );
    }
    if (hinweis) weiterBereich.append(h("p", { class: "fehler", role: "alert", "data-testid": "setup-hinweis", text: hinweis }));

    const form = h("form", { method: "dialog", novalidate: true },
      h("h1", { id: "setup-titel", text: t("setup.titel") }),
      weiterBereich,
      h("fieldset", {},
        h("legend", { text: t("setup.gemeinde") }),
        h("label", { class: "option", for: "g-norderstedt" }, radioN, t("setup.gemeinde.norderstedt")),
        h("label", { class: "option", for: "g-datei" }, radioD, t("setup.gemeinde.datei")),
        h("label", { for: "g-dateiwahl", text: t("setup.datei") }), datei,
        h("p", { class: "hilfe", id: "g-datei-hilfe", text: t("setup.datei.hilfe") }),
        f.gemeinde,
      ),
      h("label", { for: "s-kapital", text: t("setup.startkapital") }), kapital,
      h("p", { class: "hilfe", id: "s-kapital-hilfe", text: t("setup.startkapital.hilfe") }), f.startkapital,
      h("label", { for: "s-name", text: t("setup.firmenname") }), name, f.firmenname,
      h("label", { for: "s-farbe", text: t("setup.firmenfarbe") }), farbe, f.firmenfarbe,
      h("div", { class: "aktionen" }, starten),
    );
    const dlg = h("dialog", { class: "dialog", "aria-labelledby": "setup-titel", "data-testid": "setup" }, form);
    // Der Einrichtungsdialog ist Pflicht: Esc schließt ihn nicht
    dlg.addEventListener("cancel", (e) => e.preventDefault());
    for (const r of [radioN, radioD]) r.addEventListener("change", () => (datei.disabled = !radioD.checked));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const gewaehlt = radioD.checked ? (datei.files?.[0] ?? null) : null;
      const ergebnis = pruefeSetup(
        {
          gemeinde: radioN.checked ? { art: "norderstedt" } : gewaehlt ? { art: "datei", dateiname: gewaehlt.name } : null,
          startkapital: kapital.value,
          firmenname: name.value,
          firmenfarbe: farbe.value,
        },
        c,
      );
      for (const [k, el] of Object.entries(f)) {
        const key = ergebnis.ok ? undefined : ergebnis.fehler[k as keyof typeof f];
        el.hidden = !key;
        el.textContent = key ? t(key) : "";
      }
      kapital.setAttribute("aria-invalid", String(!ergebnis.ok && !!ergebnis.fehler.startkapital));
      name.setAttribute("aria-invalid", String(!ergebnis.ok && !!ergebnis.fehler.firmenname));
      if (!ergebnis.ok) return;
      // Bis Etappe 4b gibt es nur einen Speicherplatz: ein neues Spiel überschreibt ihn erst nach Rückfrage (Vorgabe: Abbrechen)
      if (stand && !(await bestaetigeUeberschreiben(dlg))) return;
      const bytes = gewaehlt ? await gewaehlt.arrayBuffer() : null;
      dlg.close();
      dlg.remove();
      resolve({ werte: ergebnis.werte, datei: bytes });
    });

    document.body.append(dlg);
    dlg.showModal();
    name.focus();
  });
}

/** Rückfrage vor dem Überschreiben des gespeicherten Stands. Abbrechen hat den Fokus, Esc bricht ebenfalls ab. */
function bestaetigeUeberschreiben(eltern: HTMLDialogElement): Promise<boolean> {
  return new Promise((resolve) => {
    const abbrechen = h("button", { type: "button", "data-testid": "ueberschreiben-abbrechen", text: t("setup.ueberschreibenAbbrechen") });
    const ja = h("button", { type: "button", "data-testid": "ueberschreiben-ja", text: t("setup.ueberschreibenJa") });
    const dlg = h("dialog", { class: "dialog", role: "alertdialog", "aria-labelledby": "ueberschreiben-titel", "aria-describedby": "ueberschreiben-text", "data-testid": "ueberschreiben" },
      h("h2", { id: "ueberschreiben-titel", text: t("setup.ueberschreibenTitel") }),
      h("p", { id: "ueberschreiben-text", text: t("setup.ueberschreibenText") }),
      h("div", { class: "aktionen" }, abbrechen, ja),
    );
    const ende = (ok: boolean) => {
      dlg.close();
      dlg.remove();
      resolve(ok);
    };
    abbrechen.addEventListener("click", () => ende(false));
    ja.addEventListener("click", () => ende(true));
    dlg.addEventListener("cancel", (e) => (e.preventDefault(), ende(false)));
    eltern.append(dlg);
    dlg.showModal();
    abbrechen.focus();
  });
}

/** Ladeanzeige mit Fortschritt. */
export function zeigeLaden(): { setze(text: string, anteil: number): void; fehler(text: string, zurueck: () => void): void; schliessen(): void } {
  const text = h("p", { id: "laden-text", "aria-live": "polite" });
  const balken = h("progress", { max: 1, value: 0, "aria-labelledby": "laden-text" });
  const dlg = h("dialog", { class: "dialog", "aria-labelledby": "laden-titel", "data-testid": "laden" }, h("h1", { id: "laden-titel", text: t("laden.titel") }), text, balken);
  dlg.addEventListener("cancel", (e) => e.preventDefault());
  document.body.append(dlg);
  dlg.showModal();
  return {
    setze(s, anteil) {
      text.textContent = s;
      balken.value = anteil;
    },
    fehler(s, zurueck) {
      text.textContent = s;
      text.setAttribute("role", "alert");
      balken.remove();
      const knopf = h("button", { type: "button", class: "primaer", text: t("fehler.zurueck") });
      knopf.addEventListener("click", () => {
        dlg.close();
        dlg.remove();
        zurueck();
      });
      dlg.append(h("div", { class: "aktionen" }, knopf));
      knopf.focus();
    },
    schliessen() {
      dlg.close();
      dlg.remove();
    },
  };
}
