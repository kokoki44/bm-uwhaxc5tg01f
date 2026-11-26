import { beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/config";
import { fahrtZeiten } from "../src/linien/fahrplan";
import { fange, fangIndex } from "../src/linien/fangen";
import { erzeugeRichtungen, fuegeHaltEin, Haltestellen, legeLinieAn, neueHaltestelle, osmHaltId, planAnfrage, setzeTakt } from "../src/linien/linien";
import { berechneLinie } from "../src/linien/plan";
import { HaltIndex, haltLage } from "../src/linien/richtung";
import { neuesNetz, type Linie, type Netz } from "../src/linien/typen";
import { findRoute } from "../src/world/router";
import type { World } from "../src/world/world";
import { buildWorld } from "../src/world/world";
import { ladeNorderstedt, netzSperren } from "./helpers/norderstedt";

const L = config.linien;
const R = config.roads;

/**
 * Beispiellinie für Kokos Test im Spiel (Bericht Etappe 3b): drei vorhandene Haltestellen an der Segeberger Chaussee,
 * Hinrichtung nach Osten. Keine reale Linie, nur eine Strecke zwischen vorhandenen Haltestellen.
 */
const HIN = [333727165, 333727166, 333727173]; // Harksheide, Wilhelm-Busch-Platz; Harksheide, Kielort; Glashütte, Glashütter Kirchenweg
const RUECK = [334310447, 334310460, 334310462];

let world: World;
let netz: Netz;
let halte: Haltestellen;
let linie: Linie;

beforeAll(async () => {
  const entsperren = netzSperren();
  try {
    world = buildWorld(await ladeNorderstedt(), config);
  } finally {
    entsperren();
  }
  netz = neuesNetz();
  halte = new Haltestellen(world.stops, netz);
  const r = legeLinieAn(netz, { nummer: "1", name: "Beispiel", farbe: "#e30613" }, L);
  if (!r.ok) throw new Error(r.fehler);
  linie = r.linie;
  for (const id of HIN) expect(fuegeHaltEin(linie.perlen, halte, osmHaltId(id), () => true, L)).toBeNull();
  erzeugeRichtungen(netz, linie, halte, L, "nach");
  for (const v of linie.varianten) setzeTakt(v, "werktag", [{ vonMin: 6 * 60, bisMin: 20 * 60, taktMin: 20 }], L);
}, 120000);

describe("Beispiellinie Norderstedt (Handrechnung für den Bericht)", () => {
  it("Namen der Haltestellen und Gegenhaltestellen der Rückrichtung", () => {
    expect(HIN.map((id) => halte.hole(osmHaltId(id))!.name)).toEqual(["Harksheide, Wilhelm-Busch-Platz", "Harksheide, Kielort", "Glashütte, Glashütter Kirchenweg"]);
    const rueck = linie.varianten.find((v) => v.art === "rueck")!;
    expect(rueck.perlen.map((p) => (p.art === "halt" ? p.halt : ""))).toEqual(RUECK.map(osmHaltId));
  });

  it("Fahrzeiten Werktag 7 Uhr: Hin 6:30 min, Rück 6:40 min, alle Zeiten auf 10 s", () => {
    const p = berechneLinie(world.network, planAnfrage(linie, halte, null), L, R);
    const [hin, rueck] = p.varianten;
    expect([hin.vollstaendig, rueck.vollstaendig]).toEqual([true, true]);
    expect([hin.strecke.engeKlassen, rueck.strecke.engeKlassen]).toEqual([[], []]);
    // Hin: 43,9 s × 1,35 + 17 + 10 = 86,3 -> 90 s; Standzeit 20 s; 131,3 s × 1,35 + 97 + 10 = 284,3 -> 280 s
    expect(hin.strecke.abschnitte.map((a) => [Math.round(a.fahrS * 10) / 10, a.zuschlagS])).toEqual([[43.9, 17], [131.3, 97]]);
    const st = [0, L.standzeitStandardS, 0];
    const zh = fahrtZeiten(hin.strecke.abschnitte, st, "werktag", 7 * 3600, L);
    expect(zh[2][0] - 7 * 3600).toBe(390);
    // Rück: 142,0 × 1,35 + 112 + 10 = 313,7 -> 310 s; 20 s; 43,2 × 1,35 + 4 + 10 = 72,3 -> 70 s
    const zr = fahrtZeiten(rueck.strecke.abschnitte, st, "werktag", 7 * 3600, L);
    expect(zr[2][0] - 7 * 3600).toBe(400);
    for (const f of p.tage.werktag.fahrten) for (const [an, ab] of f.zeiten) expect([an % 10, ab % 10]).toEqual([0, 0]);
  });

  it("Takt 20 min von 6 bis 20 Uhr in beide Richtungen: 84 Fahrten, Umlauf 23:10 min, 2 Busse", () => {
    const p = berechneLinie(world.network, planAnfrage(linie, halte, null), L, R);
    expect(p.tage.werktag.fahrten).toHaveLength(84);
    // Umlauf = 390 + 400 + 300 + 300 = 1390 s; 1390 / 1200 aufgerundet = 2
    expect(p.tage.werktag.busbedarf).toBe(Math.ceil((390 + 400 + 2 * L.wendezeitStandardS) / 1200));
    expect(p.tage.werktag.busbedarf).toBe(2);
    expect(p.tage.samstag.busbedarf).toBe(0);
  });

  it("Erschließungswege im Busnetz nur mit ausdrücklicher Busfreigabe; alle 259 Haltestellen in beide Richtungen erreichbar", async () => {
    const ex = await (async () => {
      const e = netzSperren();
      try {
        return await ladeNorderstedt();
      } finally {
        e();
      }
    })();
    const tags = new Map(ex.elements.filter((x) => x.type === "way").map((x) => [x.id, x.tags ?? {}]));
    const frei = new Set(["yes", "designated", "permissive"]);
    const fremd = world.network.edges.filter((e) => !R.busHighways.includes(e.cls));
    expect(fremd.length).toBe(60);
    for (const e of fremd) {
      expect(e.cls).toBe("service");
      const t = tags.get(e.wayId)!;
      expect(frei.has(t.bus ?? "") || frei.has(t.psv ?? "")).toBe(true);
    }
    expect(world.stops).toHaveLength(259);
    const kirchenweg = halte.hole(osmHaltId(333727173))!;
    for (const s of world.stops) {
      expect(findRoute(world.network, kirchenweg.snaps, s.snaps, R)).not.toBeNull();
      expect(findRoute(world.network, s.snaps, kirchenweg.snaps, R)).not.toBeNull();
    }
  }, 120000);

  it("Suche zeigt 'weiter Richtung <nächste Haltestelle>' statt einer schwankenden Himmelsrichtung (Regression Nachtrag 3b)", () => {
    const index = new HaltIndex(halte.alle());
    const lage = (id: number) => haltLage(world.network, index, halte.hole(osmHaltId(id))!, L.richtungSucheM);
    const naechste = (id: number) => {
      const l = lage(id);
      expect(l.art === "richtung" && l.strasse).toBe("Segeberger Chaussee");
      return l.art === "richtung" ? l.naechste : "";
    };
    // Hinrichtung: jede Haltestelle zeigt die nächste der Linie (Kirchenweg die danach folgende)
    expect(HIN.map(naechste)).toEqual(["Harksheide, Kielort", "Glashütte, Am Böhmerwald", "Glashütte, Hofweg"]);
    // Gegenrichtung: gleiche Namen, aber eindeutig unterscheidbar; keine Umkehr durch einen Kreisverkehr
    expect(RUECK.map(naechste)).toEqual(["Glashütte, Am Böhmerwald", "Harksheide, Wilhelm-Busch-Platz", "Harksheide, Heidehofweg (West)"]);
  });

  it("gleiche Eingabe, gleiches Ergebnis auf dem echten Netz", () => {
    const a = planAnfrage(linie, halte, null);
    expect(JSON.stringify(berechneLinie(world.network, a, L, R))).toBe(JSON.stringify(berechneLinie(world.network, structuredClone(a), L, R)));
  });

  it("neue Haltestelle rastet auf die nächste Busstraße ein, weit weg von Straßen nicht", () => {
    const b = world.bbox;
    const f = fangIndex(world.network, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], L.fangZelleM);
    const kirchenweg = halte.hole(osmHaltId(333727173))!;
    const s = fange(world.network, f, kirchenweg.coord, "halt", config.stops);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.dist <= config.stops.fangradiusM)).toBe(true);
    const n = neueHaltestelle(netz, "Neu am Kirchenweg", kirchenweg.coord, s, true, L);
    expect(n.ok).toBe(true);
    expect(fange(world.network, f, [b[0] - 0.05, b[1] - 0.05], "halt", config.stops)).toEqual([]);
    expect(fange(world.network, f, kirchenweg.snaps[0].point, "weg", config.stops).length).toBeGreaterThan(0);
  });
});
