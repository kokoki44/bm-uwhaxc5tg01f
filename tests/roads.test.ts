import { describe, expect, it } from "vitest";
import { config } from "../src/config";
import { LocalProj, haversine } from "../src/world/geo";
import { buildRoadNetwork, isBusWay, onewayDir, parseMaxspeed, type RoadNetwork } from "../src/world/roads";
import { fahrzeitS, findRoute, turnAllowed, type Snap } from "../src/world/router";
import { snapStops, type Stop } from "../src/world/stops";
import { TestOsm } from "./helpers/osm";

const R = config.roads;
const res = { highway: "residential", maxspeed: "36" }; // 36 km/h = 10 m/s

/** Abschnitt eines Weges von Knoten a nach b finden. */
const edge = (net: RoadNetwork, a: number, b: number) => {
  const ia = net.nodeOsm.indexOf(a), ib = net.nodeOsm.indexOf(b);
  return net.edges.find((e) => e.from === ia && e.to === ib)!;
};
const snapAt = (net: RoadNetwork, a: number, b: number, t: number): Snap => {
  const e = edge(net, a, b);
  return { edge: e.id, t, dist: 0, point: e.coords[0] };
};
const knoten = (net: RoadNetwork, edges: number[]) => [net.nodeOsm[net.edges[edges[0]].from], ...edges.map((e) => net.nodeOsm[net.edges[e].to])];

/**
 * Testnetz:
 *   D(1,1) ---W5--- E(2,1)
 *    |               |
 *   W3              W4
 *    |               |
 *   A(0,0) -W1- B(1,0) -W2- C(2,0)
 */
function testnetz(mod: (o: TestOsm, w: Record<string, number>) => void = () => {}) {
  const o = new TestOsm().node(1, 0, 0).node(2, 1, 0).node(3, 2, 0).node(4, 1, 1).node(5, 2, 1);
  const w: Record<string, number> = {};
  w.W1 = o.way([1, 2], res);
  w.W2 = o.way([2, 3], res);
  w.W3 = o.way([2, 4], res);
  w.W4 = o.way([3, 5], res);
  w.W5 = o.way([4, 5], res);
  mod(o, w);
  return { net: buildRoadNetwork(o.extract(), R), w };
}

describe("Straßennetz: Einlesen", () => {
  it("wertet maxspeed aus", () => {
    expect(parseMaxspeed("50", R)).toBe(50);
    expect(parseMaxspeed("30 mph", R)).toBeCloseTo(48.28, 1);
    expect(parseMaxspeed("DE:urban", R)).toBe(50);
    expect(parseMaxspeed("walk", R)).toBe(7);
    expect(parseMaxspeed("signals", R)).toBeNull();
    expect(parseMaxspeed(undefined, R)).toBeNull();
  });
  it("erkennt Einbahnstraßen, Kreisverkehre und Ausnahmen für Busse", () => {
    expect(onewayDir({ oneway: "yes" })).toBe(1);
    expect(onewayDir({ oneway: "-1" })).toBe(-1);
    expect(onewayDir({ junction: "roundabout" })).toBe(1);
    expect(onewayDir({ highway: "motorway" })).toBe(1);
    expect(onewayDir({ oneway: "yes", "oneway:bus": "no" })).toBe(0);
    expect(onewayDir({ highway: "residential" })).toBe(0);
  });
  it("nimmt nur Wege, die ein Bus befahren darf", () => {
    expect(isBusWay({ highway: "residential" }, R)).toBe(true);
    expect(isBusWay({ highway: "footway" }, R)).toBe(false);
    expect(isBusWay({ highway: "service" }, R)).toBe(false);
    expect(isBusWay({ highway: "service", bus: "yes" }, R)).toBe(true);
    expect(isBusWay({ highway: "pedestrian", bus: "designated" }, R)).toBe(true);
    expect(isBusWay({ highway: "residential", access: "private" }, R)).toBe(false);
    expect(isBusWay({ highway: "residential", motor_vehicle: "no", bus: "yes" }, R)).toBe(true);
    expect(isBusWay({ highway: "primary", bus: "no" }, R)).toBe(false);
    expect(isBusWay({ highway: "busway" }, R)).toBe(true);
  });
  it("Geschwindigkeit: maxspeed, sonst Standard der Straßenklasse", () => {
    const o = new TestOsm().node(1, 0, 0).node(2, 1, 0).node(3, 2, 0);
    o.way([1, 2], { highway: "primary" });
    o.way([2, 3], { highway: "residential", maxspeed: "20" });
    const net = buildRoadNetwork(o.extract(), R);
    expect(edge(net, 1, 2).speedKmh).toBe(R.defaultSpeedKmh.primary);
    expect(edge(net, 2, 3).speedKmh).toBe(20);
  });
  it("zählt Ampeln je Fahrtrichtung und speichert sie im Netz", () => {
    const o = new TestOsm().node(1, 0, 0).node(2, 1, 0, { highway: "traffic_signals" }).node(3, 2, 0);
    o.way([1, 2, 3], res);
    const net = buildRoadNetwork(o.extract(), R);
    expect(net.signalNodes).toBe(1);
    expect(edge(net, 1, 3).signals).toBe(1);
    expect(edge(net, 3, 1).signals).toBe(1);
  });
});

