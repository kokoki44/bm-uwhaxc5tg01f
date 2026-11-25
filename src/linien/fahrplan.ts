import { PLAN_TAGE, type LinienConfig, type PlanTag } from "../config";
import type { Abschnitt } from "./strecke";
import type { FahrtAenderung, TaktZeile, Variante } from "./typen";

/** Tagesart ohne Ferienzusatz. */
export type Grundtag = "werktag" | "samstag" | "sonnFeiertag";
export const grundtagVon = (t: PlanTag): Grundtag => t.replace("Ferien", "") as Grundtag;
export const istFerientag = (t: PlanTag): boolean => t.endsWith("Ferien");

/**
 * Welcher Takt gilt für eine Tagesart? Ferientage übernehmen Takt und Fahrtänderungen des Tages ohne Ferien,
 * bis der Spieler einen eigenen Ferientakt einschaltet (F8).
 */
export function taktQuelle(v: Pick<Variante, "eigenerFerientakt">, t: PlanTag): PlanTag {
  return istFerientag(t) && !v.eigenerFerientakt[grundtagVon(t)] ? grundtagVon(t) : t;
}

/** Verkehrsfaktor zur Uhrzeit (Sekunden ab 0 Uhr des Betriebstags, nach 24 Uhr gilt wieder die Tabelle ab 0 Uhr). */
export function verkehrsfaktor(tag: PlanTag, sekunde: number, cfg: LinienConfig): number {
  const h = (((sekunde / 3600) % 24) + 24) % 24;
  for (const [von, bis, f] of cfg.verkehrsfaktor[tag]) if (h >= von && h < bis) return f;
  return cfg.verkehrsfaktor[tag][cfg.verkehrsfaktor[tag].length - 1][2];
}

/** Auf die Schrittweite (10 s) runden, halbe Schritte aufwärts. */
export const runde = (s: number, cfg: LinienConfig): number => Math.round(s / cfg.rundungS + 1e-9) * cfg.rundungS;

/**
 * Fahrzeit eines Haltestellenabschnitts bei Abfahrt zur Uhrzeit `abS`: reine Fahrzeit mal Verkehrsfaktor, danach
 * Ampel- und Kreuzungszuschläge und der Zuschlag für Bremsen und Anfahren. Auf 10 s gerundet, mindestens 10 s.
 */
export function abschnittZeitS(a: Pick<Abschnitt, "fahrS" | "zuschlagS">, tag: PlanTag, abS: number, cfg: LinienConfig): number {
  const roh = a.fahrS * verkehrsfaktor(tag, abS, cfg) + a.zuschlagS + cfg.haltZuschlagS;
  return Math.max(cfg.abschnittMinS, runde(roh, cfg));
}

/** Abfahrten eines Takts in Sekunden ab 0 Uhr des Betriebstags, sortiert und ohne Doppelte. */
export function taktAbfahrten(zeilen: readonly TaktZeile[]): number[] {
  const s = new Set<number>();
  for (const z of zeilen) for (let m = z.vonMin; m < z.bisMin; m += z.taktMin) s.add(m * 60);
  return [...s].sort((a, b) => a - b);
}

export type FahrtStatus = "takt" | "verschoben" | "gestrichen" | "zusatz";

export interface Fahrt {
  /** Eindeutig je Tagesart: Variante und ursprüngliche Abfahrt bzw. Nummer der zusätzlichen Fahrt. */
  schluessel: string;
  variante: number;
  status: FahrtStatus;
  /** Ursprüngliche Abfahrt aus dem Takt (bei zusätzlichen Fahrten null). */
  ursprungS: number | null;
  zusatzId: number | null;
  abfahrtS: number;
  ankunftS: number;
  /** Ankunft und Abfahrt je Haltestelle der Variante (Sekunden ab 0 Uhr des Betriebstags). */
  zeiten: [number, number][];
}

/** Zeiten einer Fahrt über alle Haltestellen. Der Faktor gilt jeweils zur Abfahrt am Beginn des Abschnitts. */
export function fahrtZeiten(abschnitte: readonly Abschnitt[], standzeitS: readonly number[], tag: PlanTag, abfahrtS: number, cfg: LinienConfig): [number, number][] {
  const z: [number, number][] = [[abfahrtS, abfahrtS]];
  let t = abfahrtS;
  for (let i = 0; i < abschnitte.length; i++) {
    const an = t + abschnittZeitS(abschnitte[i], tag, t, cfg);
    // Standzeit nur an Zwischenhalten; am Endpunkt gilt die Wendezeit
    const ab = i === abschnitte.length - 1 ? an : an + standzeitS[i + 1];
    z.push([an, ab]);
    t = ab;
  }
  return z;
}

/** Abfahrten nach Takt und Änderungen einer Variante an einer Tagesart (ohne Zeiten). */
export function abfahrtenMitAenderungen(v: Pick<Variante, "takt" | "aenderungen" | "eigenerFerientakt">, tag: PlanTag): { schluessel: string; status: FahrtStatus; ursprungS: number | null; zusatzId: number | null; abfahrtS: number }[] {
  const q = taktQuelle(v, tag);
  const aend = v.aenderungen.filter((a) => a.tag === q);
  const out: { schluessel: string; status: FahrtStatus; ursprungS: number | null; zusatzId: number | null; abfahrtS: number }[] = [];
  for (const u of taktAbfahrten(v.takt[q])) {
    const a = aend.find((x) => x.art !== "zusatz" && x.ursprungS === u);
    if (a?.art === "streichen") out.push({ schluessel: `t${u}`, status: "gestrichen", ursprungS: u, zusatzId: null, abfahrtS: u });
    else if (a?.art === "verschieben") out.push({ schluessel: `t${u}`, status: "verschoben", ursprungS: u, zusatzId: null, abfahrtS: a.neuS });
    else out.push({ schluessel: `t${u}`, status: "takt", ursprungS: u, zusatzId: null, abfahrtS: u });
  }
  for (const a of aend) if (a.art === "zusatz") out.push({ schluessel: `z${a.id}`, status: "zusatz", ursprungS: null, zusatzId: a.id, abfahrtS: a.abfahrtS });
  return out.sort((a, b) => a.abfahrtS - b.abfahrtS || a.schluessel.localeCompare(b.schluessel));
}

