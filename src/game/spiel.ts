import { civil, parts, type CivilMs } from "../calendar/civil";
import { analysiereHof } from "../depot/analyse";
import type { HofKontext } from "../depot/hof";
import type { KaufKontext, MarktKontext } from "../fleet/fuhrpark";
import { erneuereAngebote, landVon } from "../fleet/markt";
import { entferneAusgetreteneNachMonat, monatslohn, raeumeAuf } from "../personal/personal";
import { config } from "../config";
import type { SpielZustand } from "./setup";

/** Was Spielregeln außer dem Spielzustand brauchen: Katalog, Optionen, Konfiguration, Hofregeln, Region. */
export interface SpielKontext {
  markt: MarktKontext;
  hof: HofKontext;
  /** ISO-Region der Startgemeinde (zum Beispiel DE-SH), für die Region der Gebrauchtangebote. */
  region: string | null;
}

/** Alles für Kauf, Verkauf, Umsetzen und Umlackieren zum aktuellen Spielzeitpunkt. */
export function kaufKontext(spiel: SpielZustand, k: SpielKontext): KaufKontext {
  return {
    ...k.markt,
    fuhrpark: spiel.fuhrpark,
    hof: spiel.betriebshof,
    analyse: spiel.betriebshof ? analysiereHof(spiel.betriebshof, k.hof) : null,
    kasse: spiel,
    zufall: spiel.zufall,
    jetzt: spiel.zeit,
  };
}

/** Nächster Montag 0 Uhr nach t (Wochenwechsel, A3-19). */
export function naechsterMontag(t: CivilMs): CivilMs {
  const p = parts(t);
  const tage = (8 - p.wochentag) % 7 || 7;
  return civil(p.jahr, p.monat, p.tag + tage);
}

/** Erster des nächsten Monats 0 Uhr nach t (= Monatsende 24 Uhr, A3-19). */
export function naechsterMonatsanfang(t: CivilMs): CivilMs {
  const p = parts(t);
  return civil(p.jahr, p.monat + 1, 1);
}

export type SpielEreignis =
  | { art: "angebote"; zeit: CivilMs; weg: number; neu: number }
  | { art: "lohn"; zeit: CivilMs; jahr: number; monat: number; summeEur: number; ausgetreten: number };

/** Gebrauchtmarkt beim Spielstart füllen. */
export function starteMarkt(spiel: SpielZustand, k: SpielKontext): void {
  erneuereAngebote(spiel.fuhrpark, spiel.zeit, landVon(k.region), spiel.zufall, k.markt);
}

/**
 * Schreibt die Spielzeit bis `bis` fort und löst dabei Wochenwechsel (Gebrauchtangebote erneuern) und Monatsende
 * (Lohn abbuchen) genau einmal aus, unabhängig davon, in welchen Schritten die Zeit vergeht (auch bei 600-fach).
 * Fallen beide auf denselben Zeitpunkt, kommt zuerst der Lohn. Der Lohn darf das Konto ins Minus bringen.
 */
export function fortschreiben(spiel: SpielZustand, bis: CivilMs, k: SpielKontext): SpielEreignis[] {
  const ereignisse: SpielEreignis[] = [];
  while (spiel.zeit < bis) {
    const woche = naechsterMontag(spiel.zeit);
    const monat = naechsterMonatsanfang(spiel.zeit);
    const t = Math.min(woche, monat);
    if (t > bis) break;
    spiel.zeit = t;
    if (t === monat) {
      const vorher = parts(t - 1);
      const abrechnung = monatslohn(spiel.personal, vorher.jahr, vorher.monat, config.personal);
      spiel.kontostandEur = Math.round((spiel.kontostandEur - abrechnung.summeEur) * 100) / 100;
      const weg = entferneAusgetreteneNachMonat(spiel.personal, vorher.jahr, vorher.monat);
      ereignisse.push({ art: "lohn", zeit: t, jahr: vorher.jahr, monat: vorher.monat, summeEur: abrechnung.summeEur, ausgetreten: weg.length });
    }
    if (t === woche) {
      const e = erneuereAngebote(spiel.fuhrpark, t, landVon(k.region), spiel.zufall, k.markt);
      ereignisse.push({ art: "angebote", zeit: t, ...e });
    }
  }
  spiel.zeit = Math.max(spiel.zeit, bis);
  raeumeAuf(spiel.personal, spiel.zeit);
  return ereignisse;
}
