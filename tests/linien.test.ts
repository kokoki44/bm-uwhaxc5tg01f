import { describe, expect, it } from "vitest";
import { civil } from "../src/calendar/civil";
import { config, PLAN_TAGE, schulferien, type PlanTag } from "../src/config";
import { abschnittZeitS, fahrtZeiten, leseUhrzeit, runde, taktAbfahrten, uhrzeit, verkehrsfaktor, verkette, type UmlaufFahrt } from "../src/linien/fahrplan";
import {
  benenneHaltestelle, entferneBus, entfernePerle, erzeugeRichtungen, fuegeFahrtHinzu, fuegeHaltEin, fuegeWegpunktEin, gegenhaltestelle, Haltestellen,
  legeKurzlaeuferAn, legeLinieAn, loescheHaltestelle, neueHaltestelle, osmHaltId, planAnfrage, pruefeTaktZeile, setzeAktiv, setzeEigenenFerientakt,
  setzeStandzeit, setzeTakt, setzeWendezeit, stelleFahrtWiederHer, streicheFahrt, verschiebeFahrt, verschiebePerle, vorschlagFarbe, weiseBusZu, aendereLinie, linieVonBus,
} from "../src/linien/linien";
import { berechneLinie, orte } from "../src/linien/plan";
import { passtZurLinie } from "../src/linien/pruefung";
import { berechneStrecke } from "../src/linien/strecke";
import { planTag } from "../src/linien/tagesart";
import { neuesNetz, type Linie, type Netz, type Perle, type TaktZeile } from "../src/linien/typen";
import { buildRoadNetwork } from "../src/world/roads";
import { TestOsm } from "./helpers/osm";
import { geradenNetz, halt } from "./helpers/linien-netz";

const L = config.linien;
const R = config.roads;
const frei = () => true;
const min = (h: number, m = 0) => h * 60 + m;
const sek = (h: number, m = 0, s = 0) => h * 3600 + m * 60 + s;
const zeile = (von: number, bis: number, takt: number): TaktZeile => ({ vonMin: von, bisMin: bis, taktMin: takt });

/**
 * Netz für die Handrechnung: 4 Knoten, 3 Abschnitte zu je 400 m bei 36 km/h (40 s), eine Ampel am Ende von Abschnitt 1
 * in Vorwärtsrichtung. "Anfang" liegt mitten auf Abschnitt 0, "Mitte" mitten auf Abschnitt 1, "Ende" mitten auf Abschnitt 2.
 */
function handNetz() {
  const net = geradenNetz(4, { signale: { 2: 1 } });
  const stops = [halt(net, 1, "Anfang", 0, 0.5), halt(net, 2, "Mitte", 1, 0.5), halt(net, 3, "Ende", 2, 0.5)];
  const netz = neuesNetz();
  return { net, stops, netz, halte: new Haltestellen(stops, netz) };
}

function linieMit(netz: Netz, halte: Haltestellen, ids: number[], nummer = "1"): Linie {
  const r = legeLinieAn(netz, { nummer, name: "Testlinie", farbe: "#e30613" }, L);
  if (!r.ok) throw new Error(r.fehler);
  for (const id of ids) expect(fuegeHaltEin(r.linie.perlen, halte, osmHaltId(id), frei, L)).toBeNull();
  erzeugeRichtungen(netz, r.linie, halte, L, "nach");
  return r.linie;
}

