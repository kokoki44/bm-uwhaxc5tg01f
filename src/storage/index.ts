import { config } from "../config";
import { IndexedDbStore } from "./indexeddb";
import { SqliteStore } from "./sqlite";
import type { SaveStore } from "./types";

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Wählt den Speicher je Plattform. Der Rest des Spiels kennt nur SaveStore. */
export async function createStore(): Promise<SaveStore> {
  const { databaseName, indexedDbStore, saveVersion } = config.storage;
  let store: SaveStore;
  if (isDesktop()) {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    // "sqlite:" liegt relativ zum Anwenderverzeichnis der App, plattformneutral
    const db = await Database.load(`sqlite:${databaseName}.db`);
    store = new SqliteStore(
      {
        execute: async (sql, params) => {
          await db.execute(sql, params);
        },
        select: (sql, params) => db.select(sql, params),
      },
      saveVersion,
    );
  } else {
    store = new IndexedDbStore(databaseName, indexedDbStore, saveVersion);
  }
  await store.init();
  return store;
}
