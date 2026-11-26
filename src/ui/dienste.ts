import { config, PLAN_TAGE, schulferien, type PlanTag } from "../config";
import { bereichBisAbloesung, entferneStueck, entwurfVon, freieBereiche, fuegeStueckHinzu, loescheDienst, neuerEntwurf, restDesUmlaufs, setzeEigeneFerienDienste, speichereDienst } from "../dienste/dienste";
import { fahrtKey, wirksameDienste, type Auswertung, type LinieDaten, type TagesAuswertung } from "../dienste/pruefung";
import type { Dienst, FahrtRef } from "../dienste/typen";
import { grundtagVon, istFerientag, uhrzeit } from "../linien/fahrplan";
import { planTag } from "../linien/tagesart";
import { t, type TextKey } from "../i18n";
import { h } from "./dom";
import { artText, befundText, diensteConfig as C, linienFuer, pruefeEntwurf, pruefFehler, regelwerk, regimeText, stunden, tagesAuswertung } from "./dienstbereich";
import { linienUi } from "./linienbereich";
import { linienSchild, tagName } from "./linien";
import { beobachte } from "./spielui";
import { darfErsetzen, istOffen, oeffneFenster } from "./windows";

/* ---------- Hilfen ---------- */

const ref = (f: FahrtRef) => `${f.variante}:${f.schluessel}`;

/** Fahrt eines Umlaufs mit Zeiten und Orten. */
function fahrtInfo(l: LinieDaten, f: FahrtRef) {
  const x = l.fahrten.find((y) => y.variante === f.variante && y.schluessel === f.schluessel)!;
  const v = l.varianten.find((y) => y.id === f.variante)!;
  return { ...x, start: v.start?.name ?? "", ziel: v.ziel?.name ?? "" };
}

/** Wer hat die Fahrt? Dienstnummer, "Entwurf" oder null (frei). */
function belegung(l: LinieDaten, f: FahrtRef, ta: TagesAuswertung | null, entwurf: Dienst | null): string | null {
  if (entwurf?.stuecke.some((s) => s.linie === l.linie && s.fahrten.some((x) => ref(x) === ref(f)))) return t("dienst.imEntwurf");
  return ta?.besetzt.get(fahrtKey(l.linie, f)) ?? null;
}

const meldungsfeld = (testid: string) => {
  const el = h("p", { class: "meldung", role: "status", "data-testid": testid });
  return { el, melde: (text: string, ok = false) => ((el.className = ok ? "erfolg" : "meldung"), (el.textContent = text)) };
};

/** Zuletzt im Dienstplan gewählte Tagesart. */
let gewaehlterTag: PlanTag | null = null;

/** Tagesart von heute (Betriebstag). */
export function heute(): PlanTag {
  const u = linienUi();
  return planTag(u.spiel.zeit, u.world.gemeinde.region, schulferien, config.linien).tag;
}

/* ---------- Zeitleiste ---------- */