describe("Fahrzeiten (Kriterium 5, Handrechnung)", () => {
  it("Abschnitt Anfang bis Ende: 80 s reine Fahrzeit, 15 s Ampel, 10 s Halt, Faktor nur auf die reine Fahrzeit, auf 10 s gerundet", () => {
    const { net, netz, halte } = handNetz();
    const l = linieMit(netz, halte, [1, 3]);
    const hin = l.varianten.find((v) => v.art === "hin")!;
    const s = berechneStrecke(net, planAnfrage(l, halte, null).varianten.find((v) => v.id === hin.id)!.perlen, L, R);
    expect(s.fehlt).toEqual([]);
    expect(s.abschnitte).toHaveLength(1);
    const a = s.abschnitte[0];
    expect(a.lengthM).toBeCloseTo(800, 6);
    expect(a.fahrS).toBeCloseTo(80, 6);
    expect(a.zuschlagS).toBe(15);
    // Werktag 7 Uhr: 80 × 1,35 = 108, + 15 + 10 = 133 -> 130 s
    expect(abschnittZeitS(a, "werktag", sek(7), L)).toBe(130);
    // Werktag 10 Uhr: 80 × 1,2 = 96, + 25 = 121 -> 120 s
    expect(abschnittZeitS(a, "werktag", sek(10), L)).toBe(120);
    // Ferien 7 Uhr: 80 × 1,25 = 100, + 25 = 125 -> 130 s (halbe Schritte aufwärts)
    expect(abschnittZeitS(a, "werktagFerien", sek(7), L)).toBe(130);
    // Sonntag: 80 × 1,1 = 88, + 25 = 113 -> 110 s
    expect(abschnittZeitS(a, "sonnFeiertag", sek(12), L)).toBe(110);
    // Nach Mitternacht gilt wieder die Tabelle ab 0 Uhr: 80 × 1,05 = 84, + 25 = 109 -> 110 s
    expect(abschnittZeitS(a, "werktag", sek(25, 30), L)).toBe(110);
  });

  it("Rückrichtung ohne Ampel: 80 × 1,1 + 10 = 98 -> 100 s am Sonntag", () => {
    const { net, netz, halte } = handNetz();
    const l = linieMit(netz, halte, [1, 3]);
    const rueck = l.varianten.find((v) => v.art === "rueck")!;
    const s = berechneStrecke(net, planAnfrage(l, halte, null).varianten.find((v) => v.id === rueck.id)!.perlen, L, R);
    expect(s.abschnitte[0].zuschlagS).toBe(0);
    expect(abschnittZeitS(s.abschnitte[0], "sonnFeiertag", sek(12), L)).toBe(100);
  });

  it("Faktor gilt zur Abfahrt am Beginn jedes Abschnitts, Standzeit an Zwischenhalten, alle Zeiten auf 10 s", () => {
    const ab = [{ fahrS: 100, zuschlagS: 0 }, { fahrS: 100, zuschlagS: 0 }] as never[];
    // 8:58 Werktag: 100 × 1,35 + 10 = 145 -> 150 s; an 9:00:30, Standzeit 30 s, ab 9:01:00; dann 100 × 1,2 + 10 = 130 s
    const z = fahrtZeiten(ab, [0, 30, 0], "werktag", sek(8, 58), L);
    expect(z).toEqual([[sek(8, 58), sek(8, 58)], [sek(9, 0, 30), sek(9, 1)], [sek(9, 3, 10), sek(9, 3, 10)]]);
    for (const [an, abS] of z) expect([an % 10, abS % 10]).toEqual([0, 0]);
  });

  it("mindestens 10 s je Abschnitt, Höchstgeschwindigkeit 80 km/h, kein Faktor unter 1", () => {
    expect(abschnittZeitS({ fahrS: 0, zuschlagS: 0 }, "werktag", sek(12), { ...L, haltZuschlagS: 0 })).toBe(10);
    const net = geradenNetz(2, { kmh: 120, laengeM: 800 });
    const stops = [halt(net, 1, "A", 0, 0), halt(net, 2, "B", 0, 1)];
    const netz = neuesNetz();
    const halte = new Haltestellen(stops, netz);
    const l = linieMit(netz, halte, [1, 2]);
    const s = berechneStrecke(net, planAnfrage(l, halte, null).varianten[0].perlen, L, R);
    expect(s.abschnitte[0].fahrS).toBeCloseTo(36, 6); // 800 m bei 80 statt 120 km/h
    for (const t of PLAN_TAGE) for (let h = 0; h < 28; h++) expect(verkehrsfaktor(t, h * 3600, L)).toBeGreaterThanOrEqual(1);
    expect(runde(14.9, L)).toBe(10);
    expect(runde(15, L)).toBe(20);
  });
});

