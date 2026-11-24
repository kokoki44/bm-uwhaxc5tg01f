/**
 * Freischaltung von Gebieten (Gemeinde oder Subdivision). Etappe 1: nur die Datenstruktur.
 * Die Startgemeinde ist freigeschaltet, alle anderen nicht. Kauf von Konzessionen und Gemeindeaufträge folgen später.
 */
export type FreischaltungsArt = "start" | "konzession" | "auftrag";

export interface Konzession {
  gebiet: string;
  /** Kaufpreis in Euro. Dauerhaft gültig, kein Auslaufen (Konzept). */
  preisEur: number;
  erworbenAm: string;
}

export interface Gemeindeauftrag {
  id: string;
  gebiet: string;
  /** Ausgeschriebene Linien (Linienbündel); die Linien selbst folgen mit Etappe 3b. */
  linienbuendel: string[];
  mindestbedienung: { taktMin: number; betriebszeitVon: string; betriebszeitBis: string };
  verguetungEurProFahrplanKm: number;
  laufzeitMonate: number;
  status: "ausgeschrieben" | "beworben" | "vergeben" | "entzogen";
}

export interface Freischaltungen {
  gebiete: Record<string, FreischaltungsArt>;
  konzessionen: Konzession[];
  auftraege: Gemeindeauftrag[];
}

export function startFreischaltung(startGebiete: string[]): Freischaltungen {
  return { gebiete: Object.fromEntries(startGebiete.map((g) => [g, "start" as const])), konzessionen: [], auftraege: [] };
}

export function istFreigeschaltet(f: Freischaltungen, gebiet: string): boolean {
  return f.gebiete[gebiet] !== undefined;
}
