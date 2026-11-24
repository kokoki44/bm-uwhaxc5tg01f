import { addDays, civil, isoDay, type CivilMs } from "./civil";

/** Ostersonntag nach der gregorianischen Osterformel (Meeus, Jones, Butcher). */
export function ostersonntag(jahr: number): CivilMs {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return civil(jahr, monat, tag);
}

export const BUNDESLAENDER = [
  "DE-BW", "DE-BY", "DE-BE", "DE-BB", "DE-HB", "DE-HH", "DE-HE", "DE-MV",
  "DE-NI", "DE-NW", "DE-RP", "DE-SL", "DE-SN", "DE-ST", "DE-SH", "DE-TH",
] as const;

export interface Feiertag {
  datum: string;
  name: string;
}

/** Wer einen Feiertag hat: "alle" oder eine Liste von Ländern, jeweils ab einem Jahr. */
interface Regel {
  name: string;
  tag: (jahr: number, ostern: CivilMs) => CivilMs;
  laender: "alle" | Partial<Record<(typeof BUNDESLAENDER)[number], number>>;
  /** Nur in diesem Jahr (einmalige Feiertage). */
  nurJahr?: number;
  ab?: number;
}

const fest = (monat: number, tag: number) => (jahr: number) => civil(jahr, monat, tag);
const ostern = (tage: number) => (_: number, o: CivilMs) => addDays(o, tage);

/** Buß- und Bettag: der Mittwoch vor dem 23. November. */
const bussUndBettag = (jahr: number) => {
  const d23 = civil(jahr, 11, 23);
  const wd = new Date(d23).getUTCDay(); // 0 So .. 6 Sa
  const zurueck = ((wd - 3 + 7) % 7) || 7;
  return addDays(d23, -zurueck);
};

/**
 * Gesetzliche Feiertage in Deutschland. Feiertage, die nur in einzelnen Gemeinden gelten
 * (Fronleichnam in Teilen Sachsens und Thüringens, Augsburger Friedensfest), sind nicht enthalten.
 */
const REGELN: Regel[] = [
  { name: "Neujahr", tag: fest(1, 1), laender: "alle" },
  { name: "Heilige Drei Könige", tag: fest(1, 6), laender: { "DE-BW": 0, "DE-BY": 0, "DE-ST": 0 } },
  { name: "Internationaler Frauentag", tag: fest(3, 8), laender: { "DE-BE": 2019, "DE-MV": 2023 } },
  { name: "Karfreitag", tag: ostern(-2), laender: "alle" },
  { name: "Ostersonntag", tag: ostern(0), laender: { "DE-BB": 0 } },
  { name: "Ostermontag", tag: ostern(1), laender: "alle" },
  { name: "Tag der Arbeit", tag: fest(5, 1), laender: "alle" },
  { name: "Tag der Befreiung", tag: fest(5, 8), laender: { "DE-BE": 0 }, nurJahr: 2020 },
  { name: "Tag der Befreiung", tag: fest(5, 8), laender: { "DE-BE": 0 }, nurJahr: 2025 },
  { name: "Christi Himmelfahrt", tag: ostern(39), laender: "alle" },
  { name: "Pfingstsonntag", tag: ostern(49), laender: { "DE-BB": 0 } },
  { name: "Pfingstmontag", tag: ostern(50), laender: "alle" },
  { name: "Fronleichnam", tag: ostern(60), laender: { "DE-BW": 0, "DE-BY": 0, "DE-HE": 0, "DE-NW": 0, "DE-RP": 0, "DE-SL": 0 } },
  { name: "Mariä Himmelfahrt", tag: fest(8, 15), laender: { "DE-SL": 0, "DE-BY": 0 } },
  { name: "Weltkindertag", tag: fest(9, 20), laender: { "DE-TH": 2019 } },
  { name: "Tag der Deutschen Einheit", tag: fest(10, 3), laender: "alle" },
  {
    name: "Reformationstag",
    tag: fest(10, 31),
    laender: { "DE-BB": 0, "DE-MV": 0, "DE-SN": 0, "DE-ST": 0, "DE-TH": 0, "DE-HB": 2018, "DE-HH": 2018, "DE-NI": 2018, "DE-SH": 2018 },
  },
  { name: "Reformationstag", tag: fest(10, 31), laender: "alle", nurJahr: 2017 },
  { name: "Allerheiligen", tag: fest(11, 1), laender: { "DE-BW": 0, "DE-BY": 0, "DE-NW": 0, "DE-RP": 0, "DE-SL": 0 } },
  { name: "Buß- und Bettag", tag: bussUndBettag, laender: { "DE-SN": 0 } },
  { name: "1. Weihnachtstag", tag: fest(12, 25), laender: "alle" },
  { name: "2. Weihnachtstag", tag: fest(12, 26), laender: "alle" },
];

/**
 * Feiertage eines Jahres. Ohne bekanntes Bundesland (andere Länder oder unbekannt) gelten vorläufig
 * nur die bundesweit einheitlichen Feiertage (siehe annahmen.md).
 */
export function feiertage(jahr: number, region: string | null): Feiertag[] {
  const o = ostersonntag(jahr);
  const out: Feiertag[] = [];
  for (const r of REGELN) {
    if (r.nurJahr !== undefined && r.nurJahr !== jahr) continue;
    let gilt: boolean;
    if (r.laender === "alle") gilt = true;
    else {
      const ab = region ? (r.laender as Record<string, number>)[region] : undefined;
      gilt = ab !== undefined && jahr >= ab;
    }
    if (gilt) out.push({ datum: isoDay(r.tag(jahr, o)), name: r.name });
  }
  // Doppelte (zum Beispiel Reformationstag 2017) zusammenfassen
  const seen = new Set<string>();
  return out.filter((f) => (seen.has(f.datum) ? false : (seen.add(f.datum), true))).sort((a, b) => a.datum.localeCompare(b.datum));
}

const cache = new Map<string, Map<string, string>>();
export function feiertagAm(tag: string, region: string | null): string | null {
  const jahr = Number(tag.slice(0, 4));
  const key = `${jahr}|${region}`;
  let m = cache.get(key);
  if (!m) {
    m = new Map(feiertage(jahr, region).map((f) => [f.datum, f.name]));
    cache.set(key, m);
  }
  return m.get(tag) ?? null;
}