describe("Routen (Kriterium 2)", () => {
  /** Kurzer Weg mit 10 km/h direkt, langer Umweg mit 100 km/h. */
  function umwegNetz() {
    const o = new TestOsm().node(1, 0, 0).node(2, 1, 0).node(3, 2, 0).node(4, 0, 1).node(5, 2, 1).node(6, 3, 0);
    o.way([1, 2, 3], { highway: "residential", maxspeed: "10" });
    o.way([1, 4, 5, 3], { highway: "residential", maxspeed: "100" });
    o.way([3, 6], { highway: "residential", maxspeed: "30" });
    return { o, net: buildRoadNetwork(o.extract(), R) };
  }

  it("wählt die Route mit der kürzesten Fahrzeit, nicht die kürzeste Länge", () => {
    const { net } = umwegNetz();
    // Beide Wege von Knoten 1 nach Knoten 3 sind je ein Abschnitt (Zwischenknoten liegen nur auf einem Weg)
    const langsam = net.edges.find((e) => net.nodeOsm[e.from] === 1 && e.speedKmh === 10)!;
    const schnell = net.edges.find((e) => net.nodeOsm[e.from] === 1 && e.speedKmh === 100)!;
    const e36 = net.edges.find((e) => net.nodeOsm[e.from] === 3 && net.nodeOsm[e.to] === 6)!;
    const p = (id: string, snaps: { edge: number; t: number }[]) => {
      const s = snaps.map((x) => ({ ...x, dist: 0, point: net.edges[x.edge].coords[0] }));
      return { halt: { id, name: id, coord: s[0].point, snaps: s }, coord: s[0].point, snaps: s, standzeitS: 0 };
    };
    const s = berechneStrecke(net, [p("a", [{ edge: langsam.id, t: 0 }, { edge: schnell.id, t: 0 }]), p("b", [{ edge: e36.id, t: 1 }])], L, R);
    expect(s.fehlt).toEqual([]);
    expect(s.stuecke.map((x) => x.edge)).toEqual([schnell.id, e36.id]);
    expect(schnell.lengthM).toBeGreaterThan(2 * langsam.lengthM);
  });

  it("Einbahnstraße: Hin über die Einbahnstraße, Rück über den anderen Weg", () => {
    const o = new TestOsm().node(1, 0, 0).node(2, 1, 0).node(3, 2, 0).node(4, 1, 1);
    const einbahn = o.way([1, 2, 3], { highway: "residential", oneway: "yes", maxspeed: "50" });
    const zwei = o.way([3, 4, 1], { highway: "residential", maxspeed: "50" });
    const net = buildRoadNetwork(o.extract(), R);
    const ow = net.edges.find((e) => e.wayId === einbahn)!;
    const tw13 = net.edges.find((e) => e.wayId === zwei && net.nodeOsm[e.from] === 1)!;
    const tw31 = net.edges.find((e) => e.wayId === zwei && net.nodeOsm[e.from] === 3)!;
    expect(ow.twin).toBe(-1);
    const sn = (edge: number, t: number) => ({ edge, t, dist: 0, point: net.edges[edge].coords[0] });
    const stops = [
      { id: 1, name: "West", coord: ow.coords[0], snaps: [sn(ow.id, 0.05), sn(tw13.id, 0.05), sn(tw31.id, 0.95)] },
      { id: 2, name: "Ost", coord: ow.coords[1], snaps: [sn(ow.id, 0.95), sn(tw13.id, 0.95), sn(tw31.id, 0.05)] },
    ];
    const netz = neuesNetz();
    const halte = new Haltestellen(stops, netz);
    const l = linieMit(netz, halte, [1, 2]);
    const a = planAnfrage(l, halte, null);
    const hin = berechneStrecke(net, a.varianten[0].perlen, L, R);
    const rueck = berechneStrecke(net, a.varianten[1].perlen, L, R);
    expect(hin.fehlt).toEqual([]);
    expect(rueck.fehlt).toEqual([]);
    // Hin auf der kürzeren Einbahnstraße, zurück nur über den anderen Weg
    expect(hin.stuecke.map((s) => net.edges[s.edge].wayId)).toEqual([einbahn]);
    expect(rueck.stuecke.map((s) => s.edge)).toEqual([tw31.id]);
  });

  it("ohne Route: Meldung an der Stelle, Linie bleibt gespeichert, keine Fahrten", () => {
    // Von Knoten 2 geht es nicht weiter nach Knoten 3: C ist von A und B aus nicht erreichbar
    const net = geradenNetz(4);
    net.outEdges[2] = net.outEdges[2].filter((e) => e !== 4);
    const stops = [halt(net, 1, "A", 0, 0.5), halt(net, 2, "B", 1, 0.5), halt(net, 3, "C", 2, 0.9)];
    const netz = neuesNetz();
    const halte = new Haltestellen(stops, netz);
    const l = linieMit(netz, halte, [1, 2, 3]);
    const hin = l.varianten.find((v) => v.art === "hin")!;
    setzeTakt(hin, "werktag", [zeile(min(6), min(7), 20)], L);
    const plan = berechneLinie(net, planAnfrage(l, halte, null), L, R);
    const vp = plan.varianten.find((v) => v.id === hin.id)!;
    expect(vp.vollstaendig).toBe(false);
    expect(vp.strecke.fehlt).toEqual([1]); // von Perle 2 (B) nach Perle 3 (C)
    expect(plan.tage.werktag.fahrten.filter((f) => f.variante === hin.id)).toEqual([]);
    expect(netz.linien).toHaveLength(1);
  });

  it("die nächste Teilroute beginnt auf dem Abschnitt, auf dem die vorige angekommen ist (kein Richtungswechsel an der Perle)", () => {
    const { net, netz, halte } = handNetz();
    const l = linieMit(netz, halte, [1, 2, 3]);
    const s = berechneStrecke(net, planAnfrage(l, halte, null).varianten[0].perlen, L, R);
    for (let i = 1; i < s.stuecke.length; i++) {
      const a = s.stuecke[i - 1], b = s.stuecke[i];
      expect(a.edge === b.edge ? a.t1 : net.edges[a.edge].to).toBe(a.edge === b.edge ? b.t0 : net.edges[b.edge].from);
    }
    expect(s.wendetInSackgasse).toBe(false);
    expect(s.abschnitte.map((x) => [x.von, x.nach])).toEqual([[0, 1], [1, 2]]);
  });

  it("Wegpunkte gehören zum Abschnitt zwischen zwei Haltestellen", () => {
    const { net, netz, halte } = handNetz();
    const l = linieMit(netz, halte, [1, 3]);
    const hin = l.varianten.find((v) => v.art === "hin")!;
    const e = net.edges[2];
    expect(fuegeWegpunktEin(hin.perlen, e.coords[0], [{ edge: 2, t: 0.25, dist: 0, point: e.coords[0] }], 1)).toBeNull();
    expect(fuegeWegpunktEin(hin.perlen, e.coords[0], [], 1)).toBe("ohneNetz");
    const s = berechneStrecke(net, planAnfrage(l, halte, null).varianten.find((v) => v.id === hin.id)!.perlen, L, R);
    expect(s.abschnitte).toHaveLength(1);
    expect(s.abschnitte[0].fahrS).toBeCloseTo(80, 6);
  });
});

