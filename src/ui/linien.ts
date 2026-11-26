import { config, PLAN_TAGE, schulferien, type PlanTag } from "../config";
import { t, type TextKey } from "../i18n";
import { fahrtZeiten, grundtagVon, istFerientag, leseUhrzeit, taktQuelle, uhrzeit, type Fahrt, type Grundtag } from "../linien/fahrplan";
import {
  aendereLinie, benenneHaltestelle, benenneVariante, entferneBus, entferneZusatz, erzeugeRichtungen, fuegeFahrtHinzu, legeKurzlaeuferAn, legeLinieAn,
  linieVonBus, loescheHaltestelle, loescheLinie, loescheVariante, setzeAktiv, setzeEigenenFerientakt, setzeTakt, setzeWendezeit, stelleFahrtWiederHer,
  streicheFahrt, taktVorlage, verschiebeFahrt, verschiebeZusatz, vorschlagFarbe, weiseBusZu,
} from "../linien/linien";
import type { LinienPlan } from "../linien/plan";
import { passtZurLinie, type PassWarnung } from "../linien/pruefung";
import { planTag } from "../linien/tagesart";
import type { HaltId, Linie, TaktZeile, Variante } from "../linien/typen";
import { h } from "./dom";
import { datum, zahl } from "./format";
import { berechne, berechnungsFehler, fahrzeitSpanne, freigeschaltet, GRUNDLINIE, lageText, linienUi, variantenPlaene, waehleAus, zoomeAufLinie, type LinienUi } from "./linienbereich";
import { perlenEditor } from "./perlen";
import { tagesAuswertung } from "./dienstbereich";
import { fahrtKey } from "../dienste/pruefung";
import { beobachte, modellName } from "./spielui";
import { istOffen, oeffneFenster, schliesseFenster } from "./windows";

const L = config.linien;
/** Werte aus der Konfiguration für Platzhalter in Texten. */
const W = { radius: config.stops.fangradiusM, beginn: L.betriebstagBeginnH };

/* ---------- Hilfen ---------- */

export const dauer = (s: number): string => (s >= 60 ? t("zeit.minSek", { m: Math.floor(s / 60), s: String(s % 60).padStart(2, "0") }) : t("zeit.sek", { s }));
const km = (m: number) => t("linien.km", { km: zahl(Math.round(m / 100) / 10) });
export const tagName = (tag: PlanTag) => t(`tagesart.${tag}` as TextKey);
/** Text in Einzahl ("Es fehlt 1 Bus") oder Mehrzahl ("Es fehlen 2 Busse"). */
const mz = (key: "linien.fuhrparkZuKlein" | "linien.zuWenigBusse" | "linie.fehlenBusse", n: number, werte: Record<string, string | number> = {}) => t((n === 1 ? `${key}Eins` : key) as TextKey, { n, ...werte });

/** Liniennummer als Farbschild mit Text (Information nicht nur über Farbe). */
export function linienSchild(l: Pick<Linie, "nummer" | "farbe" | "aktiv">): HTMLElement {
  return h("span", { class: `linienschild${l.aktiv ? "" : " inaktiv"}`, style: `--linienfarbe:${l.farbe}`, text: l.nummer });
}

/** Fokus nach dem Neuzeichnen wiederherstellen (gleiche testid), damit die Tastaturbedienung nicht springt. */
function mitFokus(fenster: HTMLElement, zeichne: () => void): void {
  const a = document.activeElement as HTMLElement | null;
  const id = a && fenster.contains(a) ? a.getAttribute("data-testid") : null;
  zeichne();
  if (id) (fenster.querySelector(`[data-testid="${CSS.escape(id)}"]`) as HTMLElement | null)?.focus();
}

const meldungsfeld = (testid: string) => {
  const el = h("p", { class: "meldung", role: "status", "data-testid": testid });
  return { el, melde: (text: string, ok = false) => ((el.className = ok ? "erfolg" : "meldung"), (el.textContent = text)) };
};

export function bedarf(p: LinienPlan | undefined): Record<PlanTag, number> {
  return Object.fromEntries(PLAN_TAGE.map((tag) => [tag, p?.tage[tag].busbedarf ?? 0])) as Record<PlanTag, number>;
}

/** Tagesart mit dem größten Bedarf und der Bedarf dort. */
export function hoechsterBedarf(b: Record<PlanTag, number>): { tag: PlanTag; busse: number } {
  let best: { tag: PlanTag; busse: number } = { tag: "werktag", busse: 0 };
  for (const tag of PLAN_TAGE) if (b[tag] > best.busse) best = { tag, busse: b[tag] };
  return best;
}

/** Namen der Varianten, die wegen einer Lücke in der Route keine Fahrten erzeugen (Grundlinie zählt nicht). */
function lueckenVarianten(l: Linie, plan: LinienPlan | undefined): string[] {
  const ohne = new Set(variantenPlaene(plan).filter((v) => !v.vollstaendig).map((v) => v.id));
  return l.varianten.filter((v) => ohne.has(v.id)).map((v) => v.name);
}

function warnungText(w: PassWarnung): string {
  if (w.code === "lang") return t("linie.passt.lang", { laenge: zahl(w.laengeM), klassen: w.klassen.map((k) => t(`strassenklasse.${k}` as TextKey)).join(", "), max: zahl(L.engLaengeM) });
  if (w.code === "wendekreis") return t("linie.passt.wendekreis", { wk: zahl(w.wendekreisM), max: zahl(L.wendekreisMaxM) });
  return t("linie.passt.wendekreisFehlt");
}

/* ---------- Linienliste ---------- */

