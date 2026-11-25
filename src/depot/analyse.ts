import type { BetriebshofConfig } from "../config";
import {
  BEFAHRBAR, BUSANLAGE, BUSPLATZ, GEBAEUDE, groessterJeBauart, kleinsterBus, passtBus, platzbedarf, RAUM,
  type Bauteil, type BauteilTyp, type Betriebshof, type BusMass, type HofKontext,
} from "./hof";
import { kontakt, randSeite, SEITEN, seitenLaenge, seitenTiefe, vereinige, type Kontakt, type Rechteck, type Seite } from "./rechteck";

const EPS = 1e-9;

export type HofMeldungCode =
  | "keinTor" | "torNichtAmRand" | "nichtVerbunden" | "getrennteNetze" | "stellplatzNichtErreichbar" | "halleNichtErreichbar"
  | "sackgasse" | "keineWendemoeglichkeit";

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

/** Ist die Fahrfläche groß genug, dass ein Bus darauf vorwärts wenden kann? */
export const istWendeflaeche = (r: Rechteck, cfg: BetriebshofConfig) => Math.min(r.b, r.t) >= cfg.wendeflaecheMinM - EPS;

/** Mitte der Torseite am Grundstücksrand (dort beginnt die Straße). */
export function torPunkt(t: Rechteck, s: Seite): [number, number] {
  return s === "n" ? [t.x + t.b / 2, t.y] : s === "s" ? [t.x + t.b / 2, t.y + t.t] : s === "w" ? [t.x, t.y + t.t / 2] : [t.x + t.b, t.y + t.t / 2];
}

/**
 * Fahrflächen, die eine Fläche umschließen (Rundweg, Koko 25.11.2026): Auf dem 1-m-Raster sind die Löcher der befahrbaren
 * Fläche die nicht befahrbaren Zellen, die nicht mit dem Bereich außerhalb verbunden sind. Ein Fahrweg liegt auf einem
 * Rundweg, wenn er an ein solches Loch grenzt. Drei Fahrwege, die sich an einer Einmündung nur gegenseitig berühren,
 * umschließen nichts und bilden keinen Rundweg.
 */
export function umschliessendeFahrflaechen(fahr: Bauteil[], flaeche: Rechteck): Set<number> {
  const x0 = Math.floor(flaeche.x) - 1, y0 = Math.floor(flaeche.y) - 1;
  const B = Math.ceil(flaeche.b) + 2, T = Math.ceil(flaeche.t) + 2;
  const eigner = new Int32Array(B * T).fill(-1);
  for (const d of fahr)
    for (let y = Math.max(0, Math.floor(d.y) - y0); y < Math.min(T, Math.ceil(d.y + d.t) - y0); y++)
      for (let x = Math.max(0, Math.floor(d.x) - x0); x < Math.min(B, Math.ceil(d.x + d.b) - x0); x++) eigner[y * B + x] = d.id;
  // Außenbereich: von der Randzeile aus alle nicht befahrbaren Zellen (4 Richtungen)
  const aussen = new Uint8Array(B * T);
  const q: number[] = [0];
  aussen[0] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % B, y = (i - x) / B;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= B || ny >= T) continue;
      const j = ny * B + nx;
      if (aussen[j] || eigner[j] >= 0) continue;
      aussen[j] = 1;
      q.push(j);
    }
  }
  const out = new Set<number>();
  for (let i = 0; i < B * T; i++) {
    if (eigner[i] >= 0 || aussen[i]) continue;
    // Lochzelle: angrenzende Fahrflächen (8 Richtungen) liegen auf dem Rundweg
    const x = i % B, y = (i - x) / B;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < B && ny < T && eigner[ny * B + nx] >= 0) out.add(eigner[ny * B + nx]);
      }
  }
  return out;
}

/**
 * Fahrwege ohne Wendemöglichkeit (Annahme A2-31, geschärft am 25.11.2026). Netz: Tore und Fahrwege, verbunden bei breitem
 * Kontakt. Ein Fahrweg hat eine Wendemöglichkeit, wenn er auf einem Rundweg liegt, der eine Fläche umschließt, oder auf
 * einer Durchfahrt zwischen zwei Toren, deren Torseiten mindestens wendeflaecheMinM auseinander liegen, oder wenn hinter
 * ihm, vom nächsten Tor aus gesehen, eine Wendefläche (beide Seiten mindestens wendeflaecheMinM), ein solcher Rundweg oder
 * eine solche Durchfahrt liegt. Er selbst zählt dabei mit.
 */