describe("Takt und Fahrten (Kriterien 7 und 8)", () => {
  function kurzLinie() {
    const { net, netz, halte } = handNetz();
    const l = linieMit(netz, halte, [1, 2, 3]);
    const hin = l.varianten.find((v) => v.art === "hin")!;
    const k = legeKurzlaeuferAn(netz, l, hin.id, 0, 1, halte, L, "nach");
    if (!k.ok) throw new Error(k.fehler);
    return { net, netz, halte, l, hin, kurz: k.variante };
  }

  it("Linie mit Kurzläufer erzeugt genau die richtigen Fahrten (Zahl, Abfahrten, Varianten)", () => {
    const { net, netz, halte, l, hin, kurz } = kurzLinie();
    expect(kurz.perlen.map((p) => (p.art === "halt" ? p.halt : "w"))).toEqual(["o1", "o2"]);
    setzeTakt(hin, "werktag", [zeile(min(6), min(7), 20)], L);
    setzeTakt(kurz, "werktag", [zeile(min(6, 10), min(7), 20)], L);
    // Hin 6:20 gestrichen, Hin 6:40 auf 6:45 verschoben, zusätzlicher Kurzläufer 6:55 (nur auf dem Kurzläufer)
    expect(streicheFahrt(hin, "werktag", sek(6, 20))).toBeNull();
    expect(verschiebeFahrt(hin, "werktag", sek(6, 40), sek(6, 45), L)).toBeNull();
    expect(fuegeFahrtHinzu(netz, kurz, "werktag", sek(6, 55), L).ok).toBe(true);
    const plan = berechneLinie(net, planAnfrage(l, halte, null), L, R);
    const f = plan.tage.werktag.fahrten.map((x) => [uhrzeit(x.abfahrtS), x.variante === hin.id ? "hin" : x.variante === kurz.id ? "kurz" : "?", x.status]);
    expect(f).toEqual([
      ["06:00", "hin", "takt"],
      ["06:10", "kurz", "takt"],
      ["06:20", "hin", "gestrichen"],
      ["06:30", "kurz", "takt"],
      ["06:45", "hin", "verschoben"],
      ["06:50", "kurz", "takt"],
      ["06:55", "kurz", "zusatz"],
    ]);
    // Kurzläufer endet an der Mitte (vor der Ampel): 20 + 20 = 40 s reine Fahrzeit, Werktag 6 Uhr × 1,35 = 54, + 10 = 64 -> 60 s
    const kurz610 = plan.tage.werktag.fahrten.find((x) => x.variante === kurz.id)!;
    expect(kurz610.zeiten.length).toBe(2);
    expect(kurz610.ankunftS - kurz610.abfahrtS).toBe(60);
    // Hinfahrt über drei Haltestellen: Anfang bis Mitte 60 s, Standzeit 20 s, Mitte bis Ende 40 × 1,35 = 54 + 15 + 10 = 79 -> 80 s
    const hin600 = plan.tage.werktag.fahrten[0];
    expect(hin600.zeiten).toEqual([[sek(6), sek(6)], [sek(6, 1), sek(6, 1, 20)], [sek(6, 2, 40), sek(6, 2, 40)]]);
    // Andere Tagesarten bleiben leer, Ferientag übernimmt den Werktag
    expect(plan.tage.samstag.fahrten).toEqual([]);
    expect(plan.tage.werktagFerien.fahrten.map((x) => [x.abfahrtS, x.status])).toEqual(plan.tage.werktag.fahrten.map((x) => [x.abfahrtS, x.status]));
  });

  it("Änderungen bleiben bei neuer Berechnung; passt eine Änderung nach einer Taktänderung nicht mehr, wird sie verworfen und gemeldet, zusätzliche Fahrten bleiben", () => {
    const { netz, hin } = kurzLinie();
    setzeTakt(hin, "werktag", [zeile(min(6), min(7), 20)], L);
    streicheFahrt(hin, "werktag", sek(6, 20));
    verschiebeFahrt(hin, "werktag", sek(6, 40), sek(6, 42), L);
    fuegeFahrtHinzu(netz, hin, "werktag", sek(7, 5), L);
    // 6:20 bleibt im neuen Takt (alle 10 min), 6:40 auch
    let r = setzeTakt(hin, "werktag", [zeile(min(6), min(7), 10)], L);
    expect(r.ok && r.verworfen).toEqual([]);
    // Takt alle 15 min: 6:20 und 6:40 gibt es nicht mehr
    r = setzeTakt(hin, "werktag", [zeile(min(6), min(7), 15)], L);
    expect(r.ok && r.verworfen.map((a) => a.art)).toEqual(["streichen", "verschieben"]);
    expect(hin.aenderungen.map((a) => a.art)).toEqual(["zusatz"]);
    expect(stelleFahrtWiederHer(hin, "werktag", sek(6, 15))).toBe(false);
  });

  it("Ferien: ohne eigenen Ferientakt gilt der Takt ohne Ferien, mit eigenem Ferientakt ein eigener", () => {
    const { net, netz, halte, l, hin } = kurzLinie();
    setzeTakt(hin, "werktag", [zeile(min(6), min(7), 30)], L);
    setzeEigenenFerientakt(netz, hin, "werktag", true);
    expect(hin.takt.werktagFerien).toEqual(hin.takt.werktag);
    setzeTakt(hin, "werktagFerien", [zeile(min(6), min(7), 60)], L);
    const plan = berechneLinie(net, planAnfrage(l, halte, null), L, R);
    const n = (t: PlanTag) => plan.tage[t].fahrten.filter((f) => f.variante === hin.id).length;
    expect([n("werktag"), n("werktagFerien")]).toEqual([2, 1]);
    setzeEigenenFerientakt(netz, hin, "werktag", false);
    expect(hin.takt.werktagFerien).toEqual([]);
  });

  it("Takt nach Mitternacht gehört zum Betriebstag (bis 4 Uhr), Uhrzeiten werden gelesen und geschrieben", () => {
    expect(taktAbfahrten([zeile(min(23), min(25), 30)]).map((s) => uhrzeit(s))).toEqual(["23:00", "23:30", "24:00", "24:30"]);
    expect(leseUhrzeit("01:30", L)).toBe(sek(25, 30));
    expect(leseUhrzeit("4:00", L)).toBe(sek(4));
    expect(leseUhrzeit("27:59", L)).toBe(sek(27, 59));
    expect(leseUhrzeit("28:00", L)).toBeNull();
    expect(leseUhrzeit("12:61", L)).toBeNull();
    expect(leseUhrzeit("abc", L)).toBeNull();
    expect(leseUhrzeit("06:00:04", L)).toBe(sek(6));
  });

  it("Prüfung von Takt, Standzeit und Wendezeit (A3b-5 bis A3b-7)", () => {
    expect(pruefeTaktZeile(zeile(min(6), min(7), 10), L)).toBeNull();
    expect(pruefeTaktZeile(zeile(min(3), min(7), 10), L)).toBe("zeit");
    expect(pruefeTaktZeile(zeile(min(7), min(6), 10), L)).toBe("bereich");
    expect(pruefeTaktZeile(zeile(min(6), min(7), 1), L)).toBe("takt");
    expect(pruefeTaktZeile(zeile(min(6), min(7), 241), L)).toBe("takt");
    expect(pruefeTaktZeile(zeile(min(6), min(7), 2.5), L)).toBe("takt");
    const { hin } = kurzLinie();
    expect(setzeTakt(hin, "werktag", [zeile(min(6), min(7), 10), zeile(min(8), min(7), 10)], L)).toEqual({ ok: false, fehler: "bereich", zeile: 1 });
    expect(setzeStandzeit(hin.perlen, 1, 60, L)).toBe(true);
    expect(setzeStandzeit(hin.perlen, 1, 65, L)).toBe(false);
    expect(setzeStandzeit(hin.perlen, 1, L.standzeitMaxS + 10, L)).toBe(false);
    expect(setzeWendezeit(hin, 600, L)).toBe(true);
    expect(setzeWendezeit(hin, -10, L)).toBe(false);
    expect(setzeWendezeit(hin, L.wendezeitMaxS + 10, L)).toBe(false);
    expect(setzeTakt(hin, "werktag", [zeile(min(6), min(7), 10)], L).ok).toBe(true);
    expect(verschiebeFahrt(hin, "werktag", sek(6, 5), sek(6, 7), L)).toBe("unbekannt");
    expect(verschiebeFahrt(hin, "werktag", sek(6), sek(2), L)).toBe("zeit");
  });
});