/** Menüpunkt "Linien": alle Linien mit Busbedarf, Warnungen und neuer Linie. */
export function oeffneLinien(): void {
  const u = linienUi();
  const koerper = h("tbody", {});
  const kopf = h("div", { "data-testid": "linien-fuhrpark" });
  const { el: meldung, melde } = meldungsfeld("linien-meldung");
  const nummer = h("input", { type: "text", id: "neu-nummer", "data-testid": "neu-nummer", maxlength: L.nummerMaxLaenge, autocomplete: "off", class: "kurztext" });
  const name = h("input", { type: "text", id: "neu-name", "data-testid": "neu-name", maxlength: L.nameMaxLaenge, autocomplete: "off" });
  const farbe = h("input", { type: "color", id: "neu-farbe", "data-testid": "neu-farbe", value: vorschlagFarbe(u.spiel.netz, L) });
  const anlegen = h("button", { type: "submit", class: "primaer", "data-testid": "linie-anlegen", text: t("linien.anlegen") });
  const form = h("form", { class: "neue-linie" },
    h("h3", { text: t("linien.neu") }),
    h("div", { class: "zweispaltig breit-links" },
      h("label", { for: "neu-nummer", text: t("linie.nummer") }), nummer,
      h("label", { for: "neu-name", text: t("linie.name") }), name,
      h("label", { for: "neu-farbe", text: t("linie.farbe") }), farbe,
    ),
    h("p", { class: "hilfe", text: t("linie.nummerHilfe", { max: L.nummerMaxLaenge }) }),
    h("div", { class: "aktionen" }, anlegen),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const r = legeLinieAn(u.spiel.netz, { nummer: nummer.value, name: name.value, farbe: farbe.value }, L);
    if (!r.ok) return melde(t(`linie.fehler.${r.fehler}` as TextKey));
    nummer.value = name.value = "";
    farbe.value = vorschlagFarbe(u.spiel.netz, L);
    melde(t("linien.angelegt", { nummer: r.linie.nummer }), true);
    void berechne(r.linie.id);
    oeffneLinie(r.linie.id);
  });

  function zeichne() {
    const fuhrpark = u.spiel.fuhrpark.busse.length;
    const summe = Object.fromEntries(PLAN_TAGE.map((tag) => [tag, u.spiel.netz.linien.reduce((s, l) => s + bedarf(u.plaene.get(l.id))[tag], 0)])) as Record<PlanTag, number>;
    const max = hoechsterBedarf(summe);
    const heute = planTag(u.spiel.zeit, u.world.gemeinde.region, schulferien, L);
    // Freie Fahrten (ohne gültigen Dienst) an der Tagesart von heute, geprüft im Worker (Kriterium 8)
    const dienstStand = tagesAuswertung(heute.tag);
    kopf.replaceChildren();
    kopf.append(
      h("p", { "data-testid": "linien-heute", text: t("linien.heute", { datum: datum(Date.parse(heute.betriebstag)), tag: tagName(heute.tag) }) }),
      h("p", { "data-testid": "linien-gesamt", text: t("linien.gesamt", { busse: fuhrpark, bedarf: max.busse, tag: tagName(max.tag) }) }),
    );
    if (max.busse > fuhrpark) kopf.append(h("p", { class: "schlecht", "data-testid": "linien-fuhrpark-warnung", text: `⚠ ${mz("linien.fuhrparkZuKlein", max.busse - fuhrpark, { tag: tagName(max.tag) })}` }));
    koerper.replaceChildren(
      ...u.spiel.netz.linien.map((l) => {
        const plan = u.plaene.get(l.id);
        const b = hoechsterBedarf(bedarf(plan));
        const luecke = lueckenVarianten(l, plan);
        const bearbeiten = h("button", { type: "button", "data-testid": `linie-${l.id}-bearbeiten`, "aria-label": t("linien.bearbeiten", { nummer: l.nummer }) }, linienSchild(l));
        bearbeiten.addEventListener("click", () => oeffneLinie(l.id));
        const aktiv = h("input", { type: "checkbox", checked: l.aktiv, "data-testid": `linie-${l.id}-aktiv`, "aria-label": t("linien.aktivFuer", { nummer: l.nummer }) });
        aktiv.addEventListener("change", () => {
          setzeAktiv(u.spiel.netz, l.id, aktiv.checked);
          void berechne(l.id);
        });
        const fahrplan = h("button", { type: "button", "data-testid": `linie-${l.id}-fahrplan`, text: t("linien.fahrplan") });
        fahrplan.addEventListener("click", () => oeffneFahrplan(l.id));
        const hinweise: string[] = [];
        if (!l.varianten.length) hinweise.push(t("linien.ohneVarianten"));
        if (luecke.length) hinweise.push(t("linien.routeFehlt", { varianten: luecke.join(", ") }));
        const bf = berechnungsFehler(l.id);
        if (bf) hinweise.push(t("linien.berechnungFehler", { grund: bf }));
        if (b.busse > l.busse.length) hinweise.push(mz("linien.zuWenigBusse", b.busse - l.busse.length, { tag: tagName(b.tag) }));
        return h("tr", {},
          h("td", {}, bearbeiten),
          h("td", { text: l.name }),
          h("td", {}, h("label", { class: "option" }, aktiv, t(l.aktiv ? "linien.aktiv" : "linien.inaktiv"))),
          h("td", { class: "zahl", text: String(l.varianten.length) }),
          h("td", { class: "zahl", "data-testid": `linie-${l.id}-bedarf`, text: String(b.busse) }),
          h("td", { class: "zahl", "data-testid": `linie-${l.id}-zugewiesen`, text: String(l.busse.length) }),
          h("td", { class: "zahl", "data-testid": `linie-${l.id}-frei`, text: !l.aktiv ? "" : dienstStand ? String(dienstStand.frei[l.id]?.length ?? 0) : t("linien.freiPruefung") }),
          h("td", { class: hinweise.length ? "warnung" : "ok", "data-testid": `linie-${l.id}-hinweis`, text: hinweise.length ? `⚠ ${hinweise.join(" ")}` : `✔ ${t("linien.inOrdnung")}` }),
          h("td", {}, fahrplan),
        );
      }),
    );
    if (!u.spiel.netz.linien.length) koerper.append(h("tr", {}, h("td", { colspan: 9, text: t("linien.keine") })));
  }
  const fenster = oeffneFenster("linien", t("linien.titel"), h("div", { class: "linienbereich" },
    kopf,
    h("div", { class: "rollen" },
      h("table", { class: "tabelle", "data-testid": "linien-tabelle" },
        h("thead", {}, h("tr", {}, ...["linie.nummer", "linie.name", "linien.status", "linien.varianten", "linien.bedarf", "linien.zugewiesen", "linien.frei", "linien.hinweis", ""].map((k) => h("th", { scope: "col", text: k ? t(k as TextKey) : "" })))),
        koerper,
      ),
    ),
    form,
    meldung,
  ), { links: true, breit: true });
  beobachte("linien", () => mitFokus(fenster, zeichne));
  zeichne();
}

/* ---------- Linieneditor ---------- */

