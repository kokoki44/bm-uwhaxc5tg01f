import { describe, expect, it } from "vitest";
import { config } from "../src/config";
import { analysiereHof, beschaeftigteFuerToiletten, fuhrparkGrenze, hallenPlaetze } from "../src/depot/analyse";
import {
  abreissen, bauen, baukostenEur, ladeHof, mindestmass, neuerHof, passtBus, serialisiereHof, setzeLadeleistung, zukaufen, zukaufHoechstM,
  type BauteilTyp, type Betriebshof, type BusMass, type HofKontext, type Kasse,
} from "../src/depot/hof";
import type { Rechteck } from "../src/depot/rechteck";
import { berechneWege } from "../src/depot/wege";

const cfg = config.betriebshof;
const MINI: BusMass = { laengeM: 5.998, breiteM: 1.993, bauart: "Mini" };
const SOLO: BusMass = { laengeM: 12.0, breiteM: 2.55, bauart: "Solo" };
const GELENK: BusMass = { laengeM: 18.1, breiteM: 2.55, bauart: "Gelenk" };
const ctx: HofKontext = { cfg, busse: [MINI, SOLO, GELENK] };

function hof(b = 60, t = 50): Betriebshof {
  return neuerHof({ standortId: 1, standortName: "Test", ursprung: [10, 53.7], flaeche: { x: 0, y: 0, b, t }, preisEurM2: 200, kaufpreisEur: b * t * 200 });
}
const kasse = (eur = 10_000_000): Kasse => ({ kontostandEur: eur });
function baue(h: Betriebshof, k: Kasse, typ: BauteilTyp, r: Rechteck) {
  const e = bauen(h, k, typ, r, ctx);
  if (!e.ok) throw new Error(`${typ} ${JSON.stringify(r)}: ${e.fehler}`);
  return e.bauteil;
}

/**
 * Grundlayout 60 × 50 m: Tor am Westrand (y 20 bis 27), Fahrweg 7 m breit quer über das Grundstück,
 * nördlich Stellplätze 4 × 14 m mit der Stirnseite am Fahrweg, südlich Werkstatt und Büro.
 */
function grundlayout() {
  const h = hof();
  const k = kasse();
  const tor = baue(h, k, "tor", { x: 0, y: 20, b: 4, t: 7 });
  const weg = baue(h, k, "fahrweg", { x: 4, y: 20, b: 56, t: 7 });
  const p1 = baue(h, k, "stellplatz", { x: 4, y: 6, b: 4, t: 14 });
  const p2 = baue(h, k, "stellplatz", { x: 8, y: 6, b: 4, t: 14 });
  const werkstatt = baue(h, k, "werkstatt", { x: 4, y: 27, b: 10, t: 15 });
  const buero = baue(h, k, "buero", { x: 14, y: 27, b: 4, t: 4 });
  return { h, k, tor, weg, p1, p2, werkstatt, buero };
}

