import { config, type Config } from "../config";
import { neuerFuhrpark, type Fuhrpark } from "../fleet/fuhrpark";
import { neuesNetz, type Netz } from "../linien/typen";
import { neuerDienstplan, type Dienstplan } from "../dienste/typen";
import { neuesPersonal, type Personal } from "../personal/personal";
import { neuerZufall, type Zufall } from "./zufall";
import type { CivilMs } from "../calendar/civil";
import type { Betriebshof } from "../depot/hof";
import type { TextKey } from "../i18n";
import { startFreischaltung, type Freischaltungen } from "../world/unlock";
import type { World } from "../world/world";

export type GemeindeQuelle = { art: "norderstedt" } | { art: "datei"; dateiname: string };

export interface SetupEingabe {
  gemeinde: GemeindeQuelle | null;
  startkapital: string | number;
  firmenname: string;
  firmenfarbe: string;
}

export interface SetupGeprueft {
  gemeinde: GemeindeQuelle;
  startkapital: number;
  firmenname: string;
  firmenfarbe: string;
}

export type SetupFehler = Partial<Record<keyof SetupEingabe, TextKey>>;

/** Prüft die Eingaben des Einrichtungsdialogs. Liefert entweder geprüfte Werte oder Fehler je Feld. */
export function pruefeSetup(e: SetupEingabe, cfg: Config["setup"]): { ok: true; werte: SetupGeprueft } | { ok: false; fehler: SetupFehler } {
  const fehler: SetupFehler = {};
  if (!e.gemeinde) fehler.gemeinde = "setup.fehler.gemeinde";
  const roh = typeof e.startkapital === "number" ? String(e.startkapital) : e.startkapital.trim().replace(/\./g, "").replace(",", ".");
  const kapital = /^\d+(\.\d+)?$/.test(roh) ? Number(roh) : NaN;
  if (!Number.isFinite(kapital) || kapital < cfg.startkapitalMin || kapital > cfg.startkapitalMax) fehler.startkapital = "setup.fehler.startkapital";
  const name = e.firmenname.trim();
  if (name.length === 0 || name.length > cfg.firmennameMaxLaenge) fehler.firmenname = "setup.fehler.firmenname";
  if (!/^#[0-9a-fA-F]{6}$/.test(e.firmenfarbe)) fehler.firmenfarbe = "setup.fehler.firmenfarbe";
  if (Object.keys(fehler).length) return { ok: false, fehler };
  return { ok: true, werte: { gemeinde: e.gemeinde!, startkapital: Math.round(kapital * 100) / 100, firmenname: name, firmenfarbe: e.firmenfarbe.toLowerCase() } };
}

/** Spielzustand. Wächst mit jeder Etappe. Gespeichert wird er seit Etappe 3b automatisch (src/game/spielstand.ts). */
export interface SpielZustand {
  firma: { name: string; farbe: string };
  kontostandEur: number;
  /** Spielbeginn in der Gegenwart (bürgerliche Zeit). */
  startZeit: CivilMs;
  gemeinde: { name: string; region: string | null; quelle: GemeindeQuelle };
  freischaltungen: Freischaltungen;
  /** Erster Betriebshof, sobald ein Grundstück gekauft ist. */
  betriebshof: Betriebshof | null;
  /** Bis zu diesem Zeitpunkt sind die Ereignisse der Spielzeit (Wochenwechsel, Monatsende) abgearbeitet. */
  zeit: CivilMs;
  /** Zufall mit festem Startwert je Spielstand. */
  zufall: Zufall;
  fuhrpark: Fuhrpark;
  personal: Personal;
  /** Haltestellen, Linien, Varianten, Takt und Fahrtänderungen (Etappe 3b). */
  netz: Netz;
  /** Dienste je Tagesart (Etappe 3c-1). */
  dienste: Dienstplan;
}

/** Startwert für den Zufall eines neuen Spielstands. */
export const neuerStartwert = (): number => Math.floor(Math.random() * 2 ** 32);

export function neuesSpiel(s: SetupGeprueft, world: World, startZeit: CivilMs, startwert = neuerStartwert()): SpielZustand {
  return {
    zeit: startZeit,
    zufall: neuerZufall(startwert),
    fuhrpark: neuerFuhrpark(config.fahrzeugmarkt),
    personal: neuesPersonal(config.personal),
    netz: neuesNetz(),
    dienste: neuerDienstplan(),
    firma: { name: s.firmenname, farbe: s.firmenfarbe },
    kontostandEur: s.startkapital,
    startZeit,
    gemeinde: { name: world.gemeinde.name, region: world.gemeinde.region, quelle: s.gemeinde },
    // Startgemeinde freigeschaltet; bei geteilten Städten alle Subdivisionen der Startgemeinde
    freischaltungen: startFreischaltung(world.gebiete.map((g) => g.id)),
    betriebshof: null,
  };
}