/** Linieneditor auf der Karte: Nummer, Name, Farbe, Grundlinie als Perlenkette, Varianten, Busse, Busbedarf. */
export function oeffneLinie(id: number): void {
  const u = linienUi();
  const l = u.spiel.netz.linien.find((x) => x.id === id);
  if (!l) return;
  // Der Editor ersetzt die Liste, damit links die Karte frei bleibt; die Liste öffnet sich über den Menüpunkt wieder
  schliesseFenster("linien");
  const { el: meldung, melde } = meldungsfeld("linie-meldung");
  const nummer = h("input", { type: "text", id: "linie-nummer", "data-testid": "linie-nummer", maxlength: L.nummerMaxLaenge, value: l.nummer, class: "kurztext" });
  const name = h("input", { type: "text", id: "linie-name", "data-testid": "linie-name", maxlength: L.nameMaxLaenge, value: l.name });
  const farbe = h("input", { type: "color", id: "linie-farbe", "data-testid": "linie-farbe", value: l.farbe });
  const speichern = h("button", { type: "button", "data-testid": "linie-speichern", text: t("linie.uebernehmen") });
  speichern.addEventListener("click", () => {
    const f = aendereLinie(u.spiel.netz, l.id, { nummer: nummer.value, name: name.value, farbe: farbe.value }, L);
    if (f) return melde(t(`linie.fehler.${f}` as TextKey));
    melde(t("linie.uebernommen"), true);
    void berechne(l.id);
  });
  const aktiv = h("input", { type: "checkbox", id: "linie-aktiv", "data-testid": "linie-aktiv", checked: l.aktiv });
  aktiv.addEventListener("change", () => {
    setzeAktiv(u.spiel.netz, l.id, aktiv.checked);
    void berechne(l.id);
  });

  const geaendert = () => void berechne(l.id);
  const grund = perlenEditor({ fenster: "linie", perlen: l.perlen, plan: () => u.plaene.get(l.id)?.varianten.find((v) => v.id === GRUNDLINIE), mitStandzeit: false, geaendert, melde });

  const richtungen = h("button", { type: "button", "data-testid": "linie-richtungen" });
  let richtungBestaetigen = false;
  richtungen.addEventListener("click", () => {
    if (l.perlen.filter((p) => p.art === "halt").length < 2) return melde(t("linie.zuWenigHalte"));
    if (l.varianten.some((v) => v.art !== "kurz") && !richtungBestaetigen) {
      richtungBestaetigen = true;
      richtungen.textContent = t("linie.richtungenBestaetigen");
      return;
    }
    richtungBestaetigen = false;
    erzeugeRichtungen(u.spiel.netz, l, u.halte, L, t("variante.nach"), (hd) => freigeschaltet(u, hd.coord));
    melde(t("linie.richtungenErzeugt"), true);
    geaendert();
  });

  const varianten = h("tbody", {});
  const kurzBasis = h("select", { id: "kurz-basis", "data-testid": "kurz-basis" });
  const kurzVon = h("select", { id: "kurz-von", "data-testid": "kurz-von" });
  const kurzBis = h("select", { id: "kurz-bis", "data-testid": "kurz-bis" });
  const kurzAnlegen = h("button", { type: "button", "data-testid": "kurz-anlegen", text: t("linie.kurzAnlegen") });
  kurzBasis.addEventListener("change", () => fuelleKurz());
  kurzAnlegen.addEventListener("click", () => {
    const r = legeKurzlaeuferAn(u.spiel.netz, l, Number(kurzBasis.value), Number(kurzVon.value), Number(kurzBis.value), u.halte, L, t("variante.nach"));
    if (!r.ok) return melde(t(`linie.kurzFehler.${r.fehler}` as TextKey));
    melde(t("linie.kurzAngelegt", { name: r.variante.name }), true);
    geaendert();
  });
  function fuelleKurz() {
    const basis = l!.varianten.filter((v) => v.art !== "kurz");
    const gew = basis.find((v) => String(v.id) === kurzBasis.value) ?? basis[0];
    kurzBasis.replaceChildren(...basis.map((v) => h("option", { value: String(v.id), selected: v === gew, text: v.name })));
    const halte = gew ? gew.perlen.filter((p) => p.art === "halt").map((p) => (p.art === "halt" ? u.halte.hole(p.halt)?.name || p.halt : "")) : [];
    const opts = (start: number) => halte.map((n, i) => h("option", { value: String(i), selected: i === start, text: `${i + 1}. ${n}` }));
    const vonAlt = Number(kurzVon.value) || 0, bisAlt = Number(kurzBis.value) || Math.max(0, halte.length - 2);
    kurzVon.replaceChildren(...opts(Math.min(vonAlt, halte.length - 1)));
    kurzBis.replaceChildren(...opts(Math.min(bisAlt, halte.length - 1)));
    kurzAnlegen.disabled = !gew;
  }

  const busse = h("tbody", {});
  const busWahl = h("select", { id: "bus-wahl", "data-testid": "bus-wahl" });
  const zuweisen = h("button", { type: "button", "data-testid": "bus-zuweisen", text: t("linie.busZuweisen") });
  const busMeldung = meldungsfeld("bus-meldung");
  zuweisen.addEventListener("click", () => {
    const b = u.spiel.fuhrpark.busse.find((x) => String(x.id) === busWahl.value);
    if (!b) return busMeldung.melde(t("linie.keinBusGewaehlt"));
    weiseBusZu(u.spiel.netz, l.id, b.id);
    const w = passtZurLinie(u.modelle.get(b.modellId)!, variantenPlaene(u.plaene.get(l.id)), L);
    busMeldung.melde([t("linie.busZugewiesen", { bus: b.flottennummer, nummer: l.nummer }), ...w.map((x) => `⚠ ${warnungText(x)}`)].join(" "), !w.length);
    zeichne();
    void berechne(l.id);
  });

  const bedarfTabelle = h("tbody", {});
  const loeschen = h("button", { type: "button", "data-testid": "linie-loeschen", "data-halten": "", text: t("linie.loeschen") });
  let loeschenBestaetigen = false;
  loeschen.addEventListener("click", () => {
    if (!loeschenBestaetigen) {
      loeschenBestaetigen = true;
      loeschen.textContent = t("linie.loeschenBestaetigen");
      return;
    }
    loescheLinie(u.spiel.netz, l.id);
    waehleAus(null);
    schliesseFenster("linie");
    void berechne();
  });
  const fahrplan = h("button", { type: "button", "data-testid": "linie-fahrplan", text: t("linien.fahrplan") });
  fahrplan.addEventListener("click", () => oeffneFahrplan(l.id));

  const lueckeHinweis = h("p", { class: "schlecht hinweisbox", role: "status", "data-testid": "linie-luecke-hinweis", hidden: true });

  function zeichne() {
    if (!u.spiel.netz.linien.includes(l!)) return;
    const plan = u.plaene.get(l!.id);
    const luecke = lueckenVarianten(l!, plan);
    lueckeHinweis.hidden = !luecke.length;
    lueckeHinweis.textContent = luecke.length ? `⚠ ${t("linie.lueckeHinweis", { varianten: luecke.join(", ") })}` : "";
    grund.zeichne();
    richtungen.textContent = richtungBestaetigen ? t("linie.richtungenBestaetigen") : t(l!.varianten.some((v) => v.art !== "kurz") ? "linie.richtungenNeu" : "linie.richtungen");
    varianten.replaceChildren(
      ...l!.varianten.map((v) => {
        const vp = plan?.varianten.find((x) => x.id === v.id);
        const spanne = vp ? fahrzeitSpanne(vp, v.perlen.filter((p) => p.art === "halt").map((p) => (p.art === "halt" ? p.standzeitS : 0))) : null;
        const bearbeiten = h("button", { type: "button", "data-testid": `variante-${v.id}-bearbeiten`, text: t("linie.varianteBearbeiten") });
        bearbeiten.addEventListener("click", () => oeffneVariante(l!.id, v.id));
        const weg = h("button", { type: "button", "data-testid": `variante-${v.id}-loeschen`, "aria-label": t("linie.varianteLoeschen", { name: v.name }), title: t("linie.varianteLoeschen", { name: v.name }), text: "✕" });
        weg.addEventListener("click", () => (loescheVariante(l!, v.id), geaendert()));
        const status = !vp ? t("linie.berechnet") : vp.vollstaendig ? `✔ ${t("linie.routeOk")}` : `⚠ ${t("linie.routeLuecke")}`;
        return h("tr", { "data-testid": `variante-${v.id}` },
          h("td", { text: t(`variante.art.${v.art}` as TextKey) }),
          h("td", { text: v.name }),
          h("td", { class: "zahl", text: String(v.perlen.filter((p) => p.art === "halt").length) }),
          h("td", { class: "zahl", text: vp?.vollstaendig ? km(vp.strecke.lengthM) : "" }),
          h("td", { class: "zahl", "data-testid": `variante-${v.id}-fahrzeit`, text: spanne ? (spanne[0] === spanne[1] ? dauer(spanne[0]) : t("linie.spanne", { von: dauer(spanne[0]), bis: dauer(spanne[1]) })) : "" }),
          h("td", { class: vp?.vollstaendig ? "ok" : "schlecht", text: status }),
          h("td", {}, bearbeiten, " ", weg),
        );
      }),
    );
    if (!l!.varianten.length) varianten.append(h("tr", {}, h("td", { colspan: 7, text: t("linie.keineVarianten") })));
    fuelleKurz();

    const vps = variantenPlaene(plan);
    busse.replaceChildren(
      ...l!.busse.map((bid) => {
        const b = u.spiel.fuhrpark.busse.find((x) => x.id === bid);
        if (!b) return h("tr", {});
        const m = u.modelle.get(b.modellId)!;
        const w = passtZurLinie(m, vps, L);
        const weg = h("button", { type: "button", "data-testid": `bus-${bid}-entfernen`, "aria-label": t("linie.busEntfernen", { bus: b.flottennummer }), title: t("linie.busEntfernen", { bus: b.flottennummer }), text: "✕" });
        weg.addEventListener("click", () => (entferneBus(u.spiel.netz, bid), zeichne(), void berechne(l!.id)));
        return h("tr", { "data-testid": `linie-bus-${bid}` },
          h("td", { text: b.flottennummer }),
          h("td", { text: modellName(m) }),
          h("td", { class: w.length ? "warnung" : "ok", text: w.length ? w.map((x) => `⚠ ${warnungText(x)}`).join(" ") : `✔ ${t("linie.passt.ok")}` }),
          h("td", {}, weg),
        );
      }),
    );
    if (!l!.busse.length) busse.append(h("tr", {}, h("td", { colspan: 4, text: t("linie.keineBusse") })));
    const wahl = busWahl.value;
    busWahl.replaceChildren(
      h("option", { value: "", text: t("linie.busWaehlen") }),
      ...u.spiel.fuhrpark.busse.filter((b) => !l!.busse.includes(b.id)).map((b) => {
        const andere = linieVonBus(u.spiel.netz, b.id);
        return h("option", { value: String(b.id), selected: String(b.id) === wahl, text: `${b.flottennummer}, ${modellName(u.modelle.get(b.modellId)!)}${andere ? `, ${t("linie.busAufLinie", { nummer: andere.nummer })}` : ""}` });
      }),
    );
    const bd = bedarf(plan);
    bedarfTabelle.replaceChildren(
      ...PLAN_TAGE.map((tag) => {
        const n = plan?.tage[tag].fahrten.filter((f) => f.status !== "gestrichen").length ?? 0;
        const fehlt = bd[tag] - l!.busse.length;
        return h("tr", { "data-testid": `bedarf-${tag}` },
          h("th", { scope: "row", text: tagName(tag) }),
          h("td", { class: "zahl", text: String(n) }),
          h("td", { class: "zahl", "data-testid": `bedarf-${tag}-busse`, text: String(bd[tag]) }),
          h("td", { class: fehlt > 0 ? "schlecht" : "ok", text: fehlt > 0 ? `⚠ ${mz("linie.fehlenBusse", fehlt)}` : bd[tag] ? `✔ ${t("linie.genugBusse")}` : "" }),
        );
      }),
    );
  }

  const fenster = oeffneFenster("linie", t("linie.titel", { nummer: l.nummer }), h("div", { class: "linieneditor" },
    h("div", { class: "zweispaltig breit-links" },
      h("label", { for: "linie-nummer", text: t("linie.nummer") }), nummer,
      h("label", { for: "linie-name", text: t("linie.name") }), name,
      h("label", { for: "linie-farbe", text: t("linie.farbe") }), farbe,
    ),
    h("div", { class: "aktionen links" }, speichern, h("label", { class: "option", for: "linie-aktiv" }, aktiv, t("linie.aktiv")), fahrplan),
    lueckeHinweis,
    meldung,
    h("details", { open: true },
      h("summary", { class: "fett", text: t("linie.grundlinie") }),
      h("p", { class: "hilfe", text: t("linie.grundlinieHilfe") }),
      grund.el,
      h("div", { class: "aktionen links" }, richtungen),
    ),
    h("details", { open: true },
      h("summary", { class: "fett", text: t("linie.varianten") }),
      h("div", { class: "rollen kurz" },
        h("table", { class: "tabelle", "data-testid": "varianten-tabelle" },
          h("thead", {}, h("tr", {}, ...["linie.art", "linie.name", "linie.halte", "linie.laenge", "linie.fahrzeitWerktag", "linie.route", ""].map((k) => h("th", { scope: "col", text: k ? t(k as TextKey) : "" })))),
          varianten,
        ),
      ),
      h("h4", { text: t("linie.kurzTitel") }),
      h("div", { class: "zweispaltig breit-links" },
        h("label", { for: "kurz-basis", text: t("linie.kurzBasis") }), kurzBasis,
        h("label", { for: "kurz-von", text: t("linie.kurzVon") }), kurzVon,
        h("label", { for: "kurz-bis", text: t("linie.kurzBis") }), kurzBis,
      ),
      h("div", { class: "aktionen links" }, kurzAnlegen),
    ),
    h("details", { open: true },
      h("summary", { class: "fett", text: t("linie.busse") }),
      h("table", { class: "tabelle", "data-testid": "linie-busse" }, busse),
      h("div", { class: "aktionen links" }, h("label", { for: "bus-wahl", class: "unsichtbar", text: t("linie.busWaehlen") }), busWahl, zuweisen),
      busMeldung.el,
    ),
    h("details", { open: true },
      h("summary", { class: "fett", text: t("linie.bedarf") }),
      h("p", { class: "hilfe", text: t("linie.bedarfHilfe") }),
      h("table", { class: "tabelle", "data-testid": "linie-bedarf" },
        h("thead", {}, h("tr", {}, ...["linie.tagesart", "linie.fahrten", "linie.busseNoetig", ""].map((k) => h("th", { scope: "col", text: k ? t(k as TextKey) : "" })))),
        bedarfTabelle,
      ),
    ),
    h("div", { class: "aktionen" }, loeschen),
  ), { links: true, mittel: true, geschlossen: () => (istOffen("variante") ? undefined : waehleAus(null)) });
  // Erst nach dem Öffnen: Ein zuvor offener Editor meldet beim Schließen "keine Auswahl"
  waehleAus(l.id, GRUNDLINIE);
  // Die Linie neben dem Fenster zeigen; die Karte bleibt frei bedienbar
  zoomeAufLinie(l.id);
  fenster.querySelector("header h2")!.prepend(linienSchild(l), " ");
  beobachte("linie", () => mitFokus(fenster, zeichne));
  zeichne();
}

