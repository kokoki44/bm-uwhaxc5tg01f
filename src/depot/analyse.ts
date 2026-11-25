import type { BetriebshofConfig } from "../config";
import {
  BEFAHRBAR, BUSANLAGE, BUSPLATZ, GEBAEUDE, groessterJeBauart, kleinsterBus, passtBus, platzbedarf, RAUM,
  type Bauteil, type BauteilTyp, type Betriebshof, type BusMass, type HofKontext,
} from "./hof";
import { kontakt, randSeite, SEITEN, seitenLaenge, seitenTiefe, vereinige, type Kontakt, type Rechteck, type Seite } from "./rechteck";

const EPS = 1e-9;

export type HofMeldungCode =
  | "keinTor" | "torNichtAmRand" | "nichtVerbunden" | "stellplatzNichtErreichbar" | "halleNichtErreichbar" | "sackgasse";

export interface HofMeldung {
  code: HofMeldungCode;
  bauteil?: number;
}

export type Kapazitaet =
  | { art: "tor"; busseJeDurchfahrt: 1 }
  | { art: "fahrweg"; gegenverkehr: boolean }
  | { art: "stellplatz"; busse: 1; maxLaengeM: number; maxBreiteM: number }
  | { art: "ladeplatz"; ladepunkte: 1; maxLaengeM: number; maxBreiteM: number; ladeleistungKw: number }
  | { art: "halle"; plaetze: number; jeBauart: Record<string, number> }
  | { art: "werkstatt"; arbeitsplaetze: number }
  | { art: "waschanlage"; busseJeStunde: number }
  | { art: "tankstelle"; zapfsaeulen: number }
  | { art: "lager"; lagereinheiten: number }
  | { art: "buero" }
  | { art: "toilette"; toiletten: number; beschaeftigte: number }
  | { art: "kueche"; plaetze: number }
  | { art: "pausenraum"; plaetze: number };

export interface HofSumme {
  stellplaetze: number;
  hallenplaetze: number;
  /** Stellplätze plus Hallenplätze (für den kleinsten Bus): begrenzt den Fuhrpark. */
  abstellplaetze: number;
  werkstattArbeitsplaetze: number;
  zapfsaeulen: number;
  ladepunkte: number;
  waschBusseJeStunde: number;
  lagereinheiten: number;
  toilettenBeschaeftigte: number;
  kuechenPlaetze: number;
  pausenPlaetze: number;
}

export interface HofAnalyse {
  gueltig: boolean;
  betriebsbereit: boolean;
  fehler: HofMeldung[];
  warnungen: HofMeldung[];
  /** Für den Betrieb fehlende Bauteile (Tor, Stellplatz, Werkstatt, Büro). */
  fehltFuerBetrieb: BauteilTyp[];
  /** Bauteile, die mit dem Tor verbunden sind (bei Stell- und Ladeplätzen: von einer Stirnseite erreichbar). */
  verbunden: Set<number>;
  /** Zufahrten je Bauteil: Abschnitte der Seiten, an denen erreichbare Fahrflächen anliegen. */
  zugang: Map<number, Kontakt[]>;
  /** Tor-Seite am Grundstücksrand (Verbindung zur Straße). */
  torSeite: Map<number, Seite>;
  /** Fahrflächen, die breit genug miteinander verbunden sind (mindestens die kleinste Zufahrtsbreite). */
  fahrNachbarn: Map<number, number[]>;
  kapazitaet: Map<number, Kapazitaet>;
  summe: HofSumme;
}

/** Plätze in einer Halle für einen Bus: nebeneinander, jeder von der Stirnseite erreichbar, keine Blockabstellung. */
export function hallenPlaetze(halle: Rechteck, zugang: Kontakt[], bus: BusMass, cfg: BetriebshofConfig): number {
  const p = platzbedarf(bus, cfg);
  let best = 0;
  for (const s of SEITEN) {
    if (seitenTiefe(halle, s) < p.lang - EPS) continue;
    const iv = vereinige(zugang.filter((k) => k.seite === s).map((k) => [k.von, k.bis] as [number, number]));
    const n = iv.reduce((sum, [a, b]) => sum + Math.floor((b - a) / p.kurz + EPS), 0);
    best = Math.max(best, n);
  }
  return best;
}