describe("Betriebshof: Bauen, Kosten, Grundstück", () => {
  it("alle Bauteile der Tabelle sind sofort baubar, Mindestmaße aus der Konfiguration", () => {
    const typen: BauteilTyp[] = ["tor", "fahrweg", "stellplatz", "halle", "werkstatt", "waschanlage", "lager", "buero", "tankstelle", "ladeplatz", "toilette", "kueche", "pausenraum"];
    const h = hof(400, 200);
    const k = kasse();
    let x = 0;
    for (const typ of typen) {
      const m = mindestmass(typ, ctx);
      const r = { x, y: 0, b: Math.ceil(m.kurz), t: Math.ceil(m.lang) };
      expect(bauen(h, k, typ, r, ctx).ok, typ).toBe(true);
      // eins zu klein geht nicht
      expect(bauen(h, k, typ, { x, y: 100, b: Math.ceil(m.kurz) - 1, t: Math.ceil(m.lang) }, ctx)).toEqual({ ok: false, fehler: "zuKlein" });
      x += 25;
    }
    expect(h.bauteile).toHaveLength(13);
    // gedreht ist erlaubt (Werkstatt 15 × 5)
    expect(bauen(h, k, "werkstatt", { x: 0, y: 150, b: 15, t: 5 }, ctx).ok).toBe(true);
  });

  it("Stell- und Ladeplatz: Mindestmaß ist der kleinste Bus im Katalog plus Rangierraum und Seitenabstand", () => {
    expect(mindestmass("stellplatz", ctx)).toEqual({ kurz: MINI.breiteM + 0.9, lang: MINI.laengeM + 1.5 });
    expect(mindestmass("ladeplatz", ctx)).toEqual(mindestmass("stellplatz", ctx));
  });

  it("passt Bus X auf Stellplatz Y: Gelenkbus braucht einen größeren Stellplatz als ein Solobus", () => {
    const solo = { b: 4, t: 14 };
    const gelenk = { b: 4, t: 20 };
    expect(passtBus(SOLO, solo, cfg)).toBe(true);
    expect(passtBus(GELENK, solo, cfg)).toBe(false);
    expect(passtBus(GELENK, gelenk, cfg)).toBe(true);
    expect(passtBus(SOLO, { b: 3, t: 14 }, cfg)).toBe(false); // 2,55 + 0,9 > 3
    expect(passtBus(SOLO, { b: 14, t: 4 }, cfg)).toBe(true); // gedreht
  });

  it("keine Überlappung, nur innerhalb des Grundstücks, ganze Meter", () => {
    const { h, k } = grundlayout();
    expect(bauen(h, k, "lager", { x: 6, y: 22, b: 4, t: 4 }, ctx)).toEqual({ ok: false, fehler: "ueberlappung" });
    expect(bauen(h, k, "lager", { x: 58, y: 0, b: 4, t: 4 }, ctx)).toEqual({ ok: false, fehler: "ausserhalb" });
    expect(bauen(h, k, "lager", { x: -1, y: 0, b: 4, t: 4 }, ctx)).toEqual({ ok: false, fehler: "ausserhalb" });
    expect(bauen(h, k, "lager", { x: 0.5, y: 0, b: 4, t: 4 }, ctx)).toEqual({ ok: false, fehler: "ungueltigeMasse" });
    // berührende Kanten sind erlaubt
    expect(bauen(h, k, "lager", { x: 18, y: 27, b: 4, t: 4 }, ctx).ok).toBe(true);
  });

  it("Bauen kostet Fläche mal Preis je m² des Bauteils und bucht sofort ab, Abriss erstattet die Hälfte", () => {
    const h = hof();
    const k = kasse(1_000_000);
    const e = bauen(h, k, "werkstatt", { x: 0, y: 0, b: 10, t: 15 }, ctx);
    expect(e.ok && e.kostenEur).toBe(150 * cfg.bauteile.werkstatt.kostenEurM2);
    expect(k.kontostandEur).toBe(1_000_000 - 150 * cfg.bauteile.werkstatt.kostenEurM2);
    const vorher = k.kontostandEur;
    expect(abreissen(h, k, e.ok ? e.bauteil.id : -1, cfg)).toBe(150 * cfg.bauteile.werkstatt.kostenEurM2 * 0.5);
    expect(k.kontostandEur).toBe(vorher + 150 * cfg.bauteile.werkstatt.kostenEurM2 * 0.5);
    expect(h.bauteile).toHaveLength(0);
  });

  it("Bauen nur bei ausreichendem Kontostand, das Konto geht durch Käufe nicht ins Minus", () => {
    const h = hof();
    const preis = baukostenEur("werkstatt", { b: 5, t: 15 }, cfg);
    const k = kasse(preis - 0.01);
    expect(bauen(h, k, "werkstatt", { x: 0, y: 0, b: 5, t: 15 }, ctx)).toEqual({ ok: false, fehler: "geldFehlt" });
    expect(k.kontostandEur).toBe(preis - 0.01);
    expect(h.bauteile).toHaveLength(0);
    const k2 = kasse(preis);
    expect(bauen(h, k2, "werkstatt", { x: 0, y: 0, b: 5, t: 15 }, ctx).ok).toBe(true);
    expect(k2.kontostandEur).toBe(0);
    const minus = kasse(-100);
    expect(bauen(h, minus, "lager", { x: 20, y: 0, b: 4, t: 4 }, ctx)).toEqual({ ok: false, fehler: "geldFehlt" });
  });

  it("Zukauf verlängert eine Seite zum Preis der Lage, höchstens bis 10 Hektar", () => {
    const h = hof(100, 100); // 1 ha
    const k = kasse(100_000_000);
    expect(zukaufen(h, k, "n", 50, config.grundstueck)).toEqual({ ok: true, kostenEur: 100 * 50 * 200 });
    expect(h.grundstueck.flaeche).toEqual({ x: 0, y: -50, b: 100, t: 150 });
    expect(zukaufen(h, k, "w", 10, config.grundstueck).ok).toBe(true);
    expect(h.grundstueck.flaeche).toEqual({ x: -10, y: -50, b: 110, t: 150 });
    expect(h.grundstueck.kaufpreisEur).toBe(100 * 100 * 200 + 100 * 50 * 200 + 150 * 10 * 200);
    // 110 × 150 = 16.500 m², bis 100.000 m² fehlen 83.500 m², also höchstens 556 m nach Süden
    expect(zukaufHoechstM(h, "s", config.grundstueck)).toBe(Math.floor(83_500 / 110));
    expect(zukaufen(h, k, "s", 760, config.grundstueck)).toEqual({ ok: false, fehler: "zuGross" });
    expect(zukaufen(h, k, "s", 756, config.grundstueck).ok).toBe(true);
    expect(h.grundstueck.flaeche.b * h.grundstueck.flaeche.t).toBeLessThanOrEqual(100_000);
    expect(zukaufen(h, k, "o", 1, config.grundstueck)).toEqual({ ok: false, fehler: "zuGross" });
    const arm = kasse(10);
    expect(zukaufen(hof(), arm, "o", 1, config.grundstueck)).toEqual({ ok: false, fehler: "geldFehlt" });
    expect(zukaufen(hof(), kasse(), "o", 0, config.grundstueck)).toEqual({ ok: false, fehler: "ungueltig" });
  });

  it("Ladeleistung ist einstellbar im Rahmen der Konfiguration", () => {
    const h = hof();
    const l = baue(h, kasse(), "ladeplatz", { x: 0, y: 0, b: 4, t: 14 });
    expect(l.ladeleistungKw).toBe(cfg.ladeleistungKw.standard);
    expect(setzeLadeleistung(h, l.id, 300, cfg)).toBe(true);
    expect(l.ladeleistungKw).toBe(300);
    expect(setzeLadeleistung(h, l.id, cfg.ladeleistungKw.max + 1, cfg)).toBe(false);
  });
});

