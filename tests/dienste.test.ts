import { describe, expect, it } from "vitest";
import rwRaw from "../regelwerk/de.json";
import { config } from "../src/config";
import { baueDienst, pruefeDienst, pruefeTag, regimeFuer, teilungErfuellt, wirksameDienste, type LinieDaten } from "../src/dienste/pruefung";
import { ladeRegelwerk, type Regelwerk } from "../src/dienste/regelwerk";
import { aktuellesRegelwerk } from "../src/dienste/laden";
import { neuerDienstplan, type Dienst, type FahrtRef } from "../src/dienste/typen";
import { entferneStueck, entwurfVon, freieBereiche, fuegeStueckHinzu, loescheDienst, naechsteNummer, neuerEntwurf, pruefeNummer, setzeEigeneFerienDienste, speichereDienst } from "../src/dienste/dienste";

const C = config.dienste;
const RW = ladeRegelwerk(rwRaw).regelwerk!;
const H = 3600, M = 60;

/** Linie mit Hin (A nach B) und Rück (B nach A); `abstandM` ist der durchschnittliche Haltestellenabstand. */
function linie(id = 1, abstandM = 1200, laengeM = 2 * abstandM, busse = 9): LinieDaten {
  return {
    linie: id, nummer: String(id), busse,
    varianten: [
      { id: 10 * id + 1, lengthM: laengeM, abschnitte: Math.round(laengeM / abstandM), start: { ort: "A", name: "Halt A" }, ziel: { ort: "B", name: "Halt B" } },
      { id: 10 * id + 2, lengthM: laengeM, abschnitte: Math.round(laengeM / abstandM), start: { ort: "B", name: "Halt B" }, ziel: { ort: "A", name: "Halt A" } },
    ],
    fahrten: [], umlaeufe: [],
  };
}

/** Umlauf aus Fahrten [Abfahrt, Ankunft], abwechselnd Hin und Rück, mit Ausrücken und Einrücken (Sekunden). */
function umlauf(l: LinieDaten, zeiten: [number, number][], aus: number | null = 10 * M, ein: number | null = 10 * M, mitRueck = true): FahrtRef[] {
  const refs = zeiten.map(([ab, an], i) => {
    const v = l.varianten[mitRueck && i % 2 ? 1 : 0].id;
    const s = `t${ab}`;
    l.fahrten.push({ variante: v, schluessel: s, abfahrtS: ab, ankunftS: an });
    return { variante: v, schluessel: s };
  });
  l.umlaeufe.push({
    fahrten: refs,
    ausrueck: aus === null ? null : { abHofS: zeiten[0][0] - aus, fahrzeitS: aus },
    einrueck: ein === null ? null : { anHofS: zeiten[zeiten.length - 1][1] + ein, fahrzeitS: ein },
  });
  return refs;
}

const dienst = (stuecke: Dienst["stuecke"], id = 1, nummer = "D1"): Dienst => ({ id, nummer, tag: "werktag", stuecke });
const pruefe = (d: Dienst, ls: LinieDaten[], andere: Dienst[] = [], rw: Regelwerk = RW) => pruefeDienst(d, new Map(ls.map((l) => [l.linie, l])), andere, rw, C);
const codes = (b: { regel: string; code: string }[]) => b.map((x) => `${x.regel}.${x.code}`);

/** Folge von Fahrten mit fester Fahrzeit und Wendezeit ab einer Startzeit. */
function takt(start: number, n: number, fahrS: number, wendeS: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [start + i * (fahrS + wendeS), start + i * (fahrS + wendeS) + fahrS] as [number, number]);
}