/** Zeitleiste aller Umläufe einer Tagesart: Fahrten als Balken, belegte in der Linienfarbe mit Dienstnummer, freie schraffiert. */
function zeitleiste(tag: PlanTag, ta: TagesAuswertung | null, klick: (linie: number, umlauf: number, index: number) => void): HTMLElement {
  const u = linienUi();
  const linien = linienFuer(tag);
  const box = h("div", { class: "zeitleiste", "data-testid": "zeitleiste" });
  if (!linien.length) return (box.append(h("p", { class: "hilfe", text: t("dienste.keineFahrten") })), box);
  let von = Infinity, bis = -Infinity;
  for (const l of linien)
    for (const um of l.umlaeufe) {
      von = Math.min(von, (um.ausrueck?.abHofS ?? fahrtInfo(l, um.fahrten[0]).abfahrtS) - C.vorbereitungS);
      bis = Math.max(bis, um.einrueck?.anHofS ?? fahrtInfo(l, um.fahrten[um.fahrten.length - 1]).ankunftS);
    }
  von = Math.floor(von / 3600) * 3600;
  bis = Math.ceil(bis / 3600) * 3600;
  const pos = (s: number) => `${(((s - von) / (bis - von)) * 100).toFixed(3)}%`;
  const skala = h("div", { class: "zeitskala", "aria-hidden": "true" });
  for (let s = von; s <= bis; s += 3600) skala.append(h("span", { style: `left:${pos(s)}`, text: uhrzeit(s) }));
  box.append(skala);
  for (const l of linien) {
    const linie = u.spiel.netz.linien.find((x) => x.id === l.linie)!;
    l.umlaeufe.forEach((um, k) => {
      const frei = um.fahrten.filter((f) => !belegung(l, f, ta, null));
      const leiste = h("div", { class: "leiste", "aria-hidden": "true" });
      um.fahrten.forEach((f, i) => {
        const x = fahrtInfo(l, f);
        const dienst = belegung(l, f, ta, null);
        const titel = t("dienste.balken", { ab: uhrzeit(x.abfahrtS), an: uhrzeit(x.ankunftS), von: x.start, nach: x.ziel, dienst: dienst ?? t("dienste.frei") });
        const b = h("span", { class: dienst ? "balken belegt" : "balken frei", style: `left:${pos(x.abfahrtS)};width:${pos(von + x.ankunftS - x.abfahrtS)};--linienfarbe:${linie.farbe}`, title: titel, "data-testid": `balken-${l.linie}-${k}-${i}` });
        // Maus nur zusätzlich: Klick wählt die Fahrt im offenen Dienst-Editor
        b.addEventListener("click", () => klick(l.linie, k, i));
        leiste.append(b);
      });
      const bereiche = freieBereiche(um, frei);
      const freiText = frei.length
        ? t("dienste.freiZeile", { n: frei.length, bereiche: bereiche.map(([a, b]) => t("dienste.bereich", { von: uhrzeit(fahrtInfo(l, um.fahrten[a]).abfahrtS), bis: uhrzeit(fahrtInfo(l, um.fahrten[b]).ankunftS) })).join(", ") })
        : t("dienste.allesBelegt");
      box.append(
        h("div", { class: "zeitzeile", "data-testid": `zeitzeile-${l.linie}-${k}` },
          h("span", { class: "zeitlabel" }, linienSchild(linie), " ", t("dienste.umlauf", { n: k + 1 }), k >= l.busse ? ` ${t("dienste.ohneBus")}` : ""),
          leiste,
          h("span", { class: frei.length ? "zeitfrei warnung" : "zeitfrei ok", "data-testid": `zeitzeile-${l.linie}-${k}-frei`, text: freiText }),
        ),
      );
    });
  }
  return box;
}

/* ---------- Dienstplan ---------- */

