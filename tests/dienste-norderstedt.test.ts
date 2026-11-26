import { beforeAll, describe, expect, it } from "vitest";
import rwRaw from "../regelwerk/de.json";
import { config } from "../src/config";
import { linienDaten, pruefeTag, type LinieDaten } from "../src/dienste/pruefung";
import { ladeRegelwerk } from "../src/dienste/regelwerk";
import type { Dienst } from "../src/dienste/typen";
import { uhrzeit } from "../src/linien/fahrplan";
import { erzeugeRichtungen, fuegeHaltEin, Haltestellen, legeLinieAn, osmHaltId, planAnfrage, setzeTakt } from "../src/linien/linien";
import { berechneLinie, type LinienPlan } from "../src/linien/plan";
import { neuesNetz } from "../src/linien/typen";
import { haversine, LocalProj, projectOnLine } from "../src/world/geo";
import type { Snap } from "../src/world/router";
import { naechsteStrasse } from "../src/world/standorte";
import { buildWorld, type World } from "../src/world/world";
import { ladeNorderstedt, netzSperren } from "./helpers/norderstedt";

const L = config.linien, C = config.dienste;
const RW = ladeRegelwerk(rwRaw).regelwerk!;
const H = 3600, M = 60;

/**
 * Beispiel D1, D2, D3 aus der Vorbereitung von 3c-1 auf der Beispiellinie 1 (Werktag, Takt 6 bis 20 Uhr alle 20 min).
 * Betriebshof für den Test: Gewerbefläche nächst dem Wilhelm-Busch-Platz, Tor an der nächsten Busstraße. Im Spiel gelten
 * die Werte des eigenen Hofs (Fahrplanfenster).
 */
let world: World;
let plan: LinienPlan;
let daten: LinieDaten;

beforeAll(async () => {
  const e = netzSperren();
  try {
    world = buildWorld(await ladeNorderstedt(), config);
  } finally {
    e();
  }
  const netz = neuesNetz();
  const halte = new Haltestellen(world.stops, netz);
  const r = legeLinieAn(netz, { nummer: "1", name: "Beispiel", farbe: "#e30613" }, L);
  if (!r.ok) throw new Error(r.fehler);
  for (const id of [333727165, 333727166, 333727173]) fuegeHaltEin(r.linie.perlen, halte, osmHaltId(id), () => true, L);
  erzeugeRichtungen(netz, r.linie, halte, L, "nach");
  for (const v of r.linie.varianten) setzeTakt(v, "werktag", [{ vonMin: 6 * 60, bisMin: 20 * 60, taktMin: 20 }], L);
  const wbp = halte.hole(osmHaltId(333727165))!.coord;
  const standort = [...world.standorte].sort((a, b) => haversine(a.zentrum, wbp) - haversine(b.zentrum, wbp) || a.id - b.id)[0];
  const n = naechsteStrasse(world.network, [standort.zentrum], 1500, 100)!;
  const ed = world.network.edges[n.edge];
  const b = world.bbox;
  const pr = projectOnLine(n.punkt, ed.coords, new LocalProj((b[0] + b[2]) / 2, (b[1] + b[3]) / 2));
  const hof: Snap[] = [{ edge: ed.id, t: pr.t, dist: 0, point: pr.point }];
  if (ed.twin >= 0) hof.push({ edge: ed.twin, t: 1 - pr.t, dist: 0, point: pr.point });
  plan = berechneLinie(world.network, planAnfrage(r.linie, halte, hof), L, config.roads);
  daten = linienDaten(plan, "1", 2, "werktag");
}, 120000);

