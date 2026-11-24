import type { RoadsConfig } from "../config";
import type { OsmElement, OsmExtract } from "../data/osm";
import { lineLength, type LonLat } from "./geo";

/** Gerichteter Straßenabschnitt zwischen zwei Knoten des Netzes. */
export interface RoadEdge {
  id: number;
  from: number;
  to: number;
  wayId: number;
  /** Straßenklasse (OSM highway). */
  cls: string;
  name: string;
  lengthM: number;
  speedKmh: number;
  /** Ampeln auf dem Abschnitt, einschließlich einer Ampel am Endknoten (Fahrtrichtung). */
  signals: number;
  /** Endknoten ist eine Kreuzung ohne Ampel. */
  junctionAtEnd: boolean;
  /** Gegenrichtung desselben Abschnitts oder -1 bei Einbahnstraße. */
  twin: number;
  coords: LonLat[];
}

export interface RoadNetwork {
  /** OSM-Knoten-ID je Netzknoten. */
  nodeOsm: number[];
  nodeCoords: LonLat[];
  edges: RoadEdge[];
  outEdges: number[][];
  /** Verbotene Übergänge: Eingangsabschnitt -> Liste verbotener Ausgangsabschnitte. */
  forbidden: Record<number, number[]>;
  signalNodes: number;
  restrictions: { applied: number; skipped: number };
}

/** Wert von maxspeed in km/h oder null, wenn nicht auswertbar. */
export function parseMaxspeed(v: string | undefined, cfg: RoadsConfig): number | null {
  if (!v) return null;
  const s = v.trim();
  if (cfg.maxspeedNamed[s] !== undefined) return cfg.maxspeedNamed[s];
  const m = /^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  return m[2] === "mph" ? n * 1.609344 : n;
}

/** 1 nur in Zeichenrichtung, -1 nur gegen Zeichenrichtung, 0 in beide Richtungen (aus Sicht eines Busses). */
export function onewayDir(t: Record<string, string>): -1 | 0 | 1 {
  if (t["oneway:bus"] === "no" || t["oneway:psv"] === "no") return 0;
  const o = t.oneway;
  if (o === "yes" || o === "true" || o === "1") return 1;
  if (o === "-1" || o === "reverse") return -1;
  if (o === "no" || o === "false" || o === "0") return 0;
  if (t.junction === "roundabout" || t.junction === "circular") return 1;
  if (t.highway === "motorway" || t.highway === "motorway_link") return 1;
  return 0;
}

const ERLAUBT = new Set(["yes", "designated", "permissive"]);
const GESPERRT = new Set(["no", "private"]);

/** Darf ein Linienbus diesen Weg befahren? */
export function isBusWay(t: Record<string, string> | undefined, cfg: RoadsConfig): boolean {
  if (!t?.highway || t.area === "yes") return false;
  const busTag = t.bus ?? t.psv;
  if (busTag === "no") return false;
  if (busTag && ERLAUBT.has(busTag)) return true;
  if (!cfg.busHighways.includes(t.highway)) return false;
  if (GESPERRT.has(t.access ?? "") || GESPERRT.has(t.motor_vehicle ?? "") || GESPERRT.has(t.vehicle ?? "")) return false;
  return true;
}

