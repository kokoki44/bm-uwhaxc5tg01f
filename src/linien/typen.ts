import type { PlanTag } from "../config";
import type { LonLat } from "../world/geo";
import type { Snap } from "../world/router";

/**
 * Datenmodell für Haltestellen, Linien, Varianten, Takt und Fahrtänderungen (Konzept: Linien und Fahrplan).
 * Alles hier gehört zum Spielstand. Routen, Fahrzeiten, Fahrten und Busbedarf werden daraus berechnet
 * und nicht gespeichert.
 */

/** Haltestellen-ID: "o" + OSM-Knoten-ID für vorhandene, "n" + laufende Nummer für neue Haltestellen. */
export type HaltId = string;

export interface NeueHaltestelle {
  id: HaltId;
  name: string;
  coord: LonLat;
  snaps: Snap[];
}

/** Perle der Kette: Haltestelle (mit Standzeit) oder Wegpunkt. */
export type Perle =
  | { art: "halt"; halt: HaltId; standzeitS: number }
  | { art: "weg"; coord: LonLat; snaps: Snap[] };

/** Ein Abschnitt des Takts: ab `vonMin` alle `taktMin` Minuten, solange die Abfahrt vor `bisMin` liegt. Minuten ab 0 Uhr des Betriebstags (bis 28 Uhr). */
export interface TaktZeile {
  vonMin: number;
  bisMin: number;
  taktMin: number;
}

/** Änderung einer erzeugten Fahrt oder zusätzliche Fahrt. Gebunden an Tagesart, Variante und ursprüngliche Abfahrt. */
export type FahrtAenderung =
  | { art: "verschieben"; tag: PlanTag; ursprungS: number; neuS: number }
  | { art: "streichen"; tag: PlanTag; ursprungS: number }
  | { art: "zusatz"; tag: PlanTag; id: number; abfahrtS: number };

export type VariantenArt = "hin" | "rueck" | "kurz";

export interface Variante {
  id: number;
  art: VariantenArt;
  name: string;
  perlen: Perle[];
  /** Wendezeit am Endpunkt (letzte Haltestelle). */
  wendezeitS: number;
  /** Takt je Tagesart. Für die Ferientage gilt der Takt ohne Ferien, solange `eigenerFerientakt` nicht gesetzt ist. */
  takt: Record<PlanTag, TaktZeile[]>;
  eigenerFerientakt: { werktag: boolean; samstag: boolean; sonnFeiertag: boolean };
  aenderungen: FahrtAenderung[];
}

export interface Linie {
  id: number;
  nummer: string;
  name: string;
  farbe: string;
  aktiv: boolean;
  /** Grundlinie als Perlenkette; daraus entstehen die Varianten. */
  perlen: Perle[];
  varianten: Variante[];
  /** Zugewiesene Busse (Ids aus dem Fuhrpark). Ein Bus gehört zu höchstens einer Linie. */
  busse: number[];
}

export interface Netz {
  version: 1;
  linien: Linie[];
  neueHaltestellen: NeueHaltestelle[];
  /** Umbenannte Haltestellen (vorhandene und neue): Id -> Name. */
  namen: Record<HaltId, string>;
  naechsteLinieId: number;
  naechsteVarianteId: number;
  naechsteHaltestelleId: number;
  naechsteZusatzId: number;
}

export function neuesNetz(): Netz {
  return { version: 1, linien: [], neueHaltestellen: [], namen: {}, naechsteLinieId: 1, naechsteVarianteId: 1, naechsteHaltestelleId: 1, naechsteZusatzId: 1 };
}

/** Haltestelle mit allem, was die Berechnung braucht (Name nach Umbenennung). */
export interface HaltDaten {
  id: HaltId;
  name: string;
  coord: LonLat;
  snaps: Snap[];
}

/** Perle für die Berechnung im Worker: Haltestellen sind aufgelöst. `halt` ist null bei Wegpunkten. */
export interface PerleAufgeloest {
  halt: HaltDaten | null;
  coord: LonLat;
  snaps: Snap[];
  standzeitS: number;
}