/**
 * Änderungen, die zu keiner Fahrt des Takts mehr passen (zum Beispiel nach einer Taktänderung). Zusätzliche Fahrten
 * passen immer (F10).
 */
export function verwaisteAenderungen(v: Pick<Variante, "takt" | "aenderungen">): FahrtAenderung[] {
  const ab = new Map<PlanTag, Set<number>>();
  for (const t of PLAN_TAGE) ab.set(t, new Set(taktAbfahrten(v.takt[t])));
  return v.aenderungen.filter((a) => a.art !== "zusatz" && !ab.get(a.tag)!.has(a.ursprungS));
}

/** Fahrten einer Variante an einer Tagesart mit allen Zeiten. */
export function erzeugeFahrten(v: Pick<Variante, "id" | "takt" | "aenderungen" | "eigenerFerientakt">, abschnitte: readonly Abschnitt[], standzeitS: readonly number[], tag: PlanTag, cfg: LinienConfig): Fahrt[] {
  return abfahrtenMitAenderungen(v, tag).map((a) => {
    const zeiten = fahrtZeiten(abschnitte, standzeitS, tag, a.abfahrtS, cfg);
    return { ...a, variante: v.id, ankunftS: zeiten[zeiten.length - 1][0], zeiten };
  });
}

/** Ein Umlauf: Fahrten, die ein Bus nacheinander fährt. */
export interface Umlauf {
  fahrten: { variante: number; schluessel: string }[];
  beginnS: number;
  endeS: number;
}

export interface UmlaufFahrt {
  variante: number;
  schluessel: string;
  abfahrtS: number;
  ankunftS: number;
  /** Ort der ersten und letzten Haltestelle (gleicher Ort: gleiche Haltestelle oder Gegenhaltestelle). */
  startOrt: string;
  zielOrt: string;
  wendezeitS: number;
}

/**
 * Verkettet die Fahrten einer Tagesart zu Umläufen (F11): Ein Bus übernimmt die nächste Fahrt ab dem Ort, an dem er
 * angekommen ist, sobald die Wendezeit vorbei ist. Fahrten werden nach Abfahrt abgearbeitet; unter den freien Bussen am
 * Ort fährt der, der am längsten wartet. Die Zahl der Umläufe ist der Bedarf an Bussen.
 */
export function verkette(fahrten: readonly UmlaufFahrt[]): Umlauf[] {
  const sortiert = [...fahrten].sort((a, b) => a.abfahrtS - b.abfahrtS || a.variante - b.variante || a.schluessel.localeCompare(b.schluessel));
  const umlaeufe: (Umlauf & { ort: string; freiAbS: number })[] = [];
  for (const f of sortiert) {
    let best = -1;
    for (let i = 0; i < umlaeufe.length; i++) {
      const u = umlaeufe[i];
      if (u.ort === f.startOrt && u.freiAbS <= f.abfahrtS && (best < 0 || u.freiAbS < umlaeufe[best].freiAbS)) best = i;
    }
    const neu = { variante: f.variante, schluessel: f.schluessel };
    if (best < 0) umlaeufe.push({ fahrten: [neu], beginnS: f.abfahrtS, endeS: f.ankunftS, ort: f.zielOrt, freiAbS: f.ankunftS + f.wendezeitS });
    else {
      const u = umlaeufe[best];
      u.fahrten.push(neu);
      u.endeS = f.ankunftS;
      u.ort = f.zielOrt;
      u.freiAbS = f.ankunftS + f.wendezeitS;
    }
  }
  return umlaeufe.map(({ fahrten, beginnS, endeS }) => ({ fahrten, beginnS, endeS }));
}

/** Uhrzeit "HH:MM" oder "HH:MM:SS" für Sekunden ab 0 Uhr des Betriebstags (nach Mitternacht 24:10 usw.). */
export function uhrzeit(s: number, mitSekunden = false): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return mitSekunden || sek ? `${p(h)}:${p(m)}:${p(sek)}` : `${p(h)}:${p(m)}`;
}

/**
 * Liest eine Uhrzeit "HH:MM" oder "HH:MM:SS" als Sekunden ab 0 Uhr des Betriebstags. Zeiten vor dem Beginn des
 * Betriebstags (4 Uhr) gehören zum Ende des Betriebstags (01:30 ist 25:30). Werte von 24:00 bis 27:59 sind auch direkt
 * erlaubt. Liefert null bei ungültiger Eingabe. Sekunden werden auf 10 s gerundet.
 */
export function leseUhrzeit(text: string, cfg: LinienConfig): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(text);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]), sek = Number(m[3] ?? 0);
  if (min > 59 || sek > 59 || h >= 24 + cfg.betriebstagBeginnH) return null;
  if (h < cfg.betriebstagBeginnH) h += 24;
  return runde(h * 3600 + min * 60 + sek, cfg);
}
