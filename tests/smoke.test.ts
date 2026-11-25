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
import { ladeOptionen } from "../src/catalog/optionen";
import { kaufeNeu, kreisVon, marktOptionen, standardKonfig } from "../src/fleet/fuhrpark";
import { ladeFuhrpark, serialisiereFuhrpark } from "../src/fleet/speichern";
import { fortschreiben, kaufKontext, starteMarkt, type SpielKontext } from "../src/game/spiel";
import { ladePersonal, schreibeAus, serialisierePersonal, sichtbareBewerber, stelleEin } from "../src/personal/personal";

/**
 * Rauchtest durch den Kernzyklus. Wird mit jeder Etappe um echte Schritte erweitert.
 * Schritte, die erst später existieren, sind als offen markiert (todo).
 */
interface Ctx {
  store: IndexedDbStore;
  sim: SimCore;
  world?: World;
  spiel?: SpielZustand;
  k?: SpielKontext;
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
      c.spiel = neuesSpiel(setup.werte, c.world, jetztCivil(), 20261125); // feste Zufallszahl: wiederholbar
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
  {
    name: "Bus kaufen (Fahrzeugmarkt mit Optionsdatei, Neukauf auf freien Platz, Gebrauchtmarkt)",
    seit: "3a",
    run: async (c) => {
      const spiel = c.spiel!;
      const kat = await ladeKatalog(readFileSync(config.catalog.fileName), config.catalog);
      const opt = await ladeOptionen(readFileSync(config.optionen.fileName), config.optionen);
      expect(opt.meldungen.filter((m) => m.schwere === "fehler")).toEqual([]);
      const modelle = new Map(kat.modelle.map((m) => [m.modell_id!, m]));
      c.k = {
        markt: {
          modelle, optionen: marktOptionen(opt.optionen), markt: config.fahrzeugmarkt, katalog: config.catalog, hofCfg: config.betriebshof,
          freigeschaltet: new Set(), frei: config.optionen.frei, kreis: kreisVon(c.world!.gemeinde.kreisschluessel, config.fahrzeugmarkt),
        },
        hof: { cfg: config.betriebshof, busse: busMasseAusKatalog(kat.modelle) },
        region: c.world!.gemeinde.region,
      };
      starteMarkt(spiel, c.k);
      expect(spiel.fuhrpark.angebote).toHaveLength(config.fahrzeugmarkt.gebraucht.angebote);
      const kk = kaufKontext(spiel, c.k);
      const m = modelle.get("man_lions_city_12_e_2t")!;
      const vorher = spiel.kontostandEur;
      const e = kaufeNeu(kk, m.modell_id!, standardKonfig(m, spiel.firma.farbe, kk));
      expect(e.ok).toBe(true);
      if (!e.ok) return;
      expect(spiel.kontostandEur).toBe(vorher - m.neupreis_eur!);
      expect(e.bus.kennzeichen.startsWith("SE-")).toBe(true);
      expect(spiel.fuhrpark.busse).toHaveLength(1);
    },
  },
  {
    name: "Fahrer einstellen (Ausschreibung, Bewerber nach einigen Tagen, Lohn am Monatsende)",
    seit: "3a",
    run: (c) => {
      const spiel = c.spiel!;
      let person = null;
      for (let i = 0; i < 10 && !person; i++) {
        const a = schreibeAus(spiel.personal, "fahrer", 38, spiel.zeit, spiel.zufall, config.personal);
        if (!a.ok) throw new Error("Ausschreibung");
        fortschreiben(spiel, spiel.zeit + config.personal.bewerbung.wartezeitTageMax * 86400000, c.k!);
        const b = sichtbareBewerber(a.ausschreibung, spiel.zeit)[0];
        if (b) {
          const st = stelleEin(spiel.personal, a.ausschreibung.id, b.id, spiel.zeit);
          if (st.ok) person = st.person;
        }
      }
      expect(person).not.toBeNull();
      const vorher = spiel.kontostandEur;
      const ereignisse = fortschreiben(spiel, spiel.zeit + 35 * 86400000, c.k!);
      expect(ereignisse.some((x) => x.art === "lohn" && x.summeEur > 0)).toBe(true);
      expect(spiel.kontostandEur).toBeLessThan(vorher);
    },
  },
  { name: "Linie anlegen", seit: "3b" },
  { name: "Einen Spieltag simulieren", seit: "4a" },
  {
    name: "Speichern",
    seit: "0",
    run: async (c) => {
      const s = c.spiel!;
      await c.store.save("rauch", {
        ticks: c.sim.status().ticks, betriebshof: serialisiereHof(s.betriebshof!), fuhrpark: serialisiereFuhrpark(s.fuhrpark), personal: serialisierePersonal(s.personal),
      });
    },
  },
  {
    name: "Laden",
    seit: "0",
    run: async (c) => {
      const s = c.spiel!;
      const p = (await c.store.load("rauch"))?.payload as { ticks: number; betriebshof: string; fuhrpark: string; personal: string };
      expect(p.ticks).toBe(c.sim.status().ticks);
      expect(ladeHof(p.betriebshof)).toEqual(s.betriebshof);
      expect(ladeFuhrpark(p.fuhrpark)).toEqual(s.fuhrpark);
      expect(ladePersonal(p.personal, config.personal)).toEqual(s.personal);
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