describe("Routing im Testnetz", () => {
  it("findet den direkten Weg und rechnet die Fahrzeit aus Länge und Geschwindigkeit", () => {
    const { net } = testnetz();
    const r = findRoute(net, [snapAt(net, 1, 2, 0)], [snapAt(net, 2, 4, 1)], R)!;
    expect(knoten(net, r.edges)).toEqual([1, 2, 4]);
    const l = edge(net, 1, 2).lengthM + edge(net, 2, 4).lengthM;
    expect(r.lengthM).toBeCloseTo(l, 3);
    // 10 m/s, Kreuzung B (3 Arme) kostet den Kreuzungszuschlag
    expect(r.timeS).toBeCloseTo(l / 10 + R.kreuzungZuschlagS, 3);
    expect(fahrzeitS(edge(net, 1, 2))).toBeCloseTo(edge(net, 1, 2).lengthM / 10, 6);
  });
  it("Route ist zusammenhängend und nicht kürzer als die Luftlinie", () => {
    const { net } = testnetz();
    const a = snapAt(net, 1, 2, 0), z = snapAt(net, 4, 5, 1);
    const r = findRoute(net, [a], [z], R)!;
    for (let i = 1; i < r.edges.length; i++) expect(net.edges[r.edges[i - 1]].to).toBe(net.edges[r.edges[i]].from);
    expect(r.lengthM).toBeGreaterThanOrEqual(haversine(r.coords[0], r.coords[r.coords.length - 1]));
  });
  it("Abbiegeverbot zwingt zum Umweg", () => {
    const { net } = testnetz((o, w) => o.restriction("no_left_turn", w.W1, 2, w.W3));
    expect(net.restrictions.applied).toBe(1);
    // Ziel ist der Punkt D, erreichbar über B-D oder E-D
    const zielD = [snapAt(net, 2, 4, 1), snapAt(net, 5, 4, 1)];
    const r = findRoute(net, [snapAt(net, 1, 2, 0)], zielD, R)!;
    expect(knoten(net, r.edges)).toEqual([1, 2, 3, 5, 4]);
    const ohne = testnetz().net;
    expect(knoten(ohne, findRoute(ohne, [snapAt(ohne, 1, 2, 0)], [snapAt(ohne, 2, 4, 1), snapAt(ohne, 5, 4, 1)], R)!.edges)).toEqual([1, 2, 4]);
  });
  it("Gebot (only_straight_on) verbietet alle anderen Richtungen", () => {
    const { net, w } = testnetz((o, w) => o.restriction("only_straight_on", w.W1, 2, w.W2));
    const ein = edge(net, 1, 2).id;
    expect(turnAllowed(net, ein, edge(net, 2, 4).id)).toBe(false);
    expect(turnAllowed(net, ein, edge(net, 2, 3).id)).toBe(true);
    expect(w.W2).toBeGreaterThan(0);
  });
  it("Ausnahme für Busse (except=bus) wird beachtet", () => {
    const { net } = testnetz((o, w) => o.restriction("no_left_turn", w.W1, 2, w.W3, { except: "bus" }));
    expect(net.restrictions.applied).toBe(0);
    const r = findRoute(net, [snapAt(net, 1, 2, 0)], [snapAt(net, 2, 4, 1)], R)!;
    expect(knoten(net, r.edges)).toEqual([1, 2, 4]);
  });
  it("Einbahnstraße wird nur in Fahrtrichtung befahren", () => {
    // W3 nur von D nach B befahrbar: von A nach D geht es über C und E
    const o = new TestOsm().node(1, 0, 0).node(2, 1, 0).node(3, 2, 0).node(4, 1, 1).node(5, 2, 1);
    o.way([1, 2], res);
    o.way([2, 3], res);
    o.way([4, 2], { ...res, oneway: "yes" });
    o.way([3, 5], res);
    o.way([4, 5], res);
    const net = buildRoadNetwork(o.extract(), R);
    expect(edge(net, 2, 4)).toBeUndefined();
    const r = findRoute(net, [snapAt(net, 1, 2, 0)], [snapAt(net, 5, 4, 1)], R)!;
    expect(knoten(net, r.edges)).toEqual([1, 2, 3, 5, 4]);
  });
  it("wendet nicht mitten auf der Straße, nur in einer Sackgasse", () => {
    const o = new TestOsm().node(1, 0, 0).node(2, 1, 0).node(3, 2, 0).node(4, 1, 1);
    o.way([1, 2], res);
    o.way([2, 3], res);
    o.way([2, 4], res);
    const net = buildRoadNetwork(o.extract(), R);
    // An der Kreuzung B ist Wenden verboten, an der Sackgasse C erlaubt
    expect(turnAllowed(net, edge(net, 1, 2).id, edge(net, 2, 1).id)).toBe(false);
    expect(turnAllowed(net, edge(net, 2, 3).id, edge(net, 3, 2).id)).toBe(true);
  });
  it("Ampel verlängert die Fahrzeit um den Zuschlag aus der Konfiguration", () => {
    const ohne = testnetz().net;
    const mit = buildRoadNetwork(
      (() => {
        const o = new TestOsm().node(1, 0, 0).node(2, 1, 0, { highway: "traffic_signals" }).node(3, 2, 0).node(4, 1, 1).node(5, 2, 1);
        o.way([1, 2], res); o.way([2, 3], res); o.way([2, 4], res); o.way([3, 5], res); o.way([4, 5], res);
        return o.extract();
      })(),
      R,
    );
    const r0 = findRoute(ohne, [snapAt(ohne, 1, 2, 0)], [snapAt(ohne, 2, 3, 1)], R)!;
    const r1 = findRoute(mit, [snapAt(mit, 1, 2, 0)], [snapAt(mit, 2, 3, 1)], R)!;
    // Ampel ersetzt den Kreuzungszuschlag an B
    expect(r1.timeS - r0.timeS).toBeCloseTo(R.ampelZuschlagS - R.kreuzungZuschlagS, 6);
  });
  it("Start und Ziel auf demselben Abschnitt, auch wenn das Ziel dahinter liegt", () => {
    const { net } = testnetz();
    const vor = findRoute(net, [snapAt(net, 1, 2, 0.2)], [snapAt(net, 1, 2, 0.8)], R)!;
    expect(vor.edges).toHaveLength(1);
    expect(vor.lengthM).toBeCloseTo(edge(net, 1, 2).lengthM * 0.6, 3);
    // Ziel liegt zurück: Busse wenden nicht, also Umweg über die Schleife (B-D-E-C oder B-C-E-D, gleich lang) und zurück nach A
    const zurueck = findRoute(net, [snapAt(net, 1, 2, 0.8)], [snapAt(net, 2, 1, 0.8)], R)!;
    const k = knoten(net, zurueck.edges);
    expect(k).toHaveLength(7);
    expect([k[0], k[1], k[5], k[6]]).toEqual([1, 2, 2, 1]);
    expect(new Set(k.slice(2, 5))).toEqual(new Set([3, 4, 5]));
  });
  it("liefert null, wenn das Ziel unerreichbar ist", () => {
    const o = new TestOsm().node(1, 0, 0).node(2, 1, 0).node(3, 5, 5).node(4, 6, 5);
    o.way([1, 2], res);
    o.way([3, 4], res);
    const net = buildRoadNetwork(o.extract(), R);
    expect(findRoute(net, [snapAt(net, 1, 2, 0)], [snapAt(net, 3, 4, 0.5)], R)).toBeNull();
  });
});

