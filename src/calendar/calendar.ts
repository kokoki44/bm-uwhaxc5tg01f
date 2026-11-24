import type { SchulferienConfig } from "../config";
import { isoDay, parts, type CivilMs } from "./civil";
import { feiertagAm } from "./holidays";

export type Tagesart = "werktag" | "samstag" | "sonnFeiertag";
export type Jahreszeit = "fruehling" | "sommer" | "herbst" | "winter";

export interface TagesInfo {
  datum: string;
  wochentag: number;
  feiertag: string | null;
  schulferien: string | null;
  /** Tagesart für Fahrpläne: Werktag, Samstag, Sonn- und Feiertag. */
  tagesart: Tagesart;
  jahreszeit: Jahreszeit;
}

/** Schulferien am Tag oder null. Ohne Tabelle für die Region oder das Jahr: keine Ferien (siehe annahmen.md). */
export function schulferienAm(tag: string, region: string | null, sf: SchulferienConfig): string | null {
  if (!region) return null;
  for (const f of sf.ferien[region] ?? []) if (tag >= f.von && tag <= f.bis) return f.name;
  return null;
}

/** Meteorologische Jahreszeit; auf der Südhalbkugel umgekehrt. */
export function jahreszeit(monat: number, suedhalbkugel = false): Jahreszeit {
  const nord: Jahreszeit[] = ["winter", "winter", "fruehling", "fruehling", "fruehling", "sommer", "sommer", "sommer", "herbst", "herbst", "herbst", "winter"];
  const z = nord[monat - 1];
  if (!suedhalbkugel) return z;
  return ({ winter: "sommer", sommer: "winter", fruehling: "herbst", herbst: "fruehling" } as const)[z];
}

export function tagesInfo(ms: CivilMs, region: string | null, sf: SchulferienConfig, suedhalbkugel = false): TagesInfo {
  const p = parts(ms);
  const datum = isoDay(ms);
  const feiertag = feiertagAm(datum, region);
  const tagesart: Tagesart = feiertag || p.wochentag === 7 ? "sonnFeiertag" : p.wochentag === 6 ? "samstag" : "werktag";
  return {
    datum,
    wochentag: p.wochentag,
    feiertag,
    schulferien: schulferienAm(datum, region, sf),
    tagesart,
    jahreszeit: jahreszeit(p.monat, suedhalbkugel),
  };
}