describe("Betriebshof: Layout-Gültigkeit", () => {
  it("Layout ohne Zufahrt (ohne Tor) ist ungültig", () => {
    const h = hof();
    const k = kasse();
    baue(h, k, "fahrweg", { x: 4, y: 20, b: 56, t: 7 });
    baue(h, k, "stellplatz", { x: 4, y: 6, b: 4, t: 14 });
    const a = analysiereHof(h, ctx);
    expect(a.gueltig).toBe(false);
    expect(a.fehler.map((f) => f.code)).toContain("keinTor");
    expect(analysiereHof(hof(), ctx).gueltig).toBe(false);
  });

  it("Grundlayout ist gültig und betriebsbereit, ein Bus erreicht jeden Stellplatz", () => {
    const { h, p1, p2 } = grundlayout();
    const a = analysiereHof(h, ctx);
    expect(a.fehler).toEqual([]);
    expect(a.gueltig).toBe(true);
    expect(a.betriebsbereit).toBe(true);
    expect(a.verbunden.has(p1.id) && a.verbunden.has(p2.id)).toBe(true);
    const w = berechneWege(h, a, cfg);
    for (const p of h.bauteile.filter((b) => b.typ === "stellplatz")) expect(w.je.get(p.id), `Weg zu ${p.id}`).toBeDefined();
  });

  it("Tor muss am Grundstücksrand liegen", () => {
    const h = hof();
    baue(h, kasse(), "tor", { x: 10, y: 20, b: 4, t: 7 });
    const a = analysiereHof(h, ctx);
    expect(a.fehler).toContainEqual({ code: "torNichtAmRand", bauteil: h.bauteile[0].id });
  });

  it("Stellplatz mit der Längsseite am Fahrweg ist nicht erreichbar (Zufahrt nur über die Stirnseite)", () => {
    const { h, k } = grundlayout();
    const quer = baue(h, k, "stellplatz", { x: 30, y: 16, b: 14, t: 4 });
    const a = analysiereHof(h, ctx);
    expect(a.gueltig).toBe(false);
    expect(a.fehler).toEqual([{ code: "stellplatzNichtErreichbar", bauteil: quer.id }]);
  });

  it("Stellplatz, dessen Stirnseite nur teilweise am Fahrweg liegt, ist nicht erreichbar", () => {
    const h = hof();
    const k = kasse();
    baue(h, k, "tor", { x: 0, y: 20, b: 4, t: 7 });
    baue(h, k, "fahrweg", { x: 4, y: 20, b: 20, t: 7 });
    const p = baue(h, k, "stellplatz", { x: 22, y: 6, b: 4, t: 14 }); // 2 von 4 m am Fahrweg
    expect(analysiereHof(h, ctx).fehler).toEqual([{ code: "stellplatzNichtErreichbar", bauteil: p.id }]);
  });

  it("nicht verbundene Bauteile machen das Layout ungültig (fehlende Zufahrt)", () => {
    const { h, k } = grundlayout();
    const insel = baue(h, k, "fahrweg", { x: 40, y: 0, b: 10, t: 7 });
    const lager = baue(h, k, "lager", { x: 50, y: 40, b: 4, t: 4 });
    const a = analysiereHof(h, ctx);
    expect(a.gueltig).toBe(false);
    expect(a.fehler).toContainEqual({ code: "nichtVerbunden", bauteil: insel.id });
    expect(a.fehler).toContainEqual({ code: "nichtVerbunden", bauteil: lager.id });
  });

  it("Fahrwege mit zu schmaler Verbindung (unter 3,5 m) gelten als nicht verbunden", () => {
    const h = hof();
    const k = kasse();
    baue(h, k, "tor", { x: 0, y: 20, b: 4, t: 7 });
    baue(h, k, "fahrweg", { x: 4, y: 20, b: 20, t: 7 });
    const schmal = baue(h, k, "fahrweg", { x: 24, y: 24, b: 10, t: 7 }); // nur 3 m gemeinsame Kante
    expect(analysiereHof(h, ctx).fehler).toContainEqual({ code: "nichtVerbunden", bauteil: schmal.id });
  });

  it("Räume dürfen an ein verbundenes Gebäude grenzen (Büro an der Werkstatt)", () => {
    const { h, k, buero } = grundlayout();
    abreissen(h, k, buero.id, cfg);
    const neu = baue(h, k, "buero", { x: 4, y: 42, b: 4, t: 4 }); // grenzt nur an die Werkstatt
    const a = analysiereHof(h, ctx);
    expect(a.verbunden.has(neu.id)).toBe(true);
    expect(a.betriebsbereit).toBe(true);
  });

  it("warnt bei Sackgassen", () => {
    const { h, k } = grundlayout();
    const stich = baue(h, k, "fahrweg", { x: 50, y: 27, b: 7, t: 15 });
    const a = analysiereHof(h, ctx);
    expect(a.warnungen).toContainEqual({ code: "sackgasse", bauteil: stich.id });
    expect(a.gueltig).toBe(true);
    // liegt dort ein Stellplatz, ist es keine Sackgasse mehr
    baue(h, k, "stellplatz", { x: 46, y: 28, b: 4, t: 14 });
    expect(analysiereHof(h, ctx).warnungen.filter((w) => w.bauteil === stich.id)).toEqual([]);
  });

  it("für den Betrieb nötig sind Tor, Stellplatz, Werkstatt und Büro", () => {
    const h = hof();
    const k = kasse();
    baue(h, k, "tor", { x: 0, y: 20, b: 4, t: 7 });
    baue(h, k, "fahrweg", { x: 4, y: 20, b: 56, t: 7 });
    let a = analysiereHof(h, ctx);
    expect(a.gueltig).toBe(true);
    expect(a.betriebsbereit).toBe(false);
    expect(a.fehltFuerBetrieb).toEqual(["stellplatz", "werkstatt", "buero"]);
    baue(h, k, "stellplatz", { x: 4, y: 6, b: 4, t: 14 });
    baue(h, k, "werkstatt", { x: 4, y: 27, b: 10, t: 15 });
    a = analysiereHof(h, ctx);
    expect(a.fehltFuerBetrieb).toEqual(["buero"]);
  });
});

