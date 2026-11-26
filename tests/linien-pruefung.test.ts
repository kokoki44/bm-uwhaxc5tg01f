import { describe, expect, it } from "vitest";
import raw from "../src/config/config.json";
import { config, validateConfig } from "../src/config";
import { abschnittZeitS } from "../src/linien/fahrplan";
import {
  entferneZusatz, ersetzeHalt, erzeugeRichtungen, fuegeFahrtHinzu, fuegeHaltEin, gegenhaltestelle, Haltestellen, legeLinieAn, osmHaltId, planAnfrage,
  setzeEigenenFerientakt, setzeTakt, streicheFahrt, verschiebeFahrt, verschiebeZusatz,
} from "../src/linien/linien";
import { bereinigeAnschluesse } from "../src/linien/speichern";
import { berechneStrecke } from "../src/linien/strecke";
import { neuesNetz } from "../src/linien/typen";
import { freierRand, sichtbarerAnteil } from "../src/map/linienkarte";
import { HaltIndex, haltLage } from "../src/linien/richtung";
import { LocalProj } from "../src/world/geo";
import { geradenNetz, halt } from "./helpers/linien-netz";

// Regressionstests zu den Befunden der unabhängigen Prüfung von Etappe 3b.
const L = config.linien;
const frei = () => true;