/** Wie viele volle Felder a × b passen in das Rechteck (beide Ausrichtungen geprüft)? */
export function felder(r: { b: number; t: number }, a: number, b: number): number {
  const f = (x: number, y: number) => Math.floor(x / a + EPS) * Math.floor(y / b + EPS);
  return Math.max(f(r.b, r.t), f(r.t, r.b));
}

/** Beschäftigte, für die eine Zahl von Toiletten nach ASR A4.1 (niedrige Gleichzeitigkeit) reicht. */
export function beschaeftigteFuerToiletten(toiletten: number, cfg: BetriebshofConfig): number {
  const tab = cfg.toilettenNachBeschaeftigten;
  let best = 0;
  for (const [bis, noetig] of tab) if (noetig <= toiletten) best = bis;
  const [letzteBis, letzteNoetig] = tab[tab.length - 1];
  if (toiletten > letzteNoetig) best = letzteBis + (toiletten - letzteNoetig) * cfg.toilettenBeschaeftigteJeWeitere;
  return best;
}

export function kapazitaetVon(b: Bauteil, zugang: Kontakt[], ctx: HofKontext): Kapazitaet {
  const cfg = ctx.cfg;
  const flaeche = b.b * b.t;
  const kurz = Math.min(b.b, b.t), lang = Math.max(b.b, b.t);
  switch (b.typ) {
    case "tor":
      return { art: "tor", busseJeDurchfahrt: 1 };
    case "fahrweg":
      return { art: "fahrweg", gegenverkehr: kurz >= cfg.gegenverkehrAbM - EPS };
    case "stellplatz":
      return { art: "stellplatz", busse: 1, maxLaengeM: lang - cfg.rangierraumM, maxBreiteM: kurz - cfg.seitenabstandM };
    case "ladeplatz":
      return { art: "ladeplatz", ladepunkte: 1, maxLaengeM: lang - cfg.rangierraumM, maxBreiteM: kurz - cfg.seitenabstandM, ladeleistungKw: b.ladeleistungKw ?? cfg.ladeleistungKw.standard };
    case "halle": {
      const jeBauart: Record<string, number> = {};
      for (const [k, m] of Object.entries(groessterJeBauart(ctx.busse))) jeBauart[k] = hallenPlaetze(b, zugang, m, cfg);
      return { art: "halle", plaetze: hallenPlaetze(b, zugang, kleinsterBus(ctx.busse), cfg), jeBauart };
    }
    case "werkstatt": {
      const bt = cfg.bauteile.werkstatt;
      return { art: "werkstatt", arbeitsplaetze: felder(b, bt.feldA!, bt.feldB!) };
    }
    case "waschanlage":
      return { art: "waschanlage", busseJeStunde: cfg.waschDurchsatzProStunde };
    case "tankstelle": {
      const bt = cfg.bauteile.tankstelle;
      return { art: "tankstelle", zapfsaeulen: felder(b, bt.feldA!, bt.feldB!) };
    }
    case "lager":
      return { art: "lager", lagereinheiten: Math.floor(flaeche * cfg.lagereinheitenProM2 + EPS) };
    case "buero":
      return { art: "buero" };
    case "toilette": {
      const toiletten = Math.floor(flaeche / cfg.toiletteM2ProKabine + EPS);
      return { art: "toilette", toiletten, beschaeftigte: beschaeftigteFuerToiletten(toiletten, cfg) };
    }
    case "kueche":
      return { art: "kueche", plaetze: Math.floor(flaeche / cfg.kuecheM2ProPlatz + EPS) };
    case "pausenraum":
      return { art: "pausenraum", plaetze: Math.max(0, Math.floor((flaeche - cfg.pausenraumGrundM2) / cfg.pausenraumM2ProPerson + EPS)) };
  }
}

/** Stirnseiten (kurze Seiten) eines Rechtecks. */
const stirnseiten = (r: Rechteck): Seite[] => (r.b < r.t ? ["n", "s"] : r.b > r.t ? ["w", "o"] : [...SEITEN]);