export function buildRoadNetwork(extract: OsmExtract, cfg: RoadsConfig): RoadNetwork {
  const ways: OsmElement[] = [];
  const signalNodes = new Set<number>();
  const relations: OsmElement[] = [];
  for (const e of extract.elements) {
    if (e.type === "way" && isBusWay(e.tags, cfg) && e.nodes && e.geometry && e.nodes.length === e.geometry.length && e.nodes.length >= 2 && e.geometry.every(Boolean)) ways.push(e);
    else if (e.type === "node" && e.tags?.highway === "traffic_signals") signalNodes.add(e.id);
    else if (e.type === "relation" && e.tags?.type === "restriction") relations.push(e);
  }

  // Knoten, an denen das Netz verzweigt: Wegenden und Knoten auf mehreren Wegen
  const seen = new Map<number, number>();
  for (const w of ways) for (const n of new Set(w.nodes)) seen.set(n, (seen.get(n) ?? 0) + 1);
  const isGraphNode = (w: OsmElement, i: number) => i === 0 || i === w.nodes!.length - 1 || (seen.get(w.nodes![i]) ?? 0) >= 2;

  const nodeIndex = new Map<number, number>();
  const nodeOsm: number[] = [];
  const nodeCoords: LonLat[] = [];
  const idx = (osm: number, c: LonLat) => {
    let i = nodeIndex.get(osm);
    if (i === undefined) {
      i = nodeOsm.length;
      nodeIndex.set(osm, i);
      nodeOsm.push(osm);
      nodeCoords.push(c);
    }
    return i;
  };

  const edges: RoadEdge[] = [];
  for (const w of ways) {
    const t = w.tags!;
    const dir = onewayDir(t);
    const speed = parseMaxspeed(t.maxspeed, cfg) ?? cfg.defaultSpeedKmh[t.highway] ?? cfg.fallbackSpeedKmh;
    const coordsAll: LonLat[] = w.geometry!.map((p) => [p!.lon, p!.lat]);
    let start = 0;
    for (let i = 1; i < w.nodes!.length; i++) {
      if (!isGraphNode(w, i)) continue;
      const coords = coordsAll.slice(start, i + 1);
      const inner = w.nodes!.slice(start + 1, i);
      const innerSignals = inner.filter((n) => signalNodes.has(n)).length;
      const a = idx(w.nodes![start], coords[0]);
      const b = idx(w.nodes![i], coords[coords.length - 1]);
      const len = lineLength(coords);
      const base = { wayId: w.id, cls: t.highway, name: t.name ?? "", lengthM: len, speedKmh: speed, junctionAtEnd: false, twin: -1 };
      let fwd = -1;
      if (dir >= 0) {
        fwd = edges.length;
        edges.push({ ...base, id: fwd, from: a, to: b, coords, signals: innerSignals + (signalNodes.has(w.nodes![i]) ? 1 : 0) });
      }
      if (dir <= 0) {
        const bwd = edges.length;
        edges.push({ ...base, id: bwd, from: b, to: a, coords: [...coords].reverse(), signals: innerSignals + (signalNodes.has(w.nodes![start]) ? 1 : 0), twin: fwd });
        if (fwd >= 0) edges[fwd].twin = bwd;
      }
      start = i;
    }
  }

  const outEdges: number[][] = nodeOsm.map(() => []);
  const degree = new Map<number, Set<number>>();
  for (const e of edges) {
    outEdges[e.from].push(e.id);
    for (const n of [e.from, e.to]) {
      if (!degree.has(n)) degree.set(n, new Set());
      degree.get(n)!.add(e.twin >= 0 ? Math.min(e.id, e.twin) : e.id);
    }
  }
  for (const e of edges) {
    const endIsSignal = signalNodes.has(nodeOsm[e.to]);
    e.junctionAtEnd = !endIsSignal && (degree.get(e.to)?.size ?? 0) >= 3;
  }

  // Abbiegeregeln (nur mit Knoten als "via"; Ausnahmen für Busse werden beachtet)
  const forbiddenSets = new Map<number, Set<number>>();
  const forbid = (a: number, b: number) => {
    if (!forbiddenSets.has(a)) forbiddenSets.set(a, new Set());
    forbiddenSets.get(a)!.add(b);
  };
  let applied = 0, skipped = 0;
  for (const r of relations) {
    const kind = r.tags?.restriction;
    const except = (r.tags?.except ?? "").split(";").map((s) => s.trim());
    const from = r.members?.filter((m) => m.role === "from" && m.type === "way") ?? [];
    const via = r.members?.filter((m) => m.role === "via") ?? [];
    const to = r.members?.filter((m) => m.role === "to" && m.type === "way") ?? [];
    if (!kind || except.includes("bus") || except.includes("psv") || from.length !== 1 || to.length !== 1 || via.length !== 1 || via[0].type !== "node") {
      skipped++;
      continue;
    }
    const v = nodeIndex.get(via[0].ref);
    if (v === undefined) {
      skipped++;
      continue;
    }
    const fromWay = from[0].ref, toWay = to[0].ref;
    const ins = edges.filter((e) => e.to === v && e.wayId === fromWay);
    const outs = outEdges[v].map((i) => edges[i]);
    if (ins.length === 0) {
      skipped++;
      continue;
    }
    for (const ein of ins) {
      for (const aus of outs) {
        if (kind.startsWith("no_")) {
          const trifft = fromWay === toWay ? aus.id === ein.twin : aus.wayId === toWay;
          if (trifft) forbid(ein.id, aus.id);
        } else if (kind.startsWith("only_")) {
          if (aus.wayId !== toWay) forbid(ein.id, aus.id);
        }
      }
    }
    applied++;
  }
  const forbidden: Record<number, number[]> = {};
  for (const [k, v] of forbiddenSets) forbidden[k] = [...v];

  return { nodeOsm, nodeCoords, edges, outEdges, forbidden, signalNodes: signalNodes.size, restrictions: { applied, skipped } };
}