/* ---------- Varianteneditor mit Takt ---------- */

/** Liest eine Taktzeile aus den Feldern; "bis 4:00" bedeutet das Ende des Betriebstags (28:00). */
function leseZeile(von: string, bis: string, takt: string): TaktZeile | null {
  const a = leseUhrzeit(von, L);
  let b = leseUhrzeit(bis, L);
  if (b === L.betriebstagBeginnH * 3600) b = (24 + L.betriebstagBeginnH) * 3600;
  if (a === null || b === null || a % 60 || b % 60 || !/^\s*\d+\s*$/.test(takt)) return null;
  return { vonMin: a / 60, bisMin: b / 60, taktMin: Number(takt) };
}

/** Taktabelle einer Tagesart: Zeilen "von, bis, Takt in Minuten". */
function taktTabelle(v: Variante, tag: PlanTag, melde: (s: string, ok?: boolean) => void, geaendert: () => void): HTMLElement {
  const koerper = h("tbody", {});
  const zeilen = v.takt[tag].map((z) => ({ von: uhrzeit(z.vonMin * 60), bis: uhrzeit(z.bisMin * 60), takt: String(z.taktMin) }));
  const uebernehmen = () => {
    const neu: TaktZeile[] = [];
    for (let i = 0; i < zeilen.length; i++) {
      const z = leseZeile(zeilen[i].von, zeilen[i].bis, zeilen[i].takt);
      if (!z) return melde(t("takt.fehler.zeit", { nr: i + 1, ...W }));
      neu.push(z);
    }
    const r = setzeTakt(v, tag, neu, L);
    if (!r.ok) return melde(t(`takt.fehler.${r.fehler}` as TextKey, { nr: r.zeile + 1, min: L.taktMinMin, max: L.taktMaxMin, ...W }));
    melde(r.verworfen.length ? t("takt.verworfen", { n: r.verworfen.length, liste: r.verworfen.map((a) => (a.art === "zusatz" ? "" : uhrzeit(a.ursprungS))).join(", ") }) : t("takt.uebernommen", { tag: tagName(tag) }), !r.verworfen.length);
    geaendert();
  };
  const zeichne = () =>
    koerper.replaceChildren(
      ...zeilen.map((z, i) => {
        const feld = (k: "von" | "bis" | "takt", label: TextKey) => {
          const f = h("input", { type: k === "takt" ? "number" : "text", value: z[k], class: k === "takt" ? "kurzzahl" : "uhr", "aria-label": t(label, { nr: i + 1 }), "data-testid": `takt-${tag}-${i}-${k}`, ...(k === "takt" ? { min: L.taktMinMin, max: L.taktMaxMin, step: 1 } : { inputmode: "numeric", placeholder: t("takt.platzhalter") }) });
          f.addEventListener("change", () => ((z[k] = f.value), uebernehmen()));
          return h("td", {}, f);
        };
        const weg = h("button", { type: "button", "aria-label": t("takt.zeileEntfernen", { nr: i + 1 }), title: t("takt.zeileEntfernen", { nr: i + 1 }), "data-testid": `takt-${tag}-${i}-entfernen`, text: "✕" });
        weg.addEventListener("click", () => (zeilen.splice(i, 1), zeichne(), uebernehmen()));
        return h("tr", {}, feld("von", "takt.von"), feld("bis", "takt.bis"), feld("takt", "takt.takt"), h("td", {}, weg));
      }),
    );
  const neu = h("button", { type: "button", "data-testid": `takt-${tag}-zeile`, text: t("takt.zeileNeu") });
  neu.addEventListener("click", () => {
    const letzte = zeilen.length ? leseZeile(zeilen[zeilen.length - 1].von, zeilen[zeilen.length - 1].bis, zeilen[zeilen.length - 1].takt) : null;
    const nz = L.neueTaktzeile;
    const von = letzte ? letzte.bisMin : nz.vonH * 60;
    zeilen.push({ von: uhrzeit(von * 60), bis: uhrzeit(Math.min(von + nz.dauerMin, (24 + L.betriebstagBeginnH) * 60) * 60), takt: String(nz.taktMin) });
    zeichne();
    uebernehmen();
  });
  const vorlage = h("button", { type: "button", "data-testid": `takt-${tag}-vorlage`, text: t("takt.vorlage") });
  vorlage.addEventListener("click", () => {
    zeilen.splice(0, zeilen.length, ...taktVorlage(tag, L).map((z) => ({ von: uhrzeit(z.vonMin * 60), bis: uhrzeit(z.bisMin * 60), takt: String(z.taktMin) })));
    zeichne();
    uebernehmen();
  });
  const aktionen = h("div", { class: "aktionen links" }, neu, vorlage);
  if (grundtagVon(tag) !== "werktag" && !istFerientag(tag)) {
    const kopie = h("button", { type: "button", "data-testid": `takt-${tag}-vonWerktag`, text: t("takt.vonWerktag") });
    kopie.addEventListener("click", () => {
      zeilen.splice(0, zeilen.length, ...v.takt.werktag.map((z) => ({ von: uhrzeit(z.vonMin * 60), bis: uhrzeit(z.bisMin * 60), takt: String(z.taktMin) })));
      zeichne();
      uebernehmen();
    });
    aktionen.append(kopie);
  }
  zeichne();
  return h("div", { class: "takttabelle" },
    h("table", { class: "tabelle", "data-testid": `takt-${tag}` },
      h("thead", {}, h("tr", {}, ...["takt.vonKopf", "takt.bisKopf", "takt.taktKopf", ""].map((k) => h("th", { scope: "col", text: k ? t(k as TextKey) : "" })))),
      koerper,
    ),
    aktionen,
  );
}