describe("Regressionen Prüfung Etappe 3b", () => {
  it("gespeicherte Netzanschlüsse, die nicht zur geladenen Karte passen, fallen weg (kein Absturz, Perle ohne Netz)", () => {
    const net = geradenNetz(3);
    const netz = neuesNetz();
    const gut = halt(net, 1, "A", 0, 0.5).snaps;
    netz.neueHaltestellen.push({ id: "n1", name: "Neu", coord: gut[0].point, snaps: [...gut, { edge: 999, t: 0.5, dist: 0, point: gut[0].point }] });
    const l = legeLinieAn(netz, { nummer: "1", name: "x", farbe: "#000000" }, L);
    if (!l.ok) throw new Error();
    // Wegpunkt mit Abschnitt, der weit weg vom gespeicherten Punkt liegt
    l.linie.perlen.push({ art: "weg", coord: [11, 54], snaps: [{ edge: 0, t: 0.5, dist: 0, point: [11, 54] }] });
    const weg = bereinigeAnschluesse(netz, net, new LocalProj(10, 53.7), config.stops.fangradiusM);
    expect(weg).toBe(2);
    expect(netz.neueHaltestellen[0].snaps).toEqual(gut);
    expect(l.linie.perlen[0].art === "weg" && l.linie.perlen[0].snaps).toEqual([]);
    // Die Route meldet die Perle als ohne Netz statt abzustürzen
    expect(berechneStrecke(net, [{ halt: null, coord: [11, 54], snaps: [], standzeitS: 0 }, { halt: null, coord: gut[0].point, snaps: gut, standzeitS: 0 }], L, config.roads).ohneNetz).toEqual([0]);
  });

  it("Gegenhaltestelle nur in freigeschalteten Gebieten", () => {
    const net = geradenNetz(3);
    const netz = neuesNetz();
    const halte = new Haltestellen([halt(net, 1, "Markt", 0, 0.5), halt(net, 2, "Markt", 0, 0.55), halt(net, 3, "Ende", 1, 0.5)], netz);
    expect(gegenhaltestelle("o1", halte, L)).toBe("o2");
    expect(gegenhaltestelle("o1", halte, L, (h) => h.id !== "o2")).toBe("o1");
    const l = legeLinieAn(netz, { nummer: "1", name: "x", farbe: "#000000" }, L);
    if (!l.ok) throw new Error();
    fuegeHaltEin(l.linie.perlen, halte, "o1", frei, L);
    fuegeHaltEin(l.linie.perlen, halte, "o3", frei, L);
    erzeugeRichtungen(netz, l.linie, halte, L, "nach", (h) => h.id !== "o2");
    expect(l.linie.varianten[1].perlen.map((p) => (p.art === "halt" ? p.halt : ""))).toEqual(["o3", "o1"]);
  });

  it("Ersetzen einer Haltestelle durch die Nachbarhaltestelle wird abgelehnt (doppelt)", () => {
    const net = geradenNetz(3);
    const netz = neuesNetz();
    const halte = new Haltestellen([halt(net, 1, "A", 0, 0.5), halt(net, 2, "B", 1, 0.5)], netz);
    const p: Parameters<typeof fuegeHaltEin>[0] = [];
    fuegeHaltEin(p, halte, "o1", frei, L);
    fuegeHaltEin(p, halte, "o2", frei, L);
    expect(ersetzeHalt(p, 1, halte, "o1", frei)).toBe("doppelt");
    expect(p.map((x) => (x.art === "halt" ? x.halt : ""))).toEqual(["o1", "o2"]);
  });

  it("eigener Ferientakt übernimmt Takt und Änderungen; zusätzliche Fahrten bekommen neue Nummern", () => {
    const netz = neuesNetz();
    const net = geradenNetz(3);
    const halte = new Haltestellen([halt(net, 1, "A", 0, 0.5), halt(net, 2, "B", 1, 0.5)], netz);
    const l = legeLinieAn(netz, { nummer: "1", name: "x", farbe: "#000000" }, L);
    if (!l.ok) throw new Error();
    fuegeHaltEin(l.linie.perlen, halte, osmHaltId(1), frei, L);
    fuegeHaltEin(l.linie.perlen, halte, osmHaltId(2), frei, L);
    erzeugeRichtungen(netz, l.linie, halte, L, "nach");
    const v = l.linie.varianten[0];
    setzeTakt(v, "werktag", [{ vonMin: 360, bisMin: 420, taktMin: 20 }], L);
    streicheFahrt(v, "werktag", 6 * 3600);
    const z = fuegeFahrtHinzu(netz, v, "werktag", 7 * 3600, L);
    if (!z.ok) throw new Error();
    setzeEigenenFerientakt(netz, v, "werktag", true);
    const ferien = v.aenderungen.filter((a) => a.tag === "werktagFerien");
    expect(ferien.map((a) => a.art)).toEqual(["streichen", "zusatz"]);
    const fz = ferien.find((a) => a.art === "zusatz")!;
    expect(fz.art === "zusatz" && fz.id).not.toBe(z.id);
    // Änderungen am Ferientag betreffen den Werktag nicht mehr
    verschiebeFahrt(v, "werktagFerien", 6 * 3600 + 20 * 60, 6 * 3600 + 25 * 60, L);
    expect(v.aenderungen.filter((a) => a.tag === "werktag").map((a) => a.art)).toEqual(["streichen", "zusatz"]);
    expect(planAnfrage(l.linie, halte, null).varianten[0].takt.werktagFerien).toEqual(v.takt.werktag);
  });

  it("zusätzliche Fahrten verschieben und entfernen", () => {
    const netz = neuesNetz();
    const l = legeLinieAn(netz, { nummer: "1", name: "x", farbe: "#000000" }, L);
    if (!l.ok) throw new Error();
    const v = { id: 1, art: "hin" as const, name: "", perlen: [], wendezeitS: 0, takt: { werktag: [], werktagFerien: [], samstag: [], samstagFerien: [], sonnFeiertag: [], sonnFeiertagFerien: [] }, eigenerFerientakt: { werktag: false, samstag: false, sonnFeiertag: false }, aenderungen: [] };
    const z = fuegeFahrtHinzu(netz, v, "samstag", 8 * 3600, L);
    if (!z.ok) throw new Error();
    expect(verschiebeZusatz(v, z.id, 8 * 3600 + 600, L)).toBeNull();
    expect(v.aenderungen).toEqual([{ art: "zusatz", tag: "samstag", id: z.id, abfahrtS: 8 * 3600 + 600 }]);
    expect(verschiebeZusatz(v, z.id, 3600, L)).toBe("zeit");
    expect(verschiebeZusatz(v, 999, 9 * 3600, L)).toBe("unbekannt");
    expect(entferneZusatz(v, z.id)).toBe(true);
    expect(entferneZusatz(v, z.id)).toBe(false);
    expect(v.aenderungen).toEqual([]);
  });

  it("Kreuzungszuschlag 2 s nach dem Faktor (Handrechnung): 80 × 1,2 + 2 + 15 + 10 = 123 -> 120 s", () => {
    const net = geradenNetz(4, { kreuzung: [0], signale: { 2: 1 } });
    const s = berechneStrecke(net, [
      { halt: { id: "a", name: "A", coord: [0, 0], snaps: [] }, coord: [0, 0], snaps: [halt(net, 1, "A", 0, 0.5).snaps[0]], standzeitS: 0 },
      { halt: { id: "b", name: "B", coord: [0, 0], snaps: [] }, coord: [0, 0], snaps: [halt(net, 2, "B", 2, 0.5).snaps[0]], standzeitS: 0 },
    ], L, config.roads);
    expect(s.abschnitte[0].zuschlagS).toBe(config.roads.kreuzungZuschlagS + config.roads.ampelZuschlagS);
    expect(abschnittZeitS(s.abschnitte[0], "werktag", 12 * 3600, L)).toBe(120);
  });

  it("Zoom auf die Linie lässt die Fenster frei: links und rechts verdeckte Ränder, zu schmal ergibt den einfachen Rand", () => {
    const karte = { left: 0, top: 60, right: 1600, bottom: 900 };
    const menue = { left: 12, top: 72, right: 150, bottom: 300 };
    const editor = { left: 160, top: 72, right: 736, bottom: 880 };
    const rechts = { left: 1100, top: 72, right: 1588, bottom: 600 };
    expect(freierRand(karte, [menue, editor], 40, 240)).toEqual({ top: 40, bottom: 40, left: 776, right: 40 });
    expect(freierRand(karte, [editor, rechts], 40, 240)).toEqual({ top: 40, bottom: 40, left: 776, right: 540 });
    // Fenster außerhalb der Karte zählen nicht
    expect(freierRand(karte, [{ left: 0, top: 0, right: 1600, bottom: 50 }], 40, 240)).toEqual({ top: 40, bottom: 40, left: 40, right: 40 });
    // Bleiben weniger als 240 px frei, bleibt die linke Seite (Editor) frei, das rechte Fenster darf die Linie verdecken
    expect(freierRand({ ...karte, right: 1280 }, [editor, { left: 815, top: 72, right: 1268, bottom: 290 }], 40, 240)).toEqual({ top: 40, bottom: 40, left: 776, right: 40 });
    // Reicht auch das nicht, nur die rechte Seite, zuletzt der einfache Rand
    expect(freierRand({ ...karte, right: 1000 }, [{ ...editor, right: 800 }, { left: 950, top: 72, right: 990, bottom: 600 }], 40, 240)).toEqual({ top: 40, bottom: 40, left: 40, right: 90 });
    expect(freierRand({ ...karte, right: 1000 }, [{ ...editor, right: 800 }, { left: 300, top: 72, right: 990, bottom: 600 }], 40, 240)).toEqual({ top: 40, bottom: 40, left: 40, right: 40 });
    expect(sichtbarerAnteil([[800, 400], [400, 400], [1700, 400], [1000, 500]], karte, [editor])).toBe(0.5);
    expect(sichtbarerAnteil([], karte, [])).toBe(0);
  });

  it("Lage einer Haltestelle: nächste Haltestelle auf derselben Straße, sonst auf dem Netz, sonst nur die Straße", () => {
    const net = geradenNetz(4); // Abschnitte "Weg 0" bis "Weg 2", je 400 m
    const ein = (id: string, name: string, edge: number, t: number) => ({ id, name, snaps: [{ edge, t, dist: 0, point: [0, 0] as [number, number] }] });
    const a = ein("a", "A", 0, 0.5);
    // gleicher Abschnitt dahinter, gleichnamige Haltestelle zählt nicht
    let idx = new HaltIndex([a, ein("a2", "A", 0, 0.6), ein("b", "B", 0, 0.8), ein("c", "C", 2, 0.1)]);
    expect(haltLage(net, idx, a, 2000)).toEqual({ art: "richtung", strasse: "Weg 0", naechste: "B" });
    // nichts auf derselben Straße: nächste auf dem Netz (Weg 1)
    idx = new HaltIndex([a, ein("c", "C", 2, 0.1), ein("d", "D", 4, 0.1)]);
    expect(haltLage(net, idx, a, 2000)).toEqual({ art: "richtung", strasse: "Weg 0", naechste: "C" });
    // gleiche Straße hat Vorrang vor einer näheren Haltestelle auf einer anderen Straße
    net.edges[4].name = net.edges[5].name = "Weg 0";
    net.edges[2].name = net.edges[3].name = "Weg 0";
    expect(haltLage(net, new HaltIndex([a, ein("d", "D", 4, 0.1)]), a, 2000)).toEqual({ art: "richtung", strasse: "Weg 0", naechste: "D" });
    // Haltestelle hinter dem Start in Gegenrichtung zählt nicht; nichts in Reichweite: nur die Straße
    expect(haltLage(net, new HaltIndex([a, ein("z", "Z", 1, 0.9), ein("d", "D", 4, 0.9)]), a, 500)).toEqual({ art: "strasse", strasse: "Weg 0" });
    // Haltestelle direkt auf der Straße (beide Richtungen)
    expect(haltLage(net, new HaltIndex([]), { ...halt(net, 9, "M", 1, 0.5), id: "o9" }, 2000)).toEqual({ art: "beide", strasse: "Weg 0" });
  });

  it("die Konfiguration lehnt Verkehrsfaktoren unter 1 und Lücken in der Tabelle ab", () => {
    const mit = (f: (c: typeof raw) => void) => {
      const c = structuredClone(raw);
      f(c);
      return () => validateConfig(c);
    };
    expect(mit(() => {})).not.toThrow();
    expect(mit((c) => (c.linien.verkehrsfaktor.werktag[0][2] = 0.95))).toThrow(/verkehrsfaktor.werktag/);
    expect(mit((c) => (c.linien.verkehrsfaktor.samstag[1][0] = 11))).toThrow(/verkehrsfaktor.samstag/);
    expect(mit((c) => (c.linien.verkehrsfaktor.sonnFeiertag[0][1] = 23))).toThrow(/verkehrsfaktor.sonnFeiertag/);
    expect(mit((c) => (c.linien.neueTaktzeile.taktMin = 1))).toThrow(/neueTaktzeile/);
  });
});
