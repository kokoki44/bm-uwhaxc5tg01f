import type { DiensteConfig, PlanTag } from "../config";
import { grundtagVon, istFerientag } from "../linien/fahrplan";
import type { LinienPlan } from "../linien/plan";
import type { GrenzRegel, RegelId, Regelwerk, Teilung } from "./regelwerk";
import type { Dienst, Dienstplan, FahrtRef } from "./typen";

/* ---------- Eingabe: Fahrten und Umläufe einer Tagesart ---------- */

export interface LinieDaten {
  linie: number;
  nummer: string;
  /** Zahl der zugewiesenen Busse: Umlauf k fährt der k-te Bus (F5). */
  busse: number;
  varianten: { id: number; lengthM: number; abschnitte: number; start: { ort: string; name: string } | null; ziel: { ort: string; name: string } | null }[];
  /** Fahrten der Tagesart ohne gestrichene. */
  fahrten: { variante: number; schluessel: string; abfahrtS: number; ankunftS: number }[];
  umlaeufe: { fahrten: FahrtRef[]; ausrueck: { abHofS: number; fahrzeitS: number } | null; einrueck: { anHofS: number; fahrzeitS: number } | null }[];
}

/** Daten einer Linie für die Dienstprüfung an einer Tagesart (aus dem Plan der Linie). */
export function linienDaten(plan: LinienPlan, nummer: string, busse: number, tag: PlanTag): LinieDaten {
  const t = plan.tage[tag];
  return {
    linie: plan.linieId,
    nummer,
    busse,
    varianten: plan.varianten.map((v) => ({ id: v.id, lengthM: v.strecke.lengthM, abschnitte: v.strecke.abschnitte.length, start: v.start, ziel: v.ziel })),
    fahrten: t.fahrten.filter((f) => f.status !== "gestrichen").map((f) => ({ variante: f.variante, schluessel: f.schluessel, abfahrtS: f.abfahrtS, ankunftS: f.ankunftS })),
    umlaeufe: t.umlaeufe.map((u) => ({ fahrten: u.fahrten.map((f) => ({ variante: f.variante, schluessel: f.schluessel })), ausrueck: u.ausrueck, einrueck: u.einrueck })),
  };
}

/** Dienste, die an einer Tagesart gelten: an Ferientagen ohne eigene Ferien-Dienste die des Tages ohne Ferien (F7). */
export function wirksameDienste(p: Dienstplan, tag: PlanTag): Dienst[] {
  const quelle = istFerientag(tag) && !p.eigeneFerienDienste[grundtagVon(tag)] ? grundtagVon(tag) : tag;
  return p.dienste.filter((d) => d.tag === quelle);
}

/* ---------- Ausgabe ---------- */

export type ElementArt = "vorbereitung" | "ausruecken" | "fahrt" | "wende" | "weg" | "pause" | "einruecken" | "abschluss";

export interface Element {
  art: ElementArt;
  vonS: number;
  bisS: number;
  /** Zählt als Lenkzeit (A3c-1). */
  lenk: boolean;
  /** Zählt als Arbeitszeit (A3c-1 bis A3c-5). */
  arbeit: boolean;
  linie?: number;
  fahrt?: FahrtRef;
  /** Name der Haltestelle (Ablösung, Wendepunkt) oder leer für den Betriebshof. */
  ort?: string;
}

export type Regime = "sechstel" | "blockFPersV" | "blockVO";
export type Dienstart = "frueh" | "spaet" | "nacht" | "geteilt";

export interface Befund {
  /** Regel aus dem Regelwerk oder "ablauf" (Aufbau des Dienstes, immer hart). */
  regel: RegelId | "ablauf";
  code: string;
  wertS?: number;
  grenzeS?: number;
  /** Weitere Angaben für den Text (Dienstnummer, Fahrt, Linie). */
  daten?: Record<string, string | number>;
}

export interface Auswertung {
  dienstId: number;
  /** Speicherbar: kein harter Verstoß. */
  gueltig: boolean;
  verstoesse: Befund[];
  warnungen: Befund[];
  elemente: Element[];
  beginnS: number;
  endeS: number;
  lenkS: number;
  arbeitS: number;
  /** Pausen zwischen Dienststücken (Fahrer ohne Bus). */
  pauseS: number;
  /** Arbeitsunterbrechungen ab der Mindestlänge (Wendezeiten und Pausen), für die Sechstelregel. */
  unterbrechungS: number;
  schichtS: number;
  art: Dienstart | null;
  regime: Regime;
}

