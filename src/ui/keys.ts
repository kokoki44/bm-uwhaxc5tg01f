/** Feste Tastenkürzel (Konzept, Festlegungen zu Bedienung und Darstellung). Nicht änderbar. */
/** Geschwindigkeitsstufe auf den Tasten 1 bis 5 (Index in config.sim.speeds). */
export type Stufe = 1 | 2 | 3 | 4 | 5;
export type Aktion = { art: "pauseUmschalten" } | { art: "tempo"; stufe: Stufe } | { art: "fensterSchliessen" } | { art: "speichern" } | { art: "testansicht" };

export interface Taste {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** Fokus liegt in einem Eingabefeld: dann gelten nur Esc und Speichern. */
  inEingabe?: boolean;
}

export function aktionFuer(t: Taste): Aktion | null {
  if (t.key === "Escape") return { art: "fensterSchliessen" };
  if (t.key === "F3") return { art: "testansicht" };
  if ((t.ctrlKey || t.metaKey) && !t.altKey && (t.key === "s" || t.key === "S")) return { art: "speichern" };
  if (t.inEingabe || t.ctrlKey || t.metaKey || t.altKey) return null;
  if (t.key === " " || t.key === "Spacebar") return { art: "pauseUmschalten" };
  if (/^[1-5]$/.test(t.key)) return { art: "tempo", stufe: Number(t.key) as Stufe };
  return null;
}

/** Zeitsteuerung: merkt sich die letzte Stufe, damit die Leertaste nach der Pause dorthin zurückkehrt. */
export class Zeitsteuerung {
  private letzteStufe: number;
  constructor(
    private readonly speeds: number[],
    private aktuell: number,
  ) {
    this.letzteStufe = aktuell > 0 ? aktuell : speeds[1];
  }
  get tempo(): number {
    return this.aktuell;
  }
  get pausiert(): boolean {
    return this.aktuell === 0;
  }
  setzeStufe(stufe: Stufe): number {
    this.aktuell = this.speeds[stufe];
    this.letzteStufe = this.aktuell;
    return this.aktuell;
  }
  pause(): number {
    this.aktuell = 0;
    return 0;
  }
  umschalten(): number {
    this.aktuell = this.aktuell === 0 ? this.letzteStufe : 0;
    return this.aktuell;
  }
}