describe("Bedarf an Bussen (Kriterium 10, Handrechnung)", () => {
  it("Umlaufzeit = Hin + Rück + Wendezeiten, Busse = Umlaufzeit / Takt aufgerundet", () => {
    // Sonntag: Hin 110 s, Rück 100 s (siehe Fahrzeiten), Wendezeit je 5 min: 110 + 100 + 300 + 300 = 810 s; Takt 5 min -> 3 Busse
    const { net, netz, halte } = handNetz();
    const l = linieMit(netz, halte, [1, 3]);
    const [hin, rueck] = l.varianten;
    setzeTakt(hin, "sonnFeiertag", [zeile(min(8), min(10), 5)], L);
    // Rückfahrten passend gelegt: Ankunft am Ende 8:01:50, frei ab 8:06:50, Rückfahrt 8:07
    setzeTakt(rueck, "sonnFeiertag", [zeile(min(8, 7), min(10, 7), 5)], L);
    const plan = berechneLinie(net, planAnfrage(l, halte, null), L, R);
    const t = plan.tage.sonnFeiertag;
    const f = t.fahrten[0];
    expect(f.ankunftS - f.abfahrtS).toBe(110);
    expect(t.fahrten.find((x) => x.variante === rueck.id)!.ankunftS - t.fahrten.find((x) => x.variante === rueck.id)!.abfahrtS).toBe(100);
    expect(t.busbedarf).toBe(Math.ceil((110 + 100 + 300 + 300) / 300));
    expect(t.busbedarf).toBe(3);
    expect(plan.tage.werktag.busbedarf).toBe(0);
  });

  it("ungünstig gelegte Rückfahrten brauchen einen Bus mehr als die Handrechnung (Wartezeit am Endpunkt)", () => {
    const { net, netz, halte } = handNetz();
    const l = linieMit(netz, halte, [1, 3]);
    const [hin, rueck] = l.varianten;
    setzeTakt(hin, "sonnFeiertag", [zeile(min(8), min(10), 5)], L);
    setzeTakt(rueck, "sonnFeiertag", [zeile(min(8), min(10), 5)], L);
    expect(berechneLinie(net, planAnfrage(l, halte, null), L, R).tage.sonnFeiertag.busbedarf).toBe(4);
  });

  it("Verkettung nach Ort und Wendezeit", () => {
    const f = (v: number, ab: number, an: number, von: string, nach: string, w = 0): UmlaufFahrt => ({ variante: v, schluessel: `t${ab}`, abfahrtS: ab, ankunftS: an, startOrt: von, zielOrt: nach, wendezeitS: w });
    expect(verkette([f(1, 0, 100, "A", "B", 50), f(2, 150, 250, "B", "A"), f(1, 200, 300, "A", "B")])).toHaveLength(2);
    expect(verkette([f(1, 0, 100, "A", "B", 50), f(2, 149, 250, "B", "A")])).toHaveLength(2);
    expect(verkette([f(1, 0, 100, "A", "B", 50), f(2, 150, 250, "C", "A")])).toHaveLength(2);
    expect(verkette([])).toEqual([]);
  });

  it("gestrichene Fahrten zählen nicht, deaktivierte Linien erzeugen keine Fahrten", () => {
    const { net, netz, halte } = handNetz();
    const l = linieMit(netz, halte, [1, 3]);
    const [hin] = l.varianten;
    setzeTakt(hin, "werktag", [zeile(min(6), min(6, 1), 5)], L);
    streicheFahrt(hin, "werktag", sek(6));
    expect(berechneLinie(net, planAnfrage(l, halte, null), L, R).tage.werktag.busbedarf).toBe(0);
    stelleFahrtWiederHer(hin, "werktag", sek(6));
    expect(berechneLinie(net, planAnfrage(l, halte, null), L, R).tage.werktag.busbedarf).toBe(1);
    setzeAktiv(netz, l.id, false);
    const p = berechneLinie(net, planAnfrage(l, halte, null), L, R);
    expect(p.tage.werktag.fahrten).toEqual([]);
    expect(p.varianten[0].vollstaendig).toBe(true);
  });

  it("Ausrückzeit vom Betriebshof zur ersten Haltestelle", () => {
    const { net, netz, halte } = handNetz();
    const l = linieMit(netz, halte, [2, 3]);
    const [hin] = l.varianten;
    setzeTakt(hin, "sonnFeiertag", [zeile(min(8), min(8, 1), 5)], L);
    // Hof am Anfang von Abschnitt 0: bis zur Mitte (Abschnitt 1, Anteil 0,5) 40 + 20 = 60 s, × 1,1 = 66, + 10 = 76 -> 80 s
    const hof = [{ edge: 0, t: 0, dist: 0, point: net.edges[0].coords[0] }];
    const p = berechneLinie(net, planAnfrage(l, halte, hof), L, R);
    expect(p.varianten[0].ausrueck!.fahrS).toBeCloseTo(60, 6);
    expect(p.tage.sonnFeiertag.umlaeufe[0].ausrueck).toEqual({ abHofS: sek(8) - 80, fahrzeitS: 80 });
  });

  it("gleiche Anfrage, gleiches Ergebnis (deterministisch)", () => {
    const { net, netz, halte } = handNetz();
    const l = linieMit(netz, halte, [1, 2, 3]);
    for (const v of l.varianten) setzeTakt(v, "werktag", [zeile(min(5), min(24), 7)], L);
    const a = planAnfrage(l, halte, null);
    expect(JSON.stringify(berechneLinie(net, a, L, R))).toBe(JSON.stringify(berechneLinie(net, structuredClone(a), L, R)));
  });
});

