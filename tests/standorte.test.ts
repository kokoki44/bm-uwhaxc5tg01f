import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { ladeKatalog } from "../src/catalog/katalog";
import { config } from "../src/config";
import { analysiereHof } from "../src/depot/analyse";
import { busMasseAusKatalog, neuerHof, type HofKontext } from "../src/depot/hof";
import { berechneWege } from "../src/depot/wege";
import { haversine, LocalProj, type LonLat } from "../src/world/geo";
import {
  findeLage, hofZuGeo, kaufeStartgrundstueck, naechsteStrasse, verdichte, pruefeStartgrundstueck, rechteckInFlaeche, torAnbindung, type Standort,
} from "../src/world/standorte";
import { buildWorld, type World } from "../src/world/world";
import { BEISPIEL_B, BEISPIEL_T, baueBeispiel } from "./helpers/beispiel-hof";
import { ladeNorderstedt } from "./helpers/norderstedt";

const g = config.grundstueck;
let world: World;
let ctx: HofKontext;

beforeAll(async () => {
  world = buildWorld(await ladeNorderstedt(), config);
  const kat = await ladeKatalog(readFileSync(config.catalog.fileName), config.catalog);
  ctx = { cfg: config.betriebshof, busse: busMasseAusKatalog(kat.modelle) };
}, 120000);

/** Quadrat um einen Punkt (Seitenlänge in m), als Ring. */
function ringUm(mitte: LonLat, punkteXY: [number, number][]): LonLat[] {
  const p = new LocalProj(mitte[0], mitte[1]);
  return [...punkteXY, punkteXY[0]].map((q) => p.toLonLat(q));
}

describe("Standortwahl", () => {
  it("Standorte sind Gewerbe- und Industrieflächen in der Gemeinde mit Preis, verfügbarer Fläche und Anbindung", () => {
    const s = world.standorte;
    expect(s.length).toBeGreaterThan(10);
    for (const x of s) {
      expect(g.landnutzung).toContain(x.landnutzung);
      expect(x.flaecheM2).toBeGreaterThanOrEqual(g.mindestflaecheM2);
      expect(x.preisEurM2).toBeGreaterThanOrEqual(g.bodenpreisMinEurM2);
      expect(x.preisEurM2).toBeLessThanOrEqual(g.bodenpreisMaxEurM2);
      expect(x.anbindungM).toBeGreaterThanOrEqual(0);
      expect(x.anbindungM).toBeLessThanOrEqual(g.anbindungSuchradiusM);
      // der Vorschlag für das Startgrundstück liegt ganz in der Fläche
      expect(pruefeStartgrundstueck(x, x.startLage, g.startBreiteM, g.startTiefeM, g)).toBeNull();
    }
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
  });

  it("zentrale Lagen sind teurer als Randlagen", () => {
    const s = world.standorte;
    // Schwerpunkt von Einwohnern und Arbeitsplätzen als Mitte der Gemeinde
    let sx = 0, sy = 0, sw = 0;
    for (const c of world.demand.cells) {
      const w = c.einwohner + c.arbeitsplaetze;
      sx += c.center[0] * w;
      sy += c.center[1] * w;
      sw += w;
    }
    const mitte: LonLat = [sx / sw, sy / sw];
    const nachAbstand = [...s].sort((a, b) => haversine(a.zentrum, mitte) - haversine(b.zentrum, mitte));
    const n = Math.max(3, Math.floor(s.length / 4));
    const mittel = (l: Standort[]) => l.reduce((x, y) => x + y.preisEurM2, 0) / l.length;
    const zentral = mittel(nachAbstand.slice(0, n)), rand = mittel(nachAbstand.slice(-n));
    expect(zentral).toBeGreaterThan(rand);
    // Spanne wird ausgenutzt: billigster am Rand mit dem Mindestpreis, teuerster mit dem Höchstpreis
    expect(Math.max(...s.map((x) => x.preisEurM2))).toBe(g.bodenpreisMaxEurM2);
    expect(Math.min(...s.map((x) => x.preisEurM2))).toBeLessThan(g.bodenpreisMinEurM2 + 30);
  });

  it("Regression: Anbindung wird entlang der ganzen Grenze gemessen, nicht nur an den Ecken", () => {
    const m: LonLat = [10, 53.7];
    const ring = ringUm(m, [[0, 0], [100, 0], [100, 40], [0, 40]]);
    const punkte = verdichte(ring, g.anbindungStuetzabstandM);
    expect(punkte.length).toBeGreaterThanOrEqual(Math.ceil(280 / g.anbindungStuetzabstandM));
    for (let i = 1; i < punkte.length; i++) expect(haversine(punkte[i - 1], punkte[i])).toBeLessThanOrEqual(g.anbindungStuetzabstandM + 0.01);
    // nie schlechter als die Messung nur an den Ecken
    for (const s of world.standorte) {
      const ecken = naechsteStrasse(world.network, s.ring, g.anbindungSuchradiusM, g.indexZelleM)!;
      expect(s.anbindungM).toBeLessThanOrEqual(Math.round(ecken.distM));
    }
  });

  it("Rechteck in der Fläche: auch bei einer L-förmigen Fläche wird die Aussparung erkannt", () => {
    const m: LonLat = [10, 53.7];
    // L-Form 100 × 100 m, das Viertel oben rechts fehlt
    const l = ringUm(m, [[0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100]]);
    const p = new LocalProj(m[0], m[1]);
    expect(rechteckInFlaeche(l, p.toLonLat([5, 95]), 40, 40)).toBe(true);
    expect(rechteckInFlaeche(l, p.toLonLat([5, 95]), 60, 40)).toBe(false); // ragt in die Aussparung
    expect(rechteckInFlaeche(l, p.toLonLat([5, 45]), 90, 40)).toBe(true);
    const lage = findeLage(l, 90, 40, 5)!;
    expect(rechteckInFlaeche(l, lage, 90, 40)).toBe(true);
    expect(findeLage(l, 120, 40, 5)).toBeNull();
  });

  it("Grundstückskauf bucht den Preis ab; zu klein, zu groß, außerhalb und ohne Geld wird abgelehnt", () => {
    const s = world.standorte[0];
    const kasse = { kontostandEur: 2_000_000 };
    expect(kaufeStartgrundstueck(kasse, s, s.startLage, 40, 40, g)).toEqual({ ok: false, fehler: "zuKlein" });
    expect(kaufeStartgrundstueck(kasse, s, s.startLage, 100, 19, g)).toEqual({ ok: false, fehler: "zuKlein" });
    expect(kaufeStartgrundstueck(kasse, s, s.startLage, 400, 300, g)).toEqual({ ok: false, fehler: "zuGross" });
    const weit = hofZuGeo(s.startLage, 5000, 5000);
    expect(kaufeStartgrundstueck(kasse, s, weit, 50, 40, g)).toEqual({ ok: false, fehler: "nichtInFlaeche" });
    expect(kaufeStartgrundstueck({ kontostandEur: 1000 }, s, s.startLage, 50, 40, g)).toEqual({ ok: false, fehler: "geldFehlt" });
    expect(kasse.kontostandEur).toBe(2_000_000);
    const e = kaufeStartgrundstueck(kasse, s, s.startLage, 50, 40, g);
    expect(e.ok).toBe(true);
    expect(kasse.kontostandEur).toBe(2_000_000 - 2000 * s.preisEurM2);
    if (e.ok) expect(e.grundstueck).toMatchObject({ standortId: s.id, flaeche: { x: 0, y: 0, b: 50, t: 40 }, preisEurM2: s.preisEurM2, kaufpreisEur: 2000 * s.preisEurM2 });
  });
});

