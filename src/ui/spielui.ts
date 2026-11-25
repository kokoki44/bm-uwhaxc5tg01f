import type { Bus } from "../catalog/katalog";
import type { SpielZustand } from "../game/setup";
import type { SpielKontext } from "../game/spiel";

/** Gemeinsamer Zugang der Fenster zu Spielzustand und Regeln. */
export interface SpielUi {
  spiel: SpielZustand;
  k: SpielKontext;
  /** Nach jeder Buchung: Kontostand in der Kopfleiste neu anzeigen. */
  kontoGeaendert(): void;
  /** Betriebshof-Editor öffnen (zum Beispiel, um einen Bus umzusetzen). */
  betriebshof(): void;
}

/** Fenster, die sich bei Änderungen der Spielzeit neu zeichnen (neue Bewerber, neue Angebote, Lohn). */
const beobachter = new Map<string, () => void>();

export function beobachte(id: string, neuZeichnen: () => void): void {
  beobachter.set(id, neuZeichnen);
}

export function vergiss(id: string): void {
  beobachter.delete(id);
}

/** Alle offenen Fenster aktualisieren (nur solche, die noch im Dokument sind). */
export function aktualisiereFenster(): void {
  for (const [id, f] of beobachter) {
    if (!document.querySelector(`[data-testid="fenster-${id}"]`)) beobachter.delete(id);
    else f();
  }
}

/** Anzeigename eines Modells: Hersteller, Modell, Variante. */
export function modellName(m: Bus): string {
  return [m.hersteller, m.modellfamilie, m.modell !== "Standard" ? m.modell : null, m.variante].filter(Boolean).join(" ");
}

/** Anzeigename einer Modellreihe (ohne Variante). */
export function reihenName(m: Bus): string {
  return [m.hersteller, m.modellfamilie, m.modell !== "Standard" ? m.modell : null].filter(Boolean).join(" ");
}

/** Schlüssel einer Modellreihe: Zeilen mit gleichem Hersteller, Modellfamilie und Modell sind Varianten. */
export const reihenSchluessel = (m: Bus): string => `${m.hersteller}|${m.modellfamilie}|${m.modell}`;