/* ---------- Aufbau eines Dienstes ---------- */

interface Aufgeloest {
  linie: LinieDaten;
  umlauf: LinieDaten["umlaeufe"][number];
  umlaufNr: number;
  von: number;
  bis: number;
}

const gleich = (a: FahrtRef, b: FahrtRef) => a.variante === b.variante && a.schluessel === b.schluessel;
export const fahrtKey = (linie: number, f: FahrtRef) => `${linie}:${f.variante}:${f.schluessel}`;

/** Fahrten und Lage im Umlauf je Linie, einmal je Eingabe aufgebaut (Leistung bei großer Flotte). */
const indexCache = new WeakMap<LinieDaten, { fahrt: Map<string, LinieDaten["fahrten"][number]>; lage: Map<string, [number, number]> }>();
function index(l: LinieDaten) {
  let x = indexCache.get(l);
  if (!x) {
    const k = (f: FahrtRef) => `${f.variante}:${f.schluessel}`;
    x = { fahrt: new Map(l.fahrten.map((f) => [k(f), f])), lage: new Map() };
    l.umlaeufe.forEach((u, i) => u.fahrten.forEach((f, j) => x!.lage.set(k(f), [i, j])));
    indexCache.set(l, x);
  }
  return x;
}

/** Welche Dienste haben welche Fahrt? (für doppelt vergebene Fahrten) */
export type Vergabe = Map<string, { id: number; nummer: string }[]>;
export function vergabe(dienste: readonly Dienst[]): Vergabe {
  const m: Vergabe = new Map();
  for (const d of dienste)
    for (const st of d.stuecke)
      for (const f of st.fahrten) {
        const k = fahrtKey(st.linie, f);
        const l = m.get(k) ?? [];
        if (!l.some((x) => x.id === d.id)) l.push({ id: d.id, nummer: d.nummer });
        m.set(k, l);
      }
  return m;
}

/** Ein Stück im Umlauf finden: alle Fahrten müssen aufeinanderfolgend in einem Umlauf liegen. */
function loeseAuf(st: Dienst["stuecke"][number], linien: Map<number, LinieDaten>): Aufgeloest | Befund {
  const l = linien.get(st.linie);
  if (!st.fahrten.length) return { regel: "ablauf", code: "leer" };
  if (!l) return { regel: "ablauf", code: "linieFehlt", daten: { linie: st.linie } };
  const lage = index(l).lage.get(`${st.fahrten[0].variante}:${st.fahrten[0].schluessel}`);
  if (!lage) return { regel: "ablauf", code: "fahrtFehlt", daten: { linie: l.nummer } };
  const [k, von] = lage;
  const u = l.umlaeufe[k];
  const ok = st.fahrten.every((f, i) => u.fahrten[von + i] && gleich(u.fahrten[von + i], f));
  if (!ok) return { regel: "ablauf", code: st.fahrten.every((f) => index(l).lage.has(`${f.variante}:${f.schluessel}`)) ? "nichtZusammenhaengend" : "fahrtFehlt", daten: { linie: l.nummer } };
  return { linie: l, umlauf: u, umlaufNr: k, von, bis: von + st.fahrten.length - 1 };
}

