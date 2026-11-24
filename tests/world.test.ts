import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/config";
import { haversine } from "../src/world/geo";
import { buildRoadNetwork } from "../src/world/roads";
import { findRoute, turnAllowed } from "../src/world/router";
import { istFreigeschaltet } from "../src/world/unlock";
import { buildWorld, WorldError, type World } from "../src/world/world";
import { neuesSpiel } from "../src/game/setup";
import { civil } from "../src/calendar/civil";
import { ladeNorderstedt, netzSperren } from "./helpers/norderstedt";
import { TestOsm } from "./helpers/osm";

/** Zielkorridore aus annahmen.md (A1-K1, A1-K2). */
const EINWOHNER = { min: 56000, max: 104000 };
const ARBEITSPLAETZE = { min: 25918, max: 48134 };

let world: World;
let schritte: [string, number][] = [];
let entsperren: () => void;

beforeAll(async () => {
  entsperren = netzSperren();
  const ex = await ladeNorderstedt();
  world = buildWorld(ex, config, (s, a) => schritte.push([s, a]));
});
afterAll(() => entsperren());

describe("Norderstedt lädt offline", () => {
  it("Gemeinde, Bundesland und Fortschritt", () => {
    expect(world.gemeinde.name).toBe("Norderstedt");
    expect(world.gemeinde.region).toBe("DE-SH");
    expect(world.gemeinde.rings.length).toBeGreaterThan(0);
    expect(schritte.length).toBeGreaterThanOrEqual(5);
    const anteile = schritte.map((s) => s[1]);
    expect(anteile).toEqual([...anteile].sort((a, b) => a - b));
    expect(anteile[anteile.length - 1]).toBe(1);
  });
  it("Netz war gesperrt (kein Live-Abruf)", async () => {
    await expect(fetch("https://overpass-api.de/api/interpreter")).rejects.toThrow(/gesperrt/);
  });
});

describe("Straßennetz Norderstedt", () => {
  it("hat Abschnitte mit Länge und Geschwindigkeit, Einbahnstraßen, Ampeln und Abbiegeregeln", () => {
    const n = world.network;
    expect(n.edges.length).toBeGreaterThan(3000);
    expect(n.edges.every((e) => e.lengthM > 0 && e.speedKmh > 0)).toBe(true);
    expect(n.edges.filter((e) => e.twin === -1).length).toBeGreaterThan(50);
    expect(n.signalNodes).toBeGreaterThan(100);
    expect(n.edges.reduce((s, e) => s + e.signals, 0)).toBeGreaterThan(100);
    expect(n.restrictions.applied).toBeGreaterThan(50);
    expect(Object.keys(n.forbidden).length).toBeGreaterThan(50);
  });
  it("enthält keine Fuß- und Radwege", () => {
    expect(world.network.edges.some((e) => ["footway", "cycleway", "path", "steps", "track"].includes(e.cls))).toBe(false);
  });
});

describe("Haltestellen Norderstedt", () => {
  it("Anzahl plausibel und jede einem Straßenabschnitt zugeordnet", () => {
    expect(world.stops.length).toBeGreaterThan(150);
    expect(world.stops.length).toBeLessThan(500);
    const ohne = world.stops.filter((s) => s.snaps.length === 0).map((s) => s.name);
    expect(ohne).toEqual([]);
    for (const s of world.stops) for (const sn of s.snaps) expect(sn.dist).toBeLessThanOrEqual(config.stops.fangradiusM);
  });
});

describe("Routing zwischen echten Haltestellen", () => {
  it("liefert zusammenhängende Routen ohne verbotene Abbiegungen, nicht kürzer als die Luftlinie", () => {
    const n = world.network;
    const S = world.stops;
    // Hauptnetz: Abschnitte, die vom ersten Abschnitt der ersten Haltestelle aus erreichbar sind
    const erreichbar = new Set<number>();
    const stapel = [S[0].snaps[0].edge];
    while (stapel.length) {
      const e = stapel.pop()!;
      if (erreichbar.has(e)) continue;
      erreichbar.add(e);
      for (const o of n.outEdges[n.edges[e].to]) if (turnAllowed(n, e, o)) stapel.push(o);
    }
    let geprueft = 0;
    for (let k = 0; k < 60; k++) {
      const a = S[(k * 37) % S.length], z = S[(k * 101 + 13) % S.length];
      if (a === z) continue;
      const r = findRoute(n, a.snaps, z.snaps, config.roads);
      const zielImHauptnetz = z.snaps.some((s) => erreichbar.has(s.edge)) && a.snaps.some((s) => erreichbar.has(s.edge));
      if (!zielImHauptnetz) continue; // Haltestellen an Straßenstücken, die nur über Straßen außerhalb der Gemeinde angebunden sind
      expect(r, `${a.name} -> ${z.name}`).not.toBeNull();
      geprueft++;
      for (let i = 1; i < r!.edges.length; i++) {
        expect(n.edges[r!.edges[i - 1]].to).toBe(n.edges[r!.edges[i]].from);
        expect(turnAllowed(n, r!.edges[i - 1], r!.edges[i])).toBe(true);
      }
      const luft = haversine(r!.coords[0], r!.coords[r!.coords.length - 1]);
      expect(r!.lengthM).toBeGreaterThanOrEqual(luft * 0.999);
      // Fahrzeit mindestens Länge durch Höchstgeschwindigkeit im Netz
      const vmax = Math.max(...r!.edges.map((e) => n.edges[e].speedKmh)) / 3.6;
      expect(r!.timeS).toBeGreaterThanOrEqual(r!.lengthM / vmax - 1e-6);
    }
    expect(geprueft).toBeGreaterThanOrEqual(55);
    // Mindestens 95 Prozent aller Haltestellen liegen im Hauptnetz
    const imNetz = S.filter((s) => s.snaps.some((sn) => erreichbar.has(sn.edge))).length;
    expect(imNetz / S.length).toBeGreaterThanOrEqual(0.95);
  });
  it("Einbahnstraßen werden nur in Fahrtrichtung befahren (keine Gegenrichtung im Netz)", () => {
    const ex = new TestOsm().node(1, 0, 0).node(2, 1, 0);
    ex.way([1, 2], { highway: "residential", oneway: "yes" });
    expect(buildRoadNetwork(ex.extract(), config.roads).edges).toHaveLength(1);
  });
});