/** Menüpunkt "Dienste": Tagesart wählen, Zeitleiste der Umläufe mit freien Fahrten, Liste der Dienste. */
export function oeffneDienste(): void {
  const u = linienUi();
  let tag: PlanTag = gewaehlterTag ?? heute();
  const { el: meldung, melde } = meldungsfeld("dienste-meldung");
  const tagWahl = h("select", { id: "dienste-tag", "data-testid": "dienste-tag" }, ...PLAN_TAGE.map((x) => h("option", { value: x, selected: x === tag, text: tagName(x) })));
  tagWahl.addEventListener("change", () => ((tag = gewaehlterTag = tagWahl.value as PlanTag), zeichne()));
  const ferien = h("input", { type: "checkbox", id: "dienste-ferien", "data-testid": "dienste-ferien" });
  const ferienLabel = h("label", { class: "option", for: "dienste-ferien" }, ferien, h("span", { "data-testid": "dienste-ferien-text" }));
  ferien.addEventListener("change", () => {
    setzeEigeneFerienDienste(u.spiel.dienste, grundtagVon(tag), ferien.checked);
    zeichne();
  });
  const neu = h("button", { type: "button", class: "primaer", "data-testid": "dienst-neu", text: t("dienste.neu") });
  neu.addEventListener("click", () => oeffneDienst(neuerEntwurf(u.spiel.dienste, tag), false));
  const kopf = h("div", { "data-testid": "dienste-kopf" });
  const leiste = h("div", {});
  const koerper = h("tbody", {});

  function zeichne() {
    const ta = tagesAuswertung(tag);
    const eigene = !istFerientag(tag) || u.spiel.dienste.eigeneFerienDienste[grundtagVon(tag)];
    ferienLabel.hidden = !istFerientag(tag);
    ferien.checked = istFerientag(tag) && u.spiel.dienste.eigeneFerienDienste[grundtagVon(tag)];
    ferienLabel.querySelector("span")!.textContent = t("dienste.eigeneFerien", { tag: tagName(grundtagVon(tag)) });
    neu.disabled = !eigene || !regelwerk.regelwerk;
    const linien = linienFuer(tag);
    const gesamt = linien.reduce((s, l) => s + l.fahrten.length, 0);
    const frei = ta ? Object.values(ta.frei).reduce((s, x) => s + x.length, 0) : null;
    kopf.replaceChildren(
      h("p", { "data-testid": "dienste-regelwerk", class: "hilfe", text: regelwerk.regelwerk ? t("dienste.regelwerk", { name: regelwerk.regelwerk.name, stand: regelwerk.regelwerk.stand }) : t("dienste.regelwerkFehlt", { datei: regelwerk.datei }) }),
      h("p", { "data-testid": "dienste-frei", class: frei ? "warnung" : "ok", text: frei === null ? t("dienste.wirdGeprueft") : frei ? `⚠ ${t("dienste.freiGesamt", { frei, gesamt })}` : `✔ ${t("dienste.alleBelegt", { gesamt })}` }),
      eigene ? h("span", {}) : h("p", { class: "hilfe", "data-testid": "dienste-ferien-hinweis", text: t("dienste.ferienWie", { tag: tagName(grundtagVon(tag)) }) }),
      pruefFehler(tag) ? h("p", { class: "schlecht", text: t("dienste.pruefFehler", { grund: pruefFehler(tag)! }) }) : h("span", {}),
    );
    leiste.replaceChildren(zeitleiste(tag, ta, (linie, umlauf, index) => waehleImEditor(linie, umlauf, index)));
    const dienste = wirksameDienste(u.spiel.dienste, tag).sort((a, b) => a.nummer.localeCompare(b.nummer, "de", { numeric: true }));
    koerper.replaceChildren(
      ...dienste.map((d) => {
        const a = ta?.dienste.find((x) => x.dienstId === d.id) ?? null;
        const bearbeiten = h("button", { type: "button", "data-testid": `dienst-${d.id}-bearbeiten`, text: t("dienste.bearbeiten"), disabled: !eigene });
        bearbeiten.addEventListener("click", () => oeffneDienst(entwurfVon(d), true));
        const weg = h("button", { type: "button", "data-halten": "", "data-testid": `dienst-${d.id}-loeschen`, text: t("dienste.loeschen"), disabled: !eigene });
        let sicher = false;
        weg.addEventListener("click", () => {
          if (!sicher) return ((sicher = true), (weg.textContent = t("dienste.loeschenBestaetigen")));
          loescheDienst(u.spiel.dienste, d.id);
          melde(t("dienste.geloescht", { nummer: d.nummer }), true);
          zeichne();
        });
        return h("tr", { "data-testid": `dienst-${d.id}` },
          h("th", { scope: "row", text: d.nummer }),
          h("td", { text: a ? artText(a.art) : "" }),
          h("td", { class: "zahl", text: a?.elemente.length ? uhrzeit(a.beginnS) : "" }),
          h("td", { class: "zahl", text: a?.elemente.length ? uhrzeit(a.endeS) : "" }),
          h("td", { class: "zahl", text: a ? stunden(a.lenkS) : "" }),
          h("td", { class: "zahl", text: a ? stunden(a.arbeitS) : "" }),
          h("td", { class: !a ? "" : a.gueltig ? (a.warnungen.length ? "warnung" : "ok") : "schlecht", "data-testid": `dienst-${d.id}-status`, text: !a ? t("dienste.wirdGeprueft") : a.gueltig ? (a.warnungen.length ? `⚠ ${t("dienste.mitWarnungen", { n: a.warnungen.length })}` : `✔ ${t("dienste.gueltig")}`) : `⚠ ${t("dienste.ungueltig")}: ${a.verstoesse.map(befundText).join(" ")}` }),
          h("td", {}, bearbeiten, " ", weg),
        );
      }),
    );
    if (!dienste.length) koerper.append(h("tr", {}, h("td", { colspan: 8, text: t("dienste.keine") })));
  }

  const fenster = oeffneFenster("dienste", t("dienste.titel"), h("div", { class: "dienstplan" },
    h("div", { class: "aktionen links" }, h("label", { for: "dienste-tag", text: t("linie.tagesart") }), tagWahl, ferienLabel, neu),
    kopf,
    meldung,
    h("details", { open: true },
      h("summary", { class: "fett", text: t("dienste.zeitleiste") }),
      h("p", { class: "hilfe", text: t("dienste.zeitleisteHilfe") }),
      leiste,
    ),
    h("h3", { text: t("dienste.liste") }),
    h("div", { class: "rollen" },
      h("table", { class: "tabelle", "data-testid": "dienste-tabelle" },
        h("thead", {}, h("tr", {}, ...["dienste.nummer", "dienste.art", "dienste.beginn", "dienste.ende", "dienste.lenkzeit", "dienste.arbeitszeit", "dienste.status", ""].map((k) => h("th", { scope: "col", text: k ? t(k as TextKey) : "" })))),
        koerper,
      ),
    ),
  ), { links: true, breit: true });
  beobachte("dienste", () => zeichne());
  zeichne();
  void fenster;
}

