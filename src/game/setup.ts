import type { Config } from "../config";
import type { CivilMs } from "../calendar/civil";
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

/** Spielzustand. Wächst mit jeder Etappe; Speichern und Laden folgen mit Etappe 4b. */
export interface SpielZustand {
  firma: { name: string; farbe: string };
  kontostandEur: number;
  /** Spielbeginn in der Gegenwart (bürgerliche Zeit). */
  startZeit: CivilMs;
  gemeinde: { name: string; region: string | null; quelle: GemeindeQuelle };
  freischaltungen: Freischaltungen;
}

export function neuesSpiel(s: SetupGeprueft, world: World, startZeit: CivilMs): SpielZustand {
  return {
    firma: { name: s.firmenname, farbe: s.firmenfarbe },
    kontostandEur: s.startkapital,
    startZeit,
    gemeinde: { name: world.gemeinde.name, region: world.gemeinde.region, quelle: s.gemeinde },
    // Startgemeinde freigeschaltet; bei geteilten Städten alle Subdivisionen der Startgemeinde
    freischaltungen: startFreischaltung(world.gebiete.map((g) => g.id)),
  };
}
