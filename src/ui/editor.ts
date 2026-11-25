import { config } from "../config";
import { analysiereHof, type HofAnalyse, type HofMeldung, type Kapazitaet } from "../depot/analyse";
import {
  abreissen, BAUTEIL_TYPEN, bauen, baukostenEur, groessterJeBauart, mindestmass, passtBus, setzeLadeleistung, zukaufen, zukaufHoechstM, zukaufKostenEur,
  type Bauteil, type BauteilTyp, type Betriebshof, type HofKontext,
} from "../depot/hof";
import type { Seite } from "../depot/rechteck";
import { berechneWege, type HofWege } from "../depot/wege";
import type { SpielZustand } from "../game/setup";
import { t, type TextKey } from "../i18n";
import { torAnbindung } from "../world/standorte";
import type { World } from "../world/world";
import { h } from "./dom";
import { euro, zahl } from "./format";

export interface EditorKontext {
  spiel: SpielZustand;
  ctx: HofKontext;
  world: World;
  kontoGeaendert(): void;
  /** Editor wurde geschlossen (zurück zur Karte). */
  geschlossen(): void;
}

const cfg = config.betriebshof;
const Z = cfg.zeichnung.farben;
const SVG = "http://www.w3.org/2000/svg";
const NS = (tag: string, attrs: Record<string, string | number> = {}): SVGElement => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

export const bauteilName = (typ: BauteilTyp): string => t(`bauteil.${typ}` as TextKey);
const symbol = (typ: BauteilTyp): string => t(`bauteil.symbol.${typ}` as TextKey);
const bezeichnung = (b: Bauteil): string => t("editor.bauteilNr", { nr: b.id, name: bauteilName(b.typ) });

let offen: { el: HTMLElement; schliessen(): void } | null = null;

export function editorOffen(): boolean {
  return offen !== null;
}

export function schliesseEditor(): void {
  offen?.schliessen();
}

/** Text zur Kapazität eines Bauteils. */
export function kapazitaetText(k: Kapazitaet): string {
  switch (k.art) {
    case "tor": return t("kap.tor");
    case "fahrweg": return t(k.gegenverkehr ? "kap.fahrweg.gegenverkehr" : "kap.fahrweg.einspurig", { m: zahl(cfg.gegenverkehrAbM) });
    case "stellplatz": return t("kap.stellplatz", { laenge: zahl(k.maxLaengeM), breite: zahl(k.maxBreiteM) });
    case "ladeplatz": return t("kap.ladeplatz", { laenge: zahl(k.maxLaengeM), breite: zahl(k.maxBreiteM), kw: k.ladeleistungKw });
    case "halle": return t("kap.halle", { plaetze: k.plaetze, je: Object.entries(k.jeBauart).map(([b, n]) => `${b} ${n}`).join(", ") });
    case "werkstatt": return t("kap.werkstatt", { n: k.arbeitsplaetze });
    case "waschanlage": return t("kap.waschanlage", { n: k.busseJeStunde });
    case "tankstelle": return t("kap.tankstelle", { n: k.zapfsaeulen, min: cfg.betankungMin });
    case "lager": return t("kap.lager", { n: k.lagereinheiten });
    case "buero": return t("kap.buero");
    case "toilette": return t("kap.toilette", { n: k.toiletten, personen: k.beschaeftigte });
    case "kueche": return t("kap.kueche", { n: k.plaetze });
    case "pausenraum": return t("kap.pausenraum", { n: k.plaetze });
  }
}

