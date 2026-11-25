/**
 * Bürgerliche Zeit des Spiels. Gerechnet wird mit Millisekunden in "UTC-Feldern", die als Ortszeit gelesen werden.
 * Es gibt keine Zeitzonen und keine Sommerzeitumstellung im Spiel (siehe annahmen.md).
 */
export type CivilMs = number;

export interface CivilParts {
  jahr: number;
  monat: number; // 1..12
  tag: number;
  stunde: number;
  minute: number;
  sekunde: number;
  /** 1 = Montag … 7 = Sonntag (ISO). */
  wochentag: number;
}

export function civil(jahr: number, monat: number, tag: number, stunde = 0, minute = 0, sekunde = 0): CivilMs {
  return Date.UTC(jahr, monat - 1, tag, stunde, minute, sekunde);
}

export function parts(ms: CivilMs): CivilParts {
  const d = new Date(ms);
  const wd = d.getUTCDay();
  return {
    jahr: d.getUTCFullYear(),
    monat: d.getUTCMonth() + 1,
    tag: d.getUTCDate(),
    stunde: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    sekunde: d.getUTCSeconds(),
    wochentag: wd === 0 ? 7 : wd,
  };
}

/** Kalendertag als "JJJJ-MM-TT". */
export function isoDay(ms: CivilMs): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(ms: CivilMs, tage: number): CivilMs {
  return ms + tage * 86400000;
}

/** Kalendermonate addieren; fehlt der Tag im Zielmonat (31. oder 29.2.), gilt der letzte Tag des Monats. Uhrzeit bleibt. */
export function addMonate(ms: CivilMs, n: number): CivilMs {
  const p = parts(ms);
  const versatz = ms - civil(p.jahr, p.monat, p.tag);
  const gesamt = p.monat - 1 + n;
  const jahr = p.jahr + Math.floor(gesamt / 12);
  const monat = (((gesamt % 12) + 12) % 12) + 1;
  const tage = Math.round((civil(jahr, monat + 1, 1) - civil(jahr, monat, 1)) / 86400000);
  return civil(jahr, monat, Math.min(p.tag, tage)) + versatz;
}

/** Spielstart in der Gegenwart: Ortszeit des Rechners, auf die Minute. */
export function jetztCivil(now: Date = new Date()): CivilMs {
  return civil(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes());
}