/** Baut die Zeitleiste eines Dienstes (Vorbereitung, Ausrücken, Fahrten, Wendezeiten, Wege, Pausen, Einrücken, Abschluss). */
export function baueDienst(d: Dienst, linien: Map<number, LinieDaten>, cfg: DiensteConfig): { elemente: Element[]; fehler: Befund[]; stuecke: Aufgeloest[] } {
  const fehler: Befund[] = [];
  const stuecke: Aufgeloest[] = [];
  for (const st of d.stuecke) {
    const a = loeseAuf(st, linien);
    if ("regel" in a) fehler.push(a);
    else stuecke.push(a);
  }
  if (!d.stuecke.length) fehler.push({ regel: "ablauf", code: "leer" });
  const fahrt = (a: Aufgeloest, i: number) => {
    const r = a.umlauf.fahrten[i];
    return { ref: r, f: index(a.linie).fahrt.get(`${r.variante}:${r.schluessel}`)!, v: a.linie.varianten.find((v) => v.id === r.variante)! };
  };
  stuecke.sort((a, b) => fahrt(a, a.von).f.abfahrtS - fahrt(b, b.von).f.abfahrtS);
  // Schließen zwei Stücke im selben Umlauf direkt aneinander, ist das ein Stück: dazwischen liegt eine Wendezeit, keine
  // Pause (gespeicherte Stände, neu gebildete Umläufe; Regression Prüfung 3c-1)
  for (let i = stuecke.length - 1; i > 0; i--) {
    const a = stuecke[i - 1], b = stuecke[i];
    if (a.linie === b.linie && a.umlaufNr === b.umlaufNr && b.von === a.bis + 1) {
      a.bis = b.bis;
      stuecke.splice(i, 1);
    }
  }
  // Ohne Start- oder Zielhaltestelle einer Variante ist der Ort der Ablösung unbekannt
  for (const a of stuecke) {
    if (!fahrt(a, a.von).v.start || !fahrt(a, a.bis).v.ziel) fehler.push({ regel: "ablauf", code: "ortFehlt", daten: { linie: a.linie.nummer } });
  }

  type Teil = { elemente: Element[]; startOrt: string | null; endeOrt: string | null; startS: number; endeS: number };
  const teile: Teil[] = [];
  for (const a of stuecke) {
    const el: Element[] = [];
    const erste = fahrt(a, a.von), letzte = fahrt(a, a.bis);
    let startOrt: string | null = erste.v.start?.ort ?? null;
    if (a.von === 0) {
      // Ausrücken mit Vorbereitung (Abfahrtkontrolle) am Betriebshof
      if (!a.umlauf.ausrueck) fehler.push({ regel: "ablauf", code: "keinAusruecken", daten: { linie: a.linie.nummer } });
      else {
        const ab = a.umlauf.ausrueck.abHofS;
        el.push({ art: "vorbereitung", vonS: ab - cfg.vorbereitungS, bisS: ab, lenk: false, arbeit: true, linie: a.linie.linie, ort: "" });
        el.push({ art: "ausruecken", vonS: ab, bisS: erste.f.abfahrtS, lenk: true, arbeit: true, linie: a.linie.linie, ort: erste.v.start?.name });
        startOrt = null;
      }
    }
    for (let i = a.von; i <= a.bis; i++) {
      const x = fahrt(a, i);
      if (i > a.von) {
        const vor = fahrt(a, i - 1);
        el.push({ art: "wende", vonS: vor.f.ankunftS, bisS: x.f.abfahrtS, lenk: false, arbeit: true, linie: a.linie.linie, ort: vor.v.ziel?.name });
      }
      el.push({ art: "fahrt", vonS: x.f.abfahrtS, bisS: x.f.ankunftS, lenk: true, arbeit: true, linie: a.linie.linie, fahrt: x.ref });
    }
    let endeOrt: string | null = letzte.v.ziel?.ort ?? null;
    if (a.bis === a.umlauf.fahrten.length - 1) {
      if (!a.umlauf.einrueck) fehler.push({ regel: "ablauf", code: "keinEinruecken", daten: { linie: a.linie.nummer } });
      else {
        el.push({ art: "einruecken", vonS: letzte.f.ankunftS, bisS: a.umlauf.einrueck.anHofS, lenk: true, arbeit: true, linie: a.linie.linie, ort: "" });
        endeOrt = null;
      }
    }
    teile.push({ elemente: el, startOrt, endeOrt, startS: el[0].vonS, endeS: el[el.length - 1].bisS });
  }

  // Teile verbinden: Wege laufen über den Betriebshof (A3c-4, A3c-15), die übrige Zeit ist Pause
  const weg = (vonS: number): Element => ({ art: "weg", vonS, bisS: vonS + cfg.wegS, lenk: false, arbeit: true, ort: "" });
  const elemente: Element[] = [];
  teile.forEach((t, k) => {
    if (k === 0) {
      if (t.startOrt !== null) elemente.push(weg(t.startS - cfg.wegS));
    } else {
      const vor = teile[k - 1];
      let frei = vor.endeS, bis = t.startS;
      const wege: Element[] = [];
      if (vor.endeOrt !== t.startOrt) {
        if (vor.endeOrt !== null) {
          wege.push(weg(frei));
          frei += cfg.wegS;
        }
        if (t.startOrt !== null) {
          bis -= cfg.wegS;
          wege.push(weg(bis));
        }
      }
      if (bis < frei) fehler.push({ regel: "ablauf", code: "ueberschneidung", wertS: frei - bis });
      elemente.push(...wege);
      if (bis > frei) elemente.push({ art: "pause", vonS: frei, bisS: bis, lenk: false, arbeit: false });
    }
    elemente.push(...t.elemente);
    if (k === teile.length - 1) {
      let ende = t.endeS;
      if (t.endeOrt !== null) {
        elemente.push(weg(ende));
        ende += cfg.wegS;
      }
      elemente.push({ art: "abschluss", vonS: ende, bisS: ende + cfg.abschlussS, lenk: false, arbeit: true, ort: "" });
    }
  });
  elemente.sort((a, b) => a.vonS - b.vonS || a.bisS - b.bisS);
  return { elemente, fehler, stuecke };
}

