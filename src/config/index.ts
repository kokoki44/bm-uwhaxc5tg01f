import raw from "./config.json";
import ferienRaw from "./schulferien.json";

type Farben = Record<
  | "hintergrund" | "wasser" | "gruen" | "gebaeude" | "gebaeudeRand" | "strasseRand"
  | "autobahn" | "hauptstrasse" | "nebenstrasse" | "grenze" | "haltestelle",
  string
>;

export interface RoadsConfig {
  busHighways: string[];
  defaultSpeedKmh: Record<string, number>;
  fallbackSpeedKmh: number;
  maxspeedNamed: Record<string, number>;
  ampelZuschlagS: number;
  kreuzungZuschlagS: number;
}

export interface StopsConfig {
  fangradiusM: number;
  gleichAbstandToleranzM: number;
  aufLinieToleranzM: number;
  verkehrsseite: "rechts" | "links";
  dublettenRadiusM: number;
}

export interface DemandConfig {
  zellgroesseM: number;
  mindestflaecheM2: number;
  wohnflaecheProEinwohnerM2: number;
  wohnanteilGeschossflaeche: number;
  nebengebaeude: string[];
  nebenAmenity: string[];
  wohngebaeude: string[];
  geschosseStandard: Record<string, number>;
  flaecheProArbeitsplatzM2: Record<string, number>;
  landnutzungWohnen: string[];
  landnutzungArbeit: Record<string, string>;
  unbekanntWohnanteil: number;
  poiKategorien: Record<string, Record<string, string[]>>;
}

export interface Config {
  sim: { tickRealMs: number; maxCatchUpTicks: number; speeds: number[]; startSpeed: number };
  map: {
    center: [number, number];
    zoom: number;
    minZoom: number;
    maxZoom: number;
    zoomGebaeude: number;
    zoomNebenstrassen: number;
    zoomServicewege: number;
    zoomHaltestellen: number;
    backgroundColor: string;
    farben: Farben;
  };
  roads: RoadsConfig;
  stops: StopsConfig;
  demand: DemandConfig;
  world: { teilungAbEinwohnern: number };
  setup: {
    startkapitalStandard: number;
    startkapitalMin: number;
    startkapitalMax: number;
    firmennameMaxLaenge: number;
    firmenfarbeStandard: string;
  };
  storage: { saveVersion: number; databaseName: string; indexedDbStore: string };
  data: { norderstedtPath: string };
  catalog: { fileName: string; sheetName: string; columnCount: number };
}

export interface FerienEintrag {
  name: string;
  von: string;
  bis: string;
}
export interface SchulferienConfig {
  quellen: Record<string, { url: string; stand: string; titel: string }>;
  ferien: Record<string, FerienEintrag[]>;
}

/** Prüft die Konfiguration beim Laden, damit fehlende Werte sofort auffallen. */
export function validateConfig(c: unknown): Config {
  const cfg = c as Config;
  const bad = (msg: string): never => {
    throw new Error(`Konfiguration ungültig: ${msg}`);
  };
  if (!cfg?.sim || !(cfg.sim.tickRealMs > 0)) bad("sim.tickRealMs");
  if (!Array.isArray(cfg.sim.speeds) || !cfg.sim.speeds.includes(cfg.sim.startSpeed)) bad("sim.speeds/startSpeed");
  if (cfg.sim.speeds.length !== 5 || cfg.sim.speeds[0] !== 0) bad("sim.speeds: Pause und vier Stufen (Tasten 1 bis 4)");
  if (!(cfg.sim.maxCatchUpTicks >= 1)) bad("sim.maxCatchUpTicks");
  if (!cfg.map || cfg.map.center?.length !== 2 || !cfg.map.farben) bad("map");
  if (!cfg.roads || !(cfg.roads.fallbackSpeedKmh > 0) || !(cfg.roads.ampelZuschlagS >= 0)) bad("roads");
  for (const [k, v] of Object.entries(cfg.roads.defaultSpeedKmh)) if (!(v > 0)) bad(`roads.defaultSpeedKmh.${k}`);
  if (!cfg.stops || !(cfg.stops.fangradiusM > 0)) bad("stops.fangradiusM");
  if (!cfg.demand || !(cfg.demand.zellgroesseM > 0) || !(cfg.demand.wohnflaecheProEinwohnerM2 > 0)) bad("demand");
  if (!(cfg.world?.teilungAbEinwohnern > 0)) bad("world.teilungAbEinwohnern");
  if (!cfg.setup || !(cfg.setup.startkapitalMin > 0)) bad("setup");
  if (!(cfg.storage?.saveVersion >= 1)) bad("storage.saveVersion");
  if (!cfg.storage.databaseName || !cfg.storage.indexedDbStore) bad("storage.*");
  if (!cfg.data?.norderstedtPath) bad("data.norderstedtPath");
  if (!cfg.catalog?.fileName || cfg.catalog.columnCount !== 63) bad("catalog");
  return cfg;
}

/** Prüft die Schulferientabellen: gültige Daten, Beginn nicht nach Ende, Quelle je Region. */
export function validateSchulferien(c: unknown): SchulferienConfig {
  const f = c as SchulferienConfig;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  for (const [region, liste] of Object.entries(f.ferien ?? {})) {
    if (!f.quellen?.[region]) throw new Error(`Schulferien ${region}: Quelle fehlt`);
    for (const e of liste) {
      if (!iso.test(e.von) || !iso.test(e.bis) || e.von > e.bis) throw new Error(`Schulferien ${region}: ${e.name} ${e.von}`);
    }
  }
  return f;
}

export const config: Config = validateConfig(raw);
export const schulferien: SchulferienConfig = validateSchulferien(ferienRaw);