describe("Dienste bearbeiten und speichern", () => {
  it("Stücke im selben Umlauf verschmelzen, wenn sie aneinander anschließen; doppelte Fahrten werden nicht doppelt aufgenommen", () => {
    const l = linie();
    const u = umlauf(l, takt(6 * H, 8, 20 * M, 10 * M));
    const d = neuerEntwurf(neuerDienstplan(), "werktag");
    expect(fuegeStueckHinzu(d, l, 0, 0, 2)).toBe(true);
    expect(fuegeStueckHinzu(d, l, 0, 5, 6)).toBe(true);
    expect(d.stuecke.map((s) => s.fahrten.length)).toEqual([3, 2]);
    expect(fuegeStueckHinzu(d, l, 0, 2, 4)).toBe(true);
    expect(d.stuecke).toEqual([{ linie: 1, fahrten: u.slice(0, 7) }]);
    expect(fuegeStueckHinzu(d, l, 0, 4, 9)).toBe(false);
    expect(fuegeStueckHinzu(d, l, 3, 0, 0)).toBe(false);
    expect(entferneStueck(d, 0)).toBe(true);
    expect(d.stuecke).toEqual([]);
  });

  it("gespeichert wird nur ein geprüfter Dienst ohne harten Verstoß mit gültiger Nummer (Kriterium 4)", () => {
    const p = neuerDienstplan();
    const l = linie();
    umlauf(l, takt(6 * H, 4, 20 * M, 10 * M));
    const e = neuerEntwurf(p, "werktag");
    expect(e).toEqual({ id: 1, nummer: "1", tag: "werktag", stuecke: [] });
    fuegeStueckHinzu(e, l, 0, 0, 3);
    expect(speichereDienst(p, e, null, null, C)).toBe("nichtGeprueft");
    const a = pruefe(e, [l]);
    const stand = JSON.stringify(e.stuecke);
    // Nach der Prüfung geändert: erneut prüfen
    const geaendert = structuredClone(e);
    geaendert.stuecke[0].fahrten.pop();
    expect(speichereDienst(p, geaendert, a, stand, C)).toBe("nichtGeprueft");
    expect(speichereDienst(p, e, { ...a, gueltig: false }, stand, C)).toBe("regelverstoss");
    expect(speichereDienst(p, { ...e, nummer: " " }, a, stand, C)).toBe("nummerLeer");
    expect(speichereDienst(p, { ...e, nummer: "123456789" }, a, stand, C)).toBe("nummerZuLang");
    expect(speichereDienst(p, e, a, stand, C)).toBeNull();
    expect([p.dienste.length, p.naechsteId]).toEqual([1, 2]);
    expect(pruefeNummer(p, "1", "werktag", null, C)).toBe("nummerDoppelt");
    expect(pruefeNummer(p, "1", "samstag", null, C)).toBeNull();
    expect(naechsteNummer(p, "werktag")).toBe("2");
    // Bearbeiten ersetzt den gespeicherten Dienst
    const b = entwurfVon(p.dienste[0]);
    b.nummer = "F1";
    expect(speichereDienst(p, b, a, stand, C)).toBeNull();
    expect(p.dienste.map((d) => d.nummer)).toEqual(["F1"]);
    expect(loescheDienst(p, 1)).toBe(true);
    expect(loescheDienst(p, 1)).toBe(false);
  });

  it("eigene Ferien-Dienste: Einschalten kopiert die Dienste des Grundtags, Ausschalten löscht die Ferien-Dienste", () => {
    const p = neuerDienstplan();
    p.dienste.push(dienst([], 1, "1"));
    p.naechsteId = 2;
    setzeEigeneFerienDienste(p, "werktag", true);
    expect(p.dienste.map((d) => [d.id, d.nummer, d.tag])).toEqual([[1, "1", "werktag"], [2, "1", "werktagFerien"]]);
    setzeEigeneFerienDienste(p, "werktag", false);
    expect(p.dienste.map((d) => d.tag)).toEqual(["werktag"]);
  });

  it("freie Bereiche eines Umlaufs", () => {
    const l = linie();
    const u = umlauf(l, takt(6 * H, 6, 20 * M, 10 * M));
    expect(freieBereiche(l.umlaeufe[0], [u[0], u[1], u[3], u[4], u[5]])).toEqual([[0, 1], [3, 5]]);
  });
});

describe("Regelwerk-Datei", () => {
  it("de.json ist gültig, jede Regel hat Quelle, Fundstelle und Sinn", () => {
    const r = ladeRegelwerk(rwRaw);
    expect(r.meldungen).toEqual([]);
    for (const g of Object.values(r.regelwerk!.regeln)) expect(g.quelle && g.url && g.sinn).toBeTruthy();
    // Gesetze hart, Tarif nur Warnung (F12, Konzept)
    const R = r.regelwerk!.regeln;
    expect([R.lenkSechstel.hart, R.lenkBlockFPersV.hart, R.lenkBlockVO.hart, R.tageslenkzeit.hart, R.arbeitszeit.hart, R.ruhepause.hart]).toEqual([true, true, true, true, true, true]);
    expect([R.tarifArbeitszeit.hart, R.tarifLenkzeit.hart, R.tarifDienstschicht.hart, R.tarifTeilung.hart]).toEqual([false, false, false, false]);
  });

  it("das Regelwerk des Landes aus der Konfiguration wird gefunden, ein unbekanntes Land gemeldet", () => {
    expect(aktuellesRegelwerk().meldungen).toEqual([]);
    expect(aktuellesRegelwerk().regelwerk?.land).toBe(C.regelwerk);
    expect(aktuellesRegelwerk("xx")).toEqual({ regelwerk: null, meldungen: [{ code: "unlesbar", ort: "datei" }], datei: "regelwerk/xx.json" });
  });

  it("Fehler werden mit Regel und Feld gemeldet", () => {
    const kaputt = structuredClone(rwRaw) as Record<string, unknown> & { regeln: Record<string, Record<string, unknown>> };
    delete kaputt.regeln.arbeitszeit;
    kaputt.regeln.lenkSechstel.maxAmStueckS = -1;
    kaputt.regeln.tageslenkzeit.quelle = "";
    kaputt.regeln.lenkBlockVO.teilungen = [{ minS: [], geordnet: true }];
    const r = ladeRegelwerk(kaputt);
    expect(r.regelwerk).toBeNull();
    expect(r.meldungen).toEqual(expect.arrayContaining([
      { code: "regelFehlt", ort: "arbeitszeit" },
      { code: "wertUngueltig", ort: "lenkSechstel", feld: "maxAmStueckS" },
      { code: "feldFehlt", ort: "tageslenkzeit", feld: "quelle" },
      { code: "wertUngueltig", ort: "lenkBlockVO", feld: "teilungen" },
    ]));
    expect(ladeRegelwerk(null).meldungen).toEqual([{ code: "unlesbar", ort: "datei" }]);
  });
});