/* ---------- Regeln ---------- */

const dauer = (e: Element) => e.bisS - e.vonS;

/** Passen die gesammelten Teilunterbrechungen zu einer der erlaubten Teilungen? */
export function teilungErfuellt(teile: number[], t: Teilung): boolean {
  if (t.geordnet) {
    let k = 0;
    for (const p of teile) if (k < t.minS.length && p >= t.minS[k]) k++;
    return k === t.minS.length;
  }
  const p = [...teile].sort((a, b) => b - a), m = [...t.minS].sort((a, b) => b - a);
  return p.length >= m.length && m.every((x, i) => p[i] >= x);
}

/** Welche Unterbrechungsregel gilt? Linie über 50 km: VO Art. 7; durchschnittlicher Haltestellenabstand über 3 km: FPersV Nr. 1; sonst Nr. 2 (F3, F4). */
export function regimeFuer(linien: LinieDaten[], rw: Regelwerk): Regime {
  const laenge = Math.max(0, ...linien.flatMap((l) => l.varianten.map((v) => v.lengthM)));
  const abstand = Math.max(0, ...linien.flatMap((l) => l.varianten.filter((v) => v.abschnitte > 0).map((v) => v.lengthM / v.abschnitte)));
  if (laenge > rw.anwendung.linieMaxM) return "blockVO";
  if (abstand > rw.anwendung.haltestellenabstandMaxM) return "blockFPersV";
  return "sechstel";
}

/** Überlappung der Arbeitszeit mit der Nachtzeit (Sekunden ab 0 Uhr des Betriebstags, mehrere Kalendertage). */
function nachtS(elemente: Element[], rw: Regelwerk): number {
  const n = rw.regeln.nachtarbeit;
  const fenster: [number, number][] = [];
  for (let tag = -1; tag <= 2; tag++) fenster.push([(tag * 24 + n.vonH) * 3600, ((tag + 1) * 24 + n.bisH) * 3600]);
  let s = 0;
  for (const e of elemente) if (e.arbeit) for (const [a, b] of fenster) s += Math.max(0, Math.min(b, e.bisS) - Math.max(a, e.vonS));
  return s;
}

/**
 * Prüft einen Dienst nach dem Regelwerk. `andere` sind die übrigen gespeicherten Dienste derselben Tagesart (für doppelt
 * vergebene Fahrten).
 */