describe("Linien, Haltestellen und Varianten", () => {
  it("Liniennummer eindeutig (ohne Unterschied der Schreibweise), höchstens 6 Zeichen, Name und Farbe Pflicht", () => {
    const netz = neuesNetz();
    expect(legeLinieAn(netz, { nummer: "N1", name: "Nacht", farbe: "#000000" }, L).ok).toBe(true);
    expect(legeLinieAn(netz, { nummer: "n1", name: "x", farbe: "#000000" }, L)).toEqual({ ok: false, fehler: "nummerDoppelt" });
    expect(legeLinieAn(netz, { nummer: "1234567", name: "x", farbe: "#000000" }, L)).toEqual({ ok: false, fehler: "nummerZuLang" });
    expect(legeLinieAn(netz, { nummer: " ", name: "x", farbe: "#000000" }, L)).toEqual({ ok: false, fehler: "nummerLeer" });
    expect(legeLinieAn(netz, { nummer: "X20", name: "", farbe: "#000000" }, L)).toEqual({ ok: false, fehler: "nameLeer" });
    expect(legeLinieAn(netz, { nummer: "X20", name: "Express", farbe: "rot" }, L)).toEqual({ ok: false, fehler: "farbe" });
    const x = legeLinieAn(netz, { nummer: "X20", name: "Express", farbe: "#00FF00" }, L);
    expect(x.ok && x.linie.farbe).toBe("#00ff00");
    expect(aendereLinie(netz, netz.linien[1].id, { nummer: "N1", name: "Express", farbe: "#00ff00" }, L)).toBe("nummerDoppelt");
    expect(aendereLinie(netz, netz.linien[1].id, { nummer: "X21", name: "Express", farbe: "#00ff00" }, L)).toBeNull();
    expect(vorschlagFarbe(neuesNetz(), L)).toBe(L.farben[0]);
  });

  it("neue Haltestelle nur in freigeschalteten Gebieten und an einer Busstraße, umbenennen, löschen nur ungenutzt", () => {
    const { net, netz, halte } = handNetz();
    const s = halt(net, 9, "", 1, 0.25).snaps;
    expect(neueHaltestelle(netz, "Neu", [10, 53.7], s, false, L)).toEqual({ ok: false, fehler: "gesperrt" });
    expect(neueHaltestelle(netz, "Neu", [10, 53.7], [], true, L)).toEqual({ ok: false, fehler: "ohneNetz" });
    expect(neueHaltestelle(netz, " ", [10, 53.7], s, true, L)).toEqual({ ok: false, fehler: "nameLeer" });
    const n = neueHaltestelle(netz, "Neu", [10, 53.7], s, true, L);
    expect(n.ok && n.halt.id).toBe("n1");
    expect(halte.hole("n1")?.name).toBe("Neu");
    expect(benenneHaltestelle(netz, halte, "o1", "Anfang Süd", L)).toBeNull();
    expect(halte.hole("o1")?.name).toBe("Anfang Süd");
    expect(benenneHaltestelle(netz, halte, "o99", "x", L)).toBe("unbekannt");
    const l = linieMit(netz, halte, [1]);
    expect(fuegeHaltEin(l.perlen, halte, "n1", frei, L)).toBeNull();
    expect(loescheHaltestelle(netz, "n1")).toBe("benutzt");
    entfernePerle(l.perlen, 1);
    expect(loescheHaltestelle(netz, "n1")).toBeNull();
    expect(halte.hole("n1")).toBeNull();
  });

  it("Haltestelle einfügen: nicht ohne Netz, nicht in gesperrten Gebieten, nicht zweimal hintereinander", () => {
    const { netz, halte } = handNetz();
    const stops = [...halte.alle()];
    const ohne = { id: 50, name: "Fern", coord: [11, 54] as [number, number], snaps: [] };
    const h2 = new Haltestellen([...stops.map((s) => ({ id: Number(s.id.slice(1)), name: s.name, coord: s.coord, snaps: s.snaps })), ohne], netz);
    const p: Perle[] = [];
    expect(fuegeHaltEin(p, h2, "o50", frei, L)).toBe("ohneNetz");
    expect(fuegeHaltEin(p, h2, "o1", () => false, L)).toBe("gesperrt");
    expect(fuegeHaltEin(p, h2, "o1", frei, L)).toBeNull();
    expect(fuegeHaltEin(p, h2, "o1", frei, L)).toBe("doppelt");
    expect(fuegeHaltEin(p, h2, "o2", frei, L, 0)).toBeNull();
    expect(verschiebePerle(p, 0, 1)).toBe(true);
    expect((p as { halt: string }[]).map((x) => x.halt)).toEqual(["o1", "o2"]);
  });

  it("Gegenhaltestelle: gleicher Name im Umkreis von 100 m, sonst dieselbe; Rückrichtung umgekehrt", () => {
    const net = geradenNetz(4, { laengeM: 400 });
    const stops = [halt(net, 1, "Rathaus", 0, 0.5), halt(net, 2, "Rathaus", 0, 0.55), halt(net, 3, "Markt", 2, 0.5), halt(net, 4, "Markt", 1, 0.1)];
    // Gegenhaltestelle von 3 ("Markt"): 4 liegt mehr als 100 m entfernt
    const netz = neuesNetz();
    const halte = new Haltestellen(stops, netz);
    expect(gegenhaltestelle("o1", halte, L)).toBe("o2");
    expect(gegenhaltestelle("o3", halte, L)).toBe("o3");
    const l = linieMit(netz, halte, [1, 3]);
    expect(l.varianten.map((v) => [v.art, v.perlen.map((p) => (p.art === "halt" ? p.halt : "w"))])).toEqual([["hin", ["o1", "o3"]], ["rueck", ["o3", "o2"]]]);
    expect(l.varianten.map((v) => v.name)).toEqual(["Rathaus nach Markt", "Markt nach Rathaus"]);
    // Neu erzeugen behält Takt und Wendezeit
    setzeTakt(l.varianten[0], "werktag", [zeile(min(6), min(7), 10)], L);
    setzeWendezeit(l.varianten[0], 120, L);
    erzeugeRichtungen(netz, l, halte, L, "nach");
    expect(l.varianten).toHaveLength(2);
    expect(l.varianten[0].takt.werktag).toHaveLength(1);
    expect(l.varianten[0].wendezeitS).toBe(120);
    // Orte für die Verkettung: Rathaus 1 und 2 sind ein Ort
    const o = orte([halte.hole("o1")!, halte.hole("o2")!, halte.hole("o3")!], L);
    expect(o.get("o1")).toBe(o.get("o2"));
    expect(o.get("o3")).not.toBe(o.get("o1"));
  });

  it("Kurzläufer nur als echte Teilstrecke", () => {
    const { netz, halte } = handNetz();
    const l = linieMit(netz, halte, [1, 2, 3]);
    expect(legeKurzlaeuferAn(netz, l, l.varianten[0].id, 1, 1, halte, L, "nach")).toEqual({ ok: false, fehler: "bereich" });
    expect(legeKurzlaeuferAn(netz, l, l.varianten[0].id, 0, 3, halte, L, "nach")).toEqual({ ok: false, fehler: "bereich" });
    expect(legeKurzlaeuferAn(netz, l, 999, 0, 1, halte, L, "nach")).toEqual({ ok: false, fehler: "unbekannt" });
    const k = legeKurzlaeuferAn(netz, l, l.varianten[1].id, 1, 2, halte, L, "nach");
    expect(k.ok && k.variante.name).toBe("Mitte nach Anfang");
    expect(l.varianten.map((v) => v.art)).toEqual(["hin", "rueck", "kurz"]);
  });

  it("Bus einer Linie zuweisen: höchstens eine Linie je Bus, Verkauf nimmt ihn heraus", () => {
    const netz = neuesNetz();
    const a = legeLinieAn(netz, { nummer: "1", name: "A", farbe: "#000000" }, L);
    const b = legeLinieAn(netz, { nummer: "2", name: "B", farbe: "#000000" }, L);
    if (!a.ok || !b.ok) throw new Error();
    weiseBusZu(netz, a.linie.id, 7);
    weiseBusZu(netz, b.linie.id, 7);
    expect([a.linie.busse, b.linie.busse]).toEqual([[], [7]]);
    expect(linieVonBus(netz, 7)?.nummer).toBe("2");
    entferneBus(netz, 7);
    expect(b.linie.busse).toEqual([]);
  });
});

