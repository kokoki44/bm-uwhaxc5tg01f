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

/**
 * Alle offenen Fenster aktualisieren (nur solche, die noch im Dokument sind). Ein Fenster, in dem gerade ein Eingabefeld,
 * eine Auswahlliste oder eine offene Bestätigung (data-halten) den Fokus hat, wird nicht neu gezeichnet, damit Eingabe,
 * Auswahl und Bestätigung erhalten bleiben; es folgt beim nächsten Mal.
 */
export function aktualisiereFenster(): void {
  const fokus = document.activeElement;
  const halten = !!fokus && (fokus.matches("input, select, textarea") || fokus.hasAttribute("data-halten"));
  for (const [id, f] of beobachter) {
    const el = document.querySelector(`[data-testid="fenster-${id}"]`);
    if (!el) beobachter.delete(id);
    else if (!(halten && el.contains(fokus))) f();
  }
}

/** Anzeigename eines Modells in Listen: Modellreihe, dahinter die Variante mit Komma getrennt. */
export function modellName(m: Bus): string {
  return m.variante ? `${reihenName(m)}, ${m.variante}` : reihenName(m);
}

/** Anzeigename einer Modellreihe (ohne Variante). */
export function reihenName(m: Bus): string {
  return [m.hersteller, m.modellfamilie, m.modell !== "Standard" ? m.modell : null].filter(Boolean).join(" ");
}

/** Schlüssel einer Modellreihe: Zeilen mit gleichem Hersteller, Modellfamilie und Modell sind Varianten. */
export const reihenSchluessel = (m: Bus): string => `${m.hersteller}|${m.modellfamilie}|${m.modell}`;