export function ohneWendemoeglichkeit(
  fahr: Bauteil[], nachbarn: Map<number, number[]>, torSeite: Map<number, Seite>, flaeche: Rechteck, cfg: BetriebshofConfig,
): number[] {
  const ids = new Set(fahr.map((d) => d.id));
  const adj = new Map<number, number[]>();
  for (const d of fahr) adj.set(d.id, (nachbarn.get(d.id) ?? []).filter((n) => ids.has(n)));
  const bfs = (starts: number[], sperre?: number) => {
    const dist = new Map<number, number>(starts.map((s) => [s, 0]));
    const vorg = new Map<number, number>();
    const q = [...starts];
    while (q.length) {
      const x = q.shift()!;
      for (const y of adj.get(x) ?? []) {
        if (y === sperre || dist.has(y)) continue;
        dist.set(y, dist.get(x)! + 1);
        vorg.set(y, x);
        q.push(y);
      }
    }
    return { dist, vorg };
  };
  const rundweg = umschliessendeFahrflaechen(fahr, flaeche);
  // Durchfahrt: kürzester Weg zwischen zwei Toren, die weit genug auseinander liegen
  const tore = fahr.filter((d) => torSeite.has(d.id));
  for (let i = 0; i < tore.length; i++)
    for (let j = i + 1; j < tore.length; j++) {
      const [ax, ay] = torPunkt(tore[i], torSeite.get(tore[i].id)!), [bx, by] = torPunkt(tore[j], torSeite.get(tore[j].id)!);
      if (Math.hypot(ax - bx, ay - by) < cfg.wendeflaecheMinM - EPS) continue;
      const { dist, vorg } = bfs([tore[i].id]);
      if (!dist.has(tore[j].id)) continue;
      for (let x: number | undefined = tore[j].id; x !== undefined; x = vorg.get(x)) rundweg.add(x);
    }
  const { dist } = bfs(tore.map((t) => t.id));
  const wende = new Set(fahr.filter((d) => istWendeflaeche(d, cfg)).map((d) => d.id));
  const out: number[] = [];
  for (const d of fahr) {
    if (d.typ !== "fahrweg" || rundweg.has(d.id) || !dist.has(d.id)) continue;
    // Vorgänger in Richtung des nächsten Tors; dahinter liegt alles, was ohne ihn erreichbar ist
    const vor = adj.get(d.id)!.find((y) => dist.get(y) === dist.get(d.id)! - 1);
    const hinter = bfs([d.id], vor).dist;
    if (![...hinter.keys()].some((x) => wende.has(x) || rundweg.has(x))) out.push(d.id);
  }
  return out;
}

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
  const erreichbar = new Set<number>();
  const nachbarn = new Map<number, number[]>(fahr.map((d) => [d.id, []]));
  for (const a of fahr)
    for (const b of fahr) {
      const k = a.id < b.id ? kontakt(a, b) : null;
      if (k && k.bis - k.von >= cfg.zufahrtMinM - EPS) {
        nachbarn.get(a.id)!.push(b.id);
        nachbarn.get(b.id)!.push(a.id);
      }
    }
  // Ein Layout ist ein zusammenhängendes Netz: mehrere Tore sind erlaubt, aber nur im selben Netz.
  // Gemeldet wird jedes Netz außer dem größten (meiste Fahrflächen), jeweils an seinem ersten Tor.
  const netze: { tor: number; groesse: number }[] = [];
  for (const t of torSeite.keys()) {
    if (erreichbar.has(t)) continue;
    erreichbar.add(t);
    let groesse = 1;
    const schlange = [t];
    while (schlange.length) {
      for (const n of nachbarn.get(schlange.shift()!)!) if (!erreichbar.has(n)) (erreichbar.add(n), schlange.push(n), groesse++);
    }
    netze.push({ tor: t, groesse });
  }
  if (netze.length > 1) {
    const haupt = netze.reduce((a, b) => (b.groesse > a.groesse ? b : a));
    for (const n of netze) if (n !== haupt) fehler.push({ code: "getrennteNetze", bauteil: n.tor });
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
  for (const id of ohneWendemoeglichkeit(fahrErreichbar, nachbarn, torSeite, f, cfg)) {
    const d = fahrErreichbar.find((x) => x.id === id)!;
    // Nur Fahrwege, an denen Bus-Plätze liegen (Stellplätze, Ladeplätze, Hallen mit Zufahrt über diesen Weg)
    const mitPlaetzen = alle.some((b) => {
      if (!(BUSPLATZ.includes(b.typ) || b.typ === "halle") || !verbunden.has(b.id)) return false;
      const k = kontakt(b, d);
      return !!k && k.bis - k.von >= Math.min(cfg.zufahrtMinM, kleinsterBus(ctx.busse).breiteM) - EPS;
    });
    if (mitPlaetzen) warnungen.push({ code: "keineWendemoeglichkeit", bauteil: id });
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