describe("Betriebshof: Kapazitäten", () => {
  it("Werkstatt: Arbeitsplätze = volle Felder 5 × 15 m", () => {
    const h = hof(100, 100);
    const k = kasse();
    const w1 = baue(h, k, "werkstatt", { x: 0, y: 0, b: 10, t: 15 });
    const w2 = baue(h, k, "werkstatt", { x: 20, y: 0, b: 14, t: 29 });
    const w3 = baue(h, k, "werkstatt", { x: 40, y: 0, b: 30, t: 10 });
    const a = analysiereHof(h, ctx);
    expect(a.kapazitaet.get(w1.id)).toEqual({ art: "werkstatt", arbeitsplaetze: 2 });
    expect(a.kapazitaet.get(w2.id)).toEqual({ art: "werkstatt", arbeitsplaetze: 2 });
    expect(a.kapazitaet.get(w3.id)).toEqual({ art: "werkstatt", arbeitsplaetze: 4 });
  });

  it("Halle: Plätze nebeneinander, jeder von der Stirnseite erreichbar, nach Fahrzeuglänge", () => {
    const zugang = [{ seite: "s" as const, von: 0, bis: 8 }];
    const halle = { x: 0, y: 0, b: 8, t: 20 };
    expect(hallenPlaetze(halle, zugang, SOLO, cfg)).toBe(2); // 8 / 3,45
    expect(hallenPlaetze(halle, zugang, GELENK, cfg)).toBe(2); // 18,1 + 1,5 = 19,6 <= 20
    expect(hallenPlaetze({ ...halle, t: 19 }, zugang, GELENK, cfg)).toBe(0);
    expect(hallenPlaetze(halle, [{ seite: "o", von: 0, bis: 20 }], SOLO, cfg)).toBe(0); // Tiefe nur 8 m
    // keine Blockabstellung: Zufahrt von beiden Stirnseiten zählt nicht doppelt
    expect(hallenPlaetze({ x: 0, y: 0, b: 8, t: 40 }, [...zugang, { seite: "n", von: 0, bis: 8 }], SOLO, cfg)).toBe(2);
  });

  it("Halle im Layout: Plätze je Bauart, zählen zu den Abstellplätzen", () => {
    const { h, k } = grundlayout();
    const halle = baue(h, k, "halle", { x: 20, y: 0, b: 8, t: 20 });
    const a = analysiereHof(h, ctx);
    expect(a.kapazitaet.get(halle.id)).toEqual({ art: "halle", plaetze: 2, jeBauart: { Mini: 2, Solo: 2, Gelenk: 2 } });
    expect(a.summe.stellplaetze).toBe(2);
    expect(a.summe.hallenplaetze).toBe(2);
    expect(a.summe.abstellplaetze).toBe(4);
  });

  it("Zahl der Stellplätze begrenzt den Fuhrpark, je nach Busgröße", () => {
    const { h, k } = grundlayout();
    baue(h, k, "stellplatz", { x: 12, y: 0, b: 4, t: 20 });
    const a = analysiereHof(h, ctx);
    expect(fuhrparkGrenze(h, a, SOLO, cfg)).toBe(3);
    expect(fuhrparkGrenze(h, a, GELENK, cfg)).toBe(1);
  });

  it("Tankstelle, Ladeplatz, Waschanlage, Lager und Sozialräume", () => {
    const h = hof(100, 100);
    const k = kasse();
    const t = baue(h, k, "tankstelle", { x: 0, y: 0, b: 8, t: 8 });
    const l = baue(h, k, "ladeplatz", { x: 10, y: 0, b: 4, t: 21 });
    const w = baue(h, k, "waschanlage", { x: 20, y: 0, b: 5, t: 18 });
    const la = baue(h, k, "lager", { x: 30, y: 0, b: 5, t: 6 });
    const wc = baue(h, k, "toilette", { x: 40, y: 0, b: 4, t: 4 });
    const ku = baue(h, k, "kueche", { x: 50, y: 0, b: 3, t: 3 });
    const pa = baue(h, k, "pausenraum", { x: 60, y: 0, b: 4, t: 4 });
    const f = baue(h, k, "fahrweg", { x: 0, y: 30, b: 7, t: 20 });
    const a = analysiereHof(h, ctx);
    expect(a.kapazitaet.get(t.id)).toEqual({ art: "tankstelle", zapfsaeulen: 2 });
    expect(a.kapazitaet.get(l.id)).toMatchObject({ art: "ladeplatz", ladepunkte: 1, ladeleistungKw: cfg.ladeleistungKw.standard });
    expect(a.kapazitaet.get(w.id)).toEqual({ art: "waschanlage", busseJeStunde: 10 });
    expect(a.kapazitaet.get(la.id)).toEqual({ art: "lager", lagereinheiten: 30 });
    expect(a.kapazitaet.get(wc.id)).toEqual({ art: "toilette", toiletten: 4, beschaeftigte: 50 });
    expect(a.kapazitaet.get(ku.id)).toEqual({ art: "kueche", plaetze: 6 });
    expect(a.kapazitaet.get(pa.id)).toEqual({ art: "pausenraum", plaetze: 10 });
    expect(a.kapazitaet.get(f.id)).toEqual({ art: "fahrweg", gegenverkehr: true });
  });

  it("Toiletten nach ASR A4.1 (niedrige Gleichzeitigkeit)", () => {
    expect(beschaeftigteFuerToiletten(0, cfg)).toBe(0);
    expect(beschaeftigteFuerToiletten(1, cfg)).toBe(10);
    expect(beschaeftigteFuerToiletten(2, cfg)).toBe(25);
    expect(beschaeftigteFuerToiletten(4, cfg)).toBe(50);
    expect(beschaeftigteFuerToiletten(11, cfg)).toBe(250);
    expect(beschaeftigteFuerToiletten(13, cfg)).toBe(310);
  });
});