/** Varianteneditor: Perlen der Variante (eigene Route, Gegenhaltestellen), Standzeiten, Wendezeit, Takt, Fahrzeiten. */
export function oeffneVariante(linieId: number, varianteId: number): void {
  const u = linienUi();
  const l = u.spiel.netz.linien.find((x) => x.id === linieId);
  const v = l?.varianten.find((x) => x.id === varianteId);
  if (!l || !v) return;
  const { el: meldung, melde } = meldungsfeld("variante-meldung");
  const geaendert = () => void berechne(l.id);
  const name = h("input", { type: "text", id: "variante-name", "data-testid": "variante-name", value: v.name, maxlength: L.nameMaxLaenge });
  name.addEventListener("change", () => {
    const f = benenneVariante(v, name.value, L);
    if (f) return melde(t(`linie.fehler.${f}` as TextKey));
    geaendert();
  });
  const wende = h("input", { type: "number", id: "variante-wendezeit", "data-testid": "variante-wendezeit", min: 0, max: L.wendezeitMaxS, step: L.rundungS, value: v.wendezeitS, class: "kurzzahl" });
  wende.addEventListener("change", () => {
    if (!setzeWendezeit(v, Number(wende.value), L)) return melde(t("variante.wendezeitFehler", { max: L.wendezeitMaxS }));
    melde(t("variante.wendezeitGesetzt", { zeit: dauer(v.wendezeitS) }), true);
    geaendert();
  });
  const perlen = perlenEditor({ fenster: "variante", perlen: v.perlen, plan: () => u.plaene.get(l.id)?.varianten.find((x) => x.id === v.id), mitStandzeit: true, geaendert, melde });

  // Takt mit Reitern je Tagesart; Ferien nur auf Wunsch mit eigenem Takt
  let reiter: Grundtag = "werktag";
  const reiterLeiste = h("div", { class: "reiter", role: "tablist" });
  const taktBereich = h("div", { role: "tabpanel", "data-testid": "takt-bereich" });
  const zeichneTakt = () => {
    reiterLeiste.replaceChildren(
      ...(["werktag", "samstag", "sonnFeiertag"] as const).map((g) => {
        const k = h("button", { type: "button", role: "tab", "aria-selected": String(g === reiter), "aria-pressed": String(g === reiter), "data-testid": `takt-reiter-${g}`, text: tagName(g) });
        k.addEventListener("click", () => ((reiter = g), zeichneTakt()));
        return k;
      }),
    );
    const ferien = `${reiter}Ferien` as PlanTag;
    const eigen = h("input", { type: "checkbox", id: "takt-ferien", "data-testid": "takt-ferien", checked: v.eigenerFerientakt[reiter] });
    eigen.addEventListener("change", () => {
      setzeEigenenFerientakt(u.spiel.netz, v, reiter, eigen.checked);
      zeichneTakt();
      geaendert();
    });
    taktBereich.replaceChildren(
      taktTabelle(v, reiter, melde, geaendert),
      h("label", { class: "option", for: "takt-ferien" }, eigen, t("takt.eigenerFerientakt")),
      v.eigenerFerientakt[reiter]
        ? h("div", {}, h("h4", { text: tagName(ferien) }), taktTabelle(v, ferien, melde, geaendert))
        : h("p", { class: "hilfe", text: t("takt.ferienWie", { tag: tagName(reiter) }) }),
    );
  };

  // Fahrzeiten einer Fahrt zur gewählten Uhrzeit
  const probeTag = h("select", { id: "probe-tag", "data-testid": "probe-tag" }, ...PLAN_TAGE.map((tag) => h("option", { value: tag, text: tagName(tag) })));
  const probeZeit = h("input", { type: "text", id: "probe-zeit", "data-testid": "probe-zeit", value: uhrzeit(L.probeStunde * 3600), class: "uhr", inputmode: "numeric" });
  const probe = h("tbody", {});
  probeTag.addEventListener("change", () => zeichneProbe());
  probeZeit.addEventListener("change", () => zeichneProbe());
  function zeichneProbe() {
    const vp = u.plaene.get(l!.id)?.varianten.find((x) => x.id === v!.id);
    const ab = leseUhrzeit(probeZeit.value, L);
    if (!vp?.vollstaendig || ab === null) return probe.replaceChildren(h("tr", {}, h("td", { colspan: 4, text: t(vp?.vollstaendig ? "variante.zeitUngueltig" : "variante.ohneRoute") })));
    const halte = v!.perlen.filter((p) => p.art === "halt");
    const z = fahrtZeiten(vp.strecke.abschnitte, halte.map((p) => (p.art === "halt" ? p.standzeitS : 0)), probeTag.value as PlanTag, ab, L);
    probe.replaceChildren(
      ...halte.map((p, i) =>
        h("tr", { "data-testid": `probe-${i}` },
          h("td", { text: p.art === "halt" ? u.halte.hole(p.halt)?.name || p.halt : "" }),
          h("td", { class: "zahl", text: i === 0 ? "" : uhrzeit(z[i][0], true) }),
          h("td", { class: "zahl", text: i === halte.length - 1 ? "" : uhrzeit(z[i][1], true) }),
          h("td", { class: "zahl", text: i === 0 ? "" : dauer(z[i][0] - z[i - 1][1]) }),
        ),
      ),
      h("tr", { class: "fett" }, h("td", { text: t("variante.gesamt") }), h("td", { class: "zahl", text: "" }), h("td", {}), h("td", { class: "zahl", "data-testid": "probe-gesamt", text: dauer(z[z.length - 1][0] - ab) })),
    );
  }

  function zeichne() {
    if (!l!.varianten.includes(v!)) return schliesseFenster("variante");
    perlen.zeichne();
    zeichneProbe();
  }

  const fenster = oeffneFenster("variante", t("variante.titel", { nummer: l.nummer, art: t(`variante.art.${v.art}` as TextKey) }), h("div", { class: "varianteneditor" },
    h("div", { class: "zweispaltig breit-links" },
      h("label", { for: "variante-name", text: t("variante.name") }), name,
      h("label", { for: "variante-wendezeit", text: t("variante.wendezeit") }), wende,
    ),
    h("p", { class: "hilfe", text: t("variante.wendezeitHilfe") }),
    meldung,
    h("details", { open: true }, h("summary", { class: "fett", text: t("variante.perlen") }), h("p", { class: "hilfe", text: t("variante.perlenHilfe") }), perlen.el),
    h("details", { open: true }, h("summary", { class: "fett", text: t("variante.takt") }), h("p", { class: "hilfe", text: t("takt.hilfe", { min: L.taktMinMin, max: L.taktMaxMin, ...W }) }), reiterLeiste, taktBereich),
    h("details", { open: true },
      h("summary", { class: "fett", text: t("variante.fahrzeiten") }),
      h("p", { class: "hilfe", text: t("variante.fahrzeitenHilfe") }),
      h("div", { class: "aktionen links" }, h("label", { for: "probe-tag", text: t("variante.probeTag") }), probeTag, h("label", { for: "probe-zeit", text: t("variante.probeZeit") }), probeZeit),
      h("table", { class: "tabelle", "data-testid": "probe" },
        h("thead", {}, h("tr", {}, ...["variante.halt", "variante.an", "variante.ab", "variante.abschnitt"].map((k) => h("th", { scope: "col", text: t(k as TextKey) })))),
        probe,
      ),
    ),
  ), { mittel: true, geschlossen: () => (istOffen("linie") ? waehleAus(l.id, GRUNDLINIE) : waehleAus(null)) });
  waehleAus(l.id, v.id);
  fenster.querySelector("header h2")!.prepend(linienSchild(l), " ");
  beobachte("variante", () => mitFokus(fenster, zeichne));
  zeichneTakt();
  zeichne();
}

