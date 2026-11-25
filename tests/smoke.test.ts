import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ladeKatalog } from "../src/catalog/katalog";
import { analysiereHof } from "../src/depot/analyse";
import { busMasseAusKatalog, ladeHof, neuerHof, serialisiereHof, type HofKontext } from "../src/depot/hof";
import { kaufeStartgrundstueck } from "../src/world/standorte";
import { BEISPIEL_B, BEISPIEL_T, baueBeispiel } from "./helpers/beispiel-hof";
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
  {
    name: "Betriebshof bauen (Katalog lesen, Standort wählen, Grundstück kaufen, gültiges Layout)",
    seit: "2",
    run: async (c) => {
      const kat = await ladeKatalog(readFileSync(config.catalog.fileName), config.catalog);
      expect(kat.modelle.length).toBeGreaterThan(0);
      const ctx: HofKontext = { cfg: config.betriebshof, busse: busMasseAusKatalog(kat.modelle) };
      const spiel = c.spiel!;
      const s = c.world!.standorte[0];
      const kauf = kaufeStartgrundstueck(spiel, s, s.startLage, BEISPIEL_B, BEISPIEL_T, config.grundstueck);
      expect(kauf.ok).toBe(true);
      if (!kauf.ok) return;
      spiel.betriebshof = neuerHof(kauf.grundstueck);
      baueBeispiel(spiel.betriebshof, spiel, ctx);
      const a = analysiereHof(spiel.betriebshof, ctx);
      expect(a.gueltig).toBe(true);
      expect(a.betriebsbereit).toBe(true);
      expect(spiel.kontostandEur).toBeGreaterThan(0);
      expect(ladeHof(serialisiereHof(spiel.betriebshof))).toEqual(spiel.betriebshof);
    },
  },
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