describe("Beispiel D1, D2, D3 auf dem echten Netz (Bericht 3c-1)", () => {
  it("Umlauf 0: 42 Fahrten von 06:00 bis 19:46:00, reine Fahrzeit 4:27:00 h, Ablösung 12:26:20 am Wilhelm-Busch-Platz", () => {
    const u = daten.umlaeufe[0];
    const f = (i: number) => daten.fahrten.find((x) => x.variante === u.fahrten[i].variante && x.schluessel === u.fahrten[i].schluessel)!;
    expect(u.fahrten).toHaveLength(42);
    expect([uhrzeit(f(0).abfahrtS), uhrzeit(f(41).ankunftS, true)]).toEqual(["06:00", "19:46:00"]);
    expect(u.fahrten.reduce((s, _, i) => s + f(i).ankunftS - f(i).abfahrtS, 0)).toBe(4 * H + 27 * M);
    expect([uhrzeit(f(19).ankunftS, true), uhrzeit(f(20).abfahrtS)]).toEqual(["12:26:20", "12:40"]);
    expect(plan.varianten.find((v) => v.id === f(19).variante)!.ziel!.name).toBe("Harksheide, Wilhelm-Busch-Platz");
    expect(u.ausrueck).not.toBeNull();
    expect(u.einrueck).not.toBeNull();
  });

  it("D1 und D2 speicherbar, D3 (ganzer Umlauf) nicht: Arbeitszeit über 10 h (ArbZG § 3)", () => {
    const u = daten.umlaeufe[0];
    const a = u.ausrueck!.fahrzeitS, e = u.einrueck!.fahrzeitS;
    const d = (id: number, nummer: string, von: number, bis: number): Dienst => ({ id, nummer, tag: "werktag", stuecke: [{ linie: plan.linieId, fahrten: u.fahrten.slice(von, bis) }] });
    const t = pruefeTag({ tag: "werktag", linien: [daten], dienste: [d(1, "D1", 0, 20), d(2, "D2", 20, 42)], entwurf: d(3, "D3", 0, 42) }, RW, C);
    const [d1, d2] = t.dienste;
    // Neben D1 und D2 ist D3 zusätzlich doppelt; allein geprüft bleibt nur die Arbeitszeit
    expect(t.entwurf!.verstoesse.map((v) => v.code)).toEqual(["fahrtDoppelt", "max"]);
    const d3 = pruefeTag({ tag: "werktag", linien: [daten], dienste: [], entwurf: d(3, "D3", 0, 42) }, RW, C).entwurf!;
    // Mit dem Testhof (Ausrücken 1:30 min, Einrücken 1:10 min): D1 05:48:30 bis 12:46:20, D2 12:25:00 bis 19:52:10, D3 Arbeitszeit 14:03:40 h
    expect([a, e]).toEqual([90, 70]);
    expect([d1.warnungen, d2.warnungen]).toEqual([[], []]);

    // Handrechnung D1: Beginn 06:00 minus Ausrücken minus 10 min Vorbereitung; Ende 12:26:20 plus 15 min Weg plus 5 min Abschluss
    expect(d1.beginnS).toBe(6 * H - a - C.vorbereitungS);
    expect(d1.endeS).toBe(12 * H + 26 * M + 20 + C.wegS + C.abschlussS);
    expect(d1.lenkS).toBe(a + 2 * H + 7 * M + 10);
    expect(d1.arbeitS).toBe(d1.endeS - d1.beginnS);
    expect([d1.gueltig, d1.art, d1.regime]).toEqual([true, "frueh", "sechstel"]);
    // D2: Weg ab 12:25, Fahrten 12:40 bis 19:46:00, Einrücken, 5 min Abschluss
    expect(d2.beginnS).toBe(12 * H + 40 * M - C.wegS);
    expect(d2.endeS).toBe(19 * H + 46 * M + e + C.abschlussS);
    expect(d2.lenkS).toBe(2 * H + 19 * M + 50 + e);
    expect([d2.gueltig, d2.art]).toEqual([true, "spaet"]);
    // D3: 4:27:00 h Fahrten plus Aus- und Einrücken; Arbeitszeit von Vorbereitung bis Abschluss ohne Pausen
    expect(d3.lenkS).toBe(4 * H + 27 * M + a + e);
    expect(d3.arbeitS).toBe(19 * H + 46 * M + e + C.abschlussS - (6 * H - a - C.vorbereitungS));
    expect(d3.gueltig).toBe(false);
    expect(d3.verstoesse).toEqual([{ regel: "arbeitszeit", code: "max", wertS: d3.arbeitS, grenzeS: 10 * H }]);
    // Nur D1 gespeichert: ab 12:40 sind die 22 übrigen Fahrten von Umlauf 0 und alle 42 von Umlauf 1 frei; mit D2 nur Umlauf 1
    const nurD1 = pruefeTag({ tag: "werktag", linien: [daten], dienste: [d(1, "D1", 0, 20)], entwurf: null }, RW, C);
    expect(nurD1.frei[plan.linieId]).toHaveLength(22 + 42);
    expect(t.frei[plan.linieId]).toHaveLength(42);
  });
});