/* ---------- Dienst-Editor ---------- */

let editorWahl: ((linie: number, umlauf: number, index: number) => void) | null = null;
function waehleImEditor(linie: number, umlauf: number, index: number) {
  if (istOffen("dienst")) editorWahl?.(linie, umlauf, index);
}

/**
 * Einen Dienst bearbeiten: Fahrten aus Umläufen hinzufügen (Auswahllisten und Knöpfe, ohne Maus bedienbar), sofortige
 * Prüfung im Worker mit Regel, Wert, Grenze und Quelle; nur ein regelgerechter Dienst lässt sich speichern.
 */
export function oeffneDienst(entwurf: Dienst, gespeichert: boolean): void {
  // Ein offener Entwurf mit ungespeicherten Änderungen wird nicht ohne Hinweis ersetzt (F10, Regression Prüfung 3c-1)
  if (istOffen("dienst") && !darfErsetzen("dienst")) return;
  const u = linienUi();
  const tag = entwurf.tag;
  let geaendert = !gespeichert;
  let letzte: { a: Auswertung; stand: string } | null = null;
  let verwerfen = false;
  const { el: meldung, melde } = meldungsfeld("dienst-meldung");
  const nummer = h("input", { type: "text", id: "dienst-nummer", "data-testid": "dienst-nummer", value: entwurf.nummer, maxlength: C.nummerMaxLaenge, class: "kurztext" });
  // Jede Änderung setzt die Rückfrage zurück: Das nächste Schließen zeigt wieder erst den Hinweis
  nummer.addEventListener("input", () => ((entwurf.nummer = nummer.value), (geaendert = true), (verwerfen = false)));

  const linieWahl = h("select", { id: "dienst-linie", "data-testid": "dienst-linie" });
  const umlaufWahl = h("select", { id: "dienst-umlauf", "data-testid": "dienst-umlauf" });
  const vonWahl = h("select", { id: "dienst-von", "data-testid": "dienst-von" });
  const bisWahl = h("select", { id: "dienst-bis", "data-testid": "dienst-bis" });
  const abloesung = h("select", { id: "dienst-abloesung", "data-testid": "dienst-abloesung" });
  const hinzu = h("button", { type: "button", "data-testid": "dienst-hinzufuegen", text: t("dienst.hinzufuegen") });
  const ganz = h("button", { type: "button", "data-testid": "dienst-ganzer-umlauf", text: t("dienst.ganzerUmlauf") });
  const bisAbl = h("button", { type: "button", "data-testid": "dienst-bis-abloesung", text: t("dienst.bisAbloesung") });
  const rest = h("button", { type: "button", "data-testid": "dienst-rest", text: t("dienst.rest") });
  const speichern = h("button", { type: "button", class: "primaer", "data-testid": "dienst-speichern", text: t("dienst.speichern") });
  const stueckListe = h("ol", { class: "stuecke", "data-testid": "dienst-stuecke" });
  const auswertungEl = h("div", { "data-testid": "dienst-auswertung", "aria-live": "polite" });

  const linien = () => linienFuer(tag);
  const aktLinie = () => linien().find((l) => String(l.linie) === linieWahl.value) ?? linien()[0];
  const aktUmlauf = () => aktLinie()?.umlaeufe[Number(umlaufWahl.value) || 0];

  function fuelleWahl() {
    const ta = tagesAuswertung(tag);
    const ls = linien();
    const lw = linieWahl.value;
    linieWahl.replaceChildren(...ls.map((l) => h("option", { value: String(l.linie), selected: String(l.linie) === lw, text: t("dienst.linieOption", { nummer: l.nummer }) })));
    const l = aktLinie();
    const uw = umlaufWahl.value;
    umlaufWahl.replaceChildren(
      ...(l?.umlaeufe ?? []).map((um, k) => {
        const frei = um.fahrten.filter((f) => !belegung(l!, f, ta, entwurf)).length;
        const a = fahrtInfo(l!, um.fahrten[0]), b = fahrtInfo(l!, um.fahrten[um.fahrten.length - 1]);
        return h("option", { value: String(k), selected: String(k) === uw, text: t("dienst.umlaufOption", { n: k + 1, von: uhrzeit(a.abfahrtS), bis: uhrzeit(b.ankunftS), frei }) });
      }),
    );
    const um = aktUmlauf();
    const opts = (alt: string, start: number) =>
      (um?.fahrten ?? []).map((f, i) => {
        const x = fahrtInfo(l!, f);
        const wer = belegung(l!, f, ta, entwurf);
        return h("option", { value: String(i), selected: alt ? String(i) === alt : i === start, text: t("dienst.fahrtOption", { ab: uhrzeit(x.abfahrtS), von: x.start, an: uhrzeit(x.ankunftS), nach: x.ziel, wer: wer ?? t("dienste.frei") }) });
      });
    const ersteFrei = Math.max(0, (um?.fahrten ?? []).findIndex((f) => !belegung(l!, f, ta, entwurf)));
    const vw = vonWahl.value, bw = bisWahl.value;
    vonWahl.replaceChildren(...opts(vw, ersteFrei));
    bisWahl.replaceChildren(...opts(bw, (um?.fahrten.length ?? 1) - 1));
    const aw = abloesung.value;
    // Ablösung nur an Wendepunkten: nach jeder Fahrt außer der letzten des Umlaufs
    abloesung.replaceChildren(
      ...(um?.fahrten.slice(0, -1) ?? []).map((f, i) => {
        const x = fahrtInfo(l!, f);
        return h("option", { value: String(i), selected: String(i) === aw, text: t("dienst.abloesungOption", { an: uhrzeit(x.ankunftS, true), ort: x.ziel }) });
      }),
    );
    const leer = !l || !um;
    for (const k of [hinzu, ganz, bisAbl]) k.disabled = leer;
    bisAbl.disabled = leer || !abloesung.options.length;
  }

  function nachAenderung(text: string) {
    geaendert = true;
    verwerfen = false;
    melde(text, true);
    void pruefen();
  }

  function fuegeHinzu(von: number, bis: number) {
    const l = aktLinie(), k = Number(umlaufWahl.value) || 0;
    if (!l || von > bis || !fuegeStueckHinzu(entwurf, l, k, von, bis)) return melde(t("dienst.bereichUngueltig"));
    const um = l.umlaeufe[k];
    nachAenderung(t("dienst.hinzugefuegt", { n: bis - von + 1, von: uhrzeit(fahrtInfo(l, um.fahrten[von]).abfahrtS), bis: uhrzeit(fahrtInfo(l, um.fahrten[bis]).ankunftS) }));
  }
  hinzu.addEventListener("click", () => fuegeHinzu(Number(vonWahl.value), Number(bisWahl.value)));
  ganz.addEventListener("click", () => fuegeHinzu(0, (aktUmlauf()?.fahrten.length ?? 1) - 1));
  bisAbl.addEventListener("click", () => {
    const l = aktLinie(), um = aktUmlauf();
    if (!l || !um) return;
    const ta = tagesAuswertung(tag);
    // Der zusammenhängende freie Bereich (nicht in einem anderen Dienst, nicht schon im Entwurf), der an der Ablösung endet
    const b = bereichBisAbloesung(um, um.fahrten.filter((f) => !belegung(l, f, ta, entwurf)), Number(abloesung.value));
    if (!b) return melde(t("dienst.keinFreierAnfang"));
    fuegeHinzu(b[0], b[1]);
  });
  for (const s of [linieWahl, umlaufWahl]) s.addEventListener("change", () => ((vonWahl.value = bisWahl.value = abloesung.value = ""), fuelleWahl()));
  rest.addEventListener("click", () => {
    if (geaendert) return melde(t("dienst.erstSpeichern"));
    const ta = tagesAuswertung(tag);
    // Nach dem zeitlich letzten Stück des Dienstes, im selben Umlauf (Regression Prüfung 3c-1)
    const r = restDesUmlaufs(entwurf, linien(), (l) => l.fahrten.filter((f) => !belegung(l, f, ta, entwurf)));
    if (!r) return melde(t("dienst.keinRest"));
    const neu = neuerEntwurf(u.spiel.dienste, tag);
    fuegeStueckHinzu(neu, r.linie, r.umlaufNr, r.von, r.bis);
    oeffneDienst(neu, false);
  });
  speichern.addEventListener("click", async () => {
    const a = await pruefen();
    const f = speichereDienst(u.spiel.dienste, entwurf, a?.a ?? null, a?.stand ?? null, C);
    if (f === "regelverstoss") return melde(t("dienst.fehler.regelverstoss", { gruende: a!.a.verstoesse.map(befundText).join(" ") }));
    if (f) return melde(t(`dienst.fehler.${f}` as TextKey, { max: C.nummerMaxLaenge }));
    geaendert = false;
    melde(t("dienst.gespeichert", { nummer: entwurf.nummer.trim() }), true);
    zeichne();
  });

  const wahl = (linie: number, k: number, i: number) => {
    linieWahl.value = String(linie);
    fuelleWahl();
    umlaufWahl.value = String(k);
    vonWahl.value = bisWahl.value = "";
    fuelleWahl();
    vonWahl.value = bisWahl.value = String(i);
    vonWahl.focus();
  };

  async function pruefen(): Promise<{ a: Auswertung; stand: string } | null> {
    if (!regelwerk.regelwerk) return null;
    const stand = JSON.stringify(entwurf.stuecke);
    try {
      const a = await pruefeEntwurf(structuredClone(entwurf));
      if (stand === JSON.stringify(entwurf.stuecke)) letzte = { a, stand };
    } catch (e) {
      melde(t("dienste.pruefFehler", { grund: String(e instanceof Error ? e.message : e) }));
    }
    zeichne();
    return letzte && letzte.stand === stand ? letzte : null;
  }

  function zeichne() {
    fuelleWahl();
    const ls = linien();
    stueckListe.replaceChildren(
      ...entwurf.stuecke.map((st, i) => {
        const l = ls.find((x) => x.linie === st.linie);
        const linie = u.spiel.netz.linien.find((x) => x.id === st.linie);
        const k = l?.umlaeufe.findIndex((um) => um.fahrten.some((f) => ref(f) === ref(st.fahrten[0]))) ?? -1;
        const da = l && k >= 0 && st.fahrten.every((f) => l.fahrten.some((x) => ref(x) === ref(f)));
        const a = da ? fahrtInfo(l!, st.fahrten[0]) : null, b = da ? fahrtInfo(l!, st.fahrten[st.fahrten.length - 1]) : null;
        const weg = h("button", { type: "button", "aria-label": t("dienst.stueckEntfernen", { nr: i + 1 }), title: t("dienst.stueckEntfernen", { nr: i + 1 }), "data-testid": `dienst-stueck-${i}-entfernen`, text: "✕" });
        weg.addEventListener("click", () => (entferneStueck(entwurf, i), nachAenderung(t("dienst.stueckEntfernt"))));
        return h("li", { "data-testid": `dienst-stueck-${i}` },
          linie ? linienSchild(linie) : "", " ",
          a && b ? t("dienst.stueck", { umlauf: k + 1, n: st.fahrten.length, ab: uhrzeit(a.abfahrtS), von: a.start, an: uhrzeit(b.ankunftS, true), nach: b.ziel }) : t("dienst.stueckFehlt"),
          " ", weg,
        );
      }),
    );
    if (!entwurf.stuecke.length) stueckListe.append(h("li", { class: "hilfe", text: t("dienst.keineStuecke") }));
    const a = letzte && letzte.stand === JSON.stringify(entwurf.stuecke) ? letzte.a : null;
    if (!regelwerk.regelwerk) {
      auswertungEl.replaceChildren(h("p", { class: "schlecht", text: t("dienste.regelwerkFehlt", { datei: regelwerk.datei }) }));
      speichern.disabled = true;
      return;
    }
    if (!a) return auswertungEl.replaceChildren(h("p", { class: "hilfe", text: t("dienste.wirdGeprueft") }));
    const zeile = (k: TextKey, v: string, id: string) => h("tr", {}, h("th", { scope: "row", text: t(k) }), h("td", { "data-testid": `dienst-${id}`, text: v }));
    auswertungEl.replaceChildren(
      h("p", { "data-testid": "dienst-ergebnis", class: a.gueltig ? (a.warnungen.length ? "warnung" : "ok") : "schlecht", text: a.gueltig ? `✔ ${t("dienst.speicherbar")}` : `⚠ ${t("dienst.nichtSpeicherbar")}` }),
      a.verstoesse.length ? h("ul", { class: "schlecht", role: "alert", "data-testid": "dienst-verstoesse" }, ...a.verstoesse.map((b) => h("li", { text: befundText(b) }))) : h("span", {}),
      a.warnungen.length ? h("ul", { class: "warnung", "data-testid": "dienst-warnungen" }, ...a.warnungen.map((b) => h("li", { text: `${t("dienst.warnung")} ${befundText(b)}` }))) : h("span", {}),
      h("table", { class: "tabelle kompakt" },
        h("tbody", {},
          zeile("dienst.wert.art", artText(a.art), "art"),
          zeile("dienst.wert.zeit", a.elemente.length ? t("dienste.bereich", { von: uhrzeit(a.beginnS, true), bis: uhrzeit(a.endeS, true) }) : "", "zeit"),
          zeile("dienst.wert.lenkzeit", stunden(a.lenkS), "lenkzeit"),
          zeile("dienst.wert.arbeitszeit", stunden(a.arbeitS), "arbeitszeit"),
          zeile("dienst.wert.pausen", stunden(a.pauseS), "pausen"),
          zeile("dienst.wert.unterbrechungen", stunden(a.unterbrechungS), "unterbrechungen"),
          zeile("dienst.wert.schicht", stunden(a.schichtS), "schicht"),
          zeile("dienst.wert.regel", regimeText(a.regime), "regel"),
        ),
      ),
      h("details", {},
        h("summary", { text: t("dienst.ablauf") }),
        h("table", { class: "tabelle kompakt", "data-testid": "dienst-ablauf" },
          h("thead", {}, h("tr", {}, ...["dienst.ablauf.art", "dienst.ablauf.von", "dienst.ablauf.bis", "dienst.ablauf.dauer", "dienst.ablauf.zaehlt"].map((k) => h("th", { scope: "col", text: t(k as TextKey) })))),
          h("tbody", {},
            ...a.elemente.map((e) =>
              h("tr", {},
                h("td", { text: t(`dienst.element.${e.art}` as TextKey) + (e.ort ? `, ${e.ort}` : "") }),
                h("td", { class: "zahl", text: uhrzeit(e.vonS, true) }),
                h("td", { class: "zahl", text: uhrzeit(e.bisS, true) }),
                h("td", { class: "zahl", text: stunden(e.bisS - e.vonS) }),
                h("td", { text: [e.lenk ? t("dienst.zaehlt.lenk") : "", e.arbeit ? t("dienst.zaehlt.arbeit") : "", !e.arbeit ? t("dienst.zaehlt.pause") : ""].filter(Boolean).join(", ") }),
              ),
            ),
          ),
        ),
      ),
    );
    speichern.disabled = false;
  }

  const fenster = oeffneFenster("dienst", t(gespeichert ? "dienst.titel" : "dienst.titelNeu", { nummer: entwurf.nummer, tag: tagName(tag) }), h("div", { class: "diensteditor" },
    h("div", { class: "zweispaltig breit-links" }, h("label", { for: "dienst-nummer", text: t("dienst.nummer") }), nummer),
    h("h3", { text: t("dienst.stuecke") }),
    stueckListe,
    h("details", { open: true },
      h("summary", { class: "fett", text: t("dienst.fahrtenWaehlen") }),
      h("p", { class: "hilfe", text: t("dienst.hilfe") }),
      h("div", { class: "zweispaltig breit-links" },
        h("label", { for: "dienst-linie", text: t("dienst.linie") }), linieWahl,
        h("label", { for: "dienst-umlauf", text: t("dienst.umlauf") }), umlaufWahl,
        h("label", { for: "dienst-von", text: t("dienst.von") }), vonWahl,
        h("label", { for: "dienst-bis", text: t("dienst.bis") }), bisWahl,
      ),
      h("div", { class: "aktionen links" }, hinzu, ganz),
      h("div", { class: "zweispaltig breit-links" }, h("label", { for: "dienst-abloesung", text: t("dienst.abloesung") }), abloesung),
      h("div", { class: "aktionen links" }, bisAbl, rest),
    ),
    h("h3", { text: t("dienst.pruefung") }),
    auswertungEl,
    meldung,
    h("div", { class: "aktionen" }, speichern),
  ), {
    mittel: true,
    vorSchliessen: () => {
      if (!geaendert || verwerfen) return true;
      verwerfen = true;
      melde(t("dienst.ungespeichert"));
      return false;
    },
    // Nur die eigene Auswahl abmelden: Ein neuer Editor ersetzt den alten, dessen Schließen darf ihn nicht abmelden
    geschlossen: () => {
      if (editorWahl === wahl) editorWahl = null;
    },
  });
  editorWahl = wahl;
  beobachte("dienst", () => zeichne());
  zeichne();
  void pruefen();
  void fenster;
}