describe("Beispiel-Layout: mit 2 Mio. Euro Startkapital bezahlbar", () => {
  for (const lage of ["billigste", "teuerste"] as const) {
    it(`komplettes erstes Layout auf der ${lage}n Lage`, () => {
      const s = lage === "billigste" ? world.standorte[0] : world.standorte[world.standorte.length - 1];
      const kasse = { kontostandEur: config.setup.startkapitalStandard };
      const kauf = kaufeStartgrundstueck(kasse, s, s.startLage, BEISPIEL_B, BEISPIEL_T, g);
      expect(kauf.ok).toBe(true);
      if (!kauf.ok) return;
      const hof = neuerHof(kauf.grundstueck);
      const bau = baueBeispiel(hof, kasse, ctx);
      const a = analysiereHof(hof, ctx);
      expect(a.fehler).toEqual([]);
      expect(a.betriebsbereit).toBe(true);
      expect(a.warnungen).toEqual([]);
      const summe = kauf.grundstueck.kaufpreisEur + bau;
      console.log(`Beispiel-Layout ${lage} Lage (${s.preisEurM2} €/m²): Grundstück ${kauf.grundstueck.kaufpreisEur} €, Bau ${bau} €, Summe ${summe} €, Rest ${kasse.kontostandEur} €`);
      expect(summe).toBeLessThanOrEqual(config.setup.startkapitalStandard);
      expect(kasse.kontostandEur).toBeCloseTo(config.setup.startkapitalStandard - summe, 2);
      // Wege zu allen Stellplätzen, Tor an die nächste Busstraße angebunden
      const w = berechneWege(hof, a, ctx.cfg);
      for (const b of hof.bauteile.filter((x) => x.typ === "stellplatz")) expect(w.je.get(b.id)).toBeDefined();
      const [torId, seite] = [...a.torSeite][0];
      const anb = torAnbindung(hof, torId, seite, world.network, g);
      expect(anb).not.toBeNull();
      expect(anb!.distM).toBeLessThanOrEqual(g.anbindungSuchradiusM);
    });
  }
});
