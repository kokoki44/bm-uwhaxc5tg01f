import raw from "./config.json";
import ferienRaw from "./schulferien.json";

type Farben = Record<
  | "hintergrund" | "wasser" | "gruen" | "gebaeude" | "gebaeudeRand" | "strasseRand"
  | "autobahn" | "hauptstrasse" | "nebenstrasse" | "grenze" | "haltestelle" | "standort",
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
  grundstueck: GrundstueckConfig;
  betriebshof: BetriebshofConfig;
  catalog: CatalogConfig;
}

export interface GrundstueckConfig {
  /** OSM-Landnutzung, aus der Standorte für Betriebshöfe entstehen. */
  landnutzung: string[];
  bodenpreisMinEurM2: number;
  bodenpreisMaxEurM2: number;
  /** Umkreis, in dem Einwohner und Arbeitsplätze die Lage (und damit den Preis) bestimmen. */
  dichteRadiusM: number;
  mindestflaecheM2: number;
  mindestSeiteM: number;
  hoechstflaecheM2: number;
  anbindungSuchradiusM: number;
  /** Abstand der Messpunkte entlang der Grenze einer Fläche für die Anbindung. */
  anbindungStuetzabstandM: number;
  /** Zellgröße des räumlichen Index der Straßenabschnitte. */
  indexZelleM: number;
  lageSuchschrittM: number;
  startBreiteM: number;
  startTiefeM: number;
}

export interface BauteilConfig {
  /** Mindestmaß der kurzen und der langen Seite in m (Rechteck darf gedreht sein). */
  minA: number;
  minB: number;
  /** Mindestmaß folgt aus dem kleinsten Bus im Katalog plus Rangierraum und Seitenabstand. */
  nachBus?: boolean;
  /** Feldgröße für Arbeitsplätze oder Zapfsäulen. */
  feldA?: number;
  feldB?: number;
  kostenEurM2: number;
  farbe: string;
}

export interface BetriebshofConfig {
  raster: number[];
  rasterStandard: number;
  zukaufStandardM: number;
  /** Darstellung im Editor: Rand um das Grundstück, Höchstzahl Rasterlinien, Farben. */
  zeichnung: {
    randAnteil: number;
    randMinM: number;
    maxRasterLinien: number;
    farben: Record<"grund" | "grundRand" | "raster" | "bauteilRand" | "text" | "torRand" | "nichtVerbunden" | "auswahl" | "weg", string>;
  };
  seitenabstandM: number;
  rangierraumM: number;
  zufahrtMinM: number;
  gegenverkehrAbM: number;
  gebaeudeKontaktMinM: number;
  hofGeschwindigkeitKmh: number;
  waschDurchsatzProStunde: number;
  betankungMin: number;
  abrissErstattung: number;
  ladeleistungKw: { min: number; max: number; standard: number };
  lagereinheitenProM2: number;
  pausenraumGrundM2: number;
  pausenraumM2ProPerson: number;
  kuecheM2ProPlatz: number;
  toiletteM2ProKabine: number;
  /** ASR A4.1: [bis Beschäftigte, nötige Toiletten], aufsteigend. */
  toilettenNachBeschaeftigten: [number, number][];
  /** ASR A4.1: über der Tabelle eine Toilette mehr je so viele weitere Beschäftigte. */
  toilettenBeschaeftigteJeWeitere: number;
  bauteile: Record<string, BauteilConfig>;
}

export interface CatalogConfig {
  fileName: string;
  sheetName: string;
  columnCount: number;
  /** Blatt mit den Regeln je Spalte (Pflicht, erlaubte Werte, Verhalten wenn leer). */
  spaltenBlatt: string;
  /** Blatt mit den Ersatzwerten je Klasse (Bauart und Antrieb). */
  standardwerteBlatt: string;
  /** Zeile mit den Spaltennamen im Blatt Standardwerte. */
  standardwerteKopfZeile: number;
  /** Ohne diese Felder ist eine Zeile nicht nutzbar (Identität, Länge und Breite). */
  pflichtFuerNutzung: string[];
  /** Erlaubte relative Abweichung zwischen gerechneter Formel und Wert in der Datei. */
  formelToleranz: number;
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
  if (cfg.sim.speeds.length !== 6 || cfg.sim.speeds[0] !== 0) bad("sim.speeds: Pause und fünf Stufen (Tasten 1 bis 5)");
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
  const g = cfg.grundstueck;
  if (!g || !(g.bodenpreisMinEurM2 > 0) || !(g.bodenpreisMaxEurM2 >= g.bodenpreisMinEurM2)) bad("grundstueck.bodenpreis");
  if (!(g.mindestflaecheM2 > 0) || !(g.hoechstflaecheM2 >= g.mindestflaecheM2) || !(g.mindestSeiteM > 0)) bad("grundstueck.flaechen");
  const b = cfg.betriebshof;
  if (!b || !b.raster?.length || b.raster.some((r) => !(r >= 1) || !Number.isInteger(r)) || !b.raster.includes(b.rasterStandard)) bad("betriebshof.raster (ganze Meter, kleinste Stufe 1 m)");
  if (Math.min(...b.raster) !== 1) bad("betriebshof.raster: kleinste Rastergröße 1 m");
  if (!(b.hofGeschwindigkeitKmh > 0) || !(b.abrissErstattung >= 0 && b.abrissErstattung <= 1)) bad("betriebshof");
  for (const typ of ["tor", "fahrweg", "stellplatz", "halle", "werkstatt", "waschanlage", "lager", "buero", "tankstelle", "ladeplatz", "toilette", "kueche", "pausenraum"]) {
    const bt = b.bauteile?.[typ];
    if (!bt || !(bt.kostenEurM2 >= 0) || !/^#[0-9a-f]{6}$/i.test(bt.farbe) || (!bt.nachBus && !(bt.minA > 0 && bt.minB >= bt.minA))) bad(`betriebshof.bauteile.${typ}`);
  }
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