describe("Haltestellen-Zuordnung", () => {
  const o = new TestOsm().node(1, 0, 0).node(2, 3, 0);
  o.way([1, 2], res);
  const net = buildRoadNetwork(o.extract(), R);
  const proj = new LocalProj(10, 53.7);
  const stop = (y: number): Stop => ({ id: 1, name: "", coord: [o.lon(1.5), o.lat(y)], snaps: [] });
  it("Haltestelle rechts der Straße gehört zur Fahrtrichtung mit Rechtsverkehr", () => {
    // Straße läuft von West nach Ost; südlich (y<0) ist rechts für Richtung Ost
    const s = stop(-0.2); // rund 22 m südlich
    snapStops(net, [s], config.stops, proj);
    expect(s.snaps).toHaveLength(1);
    expect(net.edges[s.snaps[0].edge].from).toBe(net.nodeOsm.indexOf(1));
    expect(s.snaps[0].t).toBeCloseTo(0.5, 2);
  });
  it("Haltestelle auf der Straße gilt für beide Richtungen", () => {
    const s = stop(0);
    snapStops(net, [s], config.stops, proj);
    expect(s.snaps).toHaveLength(2);
  });
  it("Haltestelle außerhalb des Fangradius bleibt ohne Zuordnung", () => {
    const s = stop(-5); // rund 550 m südlich
    snapStops(net, [s], config.stops, proj);
    expect(s.snaps).toHaveLength(0);
  });
});
