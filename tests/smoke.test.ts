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
import { ladeSpielstand, spielstandDaten } from "../src/game/spielstand";
import { erzeugeRichtungen, fuegeFahrtHinzu, fuegeHaltEin, Haltestellen, legeKurzlaeuferAn, legeLinieAn, osmHaltId, planAnfrage, setzeTakt, weiseBusZu } from "../src/linien/linien";
import { berechneLinie, type LinienPlan } from "../src/linien/plan";
import { passtZurLinie } from "../src/linien/pruefung";

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
  halte?: Haltestellen;
  plan?: LinienPlan;
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
  {
    name: "Linie anlegen (vorhandene Haltestellen als Perlenkette, Hin- und Rückrichtung, Route über das Busnetz)",
    seit: "3b",
    run: (c) => {
      const s = c.spiel!;
      c.halte = new Haltestellen(c.world!.stops, s.netz);
      const r = legeLinieAn(s.netz, { nummer: "1", name: "Rauchtest", farbe: "#e30613" }, config.linien);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      for (const id of [333727165, 333727166, 333727173]) expect(fuegeHaltEin(r.linie.perlen, c.halte, osmHaltId(id), () => true, config.linien)).toBeNull();
      erzeugeRichtungen(s.netz, r.linie, c.halte, config.linien, "nach");
      expect(r.linie.varianten.map((v) => v.art)).toEqual(["hin", "rueck"]);
      const k = legeKurzlaeuferAn(s.netz, r.linie, r.linie.varianten[0].id, 0, 1, c.halte, config.linien, "nach");
      expect(k.ok).toBe(true);
    },
  },
  {
    name: "Takt setzen (Werktag alle 20 min, Kurzläufer dazwischen, eine zusätzliche Fahrt)",
    seit: "3b",
    run: (c) => {
      const s = c.spiel!;
      const [hin, rueck, kurz] = s.netz.linien[0].varianten;
      for (const v of [hin, rueck]) expect(setzeTakt(v, "werktag", [{ vonMin: 360, bisMin: 1200, taktMin: 20 }], config.linien).ok).toBe(true);
      expect(setzeTakt(kurz, "werktag", [{ vonMin: 370, bisMin: 540, taktMin: 20 }], config.linien).ok).toBe(true);
      expect(fuegeFahrtHinzu(s.netz, hin, "werktag", 7 * 3600 + 25 * 60, config.linien).ok).toBe(true);
    },
  },
  {
    name: "Fahrplan erzeugen (Fahrten, Fahrzeiten auf 10 s, Bedarf an Bussen, Ausrückzeit vom Betriebshof)",
    seit: "3b",
    run: (c) => {
      const s = c.spiel!;
      const l = s.netz.linien[0];
      // Anschluss des Hofs: Anfang des Abschnitts der ersten Haltestelle (die echte Toranbindung prüft der Oberflächentest)
      const erste = c.world!.stops.find((x) => x.id === 333727165)!;
      const hof = [{ edge: erste.snaps[0].edge, t: 0, dist: 0, point: erste.coord }];
      c.plan = berechneLinie(c.world!.network, planAnfrage(l, c.halte!, hof), config.linien, config.roads);
      expect(c.plan.varianten.every((v) => v.vollstaendig)).toBe(true);
      const w = c.plan.tage.werktag;
      // 42 + 42 nach Takt, 9 Kurzläufer (6:10 bis 8:50), 1 zusätzliche Fahrt
      expect(w.fahrten).toHaveLength(84 + 9 + 1);
      for (const f of w.fahrten) for (const [an, ab] of f.zeiten) expect([an % 10, ab % 10]).toEqual([0, 0]);
      expect(w.busbedarf).toBeGreaterThanOrEqual(2);
      expect(w.umlaeufe.every((u) => u.ausrueck !== null)).toBe(true);
      expect(c.plan.tage.sonnFeiertag.fahrten).toEqual([]);
    },
  },
  {
    name: "Bus zuweisen (Stammlinie, Prüfung Länge und Wendekreis)",
    seit: "3b",
    run: async (c) => {
      const s = c.spiel!;
      const bus = s.fuhrpark.busse[0];
      expect(weiseBusZu(s.netz, s.netz.linien[0].id, bus.id)).toBe(true);
      const kat = await ladeKatalog(readFileSync(config.catalog.fileName), config.catalog);
      const m = kat.modelle.find((x) => x.modell_id === bus.modellId)!;
      expect(passtZurLinie(m, c.plan!.varianten, config.linien)).toEqual([]);
      expect(s.netz.linien[0].busse).toEqual([bus.id]);
    },
  },
  { name: "Einen Spieltag simulieren", seit: "4a" },
  {
    name: "Speichern (ganzer Spielstand mit Linien, wie der Autosave)",
    seit: "0",
    run: async (c) => {
      const s = c.spiel!;
      await c.store.save("rauch", {
        ticks: c.sim.status().ticks, betriebshof: serialisiereHof(s.betriebshof!), fuhrpark: serialisiereFuhrpark(s.fuhrpark), personal: serialisierePersonal(s.personal),
      });
      await c.store.save(config.storage.autosaveSlot, spielstandDaten(s));
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
      const geladen = ladeSpielstand((await c.store.load(config.storage.autosaveSlot))!);
      expect(geladen).toEqual(s);
      // Der geladene Stand ergibt denselben Fahrplan
      expect(berechneLinie(c.world!.network, planAnfrage(geladen.netz.linien[0], new Haltestellen(c.world!.stops, geladen.netz), null), config.linien, config.roads).tage.werktag.fahrten).toEqual(c.plan!.tage.werktag.fahrten);
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
