/** Gemeinsame Schnittstelle für Speicherstände. Dahinter SQLite (Desktop) oder IndexedDB (Browser). */
export interface SaveRecord {
  /** Version des Speicherformats, damit alte Stände nach Updates ladbar bleiben. */
  version: number;
  savedAt: string;
  payload: unknown;
}

export interface SaveStore {
  readonly kind: "sqlite" | "indexeddb";
  init(): Promise<void>;
  save(slot: string, payload: unknown): Promise<void>;
  load(slot: string): Promise<SaveRecord | null>;
  list(): Promise<string[]>;
  remove(slot: string): Promise<void>;
}

export class SaveVersionError extends Error {}

/** Stände mit höherer Version als die App kennt, werden abgelehnt statt falsch gelesen. */
export function checkVersion(rec: SaveRecord, known: number): SaveRecord {
  if (rec.version > known) {
    throw new SaveVersionError(`Speicherstand hat Version ${rec.version}, bekannt ist nur ${known}`);
  }
  return rec; // Migration älterer Versionen folgt, sobald es eine zweite Version gibt
}