/* ---------- Fahrplan ---------- */

/** Fahrplan einer Linie: Fahrten je Tagesart und Variante, verschieben, streichen, hinzufügen, Umläufe und Ausrückzeiten. */
export function oeffneFahrplan(linieId: number, start: PlanTag = "werktag"): void {
  const u = linienUi();
  const l = u.spiel.netz.linien.find((x) => x.id === linieId);
  if (!l) return;
  let tag: PlanTag = start;
  let filter = "alle";
  let offen: string | null = null;
  const { el: meldung, melde } = meldungsfeld("fahrplan-meldung");
  const tagWahl = h("select", { id: "fahrplan-tag", "data-testid": "fahrplan-tag" }, ...PLAN_TAGE.map((x) => h("option", { value: x, selected: x === tag, text: tagName(x) })));
  tagWahl.addEventListener("change", () => ((tag = tagWahl.value as PlanTag), zeichne()));
  const variantenWahl = h("select", { id: "fahrplan-variante", "data-testid": "fahrplan-variante" });
  variantenWahl.addEventListener("change", () => ((filter = variantenWahl.value), zeichne()));
  const hinweis = h("p", { class: "hilfe", "data-testid": "fahrplan-hinweis" });
  const koerper = h("tbody", {});
  const detail = h("div", { "data-testid": "fahrt-detail" });
  const bedarfEl = h("div", { "data-testid": "fahrplan-bedarf" });
  const neuVariante = h("select", { id: "neu-fahrt-variante", "data-testid": "neu-fahrt-variante" });
  const neuZeit = h("input", { type: "text", id: "neu-fahrt-zeit", "data-testid": "neu-fahrt-zeit", class: "uhr", placeholder: t("fahrplan.platzhalter"), inputmode: "numeric" });
  const neuKnopf = h("button", { type: "button", "data-testid": "neu-fahrt", text: t("fahrplan.hinzufuegen") });
  neuKnopf.addEventListener("click", () => {
    const v = l.varianten.find((x) => String(x.id) === neuVariante.value);
    const s = leseUhrzeit(neuZeit.value, L);
    if (!v || s === null) return melde(t("fahrplan.zeitUngueltig", W));
    const r = fuegeFahrtHinzu(u.spiel.netz, v, tag, s, L);
    if (!r.ok) return melde(t("fahrplan.zeitUngueltig", W));
    melde(t("fahrplan.hinzugefuegt", { zeit: uhrzeit(s), variante: v.name }), true);
    neuZeit.value = "";
    void berechne(l.id);
  });

  const vName = (id: number) => l.varianten.find((x) => x.id === id)?.name ?? "";
  const haltName = (id: HaltId) => u.halte.hole(id)?.name || id;

  function aktionen(f: Fahrt): HTMLElement {
    const v = l!.varianten.find((x) => x.id === f.variante)!;
    const zeit = h("input", { type: "text", class: "uhr", value: uhrzeit(f.abfahrtS), "aria-label": t("fahrplan.neueZeit", { zeit: uhrzeit(f.abfahrtS) }), "data-testid": `fahrt-${f.variante}-${f.schluessel}-zeit`, inputmode: "numeric" });
    const verschieben = h("button", { type: "button", "data-testid": `fahrt-${f.variante}-${f.schluessel}-verschieben`, text: t("fahrplan.verschieben") });
    verschieben.addEventListener("click", () => {
      const s = leseUhrzeit(zeit.value, L);
      if (s === null) return melde(t("fahrplan.zeitUngueltig", W));
      const fehler = f.status === "zusatz" ? verschiebeZusatz(v, f.zusatzId!, s, L) : verschiebeFahrt(v, tag, f.ursprungS!, s, L);
      if (fehler) return melde(t("fahrplan.zeitUngueltig", W));
      melde(t("fahrplan.verschoben", { von: uhrzeit(f.abfahrtS), nach: uhrzeit(s) }), true);
      void berechne(l!.id);
    });
    const box = h("span", { class: "fahrtaktionen" }, zeit, verschieben);
    if (f.status === "zusatz") {
      const weg = h("button", { type: "button", "data-testid": `fahrt-${f.variante}-${f.schluessel}-entfernen`, text: t("fahrplan.entfernen") });
      weg.addEventListener("click", () => (entferneZusatz(v, f.zusatzId!), melde(t("fahrplan.entfernt", { zeit: uhrzeit(f.abfahrtS) }), true), void berechne(l!.id)));
      box.append(weg);
    } else if (f.status === "takt") {
      const streichen = h("button", { type: "button", "data-testid": `fahrt-${f.variante}-${f.schluessel}-streichen`, text: t("fahrplan.streichen") });
      streichen.addEventListener("click", () => (streicheFahrt(v, tag, f.ursprungS!), melde(t("fahrplan.gestrichen", { zeit: uhrzeit(f.abfahrtS) }), true), void berechne(l!.id)));
      box.append(streichen);
    } else {
      const zurueck = h("button", { type: "button", "data-testid": `fahrt-${f.variante}-${f.schluessel}-wiederherstellen`, text: t("fahrplan.wiederherstellen") });
      zurueck.addEventListener("click", () => (stelleFahrtWiederHer(v, tag, f.ursprungS!), melde(t("fahrplan.wiederhergestellt", { zeit: uhrzeit(f.ursprungS!) }), true), void berechne(l!.id)));
      box.append(zurueck);
    }
    return box;
  }

  function zeichne() {
    if (!u.spiel.netz.linien.includes(l!)) return schliesseFenster("fahrplan");
    const plan = u.plaene.get(l!.id);
    variantenWahl.replaceChildren(h("option", { value: "alle", text: t("fahrplan.alleVarianten") }), ...l!.varianten.map((v) => h("option", { value: String(v.id), selected: String(v.id) === filter, text: v.name })));
    const nv = neuVariante.value;
    neuVariante.replaceChildren(...l!.varianten.map((v) => h("option", { value: String(v.id), selected: String(v.id) === nv, text: v.name })));
    const ohneEigen = istFerientag(tag) && l!.varianten.some((v) => taktQuelle(v, tag) !== tag);
    hinweis.textContent = [!l!.aktiv ? t("fahrplan.inaktiv") : "", ohneEigen ? t("fahrplan.ferienWie", { tag: tagName(grundtagVon(tag)) }) : ""].filter(Boolean).join(" ");
    const fahrten = (plan?.tage[tag].fahrten ?? []).filter((f) => filter === "alle" || String(f.variante) === filter);
    const ds = tagesAuswertung(tag);
    const dienstVon = (f: Fahrt) => (f.status === "gestrichen" ? "" : !ds ? t("linien.freiPruefung") : (ds.besetzt.get(fahrtKey(l!.id, f)) ?? t("dienste.frei")));
    koerper.replaceChildren(
      ...fahrten.map((f) => {
        const v = l!.varianten.find((x) => x.id === f.variante)!;
        const halte = v.perlen.filter((p) => p.art === "halt");
        const ab = h("button", { type: "button", "aria-expanded": String(offen === `${f.variante}-${f.schluessel}`), "data-testid": `fahrt-${f.variante}-${f.schluessel}`, text: uhrzeit(f.abfahrtS) });
        ab.addEventListener("click", () => ((offen = offen === `${f.variante}-${f.schluessel}` ? null : `${f.variante}-${f.schluessel}`), zeichne()));
        return h("tr", { class: f.status === "gestrichen" ? "gestrichen" : undefined, "data-testid": `fahrt-zeile-${f.variante}-${f.schluessel}` },
          h("td", {}, ab),
          h("td", { text: vName(f.variante) }),
          h("td", { text: halte[0]?.art === "halt" ? haltName(halte[0].halt) : "" }),
          h("td", { text: halte[halte.length - 1]?.art === "halt" ? haltName((halte[halte.length - 1] as { halt: HaltId }).halt) : "" }),
          h("td", { class: "zahl", text: f.status === "gestrichen" ? "" : uhrzeit(f.ankunftS) }),
          h("td", { "data-testid": `fahrt-${f.variante}-${f.schluessel}-status`, text: t(`fahrplan.status.${f.status}` as TextKey, { zeit: f.ursprungS !== null ? uhrzeit(f.ursprungS) : "" }) }),
          h("td", { "data-testid": `fahrt-${f.variante}-${f.schluessel}-dienst`, text: dienstVon(f) }),
          h("td", {}, aktionen(f)),
        );
      }),
    );
    if (!fahrten.length) koerper.append(h("tr", {}, h("td", { colspan: 8, text: t("fahrplan.keine") })));
    const of = offen ? (plan?.tage[tag].fahrten ?? []).find((f) => `${f.variante}-${f.schluessel}` === offen) : undefined;
    if (of) {
      const halte = l!.varianten.find((x) => x.id === of.variante)!.perlen.filter((p) => p.art === "halt");
      detail.replaceChildren(
        h("h4", { text: t("fahrplan.detail", { zeit: uhrzeit(of.abfahrtS), variante: vName(of.variante) }) }),
        h("table", { class: "tabelle" },
          h("thead", {}, h("tr", {}, ...["variante.halt", "variante.an", "variante.ab"].map((k) => h("th", { scope: "col", text: t(k as TextKey) })))),
          h("tbody", {}, ...halte.map((p, i) => h("tr", {}, h("td", { text: p.art === "halt" ? haltName(p.halt) : "" }), h("td", { class: "zahl", text: i ? uhrzeit(of.zeiten[i][0], true) : "" }), h("td", { class: "zahl", text: i < halte.length - 1 ? uhrzeit(of.zeiten[i][1], true) : "" })))),
        ),
      );
    } else detail.replaceChildren();
    const tp = plan?.tage[tag];
    const fehlt = (tp?.busbedarf ?? 0) - l!.busse.length;
    bedarfEl.replaceChildren(
      h("p", { "data-testid": "fahrplan-busse", class: fehlt > 0 ? "schlecht" : "ok", text: `${fehlt > 0 ? "⚠" : "✔"} ${t("fahrplan.busse", { n: tp?.busbedarf ?? 0, zugewiesen: l!.busse.length })}${fehlt > 0 ? ` ${mz("linie.fehlenBusse", fehlt)}` : ""}` }),
      h("table", { class: "tabelle", "data-testid": "umlaeufe" },
        h("thead", {}, h("tr", {}, ...["fahrplan.umlauf", "fahrplan.fahrtenZahl", "fahrplan.beginn", "fahrplan.ende", "fahrplan.ausruecken", "fahrplan.einruecken"].map((k) => h("th", { scope: "col", text: t(k as TextKey) })))),
        h("tbody", {}, ...(tp?.umlaeufe ?? []).map((um, i) =>
          h("tr", { "data-testid": `umlauf-${i}` },
            h("td", { text: t("fahrplan.umlaufNr", { n: i + 1 }) }),
            h("td", { class: "zahl", text: String(um.fahrten.length) }),
            h("td", { class: "zahl", text: uhrzeit(um.beginnS) }),
            h("td", { class: "zahl", text: uhrzeit(um.endeS) }),
            h("td", { "data-testid": `umlauf-${i}-ausruecken`, text: um.ausrueck ? t("fahrplan.ausrueckenText", { zeit: uhrzeit(um.ausrueck.abHofS, true), dauer: dauer(um.ausrueck.fahrzeitS) }) : t(u.spiel.betriebshof ? "fahrplan.ohneAusrueck" : "fahrplan.ohneHof") }),
            h("td", { "data-testid": `umlauf-${i}-einruecken`, text: um.einrueck ? t("fahrplan.einrueckenText", { zeit: uhrzeit(um.einrueck.anHofS, true), dauer: dauer(um.einrueck.fahrzeitS) }) : t(u.spiel.betriebshof ? "fahrplan.ohneEinrueck" : "fahrplan.ohneHof") }),
          ),
        )),
      ),
    );
  }

  const fenster = oeffneFenster("fahrplan", t("fahrplan.titel", { nummer: l.nummer }), h("div", { class: "fahrplanansicht" },
    h("div", { class: "aktionen links" }, h("label", { for: "fahrplan-tag", text: t("linie.tagesart") }), tagWahl, h("label", { for: "fahrplan-variante", text: t("fahrplan.variante") }), variantenWahl),
    hinweis,
    h("div", { class: "rollen" },
      h("table", { class: "tabelle", "data-testid": "fahrplan-tabelle" },
        h("thead", {}, h("tr", {}, ...["fahrplan.abfahrt", "fahrplan.variante", "fahrplan.von", "fahrplan.nach", "fahrplan.ankunft", "fahrplan.status", "fahrplan.dienst", ""].map((k) => h("th", { scope: "col", text: k ? t(k as TextKey) : "" })))),
        koerper,
      ),
    ),
    detail,
    h("h4", { text: t("fahrplan.neu") }),
    h("div", { class: "aktionen links" }, h("label", { for: "neu-fahrt-variante", text: t("fahrplan.variante") }), neuVariante, h("label", { for: "neu-fahrt-zeit", text: t("fahrplan.abfahrt") }), neuZeit, neuKnopf),
    meldung,
    h("h4", { text: t("fahrplan.umlaeufe") }),
    h("p", { class: "hilfe", text: t("fahrplan.umlaeufeHilfe") }),
    bedarfEl,
  ), { breit: true });
  fenster.querySelector("header h2")!.prepend(linienSchild(l), " ");
  beobachte("fahrplan", () => mitFokus(fenster, zeichne));
  zeichne();
}

