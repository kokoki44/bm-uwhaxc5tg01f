import raw from "./config.json";

export interface Config {
  sim: { tickRealMs: number; maxCatchUpTicks: number; speeds: number[]; startSpeed: number };
  map: { center: [number, number]; zoom: number; backgroundColor: string };
  storage: { saveVersion: number; databaseName: string; indexedDbStore: string };
  data: { norderstedtPath: string };
  catalog: { fileName: string; sheetName: string; columnCount: number };
}

/** Prüft die Konfiguration beim Laden, damit fehlende Werte sofort auffallen. */
export function validateConfig(c: unknown): Config {
  const cfg = c as Config;
  const bad = (msg: string): never => {
    throw new Error(`Konfiguration ungültig: ${msg}`);
  };
  if (!cfg?.sim || !(cfg.sim.tickRealMs > 0)) bad("sim.tickRealMs");
  if (!Array.isArray(cfg.sim.speeds) || !cfg.sim.speeds.includes(cfg.sim.startSpeed)) bad("sim.speeds/startSpeed");
  if (!(cfg.sim.maxCatchUpTicks >= 1)) bad("sim.maxCatchUpTicks");
  if (!cfg.map || cfg.map.center?.length !== 2) bad("map.center");
  if (!(cfg.storage?.saveVersion >= 1)) bad("storage.saveVersion");
  if (!cfg.storage.databaseName || !cfg.storage.indexedDbStore) bad("storage.*");
  if (!cfg.data?.norderstedtPath) bad("data.norderstedtPath");
  if (!cfg.catalog?.fileName || cfg.catalog.columnCount !== 63) bad("catalog");
  return cfg;
}

export const config: Config = validateConfig(raw);