/** Betriebshof-Editor: eigene Ansicht, getrennt von der Karte. */
export function oeffneEditor(k: EditorKontext): void {
  schliesseEditor();
  const hof: Betriebshof = k.spiel.betriebshof!;
  let werkzeug: BauteilTyp | "auswahl" = "auswahl";
  let raster = cfg.rasterStandard;
  let ausgewaehlt: number | null = null;
  let analyse: HofAnalyse = analysiereHof(hof, k.ctx);
  let wege: HofWege = berechneWege(hof, analyse, cfg);

  // Linke Spalte: Werkzeuge
  const meldung = h("p", { class: "meldung", role: "status", "aria-live": "polite", "data-testid": "editor-meldung" });
  const werkzeuge = h("fieldset", { class: "werkzeuge" }, h("legend", { text: t("editor.werkzeug") }));
  const radio = (wert: string, text: string, farbe?: string, titel?: string) => {
    const id = `wz-${wert}`;
    const r = h("input", { type: "radio", name: "werkzeug", id, value: wert, "data-testid": `werkzeug-${wert}` });
    if (wert === "auswahl") r.checked = true;
    r.addEventListener("change", () => waehleWerkzeug(wert as BauteilTyp | "auswahl"));
    return h("label", { class: "option", for: id, title: titel }, r, farbe ? h("span", { class: "farbfeld", style: `background:${farbe}`, "aria-hidden": "true" }) : null, text);
  };
  werkzeuge.append(radio("auswahl", t("editor.auswaehlen")));
  for (const typ of BAUTEIL_TYPEN) {
    const m = mindestmass(typ, k.ctx);
    werkzeuge.append(radio(typ, `${symbol(typ)}: ${bauteilName(typ)}`, cfg.bauteile[typ].farbe, t("editor.werkzeugHilfe", { kosten: euro(cfg.bauteile[typ].kostenEurM2), kurz: zahl(m.kurz), lang: zahl(m.lang) })));
  }
  const rasterWahl = h("select", { id: "e-raster", "data-testid": "editor-raster" }, ...cfg.raster.map((r) => h("option", { value: r, text: t("einheit.m", { n: r }), selected: r === raster })));
  rasterWahl.addEventListener("change", () => ((raster = Number(rasterWahl.value)), zeichne()));
  const feld = (id: string, label: string) => {
    const i = h("input", { id, type: "number", step: 1, "data-testid": id });
    return [h("label", { for: id, text: label }), i] as const;
  };
  const [lx, ex] = feld("e-x", t("editor.x"));
  const [ly, ey] = feld("e-y", t("editor.y"));
  const [lb, eb] = feld("e-b", t("editor.breite"));
  const [lt, et] = feld("e-t", t("editor.tiefe"));
  const bauKnopf = h("button", { type: "submit", class: "primaer", "data-testid": "editor-bauen", text: t("editor.bauen") });
  const bauKosten = h("p", { class: "hilfe", "data-testid": "editor-baukosten" });
  const eingabe = h("form", { class: "eingabe", "data-testid": "editor-eingabe" }, h("h3", { text: t("editor.eingabe") }), h("div", { class: "zweispaltig" }, lx, ex, ly, ey, lb, eb, lt, et), bauKosten, bauKnopf);
  eingabe.addEventListener("submit", (e) => {
    e.preventDefault();
    if (werkzeug === "auswahl") return melde(t("editor.erstWerkzeug"));
    versucheBau({ x: Number(ex.value), y: Number(ey.value), b: Number(eb.value), t: Number(et.value) });
  });
  for (const i of [eb, et]) i.addEventListener("input", zeigeBaukosten);

  const seiteWahl = h("select", { id: "e-seite", "data-testid": "zukauf-seite" }, ...(["n", "o", "s", "w"] as Seite[]).map((s) => h("option", { value: s, text: t(`seite.${s}` as TextKey) })));
  const zukaufM = h("input", { id: "e-zukauf", type: "number", min: 1, step: 1, value: cfg.zukaufStandardM, "data-testid": "zukauf-meter" });
  const zukaufInfo = h("p", { class: "hilfe", "data-testid": "zukauf-info" });
  const zukaufKnopf = h("button", { type: "button", "data-testid": "zukauf-kaufen", text: t("editor.zukaufen") });
  const zukaufInfoSetzen = () => {
    const s = seiteWahl.value as Seite, m = Number(zukaufM.value);
    zukaufInfo.textContent = t("editor.zukaufInfo", { kosten: Number.isInteger(m) && m > 0 ? euro(zukaufKostenEur(hof, s, m)) : "", max: zukaufHoechstM(hof, s, config.grundstueck) });
    // Ein Tor an dieser Seite läge nach dem Zukauf nicht mehr am Rand
    const f = hof.grundstueck.flaeche;
    const anSeite = (b: Bauteil) => (s === "n" ? b.y === f.y : s === "s" ? b.y + b.t === f.y + f.t : s === "w" ? b.x === f.x : b.x + b.b === f.x + f.b);
    if (hof.bauteile.some((b) => b.typ === "tor" && anSeite(b))) zukaufInfo.textContent += " " + t("editor.zukaufTorWarnung");
  };
  seiteWahl.addEventListener("change", zukaufInfoSetzen);
  zukaufM.addEventListener("input", zukaufInfoSetzen);
  zukaufKnopf.addEventListener("click", () => {
    const e = zukaufen(hof, k.spiel, seiteWahl.value as Seite, Number(zukaufM.value), config.grundstueck);
    if (e.ok) melde(t("editor.zukaufOk", { kosten: euro(e.kostenEur) }), true);
    else melde(t(`editor.zukaufFehler.${e.fehler}` as TextKey, { max: zahl(config.grundstueck.hoechstflaecheM2), ha: zahl(config.grundstueck.hoechstflaecheM2 / 10000), verhaeltnis: config.grundstueck.maxSeitenverhaeltnis }));
    if (e.ok) aenderung();
  });
  const zukauf = h("div", { class: "zukauf" }, h("h3", { text: t("editor.zukauf") }), h("div", { class: "zweispaltig" }, h("label", { for: "e-seite", text: t("editor.seite") }), seiteWahl, h("label", { for: "e-zukauf", text: t("editor.meter") }), zukaufM), zukaufInfo, zukaufKnopf);

  const zurueck = h("button", { type: "button", "data-testid": "editor-schliessen", text: t("editor.zurKarte") });
  zurueck.addEventListener("click", () => schliesseEditor());
  const links = h("aside", { class: "editor-links" },
    h("div", { class: "editor-kopf" }, h("h2", { text: t("editor.titel") }), zurueck),
    werkzeuge,
    h("div", { class: "zweispaltig" }, h("label", { for: "e-raster", text: t("editor.raster") }), rasterWahl),
    eingabe, meldung, zukauf,
  );

  // Mitte: Draufsicht
  const svg = NS("svg", { "data-testid": "editor-flaeche", role: "img", "aria-label": t("editor.flaeche") }) as SVGSVGElement;
  const mitte = h("div", { class: "editor-mitte" }, svg);

  // Rechte Spalte: Prüfung und Auswahl
  const pruefung = h("div", { "data-testid": "editor-pruefung", "aria-live": "polite" });
  const summen = h("div", { "data-testid": "editor-summen" });
  const auswahl = h("div", { "data-testid": "editor-auswahl" });
  const liste = h("div", { class: "rollen kurz", "data-testid": "editor-liste" });
  const rechts = h("aside", { class: "editor-rechts" }, pruefung, auswahl, summen, h("h3", { text: t("editor.bauteile") }), liste);

  const el = h("section", { id: "editor", "data-testid": "editor", "aria-label": t("editor.titel") }, links, mitte, rechts);
  document.body.append(el);
  document.body.classList.add("im-editor");
  offen = {
    el,
    schliessen() {
      el.remove();
      document.body.classList.remove("im-editor");
      offen = null;
      k.geschlossen();
    },
  };

  function waehleWerkzeug(w: BauteilTyp | "auswahl") {
    werkzeug = w;
    if (w !== "auswahl") {
      const m = mindestmass(w, k.ctx);
      const r = (x: number) => Math.ceil(x / raster - 1e-9) * raster;
      eb.value = String(r(m.kurz));
      et.value = String(r(m.lang));
      if (ex.value === "") ex.value = String(hof.grundstueck.flaeche.x);
      if (ey.value === "") ey.value = String(hof.grundstueck.flaeche.y);
    }
    zeigeBaukosten();
  }

  function zeigeBaukosten() {
    bauKosten.textContent = werkzeug === "auswahl" ? t("editor.auswahlHilfe") : t("editor.baukosten", { kosten: euro(baukostenEur(werkzeug, { b: Number(eb.value) || 0, t: Number(et.value) || 0 }, cfg)) });
  }

  /** Meldung unter dem Bauen: Fehler rot mit Warnzeichen, Erfolg neutral. */
  function melde(text: string, ok = false) {
    meldung.className = ok ? "erfolg" : "meldung";
    meldung.textContent = ok ? text : t("zeichen.warnung", { text });
  }

  function versucheBau(r: { x: number; y: number; b: number; t: number }) {
    if (werkzeug === "auswahl") return;
    const e = bauen(hof, k.spiel, werkzeug, r, k.ctx);
    if (!e.ok) {
      const m = mindestmass(werkzeug, k.ctx);
      melde(t(`editor.baufehler.${e.fehler}` as TextKey, { kurz: zahl(m.kurz), lang: zahl(m.lang) }));
      return;
    }
    melde(t("editor.gebaut", { name: bezeichnung(e.bauteil), kosten: euro(e.kostenEur) }), true);
    ausgewaehlt = e.bauteil.id;
    aenderung();
  }

  function aenderung() {
    analyse = analysiereHof(hof, k.ctx);
    wege = berechneWege(hof, analyse, cfg);
    k.kontoGeaendert();
    zeichne();
  }

  const meldungText = (m: HofMeldung) => {
    const b = hof.bauteile.find((x) => x.id === m.bauteil);
    return t(`editor.meldung.${m.code}` as TextKey, { bauteil: b ? bezeichnung(b) : "", m: zahl(config.betriebshof.wendeflaecheMinM) });
  };

  function zeichneInfo() {
    const a = analyse;
    pruefung.replaceChildren(
      ...[
      h("h3", { text: t("editor.pruefung") }),
      h("p", { class: a.gueltig ? "ok" : "schlecht", "data-testid": "editor-gueltig", text: a.gueltig ? t("editor.gueltig") : t("editor.ungueltig") }),
      a.fehler.length ? h("ul", { "data-testid": "editor-fehler" }, ...a.fehler.map((f) => h("li", { text: meldungText(f) }))) : null,
      a.warnungen.length ? h("ul", { class: "warnung", "data-testid": "editor-warnungen" }, ...a.warnungen.map((f) => h("li", { text: t("zeichen.warnung", { text: meldungText(f) }) }))) : null,
      h("p", { "data-testid": "editor-betrieb", class: a.betriebsbereit ? "ok" : "schlecht", text: a.betriebsbereit ? t("editor.betriebsbereit") : t("editor.nichtBetriebsbereit", { fehlt: a.fehltFuerBetrieb.map(bauteilName).join(", ") || t("editor.keinWert") }) }),
      ].filter((x) => x !== null),
    );
    const s = a.summe, p = wege.pauschal;
    const f = hof.grundstueck.flaeche;
    const sek = (x: number | null) => (x === null ? t("editor.keinWert") : t("einheit.s", { n: zahl(x) }));
    summen.replaceChildren(
      h("h3", { text: t("editor.kapazitaeten") }),
      h("dl", { class: "werte" },
        h("dt", { text: t("editor.sum.abstellplaetze") }), h("dd", { "data-testid": "sum-abstellplaetze", text: t("editor.sum.abstellplaetzeWert", { n: s.abstellplaetze, stell: s.stellplaetze, halle: s.hallenplaetze }) }),
        h("dt", { text: t("editor.sum.werkstatt") }), h("dd", { "data-testid": "sum-werkstatt", text: String(s.werkstattArbeitsplaetze) }),
        h("dt", { text: t("editor.sum.zapfsaeulen") }), h("dd", { text: String(s.zapfsaeulen) }),
        h("dt", { text: t("editor.sum.ladepunkte") }), h("dd", { text: String(s.ladepunkte) }),
        h("dt", { text: t("editor.sum.waesche") }), h("dd", { text: String(s.waschBusseJeStunde) }),
        h("dt", { text: t("editor.sum.lager") }), h("dd", { text: String(s.lagereinheiten) }),
        h("dt", { text: t("editor.sum.sozial") }), h("dd", { text: t("editor.sum.sozialWert", { wc: s.toilettenBeschaeftigte, kueche: s.kuechenPlaetze, pause: s.pausenPlaetze }) }),
        h("dt", { text: t("editor.sum.pauschal") }), h("dd", { "data-testid": "sum-pauschal", text: t("editor.sum.pauschalWert", { stell: sek(p.zumAbstellplatzS), werkstatt: sek(p.zurWerkstattS), wasch: sek(p.zurWaschanlageS), tank: sek(p.zurTankstelleS), laden: sek(p.zumLadeplatzS) }) }),
        h("dt", { text: t("editor.grundstueck") }), h("dd", { "data-testid": "editor-grundstueck", text: t("editor.grundstueckWert", { b: f.b, t: f.t, flaeche: zahl(f.b * f.t), preis: hof.grundstueck.preisEurM2 }) }),
      ),
    );
    liste.replaceChildren(
      ...hof.bauteile.map((b) => {
        const knopf = h("button", { type: "button", class: "listeneintrag", "aria-pressed": String(b.id === ausgewaehlt), "data-testid": `bauteil-${b.id}`, text: t(analyse.verbunden.has(b.id) ? "editor.listeneintrag" : "editor.listeneintragFehler", { name: bezeichnung(b), b: b.b, t: b.t }) });
        knopf.addEventListener("click", () => ((ausgewaehlt = b.id), zeichne()));
        return knopf;
      }),
    );
    zeichneAuswahl();
    zukaufInfoSetzen();
  }

  function zeichneAuswahl() {
    const b = hof.bauteile.find((x) => x.id === ausgewaehlt);
    if (!b) {
      auswahl.replaceChildren(h("p", { class: "hilfe", text: t("editor.nichtsAusgewaehlt") }));
      return;
    }
    const w = wege.je.get(b.id);
    const zeilen: (Node | null)[] = [
      h("h3", { text: bezeichnung(b) }),
      h("p", { text: t("editor.lageMasse", { x: b.x, y: b.y, b: b.b, t: b.t, flaeche: zahl(b.b * b.t) }) }),
      h("p", { "data-testid": "auswahl-kapazitaet", text: kapazitaetText(analyse.kapazitaet.get(b.id)!) }),
      h("p", { text: analyse.verbunden.has(b.id) ? t("editor.verbunden") : t("editor.nichtVerbunden") }),
    ];
    if (w) zeilen.push(h("p", { "data-testid": "auswahl-weg", class: "fett", text: t("editor.weg", { m: zahl(w.laengeM), s: zahl(w.fahrzeitS), kmh: cfg.hofGeschwindigkeitKmh }) }));
    if (b.typ === "stellplatz" || b.typ === "ladeplatz") {
      const passt = Object.entries(groessterJeBauart(k.ctx.busse)).filter(([, m]) => passtBus(m, b, cfg)).map(([n]) => n);
      zeilen.push(h("p", { text: t("editor.passendeBauarten", { liste: passt.join(", ") || t("editor.keinWert") }) }));
    }
    if (b.typ === "tor") {
      const s = analyse.torSeite.get(b.id);
      const anb = s ? torAnbindung(hof, b.id, s, k.world.network, config.grundstueck) : null;
      zeilen.push(h("p", { "data-testid": "auswahl-anbindung", text: anb ? t("editor.anbindung", { m: zahl(anb.distM), strasse: anb.strasse || t("grundstueck.ohneName") }) : t("editor.keineAnbindung") }));
    }
    if (b.typ === "ladeplatz") {
      const kw = h("input", { id: "e-kw", type: "number", min: cfg.ladeleistungKw.min, max: cfg.ladeleistungKw.max, step: 1, value: b.ladeleistungKw ?? cfg.ladeleistungKw.standard, "data-testid": "auswahl-ladeleistung" });
      kw.addEventListener("change", () => {
        if (setzeLadeleistung(hof, b.id, Number(kw.value), cfg)) aenderung();
        else melde(t("editor.ladeleistungFehler", { min: cfg.ladeleistungKw.min, max: cfg.ladeleistungKw.max }));
      });
      zeilen.push(h("div", { class: "zweispaltig" }, h("label", { for: "e-kw", text: t("editor.ladeleistung") }), kw));
    }
    const erstattung = baukostenEur(b.typ, b, cfg) * cfg.abrissErstattung;
    const abriss = h("button", { type: "button", "data-testid": "auswahl-abreissen", text: t("editor.abreissen", { erstattung: euro(erstattung) }) });
    abriss.addEventListener("click", () => {
      const e = abreissen(hof, k.spiel, b.id, cfg);
      melde(t("editor.abgerissen", { name: bezeichnung(b), erstattung: euro(e ?? 0) }), true);
      ausgewaehlt = null;
      aenderung();
    });
    zeilen.push(abriss);
    auswahl.replaceChildren(...zeilen.filter((z): z is Node => !!z));
  }

  // Zeichnen der Draufsicht
  let vorschau: SVGElement | null = null;
  function zeichne() {
    const f = hof.grundstueck.flaeche;
    const rand = Math.max(cfg.zeichnung.randMinM, Math.max(f.b, f.t) * cfg.zeichnung.randAnteil);
    svg.setAttribute("viewBox", `${f.x - rand} ${f.y - rand} ${f.b + 2 * rand} ${f.t + 2 * rand}`);
    svg.replaceChildren();
    const defs = NS("defs");
    const muster = NS("pattern", { id: "schraffur", width: 2, height: 2, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    muster.append(NS("rect", { width: 1, height: 2, fill: Z.nichtVerbunden, "fill-opacity": 0.45 }));
    defs.append(muster);
    svg.append(defs);
    svg.append(NS("rect", { x: f.x, y: f.y, width: f.b, height: f.t, fill: Z.grund, stroke: Z.grundRand, "stroke-width": 2, "vector-effect": "non-scaling-stroke" }));
    // Rasterlinien
    const linien = NS("g", { stroke: Z.raster, "stroke-width": 1, "vector-effect": "non-scaling-stroke", "data-testid": "raster" });
    // bei sehr vielen Linien nur jede fünfte zeichnen, damit die Ansicht lesbar und schnell bleibt
    const viele = cfg.zeichnung.maxRasterLinien;
    const schritt = f.b / raster > viele || f.t / raster > viele ? raster * 5 : raster;
    for (let x = f.x + schritt; x < f.x + f.b; x += schritt) linien.append(NS("line", { x1: x, y1: f.y, x2: x, y2: f.y + f.t, "vector-effect": "non-scaling-stroke" }));
    for (let y = f.y + schritt; y < f.y + f.t; y += schritt) linien.append(NS("line", { x1: f.x, y1: y, x2: f.x + f.b, y2: y, "vector-effect": "non-scaling-stroke" }));
    svg.append(linien);
    for (const b of hof.bauteile) {
      const g = NS("g", { "data-bauteil": b.id, "data-typ": b.typ });
      g.append(NS("rect", { x: b.x, y: b.y, width: b.b, height: b.t, fill: cfg.bauteile[b.typ].farbe, stroke: Z.bauteilRand, "stroke-width": 1, "vector-effect": "non-scaling-stroke" }));
      const verbunden = analyse.verbunden.has(b.id);
      if (!verbunden) g.append(NS("rect", { x: b.x, y: b.y, width: b.b, height: b.t, fill: "url(#schraffur)", stroke: Z.nichtVerbunden, "stroke-width": 2, "stroke-dasharray": "4 3", "vector-effect": "non-scaling-stroke" }));
      const seite = analyse.torSeite.get(b.id);
      if (seite) {
        const [x1, y1, x2, y2] = seite === "n" ? [b.x, b.y, b.x + b.b, b.y] : seite === "s" ? [b.x, b.y + b.t, b.x + b.b, b.y + b.t] : seite === "w" ? [b.x, b.y, b.x, b.y + b.t] : [b.x + b.b, b.y, b.x + b.b, b.y + b.t];
        g.append(NS("line", { x1, y1, x2, y2, stroke: Z.torRand, "stroke-width": 5, "vector-effect": "non-scaling-stroke" }));
      }
      if (b.id === ausgewaehlt) g.append(NS("rect", { x: b.x, y: b.y, width: b.b, height: b.t, fill: "none", stroke: Z.auswahl, "stroke-width": 4, "vector-effect": "non-scaling-stroke" }));
      const beschriftung = verbunden ? symbol(b.typ) : t("editor.symbolFehler", { symbol: symbol(b.typ) });
      // Schrift passt in das Rechteck: höchstens 45 % der kurzen Seite und so schmal, dass der Text in die Breite passt
      const groesse = Math.max(0.6, Math.min(4, Math.min(b.b, b.t) * 0.45, (b.b * 0.9) / (beschriftung.length * 0.6)));
      const text = NS("text", { x: b.x + b.b / 2, y: b.y + b.t / 2, "font-size": groesse, "text-anchor": "middle", "dominant-baseline": "central", fill: Z.text, "pointer-events": "none" });
      text.textContent = beschriftung;
      g.append(text);
      svg.append(g);
    }
    const w = ausgewaehlt !== null ? wege.je.get(ausgewaehlt) : undefined;
    if (w) {
      svg.append(NS("polyline", { points: w.punkte.map((p) => p.join(",")).join(" "), fill: "none", stroke: Z.weg, "stroke-width": 3, "stroke-dasharray": "6 3", "vector-effect": "non-scaling-stroke", "data-testid": "weg-linie" }));
      const [sx, sy] = w.punkte[0];
      svg.append(NS("circle", { cx: sx, cy: sy, r: 0.6, fill: Z.weg }));
    }
    vorschau = null;
    zeichneInfo();
  }

  // Maus: Ziehen baut mit dem gewählten Werkzeug, Klick wählt ein Bauteil aus
  const hofPunkt = (e: PointerEvent): [number, number] => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return [p.x, p.y];
  };
  const amRaster = (v: number) => Math.round(v / raster) * raster;
  let start: [number, number] | null = null;
  let startRoh: [number, number] | null = null;
  svg.addEventListener("pointerdown", (e) => {
    startRoh = hofPunkt(e);
    start = [amRaster(startRoh[0]), amRaster(startRoh[1])];
    svg.setPointerCapture(e.pointerId);
  });
  const rechteckAus = (p: [number, number]) => {
    const q = [amRaster(p[0]), amRaster(p[1])];
    return { x: Math.min(start![0], q[0]), y: Math.min(start![1], q[1]), b: Math.abs(q[0] - start![0]), t: Math.abs(q[1] - start![1]) };
  };
  svg.addEventListener("pointermove", (e) => {
    if (!start || werkzeug === "auswahl") return;
    const r = rechteckAus(hofPunkt(e));
    if (!vorschau) {
      vorschau = NS("rect", { fill: cfg.bauteile[werkzeug].farbe, "fill-opacity": 0.5, stroke: Z.text, "stroke-dasharray": "4 2", "stroke-width": 2, "vector-effect": "non-scaling-stroke", "data-testid": "vorschau" });
      svg.append(vorschau);
    }
    vorschau.setAttribute("x", String(r.x));
    vorschau.setAttribute("y", String(r.y));
    vorschau.setAttribute("width", String(r.b));
    vorschau.setAttribute("height", String(r.t));
  });
  svg.addEventListener("pointerup", (e) => {
    if (!start || !startRoh) return;
    const p = hofPunkt(e);
    const r = rechteckAus(p);
    const roh = startRoh;
    start = startRoh = null;
    vorschau?.remove();
    vorschau = null;
    if (werkzeug !== "auswahl" && r.b > 0 && r.t > 0) {
      ex.value = String(r.x);
      ey.value = String(r.y);
      eb.value = String(r.b);
      et.value = String(r.t);
      versucheBau(r);
      return;
    }
    const getroffen = hof.bauteile.find((b) => roh[0] >= b.x && roh[0] <= b.x + b.b && roh[1] >= b.y && roh[1] <= b.y + b.t);
    ausgewaehlt = getroffen?.id ?? null;
    zeichne();
  });

  zeichne();
  zeigeBaukosten();
  (werkzeuge.querySelector("input") as HTMLInputElement).focus();
}
