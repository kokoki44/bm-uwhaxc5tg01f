import { checkVersion, type SaveRecord, type SaveStore } from "./types";

/** Minimale SQL-Schnittstelle. In der Desktop-App steckt das Tauri-SQL-Plugin dahinter, in Tests node:sqlite. */
export interface SqlExecutor {
  execute(sql: string, params?: unknown[]): Promise<void>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

interface Row {
  slot: string;
  version: number;
  saved_at: string;
  payload: string;
}

export class SqliteStore implements SaveStore {
  readonly kind = "sqlite" as const;

  constructor(
    private readonly sql: SqlExecutor,
    private readonly version: number,
  ) {}

  async init(): Promise<void> {
    await this.sql.execute(
      "CREATE TABLE IF NOT EXISTS spielstaende (slot TEXT PRIMARY KEY, version INTEGER NOT NULL, saved_at TEXT NOT NULL, payload TEXT NOT NULL)",
    );
  }

  async save(slot: string, payload: unknown): Promise<void> {
    await this.sql.execute(
      "INSERT INTO spielstaende (slot, version, saved_at, payload) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(slot) DO UPDATE SET version = excluded.version, saved_at = excluded.saved_at, payload = excluded.payload",
      [slot, this.version, new Date().toISOString(), JSON.stringify(payload)],
    );
  }

  async load(slot: string): Promise<SaveRecord | null> {
    const rows = await this.sql.select<Row>("SELECT * FROM spielstaende WHERE slot = ?", [slot]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return checkVersion({ version: r.version, savedAt: r.saved_at, payload: JSON.parse(r.payload) }, this.version);
  }

  async list(): Promise<string[]> {
    const rows = await this.sql.select<{ slot: string }>("SELECT slot FROM spielstaende ORDER BY slot");
    return rows.map((r) => r.slot);
  }

  async remove(slot: string): Promise<void> {
    await this.sql.execute("DELETE FROM spielstaende WHERE slot = ?", [slot]);
  }
}