export function pruefeDienst(d: Dienst, linien: Map<number, LinieDaten>, andere: readonly Dienst[] | Vergabe, rw: Regelwerk, cfg: DiensteConfig): Auswertung {
  const { elemente, fehler, stuecke } = baueDienst(d, linien, cfg);
  const verstoesse: Befund[] = [...fehler];
  const warnungen: Befund[] = [];
  const melde = (regel: GrenzRegel, code: string, wertS?: number, grenzeS?: number) => (rw.regeln[regel].hart ? verstoesse : warnungen).push({ regel, code, wertS, grenzeS });

  // Ablauf: jede Fahrt nur in einem Dienst, Umlauf mit Bus
  const vergeben = andere instanceof Map ? andere : vergabe(andere);
  suche: for (const st of d.stuecke)
    for (const f of st.fahrten) {
      const n = vergeben.get(fahrtKey(st.linie, f))?.find((x) => x.id !== d.id);
      if (n) {
        verstoesse.push({ regel: "ablauf", code: "fahrtDoppelt", daten: { dienst: n.nummer } });
        break suche;
      }
    }
  for (const a of stuecke) if (a.umlaufNr >= a.linie.busse) warnungen.push({ regel: "ablauf", code: "umlaufOhneBus", daten: { linie: a.linie.nummer, umlauf: a.umlaufNr + 1 } });

  const lenkS = elemente.filter((e) => e.lenk).reduce((s, e) => s + dauer(e), 0);
  const arbeitS = elemente.filter((e) => e.arbeit).reduce((s, e) => s + dauer(e), 0);
  const pausen = elemente.filter((e) => e.art === "pause");
  const pauseS = pausen.reduce((s, e) => s + dauer(e), 0);
  const beginnS = elemente.length ? elemente[0].vonS : 0, endeS = elemente.length ? Math.max(...elemente.map((e) => e.bisS)) : 0;
  const regime = regimeFuer([...new Set(stuecke.map((a) => a.linie))], rw);
  const R = rw.regeln;

  // Lenkzeitunterbrechung
  let unterbrechungS = 0;
  if (regime === "sechstel") {
    const r = R.lenkSechstel;
    let cum = 0, maxCum = 0, pauseVerstoss: number | null = null;
    elemente.forEach((e, i) => {
      if (e.lenk) {
        cum += dauer(e);
        maxCum = Math.max(maxCum, cum);
      } else if ((e.art === "wende" || e.art === "pause") && dauer(e) >= r.minUnterbrechungS) {
        unterbrechungS += dauer(e);
        // Nach 4,5 h ununterbrochener Lenkzeit mindestens 45 min, sofern danach noch gelenkt wird
        if (cum >= r.maxAmStueckS && dauer(e) < r.pauseDanachS && elemente.slice(i + 1).some((x) => x.lenk)) pauseVerstoss = dauer(e);
        cum = 0;
      }
    });
    if (maxCum > r.maxAmStueckS) melde("lenkSechstel", "amStueck", maxCum, r.maxAmStueckS);
    if (pauseVerstoss !== null) melde("lenkSechstel", "pauseDanach", pauseVerstoss, r.pauseDanachS);
    if (unterbrechungS * r.nenner < lenkS) melde("lenkSechstel", "sechstel", unterbrechungS, Math.ceil(lenkS / r.nenner));
  } else {
    const r = regime === "blockVO" ? R.lenkBlockVO : R.lenkBlockFPersV;
    let cum = 0, maxCum = 0, teile: number[] = [];
    for (const e of elemente) {
      if (e.lenk) {
        cum += dauer(e);
        maxCum = Math.max(maxCum, cum);
      } else if (e.art === "pause") {
        // Nur echte Fahrtunterbrechungen (VO Art. 4 Buchst. d), keine Wendezeiten
        unterbrechungS += dauer(e);
        if (dauer(e) >= r.vollS) teile = [];
        else teile.push(dauer(e));
        if (dauer(e) >= r.vollS || r.teilungen.some((t) => teilungErfuellt(teile, t))) {
          cum = 0;
          teile = [];
        }
      }
    }
    if (maxCum > r.maxLenkS) melde(regime === "blockVO" ? "lenkBlockVO" : "lenkBlockFPersV", "block", maxCum, r.maxLenkS);
  }

  if (lenkS > R.tageslenkzeit.maxS) melde("tageslenkzeit", "max", lenkS, R.tageslenkzeit.maxS);
  if (arbeitS > R.arbeitszeit.maxS) melde("arbeitszeit", "max", arbeitS, R.arbeitszeit.maxS);

  // Ruhepausen nach ArbZG § 4, abgegolten nach TV-N SH Anlage 3 § 4 Abs. 3
  const ab = R.pausenAbgeltung;
  const abgeltung = elemente.filter((e) => (e.art === "wende" || e.art === "pause") && dauer(e) >= ab.minUnterbrechungS).reduce((s, e) => s + dauer(e), 0);
  if (!(lenkS > 0 && abgeltung * ab.nenner >= lenkS)) {
    const r = R.ruhepause;
    const ruhe = pausen.filter((e) => dauer(e) >= r.minTeilS).reduce((s, e) => s + dauer(e), 0);
    const noetig = [...r.stufen].reverse().find((s) => arbeitS > s.abS)?.pauseS ?? 0;
    if (ruhe < noetig) melde("ruhepause", "zuKurz", ruhe, noetig);
    let lauf = 0, maxLauf = 0;
    for (const e of elemente) {
      if (e.arbeit) lauf += dauer(e);
      else if (e.art === "pause" && dauer(e) >= r.minTeilS) lauf = 0;
      maxLauf = Math.max(maxLauf, lauf);
    }
    if (maxLauf > r.maxOhnePauseS) melde("ruhepause", "ohnePause", maxLauf, r.maxOhnePauseS);
  }

  // Tarif (nur Warnungen, wenn das Regelwerk es so festlegt)
  const schichtS = endeS - beginnS;
  if (arbeitS > R.tarifArbeitszeit.ausnahmeMaxS) melde("tarifArbeitszeit", "ausnahme", arbeitS, R.tarifArbeitszeit.ausnahmeMaxS);
  else if (arbeitS > R.tarifArbeitszeit.maxS) melde("tarifArbeitszeit", "max", arbeitS, R.tarifArbeitszeit.maxS);
  if (lenkS > R.tarifLenkzeit.maxS) melde("tarifLenkzeit", "max", lenkS, R.tarifLenkzeit.maxS);
  if (schichtS > R.tarifDienstschicht.dringendMaxS) melde("tarifDienstschicht", "dringend", schichtS, R.tarifDienstschicht.dringendMaxS);
  else if (schichtS > R.tarifDienstschicht.maxS) melde("tarifDienstschicht", "max", schichtS, R.tarifDienstschicht.maxS);
  const teilungen = pausen.filter((e) => dauer(e) >= cfg.geteiltAbS);
  if (teilungen.length > R.tarifTeilung.maxTeilungen) melde("tarifTeilung", "anzahl", teilungen.length, R.tarifTeilung.maxTeilungen);
  if (teilungen.length) {
    const grenzen = [beginnS, ...teilungen.flatMap((p) => [p.vonS, p.bisS]), endeS];
    let kurz = Infinity;
    for (let i = 0; i < grenzen.length; i += 2) kurz = Math.min(kurz, grenzen[i + 1] - grenzen[i]);
    if (kurz < R.tarifTeilung.minTeilS) melde("tarifTeilung", "teil", kurz, R.tarifTeilung.minTeilS);
  }

  let art: Dienstart | null = null;
  if (elemente.length) {
    if (nachtS(elemente, rw) > R.nachtarbeit.mehrAlsS) art = "nacht";
    else if (teilungen.length) art = "geteilt";
    else art = beginnS < cfg.fruehdienstBisH * 3600 ? "frueh" : "spaet";
  }
  return { dienstId: d.id, gueltig: verstoesse.length === 0, verstoesse, warnungen, elemente, beginnS, endeS, lenkS, arbeitS, pauseS, unterbrechungS, schichtS, art, regime };
}