describe("Passt der Bus zur Linie? (Kriterium 11)", () => {
  it("Warnung für lange Busse auf engen Straßen, für großen Wendekreis beim Wenden in einer Sackgasse, Meldung ohne Wendekreis", () => {
    // Linie fährt über eine Spielstraße und wendet am Ende in der Sackgasse
    const net = geradenNetz(3, { klasse: { 2: "living_street", 3: "living_street" } });
    const stops = [halt(net, 1, "A", 0, 0.5), halt(net, 2, "B", 1, 0.9)];
    stops[0].snaps = [stops[0].snaps[0]];
    stops[1].snaps = [stops[1].snaps[1]]; // B nur in Gegenrichtung: der Bus muss am Ende der Straße wenden
    const netz = neuesNetz();
    const halte = new Haltestellen(stops, netz);
    const l = legeLinieAn(netz, { nummer: "1", name: "x", farbe: "#000000" }, L);
    if (!l.ok) throw new Error();
    fuegeHaltEin(l.linie.perlen, halte, "o1", frei, L);
    fuegeHaltEin(l.linie.perlen, halte, "o2", frei, L);
    erzeugeRichtungen(netz, l.linie, halte, L, "nach");
    l.linie.varianten.splice(1, 1);
    const plan = berechneLinie(net, planAnfrage(l.linie, halte, null), L, R);
    expect(plan.varianten[0].strecke.wendetInSackgasse).toBe(true);
    expect(plan.varianten[0].strecke.engeKlassen).toEqual(["living_street"]);
    expect(passtZurLinie({ laenge_mm: 18000, wendekreis_mm: 26000 }, plan.varianten, L)).toEqual([
      { code: "lang", laengeM: 18, klassen: ["living_street"] },
      { code: "wendekreis", wendekreisM: 26 },
    ]);
    expect(passtZurLinie({ laenge_mm: 12000, wendekreis_mm: 21000 }, plan.varianten, L)).toEqual([]);
    expect(passtZurLinie({ laenge_mm: 12000, wendekreis_mm: null }, plan.varianten, L)).toEqual([{ code: "wendekreisFehlt" }]);
    expect(passtZurLinie({ laenge_mm: 15000, wendekreis_mm: 25000 }, plan.varianten, L)).toEqual([]);
  });
});