describe("Betriebshof: Wege im Hof", () => {
  it("Weg vom Tor zum Stellplatz auf dem Raster mit Länge und Fahrzeit (Handrechnung)", () => {
    const { h, p1, p2, werkstatt } = grundlayout();
    const a = analysiereHof(h, ctx);
    const w = berechneWege(h, a, cfg);
    // Torzelle am Westrand 0,5 m, vier Zellen bis vor den Stellplatz, dann halbe Zelle und halbe Platztiefe (7 m)
    expect(w.je.get(p1.id)!.laengeM).toBeCloseTo(0.5 + 4 + 0.5 + 7, 9);
    expect(w.je.get(p1.id)!.fahrzeitS).toBeCloseTo(12 / (10 / 3.6), 9);
    expect(w.je.get(p2.id)!.laengeM).toBeCloseTo(16, 9);
    // Weg beginnt am Grundstücksrand und endet in der Mitte des Stellplatzes
    const pk = w.je.get(p1.id)!.punkte;
    expect(pk[0][0]).toBe(0);
    expect(pk[pk.length - 1]).toEqual([4.5, 13]);
    expect(w.je.get(werkstatt.id)!.laengeM).toBeCloseTo(0.5 + 4 + 0.5 + 7.5, 9);
  });

  it("Umwege über das Raster: um ein Hindernis herum ist der Weg länger", () => {
    const h = hof(60, 60);
    const k = kasse();
    baue(h, k, "tor", { x: 0, y: 0, b: 4, t: 7 });
    baue(h, k, "fahrweg", { x: 4, y: 0, b: 7, t: 40 });
    baue(h, k, "fahrweg", { x: 11, y: 33, b: 30, t: 7 });
    const p = baue(h, k, "stellplatz", { x: 37, y: 19, b: 4, t: 14 });
    const a = analysiereHof(h, ctx);
    expect(a.gueltig).toBe(true);
    const w = berechneWege(h, a, cfg).je.get(p.id)!;
    expect(w.laengeM).toBeGreaterThan(Math.hypot(37, 26));
    expect(w.laengeM).toBeLessThan(80);
  });

  it("Pauschalwerte für hohen Zeitraffer: mittlere Fahrzeit je Ziel", () => {
    const { h } = grundlayout();
    const a = analysiereHof(h, ctx);
    const w = berechneWege(h, a, cfg);
    expect(w.pauschal.zumAbstellplatzS).toBeCloseTo((12 + 16) / 2 / (10 / 3.6), 9);
    expect(w.pauschal.zurWerkstattS).toBeCloseTo(12.5 / (10 / 3.6), 9);
    expect(w.pauschal.zurWaschanlageS).toBeNull();
  });
});