/* ---------- Haltestelle ---------- */

/** Fenster einer Haltestelle: Name, Herkunft, Linien, Umbenennen; neue Haltestellen lassen sich löschen, solange keine Linie hält. */
export function oeffneHaltestelle(u: LinienUi, id: HaltId): void {
  const hd = u.halte.hole(id);
  if (!hd) return;
  const { el: meldung, melde } = meldungsfeld("haltestelle-meldung");
  const name = h("input", { type: "text", id: "haltestelle-name", "data-testid": "haltestelle-name", value: hd.name, maxlength: L.nameMaxLaenge });
  const umbenennen = h("button", { type: "button", "data-testid": "haltestelle-umbenennen", text: t("haltestelle.umbenennen") });
  umbenennen.addEventListener("click", () => {
    const f = benenneHaltestelle(u.spiel.netz, u.halte, id, name.value, L);
    if (f) return melde(t(`haltestelle.fehler.${f}` as TextKey, W));
    melde(t("haltestelle.umbenannt", { name: name.value.trim() }), true);
    titel.textContent = name.value.trim();
    void berechne();
  });
  const nutzt = (p: { art: string; halt?: string }[]) => p.some((x) => x.art === "halt" && x.halt === id);
  const linien = u.spiel.netz.linien.filter((l) => nutzt(l.perlen) || l.varianten.some((v) => nutzt(v.perlen)));
  const titel = h("p", { class: "fett", "data-testid": "haltestelle-titel", text: hd.name || t("haltestelle.ohneName") });
  const inhalt = h("div", {},
    titel,
    hd.snaps.length ? h("p", { "data-testid": "haltestelle-lage", text: lageText(u, hd) }) : null,
    h("p", { class: "klein", text: u.halte.istNeu(id) ? t("haltestelle.neuAngelegt") : t("haltestelle.osm", { id: id.slice(1) }) }),
    hd.snaps.length ? null : h("p", { class: "schlecht", text: `⚠ ${t("perle.fehler.ohneNetz", W)}` }),
    h("p", { "data-testid": "haltestelle-linien" }, linien.length ? t("haltestelle.linien") : t("haltestelle.keineLinien"), " ", ...linien.flatMap((l) => [linienSchild(l), " "])),
    h("label", { for: "haltestelle-name", text: t("haltestelle.name") }),
    h("div", { class: "aktionen links" }, name, umbenennen),
    meldung,
  );
  if (u.halte.istNeu(id)) {
    const weg = h("button", { type: "button", "data-testid": "haltestelle-loeschen", text: t("haltestelle.loeschen") });
    weg.addEventListener("click", () => {
      const f = loescheHaltestelle(u.spiel.netz, id);
      if (f) return melde(t(`haltestelle.loeschFehler.${f}` as TextKey));
      schliesseFenster("haltestelle");
      void berechne();
    });
    inhalt.append(h("div", { class: "aktionen" }, weg));
  }
  oeffneFenster("haltestelle", t("haltestelle.titel"), inhalt);
}
