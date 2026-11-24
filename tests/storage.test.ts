import "fake-indexeddb/auto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { IndexedDbStore } from "../src/storage/indexeddb";
import { SqliteStore, type SqlExecutor } from "../src/storage/sqlite";
import { SaveVersionError, type SaveStore } from "../src/storage/types";

function sqlExec(db: DatabaseSync): SqlExecutor {
  return {
    execute: async (sql, p = []) => void db.prepare(sql).run(...(p as never[])),
    select: async <T>(sql: string, p: unknown[] = []) => db.prepare(sql).all(...(p as never[])) as T[],
  };
}

const stores: [string, (v: number) => SaveStore][] = [
  ["SQLite", (v) => new SqliteStore(sqlExec(new DatabaseSync(":memory:")), v)],
  ["IndexedDB", (v) => new IndexedDbStore("test-" + Math.random(), "s", v)],
];

describe.each(stores)("Speicherschnittstelle %s", (_n, make) => {
  it("schreibt, liest, überschreibt, listet und löscht", async () => {
    const s = make(1);
    await s.init();
    expect(await s.load("a")).toBeNull();
    await s.save("a", { geld: 100, liste: [1, 2] });
    await s.save("b", "x");
    const rec = await s.load("a");
    expect(rec?.payload).toEqual({ geld: 100, liste: [1, 2] });
    expect(rec?.version).toBe(1);
    await s.save("a", { geld: 5 });
    expect((await s.load("a"))?.payload).toEqual({ geld: 5 });
    expect(await s.list()).toEqual(["a", "b"]);
    await s.remove("a");
    expect(await s.list()).toEqual(["b"]);
  });
});

describe("Speicherversion", () => {
  it("lehnt Stände mit unbekannter neuerer Version ab", async () => {
    const db = new DatabaseSync(":memory:");
    const neu = new SqliteStore(sqlExec(db), 2);
    await neu.init();
    await neu.save("x", {});
    const alt = new SqliteStore(sqlExec(db), 1);
    await expect(alt.load("x")).rejects.toThrow(SaveVersionError);
  });
  it("lädt ältere Versionen", async () => {
    const db = new DatabaseSync(":memory:");
    const alt = new SqliteStore(sqlExec(db), 1);
    await alt.init();
    await alt.save("x", { a: 1 });
    const neu = new SqliteStore(sqlExec(db), 2);
    expect((await neu.load("x"))?.version).toBe(1);
  });
});
