import { config } from "../config";
import { pruefeSetup, type SetupGeprueft } from "../game/setup";
import { t } from "../i18n";
import { h } from "./dom";

export interface SetupErgebnis {
  werte: SetupGeprueft;
  /** Bytes der eigenen Datei; bei Norderstedt null. */
  datei: ArrayBuffer | null;
}

/** Einrichtungsdialog (Konzept, Spielstart Schritt 1). Liefert die geprüften Eingaben. */
export function zeigeSetup(): Promise<SetupErgebnis> {
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

    const form = h("form", { method: "dialog", novalidate: true },
      h("h1", { id: "setup-titel", text: t("setup.titel") }),
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