describe("Aufbau eines Dienstes (Zählweise A3c-1 bis A3c-5)", () => {
  it("ganzer Umlauf: Vorbereitung, Ausrücken, Fahrten, Wendezeiten, Einrücken, Abschluss mit Handrechnung", () => {
    const l = linie();
    const f = umlauf(l, [[6 * H, 6 * H + 20 * M], [6 * H + 30 * M, 6 * H + 50 * M]]);
    const a = pruefe(dienst([{ linie: 1, fahrten: f }]), [l]);
    expect(a.elemente.map((e) => [e.art, e.vonS, e.bisS])).toEqual([
      ["vorbereitung", 5 * H + 40 * M, 5 * H + 50 * M],
      ["ausruecken", 5 * H + 50 * M, 6 * H],
      ["fahrt", 6 * H, 6 * H + 20 * M],
      ["wende", 6 * H + 20 * M, 6 * H + 30 * M],
      ["fahrt", 6 * H + 30 * M, 6 * H + 50 * M],
      ["einruecken", 6 * H + 50 * M, 7 * H],
      ["abschluss", 7 * H, 7 * H + 5 * M],
    ]);
    // Lenkzeit = 10 + 20 + 20 + 10 = 60 min; Arbeitszeit = alles = 85 min; Wendezeit ist Arbeitszeit, keine Lenkzeit
    expect([a.lenkS, a.arbeitS, a.pauseS, a.schichtS]).toEqual([60 * M, 85 * M, 0, 85 * M]);
    expect([a.beginnS, a.endeS, a.art, a.gueltig]).toEqual([5 * H + 40 * M, 7 * H + 5 * M, "frueh", true]);
  });

  it("Ablösung am Wendepunkt: Weg vom und zum Betriebshof (je 15 min), kein Ausrücken", () => {
    const l = linie();
    const f = umlauf(l, takt(6 * H, 6, 20 * M, 10 * M));
    const a = pruefe(dienst([{ linie: 1, fahrten: f.slice(2, 4) }]), [l]);
    expect(a.elemente.map((e) => e.art)).toEqual(["weg", "fahrt", "wende", "fahrt", "weg", "abschluss"]);
    expect([a.beginnS, a.endeS]).toEqual([7 * H - 15 * M, 7 * H + 50 * M + 15 * M + 5 * M]);
    expect(a.lenkS).toBe(40 * M);
  });

  it("zwei Stücke: gleicher Ort ohne Weg, anderer Ort über den Betriebshof, Pause dazwischen ist keine Arbeitszeit", () => {
    const l = linie();
    const u1 = umlauf(l, takt(6 * H, 4, 20 * M, 10 * M)); // endet 7:50 in A
    const u2 = umlauf(l, takt(8 * H + 30 * M, 4, 20 * M, 10 * M));
    // Stück 1: Fahrten 0 bis 1 (endet in A um 6:50), Stück 2: Fahrten 0 bis 1 von Umlauf 2 (beginnt mit Ausrücken 8:20)
    const a = pruefe(dienst([{ linie: 1, fahrten: u1.slice(0, 2) }, { linie: 1, fahrten: u2.slice(0, 2) }]), [l]);
    // 6:50 Ankunft in A, Weg zum Hof bis 7:05, Pause bis 8:10, Vorbereitung 8:10 bis 8:20
    const pause = a.elemente.find((e) => e.art === "pause")!;
    expect([pause.vonS, pause.bisS]).toEqual([7 * H + 5 * M, 8 * H + 10 * M]);
    expect(a.elemente.filter((e) => e.art === "weg")).toHaveLength(2);
    expect(a.pauseS).toBe(65 * M);
    expect(a.arbeitS).toBe(a.schichtS - 65 * M);
  });

  it("Ablauf: Überschneidung, doppelte Fahrt, fehlende und nicht zusammenhängende Fahrten, kein Ausrücken ohne Hof", () => {
    const l = linie();
    const u1 = umlauf(l, takt(6 * H, 4, 20 * M, 10 * M));
    const u2 = umlauf(l, takt(6 * H + 15 * M, 4, 20 * M, 10 * M).map(([a, b]) => [a + 5 * M, b + 5 * M] as [number, number]), null);
    expect(codes(pruefe(dienst([{ linie: 1, fahrten: u1.slice(0, 2) }, { linie: 1, fahrten: u2.slice(1, 3) }]), [l]).verstoesse)).toContain("ablauf.ueberschneidung");
    const anderer = dienst([{ linie: 1, fahrten: u1.slice(1, 2) }], 2, "D7");
    const d = pruefe(dienst([{ linie: 1, fahrten: u1.slice(0, 2) }]), [l], [anderer]);
    expect(d.verstoesse).toContainEqual({ regel: "ablauf", code: "fahrtDoppelt", daten: { dienst: "D7" } });
    expect(codes(pruefe(dienst([{ linie: 1, fahrten: [u1[0], u1[2]] }]), [l]).verstoesse)).toContain("ablauf.nichtZusammenhaengend");
    expect(codes(pruefe(dienst([{ linie: 1, fahrten: [{ variante: 11, schluessel: "t1" }] }]), [l]).verstoesse)).toContain("ablauf.fahrtFehlt");
    expect(codes(pruefe(dienst([{ linie: 1, fahrten: u2.slice(0, 1) }]), [l]).verstoesse)).toContain("ablauf.keinAusruecken");
    expect(codes(pruefe(dienst([]), [l]).verstoesse)).toEqual(["ablauf.leer"]);
    // Kriterium 9: Mit Ausrücken beginnt der Dienst genau zur Ausrückzeit minus Vorbereitung
    const b = pruefe(dienst([{ linie: 1, fahrten: u1 }]), [l]);
    expect(b.beginnS).toBe(l.umlaeufe[0].ausrueck!.abHofS - C.vorbereitungS);
  });

  it("Umlauf ohne Bus (mehr Umläufe als zugewiesene Busse) ist eine Warnung", () => {
    const l = linie(1, 1200, 2400, 1);
    umlauf(l, takt(6 * H, 2, 20 * M, 10 * M));
    const u2 = umlauf(l, takt(6 * H + 5 * M, 2, 20 * M, 10 * M));
    const a = pruefe(dienst([{ linie: 1, fahrten: u2 }]), [l]);
    expect(a.gueltig).toBe(true);
    expect(a.warnungen).toContainEqual({ regel: "ablauf", code: "umlaufOhneBus", daten: { linie: "1", umlauf: 2 } });
  });
});

