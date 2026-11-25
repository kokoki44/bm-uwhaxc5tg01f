import { config } from "../config";
import { ladeHof, serialisiereHof } from "../depot/hof";
import { ladeFuhrpark, serialisiereFuhrpark } from "../fleet/speichern";
import { ladeNetz } from "../linien/speichern";
import { neuesNetz, type Netz } from "../linien/typen";
import { ladePersonal, serialisierePersonal } from "../personal/personal";
import type { SaveRecord } from "../storage/types";
import type { SpielZustand } from "./setup";

/**
 * Spielstand als Datenstruktur mit Version (Konzept: Speicherstände tragen eine Version).
 * Version 1: Stand nach Etappe 3a (ohne Linien). Version 2: mit Liniennetz (Etappe 3b).
 * Karten-Auszüge werden nicht gespeichert, nur referenziert (Gemeinde und Quelle).
 */
export interface SpielstandDaten {
  firma: SpielZustand["firma"];
  kontostandEur: number;
  startZeit: number;
  gemeinde: SpielZustand["gemeinde"];
  freischaltungen: SpielZustand["freischaltungen"];
  betriebshof: string | null;
  zeit: number;
  zufall: number;
  fuhrpark: string;
  personal: string;
  /** Ab Version 2. */
  netz?: Netz;
}

export class SpielstandFehler extends Error {}

export function spielstandDaten(s: SpielZustand): SpielstandDaten {
  return {
    firma: { ...s.firma },
    kontostandEur: s.kontostandEur,
    startZeit: s.startZeit,
    gemeinde: structuredClone(s.gemeinde),
    freischaltungen: structuredClone(s.freischaltungen),
    betriebshof: s.betriebshof ? serialisiereHof(s.betriebshof) : null,
    zeit: s.zeit,
    zufall: s.zufall.zustand,
    fuhrpark: serialisiereFuhrpark(s.fuhrpark),
    personal: serialisierePersonal(s.personal),
    netz: structuredClone(s.netz),
  };
}

/** Bringt ältere Stände auf die aktuelle Version. Version 1 (Etappe 3a) bekommt ein leeres Liniennetz. */
export function migriere(version: number, p: SpielstandDaten): SpielstandDaten {
  if (version > config.storage.saveVersion) throw new SpielstandFehler(`Spielstand hat Version ${version}, bekannt ist nur ${config.storage.saveVersion}`);
  if (version < 2) return { ...p, netz: neuesNetz() };
  return p;
}

const zahl = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Lädt einen Spielstand. Mit `modellIds` muss jedes Modell des Fuhrparks im Katalog vorkommen. Wirft SpielstandFehler. */
export function ladeSpielstand(rec: SaveRecord, modellIds?: ReadonlySet<string>): SpielZustand {
  try {
    const p = migriere(rec.version, rec.payload as SpielstandDaten);
    if (!p?.firma || typeof p.firma.name !== "string" || typeof p.firma.farbe !== "string") throw new SpielstandFehler("Firma fehlt");
    if (![p.kontostandEur, p.startZeit, p.zeit, p.zufall].every(zahl)) throw new SpielstandFehler("Zahlen fehlen");
    if (!p.gemeinde?.name || !p.gemeinde.quelle || !p.freischaltungen?.gebiete) throw new SpielstandFehler("Gemeinde fehlt");
    const fuhrpark = ladeFuhrpark(p.fuhrpark, modellIds);
    return {
      firma: { name: p.firma.name, farbe: p.firma.farbe },
      kontostandEur: p.kontostandEur,
      startZeit: p.startZeit,
      gemeinde: structuredClone(p.gemeinde),
      freischaltungen: structuredClone(p.freischaltungen),
      betriebshof: p.betriebshof ? ladeHof(p.betriebshof) : null,
      zeit: p.zeit,
      zufall: { zustand: p.zufall >>> 0 },
      fuhrpark,
      personal: ladePersonal(p.personal, config.personal),
      netz: ladeNetz(p.netz, new Set(fuhrpark.busse.map((b) => b.id))),
    };
  } catch (e) {
    if (e instanceof SpielstandFehler) throw e;
    throw new SpielstandFehler(String(e instanceof Error ? e.message : e));
  }
}

/** Kurzinfo für den Einrichtungsdialog ("Weiterspielen"), ohne den ganzen Stand zu prüfen. */
export function spielstandInfo(rec: SaveRecord | null): { firma: string; gemeinde: string; zeit: number; datei: string | null } | null {
  const p = rec?.payload as SpielstandDaten | undefined;
  if (!p?.firma?.name || !p.gemeinde?.name || !zahl(p.zeit)) return null;
  return { firma: p.firma.name, gemeinde: p.gemeinde.name, zeit: p.zeit, datei: p.gemeinde.quelle?.art === "datei" ? p.gemeinde.quelle.dateiname : null };
}
