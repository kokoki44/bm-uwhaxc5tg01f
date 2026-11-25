import { tagesInfo } from "../calendar/calendar";
import type { CivilMs } from "../calendar/civil";
import type { LinienConfig, PlanTag, SchulferienConfig } from "../config";

/**
 * Tagesart des Fahrplans zu einem Zeitpunkt (Kriterium 9). Der Betriebstag beginnt um 4 Uhr (F9): Bis 3:59 Uhr gilt
 * noch der Vortag. Feiertage zählen wie Sonntage, Schulferien nach den Tabellen der Region.
 */
export function planTag(ms: CivilMs, region: string | null, sf: SchulferienConfig, cfg: LinienConfig, suedhalbkugel = false): { tag: PlanTag; betriebstag: string; sekunde: number } {
  const beginn = cfg.betriebstagBeginnH * 3600000;
  const tagMs = Math.floor((ms - beginn) / 86400000) * 86400000;
  const info = tagesInfo(tagMs, region, sf, suedhalbkugel);
  const tag = (info.schulferien ? `${info.tagesart}Ferien` : info.tagesart) as PlanTag;
  return { tag, betriebstag: info.datum, sekunde: Math.floor((ms - tagMs) / 1000) };
}
