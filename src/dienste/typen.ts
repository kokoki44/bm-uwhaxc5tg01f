import type { PlanTag } from "../config";
import type { Grundtag } from "../linien/fahrplan";

/**
 * Dienstplan (Etappe 3c-1). Ein Dienst ist die Folge von Abschnitten eines Fahrers an einer Tagesart. Er besteht aus
 * Dienststücken: zusammenhängenden Teilen eines Umlaufs. Gespeichert wird je Fahrt (Variante und Schlüssel wie bei den
 * Fahrtänderungen), nicht je Umlauf, weil sich Umläufe bei Fahrplanänderungen neu bilden können.
 */
export interface FahrtRef {
  variante: number;
  /** "t<Sekunden>" für Fahrten aus dem Takt, "z<Nummer>" für zusätzliche Fahrten. */
  schluessel: string;
}

export interface Dienststueck {
  linie: number;
  /** Aufeinanderfolgende Fahrten eines Umlaufs. Beginnt das Stück mit der ersten Fahrt des Umlaufs, rückt es aus; endet es mit der letzten, rückt es ein; sonst Ablösung am Wendepunkt. */
  fahrten: FahrtRef[];
}

export interface Dienst {
  id: number;
  /** Frei wählbare Dienstnummer, je Tagesart eindeutig. */
  nummer: string;
  tag: PlanTag;
  stuecke: Dienststueck[];
}

export interface Dienstplan {
  version: 1;
  dienste: Dienst[];
  /** Eigene Dienste an Ferientagen; sonst gelten die Dienste des Tages ohne Ferien (wie der Takt in 3b, F7). */
  eigeneFerienDienste: Record<Grundtag, boolean>;
  naechsteId: number;
}

export const neuerDienstplan = (): Dienstplan => ({ version: 1, dienste: [], eigeneFerienDienste: { werktag: false, samstag: false, sonnFeiertag: false }, naechsteId: 1 });
