import { describe, expect, it } from "vitest";
import { config } from "../src/config";
import { analysiereHof, beschaeftigteFuerToiletten, fuhrparkGrenze, hallenPlaetze, umschliessendeFahrflaechen } from "../src/depot/analyse";
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

  it("Zukauf hält das Seitenverhältnis von höchstens 1 zu 10 ein, die Anzeige des Höchstwerts berücksichtigt es", () => {
    const g = config.grundstueck;
    expect(g.maxSeitenverhaeltnis).toBe(10);
    const h = hof(50, 40); // 50 m breit (Ost nach West), 40 m tief
    const k = kasse(100_000_000);
    // nach Osten: Breite höchstens 10 × 40 = 400 m, also 350 m; die Fläche (16.000 m²) wäre noch erlaubt
    expect(zukaufHoechstM(h, "o", g)).toBe(350);
    expect(zukaufHoechstM(h, "w", g)).toBe(350);
    expect(zukaufen(h, k, "o", 351, g)).toEqual({ ok: false, fehler: "seitenverhaeltnis" });
    expect(h.grundstueck.flaeche).toEqual({ x: 0, y: 0, b: 50, t: 40 });
    expect(zukaufen(h, k, "o", 350, g).ok).toBe(true);
    expect(h.grundstueck.flaeche).toEqual({ x: 0, y: 0, b: 400, t: 40 });
    expect(zukaufHoechstM(h, "o", g)).toBe(0);
    expect(zukaufen(h, k, "w", 1, g)).toEqual({ ok: false, fehler: "seitenverhaeltnis" });
    // nach Süden: Fläche begrenzt (100.000 / 400 = 250 m Tiefe, also 210 m), das Verhältnis nicht (4.000 m)
    expect(zukaufHoechstM(h, "s", g)).toBe(210);
    // ein Zukauf an der kurzen Seite, der das Verhältnis verbessert, ist erlaubt
    expect(zukaufen(h, k, "n", 10, g).ok).toBe(true);
    expect(zukaufHoechstM(h, "o", g)).toBe(100);
  });

  it("Regression: ein schon zu schmales Grundstück (Stand vor der Regel) darf an der kurzen Seite wachsen", () => {
    const g = config.grundstueck;
    const h = hof(400, 20); // 1 zu 20
    const k = kasse(100_000_000);
    expect(zukaufen(h, k, "s", 5, g).ok).toBe(true); // 400 × 25: besser, aber noch über der Grenze
    expect(zukaufen(h, k, "o", 1, g)).toEqual({ ok: false, fehler: "seitenverhaeltnis" }); // verschlechtert
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

  it("zwei getrennte Hofnetze machen das Layout ungültig, mehrere Tore im selben Netz sind erlaubt", () => {
    const { h, k } = grundlayout();
    // zweites Tor am Nordrand mit eigenem Fahrweg, ohne Verbindung zum ersten Netz
    const tor2 = baue(h, k, "tor", { x: 40, y: 0, b: 7, t: 4 });
    baue(h, k, "fahrweg", { x: 40, y: 4, b: 7, t: 10 });
    let a = analysiereHof(h, ctx);
    expect(a.gueltig).toBe(false);
    expect(a.fehler).toEqual([{ code: "getrennteNetze", bauteil: tor2.id }]);
    // verbunden: ein Netz mit zwei Toren ist gültig
    baue(h, k, "fahrweg", { x: 40, y: 14, b: 7, t: 6 });
    a = analysiereHof(h, ctx);
    expect(a.fehler).toEqual([]);
    expect(a.gueltig).toBe(true);
    expect(a.torSeite.size).toBe(2);
  });

  it("Regression: getrennte Netze werden am kleineren Netz gemeldet, nicht am zuletzt gebauten Tor", () => {
    const h = hof();
    const k = kasse();
    const einzeln = baue(h, k, "tor", { x: 40, y: 0, b: 7, t: 4 }); // zuerst gebaut, ohne Fahrweg
    baue(h, k, "tor", { x: 0, y: 20, b: 4, t: 7 });
    baue(h, k, "fahrweg", { x: 4, y: 20, b: 56, t: 7 });
    expect(analysiereHof(h, ctx).fehler).toEqual([{ code: "getrennteNetze", bauteil: einzeln.id }]);
  });

  describe("Wendemöglichkeit (Annahme A2-31)", () => {
    const warnt = (h: Betriebshof, id: number) => analysiereHof(h, ctx).warnungen.some((w) => w.code === "keineWendemoeglichkeit" && w.bauteil === id);
    function stich() {
      const h = hof(100, 60);
      const k = kasse();
      baue(h, k, "tor", { x: 0, y: 20, b: 4, t: 7 });
      const weg = baue(h, k, "fahrweg", { x: 4, y: 20, b: 60, t: 7 });
      baue(h, k, "stellplatz", { x: 4, y: 6, b: 4, t: 14 });
      return { h, k, weg };
    }

    it("Fahrweg mit Stellplätzen ohne Wendemöglichkeit: Warnung, Layout bleibt gültig", () => {
      const { h, weg } = stich();
      expect(config.betriebshof.wendeflaecheMinM).toBe(27);
      const a = analysiereHof(h, ctx);
      expect(a.gueltig).toBe(true);
      expect(a.warnungen).toContainEqual({ code: "keineWendemoeglichkeit", bauteil: weg.id });
    });

    it("ohne Stellplätze am Weg keine Warnung", () => {
      const h = hof(100, 60);
      const k = kasse();
      baue(h, k, "tor", { x: 0, y: 20, b: 4, t: 7 });
      const weg = baue(h, k, "fahrweg", { x: 4, y: 20, b: 60, t: 7 });
      expect(warnt(h, weg.id)).toBe(false);
    });

    it("Wendefläche hinter dem Weg hebt die Warnung auf, eine zu kleine nicht", () => {
      const a = stich();
      baue(a.h, a.k, "fahrweg", { x: 64, y: 10, b: 26, t: 27 });
      expect(warnt(a.h, a.weg.id)).toBe(true);
      const b = stich();
      baue(b.h, b.k, "fahrweg", { x: 64, y: 10, b: 27, t: 27 });
      expect(warnt(b.h, b.weg.id)).toBe(false);
    });

    it("Wendefläche vor dem Weg (zwischen Tor und Weg) hilft nicht", () => {
      const h = hof(120, 60);
      const k = kasse();
      baue(h, k, "tor", { x: 0, y: 20, b: 4, t: 7 });
      const platz = baue(h, k, "fahrweg", { x: 4, y: 10, b: 27, t: 27 });
      const weg = baue(h, k, "fahrweg", { x: 31, y: 20, b: 60, t: 7 });
      baue(h, k, "stellplatz", { x: 40, y: 6, b: 4, t: 14 });
      expect(warnt(h, weg.id)).toBe(true);
      expect(warnt(h, platz.id)).toBe(false);
    });

    it("Durchfahrt über ein zweites Tor ist eine Wendemöglichkeit", () => {
      const h = hof(100, 60);
      const k = kasse();
      baue(h, k, "tor", { x: 0, y: 20, b: 4, t: 7 });
      const weg = baue(h, k, "fahrweg", { x: 4, y: 20, b: 92, t: 7 });
      baue(h, k, "tor", { x: 96, y: 20, b: 4, t: 7 });
      baue(h, k, "stellplatz", { x: 4, y: 6, b: 4, t: 14 });
      expect(warnt(h, weg.id)).toBe(false);
    });

    it("Regression: zwei Tore direkt nebeneinander sind keine Durchfahrt (Abstand unter 27 m)", () => {
      const h = hof(50, 40);
      const k = kasse();
      baue(h, k, "tor", { x: 0, y: 16, b: 4, t: 4 });
      baue(h, k, "tor", { x: 0, y: 20, b: 4, t: 4 });
      const weg = baue(h, k, "fahrweg", { x: 4, y: 16, b: 40, t: 8 });
      baue(h, k, "stellplatz", { x: 4, y: 2, b: 4, t: 14 });
      expect(analysiereHof(h, ctx).gueltig).toBe(true);
      expect(warnt(h, weg.id)).toBe(true);
      // ein zweites Tor am anderen Ende (mehr als 27 m entfernt) ist eine Durchfahrt
      const h2 = hof(50, 40);
      baue(h2, k, "tor", { x: 0, y: 16, b: 4, t: 8 });
      const weg2 = baue(h2, k, "fahrweg", { x: 4, y: 16, b: 42, t: 8 });
      baue(h2, k, "tor", { x: 46, y: 16, b: 4, t: 8 });
      baue(h2, k, "stellplatz", { x: 4, y: 2, b: 4, t: 14 });
      expect(warnt(h2, weg2.id)).toBe(false);
    });

    it("Regression: drei Fahrwege an einer Einmündung umschließen keine Fläche und sind kein Rundweg", () => {
      const h = hof(50, 40);
      const k = kasse();
      baue(h, k, "tor", { x: 0, y: 16, b: 4, t: 7 });
      baue(h, k, "fahrweg", { x: 4, y: 16, b: 40, t: 7 }); // M
      const x = baue(h, k, "fahrweg", { x: 20, y: 23, b: 7, t: 15 }); // Stich nach Süden
      baue(h, k, "fahrweg", { x: 27, y: 23, b: 7, t: 7 }); // Y berührt M und X
      baue(h, k, "stellplatz", { x: 12, y: 24, b: 8, t: 4 }); // Stirnseite an X
      const a = analysiereHof(h, ctx);
      expect(a.gueltig).toBe(true);
      expect(warnt(h, x.id)).toBe(true);
    });

    it("Regression: Fahrwege, die sich nur an einer Ecke berühren, schließen keinen Rundweg", () => {
      const h = hof(60, 50);
      const k = kasse();
      baue(h, k, "tor", { x: 0, y: 30, b: 4, t: 7 });
      const d = baue(h, k, "fahrweg", { x: 4, y: 10, b: 7, t: 30 }); // D, vom Tor nach Norden
      baue(h, k, "fahrweg", { x: 11, y: 33, b: 30, t: 7 }); // C, breit an D
      baue(h, k, "fahrweg", { x: 41, y: 3, b: 7, t: 37 }); // B, breit an C
      baue(h, k, "fahrweg", { x: 11, y: 3, b: 30, t: 7 }); // A, breit an B, berührt D nur an der Ecke (11, 10)
      baue(h, k, "stellplatz", { x: 11, y: 12, b: 8, t: 4 }); // Stirnseite an D
      const a = analysiereHof(h, ctx);
      expect(a.gueltig).toBe(true);
      // Die Wege umschließen auf dem Raster eine Fläche, bilden aber im Netz keinen Kreis: Hufeisen ohne Wendemöglichkeit
      expect(umschliessendeFahrflaechen(h.bauteile.filter((b) => b.typ === "fahrweg" || b.typ === "tor"), h.grundstueck.flaeche).has(d.id)).toBe(true);
      expect(warnt(h, d.id)).toBe(true);
      // mit breitem Schluss zwischen A und D ist es ein Rundweg
      baue(h, k, "fahrweg", { x: 4, y: 3, b: 7, t: 7 });
      expect(warnt(h, d.id)).toBe(false);
    });

    it("Rundweg ist eine Wendemöglichkeit, ein Stich davor nicht", () => {
      const h = hof(100, 60);
      const k = kasse();
      baue(h, k, "tor", { x: 0, y: 20, b: 4, t: 7 });
      const sued = baue(h, k, "fahrweg", { x: 4, y: 20, b: 60, t: 7 });
      baue(h, k, "fahrweg", { x: 4, y: 0, b: 60, t: 7 });
      baue(h, k, "fahrweg", { x: 4, y: 7, b: 7, t: 13 });
      baue(h, k, "fahrweg", { x: 57, y: 7, b: 7, t: 13 });
      baue(h, k, "stellplatz", { x: 15, y: 7, b: 4, t: 13 });
      // Stich nach Süden mit Stellplatz: der Rundweg liegt vor ihm, nicht dahinter
      const stichSued = baue(h, k, "fahrweg", { x: 30, y: 27, b: 7, t: 30 });
      baue(h, k, "stellplatz", { x: 37, y: 40, b: 14, t: 4 });
      const a = analysiereHof(h, ctx);
      expect(a.gueltig).toBe(true);
      expect(warnt(h, sued.id)).toBe(false);
      expect(warnt(h, stichSued.id)).toBe(true);
    });
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

  it("Regression: der Weg nutzt keine Durchgänge, die schmaler als die kleinste Zufahrt sind", () => {
    // Gegenbeispiel der unabhängigen Prüfung: Fahrweg D berührt Tor und A nur auf 1 m und 3 m,
    // er ist nur über A, B und C verbunden. Vorher lief der Weg direkt durch den schmalen Durchgang (64,5 m).
    const h = hof(60, 60);
    const k = kasse();
    baue(h, k, "tor", { x: 0, y: 0, b: 4, t: 4 });
    baue(h, k, "fahrweg", { x: 4, y: 0, b: 50, t: 4 }); // A
    baue(h, k, "fahrweg", { x: 54, y: 0, b: 4, t: 40 }); // B
    baue(h, k, "fahrweg", { x: 7, y: 40, b: 51, t: 4 }); // C
    baue(h, k, "fahrweg", { x: 3, y: 4, b: 4, t: 40 }); // D
    const p = baue(h, k, "stellplatz", { x: 20, y: 44, b: 4, t: 14 });
    const a = analysiereHof(h, ctx);
    expect(a.gueltig).toBe(true);
    const w = berechneWege(h, a, cfg).je.get(p.id)!;
    expect(w.laengeM).toBeGreaterThan(120);
    // jeder Schritt des Weges bleibt in einer Fahrfläche oder wechselt über eine breite Verbindung
    expect(w.punkte.every(([x, y]) => x < 4 || y < 4 || x >= 54 || (y >= 40 && x >= 7) || y >= 44)).toBe(true);
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