/** Länge der längsten zusammenhängenden Zufahrt auf einer Seite. */
const laengsteZufahrt = (zug: Kontakt[], s?: Seite) =>
  Math.max(0, ...vereinige(zug.filter((k) => !s || k.seite === s).map((k) => [k.von, k.bis] as [number, number])).map(([a, b]) => b - a));

/**
 * Prüft das Layout: Ein Layout ist nur gültig, wenn Tor, Fahrwege und alle Bauteile verbunden sind
 * und ein Bus jeden Stellplatz erreichen kann. Warnt bei Sackgassen. Rechnet die Kapazitäten.
 */
export function analysiereHof(hof: Betriebshof, ctx: HofKontext): HofAnalyse {
  const cfg = ctx.cfg;
  const f = hof.grundstueck.flaeche;
  const alle = hof.bauteile;
  const fehler: HofMeldung[] = [];
  const warnungen: HofMeldung[] = [];
  const fahr = alle.filter((b) => BEFAHRBAR.includes(b.typ));
  const tore = alle.filter((b) => b.typ === "tor");
  const torSeite = new Map<number, Seite>();
  if (!tore.length) fehler.push({ code: "keinTor" });
  for (const t of tore) {
    const s = randSeite(f, t);
    if (s) torSeite.set(t.id, s);
    else fehler.push({ code: "torNichtAmRand", bauteil: t.id });
  }

  // Fahrflächen, die vom Tor aus erreichbar sind (Verbindung mindestens so breit wie die kleinste Zufahrt)
  const erreichbar = new Set<number>(torSeite.keys());
  const nachbarn = new Map<number, number[]>(fahr.map((d) => [d.id, []]));
  for (const a of fahr)
    for (const b of fahr) {
      const k = a.id < b.id ? kontakt(a, b) : null;
      if (k && k.bis - k.von >= cfg.zufahrtMinM - EPS) {
        nachbarn.get(a.id)!.push(b.id);
        nachbarn.get(b.id)!.push(a.id);
      }
    }
  const schlange = [...erreichbar];
  while (schlange.length) {
    for (const n of nachbarn.get(schlange.shift()!)!) if (!erreichbar.has(n)) (erreichbar.add(n), schlange.push(n));
  }
  const fahrErreichbar = fahr.filter((d) => erreichbar.has(d.id));

  const zugang = new Map<number, Kontakt[]>();
  for (const b of alle) {
    if (BEFAHRBAR.includes(b.typ)) continue;
    zugang.set(b.id, fahrErreichbar.map((d) => kontakt(b, d)).filter((k): k is Kontakt => !!k));
  }

  const verbunden = new Set<number>(erreichbar);
  const klein = kleinsterBus(ctx.busse);
  for (const b of alle) {
    const zug = zugang.get(b.id) ?? [];
    if (BUSPLATZ.includes(b.typ)) {
      // Ein Bus erreicht den Platz, wenn eine Stirnseite ganz an Fahrweg oder Tor grenzt
      const ok = stirnseiten(b).some((s) => laengsteZufahrt(zug, s) >= seitenLaenge(b, s) - EPS);
      if (ok) verbunden.add(b.id);
      else fehler.push({ code: "stellplatzNichtErreichbar", bauteil: b.id });
    } else if (b.typ === "halle") {
      if (hallenPlaetze(b, zug, klein, cfg) > 0) verbunden.add(b.id);
      else fehler.push({ code: "halleNichtErreichbar", bauteil: b.id });
    } else if (BUSANLAGE.includes(b.typ)) {
      if (laengsteZufahrt(zug) >= cfg.zufahrtMinM - EPS) verbunden.add(b.id);
    }
  }
  // Räume ohne Busverkehr: an Fahrfläche oder an einem verbundenen Gebäude
  let geaendert = true;
  while (geaendert) {
    geaendert = false;
    for (const r of alle) {
      if (!RAUM.includes(r.typ) || verbunden.has(r.id)) continue;
      const ok = alle.some((n) => {
        if (n.id === r.id || !verbunden.has(n.id) || !(BEFAHRBAR.includes(n.typ) || GEBAEUDE.includes(n.typ))) return false;
        const k = kontakt(r, n);
        return !!k && k.bis - k.von >= cfg.gebaeudeKontaktMinM - EPS;
      });
      if (ok) (verbunden.add(r.id), (geaendert = true));
    }
  }
  for (const b of alle) {
    if (verbunden.has(b.id) || BUSPLATZ.includes(b.typ) || b.typ === "halle" || (b.typ === "tor" && !torSeite.has(b.id))) continue;
    fehler.push({ code: "nichtVerbunden", bauteil: b.id });
  }

  // Sackgassen: Fahrweg mit höchstens einem Anschluss, an dem nichts liegt
  for (const d of fahrErreichbar) {
    if (d.typ !== "fahrweg" || nachbarn.get(d.id)!.filter((n) => erreichbar.has(n)).length > 1) continue;
    const genutzt = alle.some((b) => !BEFAHRBAR.includes(b.typ) && kontakt(b, d));
    if (!genutzt) warnungen.push({ code: "sackgasse", bauteil: d.id });
  }

  const kapazitaet = new Map<number, Kapazitaet>();
  for (const b of alle) kapazitaet.set(b.id, kapazitaetVon(b, zugang.get(b.id) ?? [], ctx));

  const summe: HofSumme = {
    stellplaetze: 0, hallenplaetze: 0, abstellplaetze: 0, werkstattArbeitsplaetze: 0, zapfsaeulen: 0, ladepunkte: 0,
    waschBusseJeStunde: 0, lagereinheiten: 0, toilettenBeschaeftigte: 0, kuechenPlaetze: 0, pausenPlaetze: 0,
  };
  for (const b of alle) {
    if (!verbunden.has(b.id)) continue;
    const k = kapazitaet.get(b.id)!;
    if (k.art === "stellplatz") summe.stellplaetze++;
    else if (k.art === "halle") summe.hallenplaetze += k.plaetze;
    else if (k.art === "werkstatt") summe.werkstattArbeitsplaetze += k.arbeitsplaetze;
    else if (k.art === "tankstelle") summe.zapfsaeulen += k.zapfsaeulen;
    else if (k.art === "ladeplatz") summe.ladepunkte++;
    else if (k.art === "waschanlage") summe.waschBusseJeStunde += k.busseJeStunde;
    else if (k.art === "lager") summe.lagereinheiten += k.lagereinheiten;
    else if (k.art === "toilette") summe.toilettenBeschaeftigte += k.beschaeftigte;
    else if (k.art === "kueche") summe.kuechenPlaetze += k.plaetze;
    else if (k.art === "pausenraum") summe.pausenPlaetze += k.plaetze;
  }
  summe.abstellplaetze = summe.stellplaetze + summe.hallenplaetze;

  const fehltFuerBetrieb: BauteilTyp[] = [];
  if (!alle.some((b) => b.typ === "tor" && verbunden.has(b.id))) fehltFuerBetrieb.push("tor");
  if (summe.abstellplaetze === 0) fehltFuerBetrieb.push("stellplatz");
  if (!alle.some((b) => b.typ === "werkstatt" && verbunden.has(b.id))) fehltFuerBetrieb.push("werkstatt");
  if (!alle.some((b) => b.typ === "buero" && verbunden.has(b.id))) fehltFuerBetrieb.push("buero");
  const gueltig = fehler.length === 0;
  return { gueltig, betriebsbereit: gueltig && fehltFuerBetrieb.length === 0, fehler, warnungen, fehltFuerBetrieb, verbunden, zugang, torSeite, fahrNachbarn: nachbarn, kapazitaet, summe };
}

/** Wie viele Busse dieser Größe kann der Hof abstellen? (Stellplätze, auf die er passt, plus Hallenplätze.) */
export function fuhrparkGrenze(hof: Betriebshof, a: HofAnalyse, bus: BusMass, cfg: BetriebshofConfig): number {
  let n = 0;
  for (const b of hof.bauteile) {
    if (!a.verbunden.has(b.id)) continue;
    if (b.typ === "stellplatz" && passtBus(bus, b, cfg)) n++;
    else if (b.typ === "halle") n += hallenPlaetze(b, a.zugang.get(b.id) ?? [], bus, cfg);
  }
  return n;
}
