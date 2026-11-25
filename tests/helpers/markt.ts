import { readFileSync } from "node:fs";
import { civil } from "../../src/calendar/civil";
import { ladeKatalog, type Bus } from "../../src/catalog/katalog";
import { config } from "../../src/config";
import { analysiereHof } from "../../src/depot/analyse";
import { busMasseAusKatalog, neuerHof, type Betriebshof, type HofKontext } from "../../src/depot/hof";
import { neuerFuhrpark, type KaufKontext, type MarktKontext, type MarktOption } from "../../src/fleet/fuhrpark";
import { neuerZufall } from "../../src/game/zufall";
import { baueBeispiel, BEISPIEL_B, BEISPIEL_T } from "./beispiel-hof";

/** Kleine, feste Optionsliste für Tests (unabhängig von der gepflegten Optionsdatei). */
export const TEST_OPTIONEN: MarktOption[] = [
  { id: "kunststoff", gruppe: "bestuhlung", aufpreisEur: 0, nurAntrieb: null, standard: true, serieNeukauf: false, freischaltung: "frei", gebrauchtAnteil: 0.5 },
  { id: "stoff", gruppe: "bestuhlung", aufpreisEur: 6000, nurAntrieb: null, standard: false, serieNeukauf: false, freischaltung: "frei", gebrauchtAnteil: 0.4 },
  { id: "premium", gruppe: "bestuhlung", aufpreisEur: 12000, nurAntrieb: null, standard: false, serieNeukauf: false, freischaltung: "Premium-Sitze", gebrauchtAnteil: 0.1 },
  { id: "heizung_elektrisch", gruppe: "heizung", aufpreisEur: 0, nurAntrieb: "Elektro", standard: true, serieNeukauf: false, freischaltung: "frei", gebrauchtAnteil: 0.7 },
  { id: "waermepumpe", gruppe: "heizung", aufpreisEur: 20000, nurAntrieb: "Elektro", standard: false, serieNeukauf: false, freischaltung: "frei", gebrauchtAnteil: 0.3 },
  { id: "klimaanlage", gruppe: null, aufpreisEur: 25000, nurAntrieb: null, standard: false, serieNeukauf: false, freischaltung: "Klimaanlage", gebrauchtAnteil: 0.5 },
  { id: "video", gruppe: null, aufpreisEur: 6000, nurAntrieb: null, standard: false, serieNeukauf: false, freischaltung: "frei", gebrauchtAnteil: 0.3 },
  { id: "abbiegeassistent", gruppe: null, aufpreisEur: 3000, nurAntrieb: null, standard: false, serieNeukauf: true, freischaltung: "frei", gebrauchtAnteil: 0.5 },
];

export const JETZT = civil(2026, 11, 25, 10, 0);

let modelle: Map<string, Bus> | null = null;
export async function katalogModelle(): Promise<Map<string, Bus>> {
  if (!modelle) {
    const k = await ladeKatalog(readFileSync(config.catalog.fileName), config.catalog);
    modelle = new Map(k.modelle.map((m) => [m.modell_id!, m]));
  }
  return modelle;
}

export function marktKontext(m: Map<string, Bus>, optionen = TEST_OPTIONEN): MarktKontext {
  return {
    modelle: m,
    optionen,
    markt: config.fahrzeugmarkt,
    katalog: config.catalog,
    hofCfg: config.betriebshof,
    freigeschaltet: new Set(),
    frei: config.optionen.frei,
    kreis: "SE",
  };
}

export function hofKontext(m: Map<string, Bus>): HofKontext {
  return { cfg: config.betriebshof, busse: busMasseAusKatalog([...m.values()]) };
}

/** Beispiel-Layout 50 × 40 m mit 6 Stellplätzen (4 × 14 m) und einer Halle (4 × 15 m). */
export function beispielHof(m: Map<string, Bus>): Betriebshof {
  const hof = neuerHof({ standortId: 1, standortName: "Test", ursprung: [10, 53.7], flaeche: { x: 0, y: 0, b: BEISPIEL_B, t: BEISPIEL_T }, preisEurM2: 200, kaufpreisEur: 0 });
  baueBeispiel(hof, { kontostandEur: 1e9 }, hofKontext(m));
  return hof;
}

export function kaufKontext(m: Map<string, Bus>, opt: { kontostandEur?: number; hof?: Betriebshof | null; seed?: number; optionen?: MarktOption[] } = {}): KaufKontext {
  const hof = opt.hof === undefined ? beispielHof(m) : opt.hof;
  return {
    ...marktKontext(m, opt.optionen),
    fuhrpark: neuerFuhrpark(config.fahrzeugmarkt),
    hof,
    analyse: hof ? analysiereHof(hof, hofKontext(m)) : null,
    kasse: { kontostandEur: opt.kontostandEur ?? 10_000_000 },
    zufall: neuerZufall(opt.seed ?? 42),
    jetzt: JETZT,
  };
}