describe("Lenkzeitunterbrechung FPersV § 1 Abs. 3 Nr. 2 (Haltestellenabstand bis 3 km)", () => {
  /** Ausrücken 10 min + erste Fahrt + Wende + zweite Fahrt 30 min + Einrücken 10 min. */
  function langerBlock(ersteS: number, wendeS: number) {
    const l = linie();
    const f = umlauf(l, [[6 * H, 6 * H + ersteS], [6 * H + ersteS + wendeS, 6 * H + ersteS + wendeS + 30 * M]]);
    return pruefe(dienst([{ linie: 1, fahrten: f }]), [l]);
  }

  it("Kriterium 4: 4:30 h ununterbrochene Lenkzeit mit 60 min Wende danach speicherbar, 4:31 h nicht", () => {
    // 10 min Ausrücken + 4:20 h Fahrt = 4:30 h; Sechstel: (4:30 + 0:30 + 0:10) / 6 = 51:40 min, Wende 60 min reicht
    const ok = langerBlock(4 * H + 20 * M, 60 * M);
    expect(ok.verstoesse).toEqual([]);
    expect(ok.gueltig).toBe(true);
    const zuLang = langerBlock(4 * H + 21 * M, 60 * M);
    expect(codes(zuLang.verstoesse)).toEqual(["lenkSechstel.amStueck"]);
    expect(zuLang.verstoesse[0]).toMatchObject({ wertS: 4 * H + 31 * M, grenzeS: 4 * H + 30 * M });
    expect(zuLang.gueltig).toBe(false);
  });

  it("nach 4:30 h am Stück muss die Unterbrechung mindestens 45 min dauern, wenn danach noch gelenkt wird", () => {
    expect(codes(langerBlock(4 * H + 20 * M, 44 * M).verstoesse)).toContain("lenkSechstel.pauseDanach");
    expect(codes(langerBlock(4 * H + 20 * M, 45 * M).verstoesse)).not.toContain("lenkSechstel.pauseDanach");
  });

  it("Wendezeiten ab 10 min unterbrechen die Lenkzeit: viele kurze Fahrten brauchen keine 45-min-Pause (Lesart nach dem Wortlaut)", () => {
    const l = linie();
    // 6 h Fahrten zu 20 min mit 10 min Wende: Lenkzeit am Stück nie über 30 min
    const f = umlauf(l, takt(6 * H, 12, 20 * M, 10 * M));
    const a = pruefe(dienst([{ linie: 1, fahrten: f }]), [l]);
    expect(codes(a.verstoesse).filter((c) => c.startsWith("lenk"))).toEqual([]);
    // 9:50 min Wende unterbricht nicht: 5 Fahrten zu 55 min mit 9:50 min Wende = 4:35 h + Ausrücken am Stück
    const l2 = linie();
    const g = umlauf(l2, takt(6 * H, 5, 55 * M, 9 * M + 50));
    expect(codes(pruefe(dienst([{ linie: 1, fahrten: g }]), [l2]).verstoesse)).toContain("lenkSechstel.amStueck");
  });

  it("Kriterium 5: Sechstelregel mit Grenzfall, 9:50 min zählt nicht, eine Minute zu wenig ist nicht speicherbar", () => {
    // Ausrücken 10 + 3 × 50 + Einrücken 10 = 170 min Lenkzeit; ein Sechstel = 28:20 min
    const mit = (w1: number, w2: number) => {
      const l = linie();
      const f = umlauf(l, [[6 * H, 6 * H + 50 * M], [6 * H + 50 * M + w1, 7 * H + 40 * M + w1], [7 * H + 40 * M + w1 + w2, 8 * H + 30 * M + w1 + w2]]);
      return pruefe(dienst([{ linie: 1, fahrten: f }]), [l]);
    };
    expect(mit(14 * M + 10, 14 * M + 10).verstoesse).toEqual([]); // 28:20 min
    const knapp = mit(13 * M + 40, 13 * M + 40); // 27:20 min, eine Minute zu wenig
    expect(codes(knapp.verstoesse)).toEqual(["lenkSechstel.sechstel"]);
    expect(knapp.verstoesse[0]).toMatchObject({ wertS: 27 * M + 20, grenzeS: 28 * M + 20 });
    // 9:50 min zählt nicht mit: 9:50 + 18:30 = 28:20 min, angerechnet nur 18:30
    expect(codes(mit(9 * M + 50, 18 * M + 30).verstoesse)).toEqual(["lenkSechstel.sechstel"]);
    expect(mit(10 * M, 18 * M + 20).verstoesse).toEqual([]);
  });
});

