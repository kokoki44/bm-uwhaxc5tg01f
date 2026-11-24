import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { config } from "../src/config";
import { SimCore } from "../src/sim/core";
import { IndexedDbStore } from "../src/storage/indexeddb";

/**
 * Rauchtest durch den Kernzyklus. Wird mit jeder Etappe um echte Schritte erweitert.
 * Etappe 0: Gerüst. Schritte, die erst später existieren, sind als offen markiert (todo).
 */
interface Ctx {
  store: IndexedDbStore;
  sim: SimCore;
}

const schritte: { name: string; seit: string; run?: (c: Ctx) => Promise<void> | void }[] = [
  {
    name: "Spiel starten (Simulation läuft, Speicher bereit)",
    seit: "0",
    run: async (c) => {
      await c.store.init();
      c.sim.advance(1000);
      expect(c.sim.status().ticks).toBeGreaterThan(0);
    },
  },
  { name: "Gemeinde wählen", seit: "1" },
  { name: "Betriebshof bauen", seit: "2" },
  { name: "Bus kaufen", seit: "3a" },
  { name: "Fahrer einstellen", seit: "3a" },
  { name: "Linie anlegen", seit: "3b" },
  { name: "Einen Spieltag simulieren", seit: "4a" },
  {
    name: "Speichern",
    seit: "0",
    run: async (c) => {
      await c.store.save("rauch", { ticks: c.sim.status().ticks });
    },
  },
  {
    name: "Laden",
    seit: "0",
    run: async (c) => {
      expect((await c.store.load("rauch"))?.payload).toEqual({ ticks: c.sim.status().ticks });
    },
  },
];

describe("Rauchtest Kernzyklus", () => {
  const ctx: Ctx = {
    store: new IndexedDbStore("rauch-" + Math.random(), config.storage.indexedDbStore, config.storage.saveVersion),
    sim: new SimCore(config.sim),
  };
  for (const s of schritte) {
    if (s.run) it(`${s.name} (Etappe ${s.seit})`, () => s.run!(ctx));
    else it.todo(`${s.name} (ab Etappe ${s.seit})`);
  }
});
