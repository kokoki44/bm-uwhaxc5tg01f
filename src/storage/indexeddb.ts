import { checkVersion, type SaveRecord, type SaveStore } from "./types";

export class IndexedDbStore implements SaveStore {
  readonly kind = "indexeddb" as const;
  private db!: IDBDatabase;

  constructor(
    private readonly dbName: string,
    private readonly storeName: string,
    private readonly version: number,
    private readonly factory: IDBFactory = indexedDB,
  ) {}

  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.factory.open(this.dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.storeName);
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  private run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, mode);
      const req = fn(tx.objectStore(this.storeName));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async save(slot: string, payload: unknown): Promise<void> {
    const rec: SaveRecord = { version: this.version, savedAt: new Date().toISOString(), payload };
    await this.run("readwrite", (s) => s.put(rec, slot));
  }

  async load(slot: string): Promise<SaveRecord | null> {
    const rec = await this.run<SaveRecord | undefined>("readonly", (s) => s.get(slot));
    return rec ? checkVersion(rec, this.version) : null;
  }

  async list(): Promise<string[]> {
    const keys = await this.run<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
    return keys.map(String).sort();
  }

  async remove(slot: string): Promise<void> {
    await this.run("readwrite", (s) => s.delete(slot));
  }
}
