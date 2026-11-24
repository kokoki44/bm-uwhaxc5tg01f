/** Feste Tastenkürzel (Konzept, Festlegungen zu Bedienung und Darstellung). Nicht änderbar. */
export type Aktion = { art: "pauseUmschalten" } | { art: "tempo"; stufe: 1 | 2 | 3 | 4 } | { art: "fensterSchliessen" } | { art: "speichern" };

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
  if ((t.ctrlKey || t.metaKey) && !t.altKey && (t.key === "s" || t.key === "S")) return { art: "speichern" };
  if (t.inEingabe || t.ctrlKey || t.metaKey || t.altKey) return null;
  if (t.key === " " || t.key === "Spacebar") return { art: "pauseUmschalten" };
  if (t.key === "1" || t.key === "2" || t.key === "3" || t.key === "4") return { art: "tempo", stufe: Number(t.key) as 1 | 2 | 3 | 4 };
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
  setzeStufe(stufe: 1 | 2 | 3 | 4): number {
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