describe("Tagesart eines Datums (Kriterium 9)", () => {
  const tag = (j: number, m: number, d: number, h = 12, min = 0) => planTag(civil(j, m, d, h, min), "DE-SH", schulferien, L);
  it("Werktag, Samstag, Sonntag, Feiertag, Schulferien Schleswig-Holstein, Betriebstag ab 4 Uhr", () => {
    expect(tag(2026, 11, 25).tag).toBe("werktag");
    expect(tag(2026, 11, 28).tag).toBe("samstag");
    expect(tag(2026, 11, 29).tag).toBe("sonnFeiertag");
    expect(tag(2026, 12, 22).tag).toBe("werktagFerien"); // Weihnachtsferien SH ab 21.12.2026
    expect(tag(2026, 12, 25).tag).toBe("sonnFeiertagFerien"); // 1. Weihnachtstag in den Ferien
    expect(tag(2026, 12, 26).tag).toBe("sonnFeiertagFerien");
    expect(tag(2027, 1, 2).tag).toBe("samstagFerien");
    expect(tag(2026, 10, 3).tag).toBe("sonnFeiertag"); // Tag der Deutschen Einheit, Samstag
    // 3:59 Uhr gehört noch zum Vortag, 4:00 Uhr nicht mehr
    expect(tag(2026, 11, 30, 3, 59)).toEqual({ tag: "sonnFeiertag", betriebstag: "2026-11-29", sekunde: sek(27, 59) });
    expect(tag(2026, 11, 30, 4, 0)).toEqual({ tag: "werktag", betriebstag: "2026-11-30", sekunde: sek(4) });
    // Ohne Ferientabelle keine Ferien
    expect(planTag(civil(2026, 12, 22, 12), null, schulferien, L).tag).toBe("werktag");
  });
});