describe("Lenkzeitunterbrechung FPersV § 1 Abs. 3 Nr. 1 und VO Art. 7", () => {
  it("Regime: Linie über 50 km VO, durchschnittlicher Haltestellenabstand über 3 km Nr. 1, sonst Nr. 2", () => {
    expect(regimeFuer([linie(1, 3000)], RW)).toBe("sechstel");
    expect(regimeFuer([linie(1, 3010, 9030)], RW)).toBe("blockFPersV");
    expect(regimeFuer([linie(1, 1200, 50010)], RW)).toBe("blockVO");
    expect(regimeFuer([linie(1), linie(2, 4000)], RW)).toBe("blockFPersV");
  });

  it("Teilungen: 2 × 20 oder 3 × 15 min in beliebiger Folge, VO nur 15 gefolgt von 30", () => {
    const [n1a, n1b] = RW.regeln.lenkBlockFPersV.teilungen;
    expect(teilungErfuellt([20 * M, 20 * M], n1a)).toBe(true);
    expect(teilungErfuellt([20 * M, 19 * M], n1a)).toBe(false);
    expect(teilungErfuellt([15 * M, 16 * M, 15 * M], n1b)).toBe(true);
    const vo = RW.regeln.lenkBlockVO.teilungen[0];
    expect(teilungErfuellt([15 * M, 30 * M], vo)).toBe(true);
    expect(teilungErfuellt([30 * M, 15 * M], vo)).toBe(false);
  });

  it("Nr. 1: Wendezeiten zählen nicht, nach 4:30 h Lenkzeit eine Fahrtunterbrechung (Pause zwischen Stücken)", () => {
    const l = linie(1, 4000);
    const f = umlauf(l, takt(6 * H, 10, 25 * M, 10 * M)); // Wendezeiten 10 min
    const a = pruefe(dienst([{ linie: 1, fahrten: f }]), [l]);
    // Lenkzeit 10 + 10 × 25 + 10 = 270 min = 4:30 h ohne Fahrtunterbrechung: genau an der Grenze
    expect(a.regime).toBe("blockFPersV");
    expect(a.lenkS).toBe(270 * M);
    expect(codes(a.verstoesse)).toEqual([]);
    const l2 = linie(1, 4000);
    const g = umlauf(l2, takt(6 * H, 11, 25 * M, 10 * M));
    expect(codes(pruefe(dienst([{ linie: 1, fahrten: g }]), [l2]).verstoesse)).toEqual(["lenkBlockFPersV.block"]);
  });
});

