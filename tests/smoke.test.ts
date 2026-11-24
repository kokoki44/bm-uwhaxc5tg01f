import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { jetztCivil } from "../src/calendar/civil";
import { config } from "../src/config";
import { neuesSpiel, pruefeSetup, type SpielZustand } from "../src/game/setup";
import { SimCore } from "../src/sim/core";
import { IndexedDbStore } from "../src/storage/indexeddb";
import { istFreigeschaltet } from "../src/world/unlock";
import { buildWorld, type World } from "../src/world/world";
import { ladeNorderstedt, netzSperren } from "./helpers/norderstedt";

/**
 * Rauchtest durch den Kernzyklus. Wird mit jeder Etappe um echte Schritte erweitert.
 * Schritte, die erst später existieren, sind als offen markiert (todo).
 */
interface Ctx {
  store: IndexedDbStore;
  sim: SimCore;
  world?: World;
  spiel?: SpielZustand;
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
  {
    name: "Gemeinde wählen (Einrichtung, Norderstedt offline laden, Welt aufbauen)",
    seit: "1",
    run: async (c) => {
      const setup = pruefeSetup({ gemeinde: { art: "norderstedt" }, startkapital: "2000000", firmenname: "Rauchtest Bus", firmenfarbe: "#123456" }, config.setup);
      expect(setup.ok).toBe(true);
      if (!setup.ok) return;
      const entsperren = netzSperren();
      try {
        c.world = buildWorld(await ladeNorderstedt(), config);
      } finally {
        entsperren();
      }
      c.spiel = neuesSpiel(setup.werte, c.world, jetztCivil());
      expect(c.world.gemeinde.name).toBe("Norderstedt");
      expect(c.world.stops.length).toBeGreaterThan(0);
      expect(c.world.network.edges.length).toBeGreaterThan(0);
      expect(c.world.demand.cells.length).toBeGreaterThan(0);
      expect(istFreigeschaltet(c.spiel.freischaltungen, c.world.gebiete[0].id)).toBe(true);
      expect(c.spiel.kontostandEur).toBe(2000000);
    },
  },
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