describe("Betriebshof: Speichern und Laden (Kriterium 13)", () => {
  it("Datenstruktur speichern und laden ergibt dasselbe Layout, dieselbe Prüfung und dieselben Wege", () => {
    const { h, k } = grundlayout();
    baue(h, k, "ladeplatz", { x: 30, y: 6, b: 4, t: 14 });
    zukaufen(h, k, "o", 20, config.grundstueck);
    const geladen = ladeHof(serialisiereHof(h));
    expect(geladen).toEqual(h);
    const a1 = analysiereHof(h, ctx), a2 = analysiereHof(geladen, ctx);
    expect(a2.fehler).toEqual(a1.fehler);
    expect(a2.summe).toEqual(a1.summe);
    expect([...a2.kapazitaet]).toEqual([...a1.kapazitaet]);
    expect([...berechneWege(geladen, a2, cfg).je]).toEqual([...berechneWege(h, a1, cfg).je]);
    // neue Bauteile bekommen nach dem Laden neue Nummern
    const neu = bauen(geladen, k, "lager", { x: 70, y: 0, b: 4, t: 4 }, ctx);
    expect(neu.ok && h.bauteile.every((b) => b.id !== neu.bauteil.id)).toBe(true);
  });

  it("unbekannte Version und kaputte Daten werden abgelehnt", () => {
    const { h } = grundlayout();
    expect(() => ladeHof({ ...JSON.parse(serialisiereHof(h)), version: 99 })).toThrow(/Version/);
    const o = JSON.parse(serialisiereHof(h));
    o.bauteile[0].typ = "kino";
    expect(() => ladeHof(o)).toThrow(/Bauteil/);
  });
});