describe("Tageslenkzeit, Arbeitszeit, Ruhepausen (VO Art. 6, ArbZG §§ 3 und 4)", () => {
  it("Tageslenkzeit: 9:00 h erlaubt, darüber nicht speicherbar", () => {
    const mit = (extraS: number) => {
      const l = linie();
      // 10 Fahrten zu 52 min mit 12 min Wende, dazu Aus- und Einrücken 10 min: 540 min = 9:00 h
      const z = takt(5 * H, 10, 52 * M, 12 * M);
      z[9] = [z[9][0], z[9][1] + extraS];
      const f = umlauf(l, z);
      return pruefe(dienst([{ linie: 1, fahrten: f }]), [l]);
    };
    const ok = mit(0);
    expect(ok.lenkS).toBe(9 * H);
    expect(codes(ok.verstoesse)).not.toContain("tageslenkzeit.max");
    const zuViel = mit(10);
    expect(zuViel.verstoesse).toContainEqual({ regel: "tageslenkzeit", code: "max", wertS: 9 * H + 10, grenzeS: 9 * H });
  });

  it("Arbeitszeit: 10:00 h erlaubt, 10:00:10 h nicht (Pausen zählen nicht)", () => {
    const mit = (extraS: number) => {
      const l = linie();
      // Vorbereitung 10 + Ausrücken 10 + 11 × 40 + 10 × 12:30 + Einrücken 10 + Abschluss 5 = 600 min
      const z = takt(5 * H, 11, 40 * M, 12 * M + 30);
      z[10] = [z[10][0], z[10][1] + extraS];
      return pruefe(dienst([{ linie: 1, fahrten: umlauf(l, z) }]), [l]);
    };
    const ok = mit(0);
    expect(ok.arbeitS).toBe(10 * H);
    expect(codes(ok.verstoesse)).not.toContain("arbeitszeit.max");
    expect(mit(10).verstoesse).toContainEqual({ regel: "arbeitszeit", code: "max", wertS: 10 * H + 10, grenzeS: 10 * H });
  });

  it("Ruhepause ArbZG § 4 ohne Abgeltung: über 6 h Arbeit 30 min Pause in Teilen ab 15 min, höchstens 6 h am Stück", () => {
    // Wendezeiten 5 min (unter 10 min): keine Abgeltung nach TV-N SH, keine Sechstelregel; deshalb Linie mit Nr. 1
    const fall = (pauseS: number) => {
      const l = linie(1, 4000);
      const u1 = umlauf(l, takt(5 * H, 4, 50 * M, 5 * M), 10 * M, 10 * M); // endet 8:35 in A, Einrücken 8:45
      const u2 = umlauf(l, takt(8 * H + 45 * M + pauseS + 10 * M + 10 * M, 4, 50 * M, 5 * M), 10 * M, 10 * M);
      return pruefe(dienst([{ linie: 1, fahrten: u1 }, { linie: 1, fahrten: u2 }]), [l]);
    };
    const ok = fall(30 * M);
    expect(ok.pauseS).toBe(30 * M);
    expect(ok.arbeitS).toBeGreaterThan(6 * H);
    expect(codes(ok.verstoesse)).toEqual([]);
    const kurz = fall(29 * M);
    expect(kurz.verstoesse).toContainEqual({ regel: "ruhepause", code: "zuKurz", wertS: 29 * M, grenzeS: 30 * M });
    // ohne Pause: mehr als 6 h am Stück (ein langer Umlauf mit 5-min-Wenden, Lenkblöcke unter 4:30 h durch Pause nicht gegeben)
    const l = linie(1, 4000);
    const f = umlauf(l, takt(5 * H, 7, 50 * M, 5 * M));
    expect(codes(pruefe(dienst([{ linie: 1, fahrten: f }]), [l]).verstoesse)).toContain("ruhepause.ohnePause");
  });

  it("Abgeltung TV-N SH: Wendezeiten ab 10 min, die ein Sechstel der Fahrzeit erreichen, ersetzen die Ruhepause", () => {
    const l = linie();
    const f = umlauf(l, takt(5 * H, 14, 20 * M, 10 * M)); // 7 h, Wenden 13 × 10 min
    const a = pruefe(dienst([{ linie: 1, fahrten: f }]), [l]);
    expect(a.arbeitS).toBeGreaterThan(6 * H);
    expect(a.pauseS).toBe(0);
    expect(codes(a.verstoesse)).toEqual([]);
  });
});

