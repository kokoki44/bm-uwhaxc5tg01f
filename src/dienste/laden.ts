import { config } from "../config";
import { ladeRegelwerk, type Regelwerk, type RegelwerkMeldung } from "./regelwerk";

/** Alle Regelwerk-Dateien im Ordner `regelwerk/` (eine je Land), beim Bauen eingebunden. */
const dateien = import.meta.glob("../../regelwerk/*.json", { eager: true, import: "default" }) as Record<string, unknown>;

export interface RegelwerkErgebnis {
  regelwerk: Regelwerk | null;
  meldungen: RegelwerkMeldung[];
  datei: string;
}

/** Lädt und prüft das Regelwerk des Landes aus der Konfiguration (`dienste.regelwerk`). */
export function aktuellesRegelwerk(land = config.dienste.regelwerk): RegelwerkErgebnis {
  const datei = `regelwerk/${land}.json`;
  const roh = Object.entries(dateien).find(([pfad]) => pfad.endsWith(`/${land}.json`))?.[1];
  if (roh === undefined) return { regelwerk: null, meldungen: [{ code: "unlesbar", ort: "datei" }], datei };
  return { ...ladeRegelwerk(roh), datei };
}