describe("Nachfragegitter Norderstedt", () => {
  it("ist nicht leer und liegt in den Zielkorridoren", () => {
    const d = world.demand;
    expect(d.cells.length).toBeGreaterThan(100);
    expect(d.summe.einwohner).toBeGreaterThanOrEqual(EINWOHNER.min);
    expect(d.summe.einwohner).toBeLessThanOrEqual(EINWOHNER.max);
    expect(d.summe.arbeitsplaetze).toBeGreaterThanOrEqual(ARBEITSPLAETZE.min);
    expect(d.summe.arbeitsplaetze).toBeLessThanOrEqual(ARBEITSPLAETZE.max);
    for (const k of ["schule", "einkauf", "freizeit", "versorgung"]) expect(d.summe.orte[k], k).toBeGreaterThan(0);
  });
  it("ist deterministisch", async () => {
    const zweite = buildWorld(await ladeNorderstedt(), config);
    expect(zweite.demand.summe).toEqual(world.demand.summe);
    expect(zweite.demand.cells).toEqual(world.demand.cells);
    expect(zweite.network.edges.length).toBe(world.network.edges.length);
  });
});

describe("Gebiete und Freischaltung", () => {
  it("Norderstedt liegt unter dem Schwellenwert und wird nicht geteilt", () => {
    expect(world.gemeinde.einwohner).toBeLessThan(config.world.teilungAbEinwohnern);
    expect(world.geteilt).toBe(false);
    expect(world.gebiete).toHaveLength(1);
    expect(world.gebiete[0].einwohner).toBe(world.gemeinde.einwohner);
  });
  it("Startgemeinde ist freigeschaltet, andere Gebiete nicht", () => {
    const s = neuesSpiel({ gemeinde: { art: "norderstedt" }, startkapital: 1e6, firmenname: "A", firmenfarbe: "#000000" }, world, civil(2026, 11, 24, 8));
    expect(istFreigeschaltet(s.freischaltungen, world.gebiete[0].id)).toBe(true);
    expect(istFreigeschaltet(s.freischaltungen, "r999")).toBe(false);
    expect(s.freischaltungen.konzessionen).toEqual([]);
    expect(s.freischaltungen.auftraege).toEqual([]);
    expect(s.kontostandEur).toBe(1e6);
  });

  /** Kleine Stadt mit zwei Stadtteilen und Wohnhäusern in beiden. */
  function kleineStadt() {
    const o = new TestOsm().node(1, 0, 0).node(2, 20, 0);
    o.way([1, 2], { highway: "residential" });
    o.boundary("Teststadt", 8, -1, -10, 21, 10, { "ISO3166-2": "DE-HH" });
    o.boundary("West", 10, -1, -10, 10, 10);
    o.boundary("Ost", 10, 10, -10, 21, 10);
    for (let x = 1; x < 20; x += 2) o.building(x, 3, 0.4, { building: "apartments", "building:levels": "5" });
    return o.extract();
  }
  it("über dem Schwellenwert in Subdivisionen geteilt", () => {
    const w = buildWorld(kleineStadt(), { ...config, world: { teilungAbEinwohnern: 10 } });
    expect(w.geteilt).toBe(true);
    expect(w.gebiete.map((g) => g.name)).toEqual(["Ost", "West"]);
    expect(w.gebiete.every((g) => g.einwohner > 0)).toBe(true);
    expect(w.gebiete.reduce((s, g) => s + g.einwohner, 0)).toBe(w.gemeinde.einwohner);
    expect(w.gemeinde.region).toBe("DE-HH");
  });
  it("unter dem Schwellenwert nicht geteilt", () => {
    const w = buildWorld(kleineStadt(), { ...config, world: { teilungAbEinwohnern: 1e9 } });
    expect(w.geteilt).toBe(false);
    expect(w.gebiete.map((g) => g.name)).toEqual(["Teststadt"]);
  });
  it("Datei ohne Gemeindegrenze oder ohne Straßen wird mit Meldung abgelehnt", () => {
    expect(() => buildWorld({ elements: [] }, config)).toThrow(WorldError);
    const o = new TestOsm();
    o.boundary("Leer", 8, 0, 0, 1, 1);
    try {
      buildWorld(o.extract(), config);
      expect.unreachable();
    } catch (e) {
      expect((e as WorldError).key).toBe("fehler.keineStrassen");
    }
  });
});