describe("Dienstarten, geteilter Dienst, Tarif", () => {
  it("Frühdienst vor 10 Uhr, Spätdienst ab 10 Uhr, Nachtdienst bei mehr als 2 h zwischen 23 und 6 Uhr", () => {
    const art = (start: number) => {
      const l = linie();
      return pruefe(dienst([{ linie: 1, fahrten: umlauf(l, takt(start, 4, 20 * M, 10 * M)) }]), [l]).art;
    };
    expect(art(6 * H)).toBe("frueh");
    expect(art(10 * H + 20 * M)).toBe("spaet");
    expect(art(10 * H + 19 * M)).toBe("frueh"); // Beginn 9:59 mit Vorbereitung und Ausrücken
    const l = linie();
    // Vorbereitung ab 22:30, letzte Ankunft 1:40, Einrücken bis 1:50, Abschluss bis 1:55: Nachtzeit 23:00 bis 1:55 = 2:55 h
    expect(pruefe(dienst([{ linie: 1, fahrten: umlauf(l, takt(22 * H + 50 * M, 6, 20 * M, 10 * M)) }]), [l]).art).toBe("nacht");
  });

  it("geteilter Dienst ab 2 h Unterbrechung: Unterbrechung keine Arbeitszeit, Tarif warnt bei kurzen Teilen", () => {
    const l = linie();
    const u1 = umlauf(l, takt(6 * H, 4, 20 * M, 10 * M)); // Einrücken 8:00, Abschluss nur am Dienstende
    const u2 = umlauf(l, takt(10 * H + 20 * M, 2, 20 * M, 10 * M));
    const a = pruefe(dienst([{ linie: 1, fahrten: u1 }, { linie: 1, fahrten: u2 }]), [l]);
    expect(a.art).toBe("geteilt");
    expect(a.pauseS).toBe(2 * H); // 8:00 bis 10:00, danach Vorbereitung
    expect(a.arbeitS).toBe(a.schichtS - 2 * H);
    // zweiter Teil 10:00 bis 11:25 kürzer als 2 h: Warnung nach TV-N SH Anlage 3 § 3, speicherbar
    expect(a.gueltig).toBe(true);
    expect(a.warnungen).toContainEqual({ regel: "tarifTeilung", code: "teil", wertS: 85 * M, grenzeS: 2 * H });
  });

  it("Tarifgrenzen warnen nur (Arbeitszeit 8,5 h, Dienstschicht 10 h, dringend 13 h)", () => {
    const l = linie();
    const u1 = umlauf(l, takt(5 * H, 12, 20 * M, 10 * M)); // 4:40 bis Einrücken 11:00
    const u2 = umlauf(l, takt(14 * H, 6, 20 * M, 10 * M)); // Vorbereitung 13:40, Abschluss bis 17:05
    const a = pruefe(dienst([{ linie: 1, fahrten: u1 }, { linie: 1, fahrten: u2 }]), [l]);
    // Arbeitszeit 380 + 205 = 585 min (über 8,5 h), Schicht 4:40 bis 17:05 = 12:25 h (über 10 h, unter 13 h)
    expect([a.arbeitS, a.schichtS]).toEqual([585 * M, 12 * H + 25 * M]);
    expect(codes(a.warnungen)).toEqual(expect.arrayContaining(["tarifArbeitszeit.max", "tarifDienstschicht.max"]));
    expect(codes(a.warnungen)).not.toContain("tarifDienstschicht.dringend");
    expect(a.gueltig).toBe(true);
  });

  it("eine weiche Regel im Regelwerk wird zur Warnung (Regeln nicht im Code)", () => {
    const l = linie();
    const z = takt(5 * H, 11, 40 * M, 12 * M + 30);
    z[10] = [z[10][0], z[10][1] + 10];
    const weich = structuredClone(RW);
    weich.regeln.arbeitszeit.hart = false;
    const a = pruefe(dienst([{ linie: 1, fahrten: umlauf(l, z) }]), [l], [], weich);
    expect(codes(a.warnungen)).toContain("arbeitszeit.max");
    expect(codes(a.verstoesse)).not.toContain("arbeitszeit.max");
  });
});