/* ---------- Tagesart: alle Dienste und freie Fahrten ---------- */

export interface DienstAnfrage {
  tag: PlanTag;
  linien: LinieDaten[];
  /** Gespeicherte Dienste, die an dieser Tagesart gelten. */
  dienste: Dienst[];
  /** Dienst im Editor (noch nicht gespeichert), oder null. */
  entwurf: Dienst | null;
}

export interface TagesAuswertung {
  tag: PlanTag;
  dienste: Auswertung[];
  entwurf: Auswertung | null;
  /** Fahrten ohne gültigen Dienst je Linie (Schlüssel "linie:variante:schluessel"), sortiert nach Abfahrt. */
  frei: Record<number, FahrtRef[]>;
  /** Fahrt (Schlüssel wie oben) zu Dienstnummer, nur gültige Dienste. */
  besetzt: Map<string, string>;
}

/** Prüft alle Dienste einer Tagesart und ermittelt die freien Fahrten (Kriterium 8, 10). Deterministisch. */
export function pruefeTag(a: DienstAnfrage, rw: Regelwerk, cfg: DiensteConfig): TagesAuswertung {
  const linien = new Map(a.linien.map((l) => [l.linie, l]));
  const sortiert = [...a.dienste].sort((x, y) => x.id - y.id);
  const v = vergabe(sortiert);
  const dienste = sortiert.map((d) => pruefeDienst(d, linien, v, rw, cfg));
  const besetzt = new Map<string, string>();
  dienste.forEach((w, i) => {
    if (!w.gueltig) return;
    for (const st of sortiert[i].stuecke) for (const f of st.fahrten) besetzt.set(fahrtKey(st.linie, f), sortiert[i].nummer);
  });
  const frei: Record<number, FahrtRef[]> = {};
  for (const l of a.linien) frei[l.linie] = [...l.fahrten].sort((x, y) => x.abfahrtS - y.abfahrtS).filter((f) => !besetzt.has(fahrtKey(l.linie, f))).map((f) => ({ variante: f.variante, schluessel: f.schluessel }));
  const entwurf = a.entwurf ? pruefeDienst(a.entwurf, linien, v, rw, cfg) : null;
  return { tag: a.tag, dienste, entwurf, frei, besetzt };
}