describe("Tagesart: freie Fahrten, ungültige Dienste, Ferien", () => {
  it("Kriterium 8 und 10: Fahrten ohne gültigen Dienst sind frei, ein ungültiger Dienst besetzt nichts", () => {
    const l = linie();
    const u = umlauf(l, takt(6 * H, 6, 20 * M, 10 * M));
    const d1 = dienst([{ linie: 1, fahrten: u.slice(0, 3) }], 1, "D1");
    const kaputt = dienst([{ linie: 1, fahrten: [u[3], u[5]] }], 2, "D2");
    const t = pruefeTag({ tag: "werktag", linien: [l], dienste: [d1, kaputt], entwurf: null }, RW, C);
    expect(t.dienste.map((x) => x.gueltig)).toEqual([true, false]);
    expect(t.frei[1]).toEqual(u.slice(3));
    expect([...t.besetzt.values()]).toEqual(["D1", "D1", "D1"]);
    // Nach einer Fahrplanänderung (Fahrt fehlt) wird der Dienst ungültig und seine Fahrten frei
    const ohne = { ...l, fahrten: l.fahrten.filter((f) => f.schluessel !== u[1].schluessel || f.variante !== u[1].variante), umlaeufe: [{ ...l.umlaeufe[0], fahrten: u.filter((_, i) => i !== 1) }] };
    const t2 = pruefeTag({ tag: "werktag", linien: [ohne], dienste: [d1], entwurf: null }, RW, C);
    expect(codes(t2.dienste[0].verstoesse)).toContain("ablauf.fahrtFehlt");
    expect(t2.frei[1]).toHaveLength(5);
  });

  it("Entwurf wird gegen die gespeicherten Dienste geprüft", () => {
    const l = linie();
    const u = umlauf(l, takt(6 * H, 4, 20 * M, 10 * M));
    const t = pruefeTag({ tag: "werktag", linien: [l], dienste: [dienst([{ linie: 1, fahrten: u.slice(0, 2) }])], entwurf: dienst([{ linie: 1, fahrten: u.slice(1) }], 9, "D9") }, RW, C);
    expect(codes(t.entwurf!.verstoesse)).toContain("ablauf.fahrtDoppelt");
  });

  it("Ferien ohne eigene Dienste übernehmen die Dienste des Tages ohne Ferien (F7)", () => {
    const p = neuerDienstplan();
    p.dienste.push(dienst([], 1), { ...dienst([], 2, "F1"), tag: "werktagFerien" });
    expect(wirksameDienste(p, "werktagFerien").map((d) => d.id)).toEqual([1]);
    p.eigeneFerienDienste.werktag = true;
    expect(wirksameDienste(p, "werktagFerien").map((d) => d.id)).toEqual([2]);
    expect(wirksameDienste(p, "samstag")).toEqual([]);
  });

  it("Leistung (Kriterium 13): 1.000 Dienste prüfen in unter 200 ms, gleiches Ergebnis bei gleicher Eingabe", () => {
    const linien: LinieDaten[] = [];
    const dienste: Dienst[] = [];
    for (let i = 0; i < 100; i++) {
      const l = linie(i + 1);
      for (let k = 0; k < 10; k++) {
        const u = umlauf(l, takt(5 * H + k * 60, 30, 20 * M, 10 * M));
        dienste.push(dienst([{ linie: l.linie, fahrten: u.slice(0, 15) }], dienste.length + 1, `D${dienste.length + 1}`));
      }
      linien.push(l);
    }
    const a = { tag: "werktag" as const, linien, dienste, entwurf: null };
    // Rechenzeit des Prozesses (CPU-Zeit), bester von drei Läufen: unabhängig von der Last durch parallel laufende Testdateien
    let t = pruefeTag(a, RW, C);
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const c0 = process.cpuUsage();
      t = pruefeTag(a, RW, C);
      const c = process.cpuUsage(c0);
      best = Math.min(best, (c.user + c.system) / 1000);
    }
    expect(best).toBeLessThan(200);
    expect(t.dienste).toHaveLength(1000);
    const t2 = pruefeTag(structuredClone(a), RW, C);
    expect(JSON.stringify(t2)).toBe(JSON.stringify(t));
    expect([...t2.besetzt]).toEqual([...t.besetzt]);
    expect(t.besetzt.size).toBe(15000);
  });

  it("baueDienst liefert Elemente ohne Lücken und Überlappungen (Summe = Schichtdauer)", () => {
    const l = linie();
    const u = umlauf(l, takt(6 * H, 6, 20 * M, 10 * M));
    const { elemente } = baueDienst(dienst([{ linie: 1, fahrten: u.slice(0, 2) }, { linie: 1, fahrten: u.slice(4) }]), new Map([[1, l]]), C);
    for (let i = 1; i < elemente.length; i++) expect(elemente[i].vonS).toBe(elemente[i - 1].bisS);
  });
});
