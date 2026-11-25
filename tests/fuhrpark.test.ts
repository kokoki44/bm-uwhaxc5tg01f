import { beforeAll, describe, expect, it } from "vitest";
import { addDays, addMonate, civil, parts } from "../src/calendar/civil";
import type { Bus } from "../src/catalog/katalog";
import { config } from "../src/config";
import { analysiereHof } from "../src/depot/analyse";
import {
  alterJahre, batterien, belegung, busWert, kaufeGebraucht, kaufeNeu, lackiereUm, neupreis, neuKaufbar, plaetzeMitBatterie, platzFuer,
  pruefeKonfig, restwert, setzeUm, standardKonfig, verkaufe, verkaufserloes, wert, type Konfiguration,
} from "../src/fleet/fuhrpark";
import { baujahrSpanne, erneuereAngebote, erzeugeAngebot, gebrauchtModelle, inspiziere, montagAb } from "../src/fleet/markt";
import { abrissErlaubt, alleBusseHabenPlatz, freiePlaetze } from "../src/fleet/plaetze";
import { neuerZufall } from "../src/game/zufall";
import { hofKontext, JETZT, katalogModelle, kaufKontext, marktKontext } from "./helpers/markt";

const mk = config.fahrzeugmarkt;
let M: Map<string, Bus>;
const MAN = "man_lions_city_12_e_2t";
const DIESEL_SOLO = () => [...M.values()].find((m) => m.antrieb === "Diesel" && m.bauart === "Solo" && m.im_neukauf === "ja" && m.laenge_mm! <= 12500 && m.breite_mm! <= 2550)!;

beforeAll(async () => {
  M = await katalogModelle();
}, 120000);

describe("Neukauf: Konfiguration, Preis und Plätze", () => {
  it("Batterie- und Plätzeregel am MAN Lion's City 12 E (Handrechnung)", () => {
    const m = M.get(MAN)!;
    const k = marktKontext(M);
    expect(batterien(m, config.catalog)).toEqual([356, 445, 534]);
    expect([m.sitzplaetze, m.stehplaetze, m.plaetze_je_batterieeinheit_weniger]).toEqual([44, 44, 8]);
    // kleinste Batterie: Katalogplätze, Neupreis aus dem Katalog
    const c: Konfiguration = { ...standardKonfig(m, "#123456", k), batterieKwh: 356 };
    expect(plaetzeMitBatterie(m, 356, config.catalog)).toMatchObject({ sitzplaetze: 44, stehplaetze: 44 });
    expect(neupreis(m, c, k)).toBe(m.neupreis_eur);
    // zwei Einheiten mehr (534 kWh): 2 × 8 = 16 Stehplätze weniger, 178 kWh × 700 € Aufpreis
    expect(plaetzeMitBatterie(m, 534, config.catalog)).toMatchObject({ sitzplaetze: 44, stehplaetze: 28 });
    expect(neupreis(m, { ...c, batterieKwh: 534 }, k)).toBe(m.neupreis_eur! + 178 * 700);
    // mit Optionen: Stoffsitze 6.000 €, Wärmepumpe 20.000 €, Abbiegeassistent serienmäßig ohne Aufpreis
    const voll = { ...c, batterieKwh: 445, optionen: ["stoff", "waermepumpe", "abbiegeassistent", "video"] };
    expect(pruefeKonfig(m, voll, k)).toBeNull();
    expect(neupreis(m, voll, k)).toBe(m.neupreis_eur! + 89 * 700 + 6000 + 20000 + 6000);
  });

  it("Regression: Batterieeinheiten zählen nach der Position in der Liste, auch wenn das Maximum kein Vielfaches ist", () => {
    const m = { ...M.get(MAN)!, batterie_kwh_min: 200, batterie_kwh_max: 280, batterie_kwh_schritt: null, plaetze_je_batterieeinheit_weniger: 5 } as Bus;
    expect(batterien(m, config.catalog)).toEqual([200, 250, 280]);
    expect(plaetzeMitBatterie(m, 250, config.catalog).weniger).toBe(5);
    expect(plaetzeMitBatterie(m, 280, config.catalog).weniger).toBe(10);
  });

  it("zuerst Stehplätze, dann Sitzplätze; Modelle ohne Eintrag verlieren keine Plätze", () => {
    const m = { ...M.get(MAN)!, stehplaetze: 10 } as Bus;
    expect(plaetzeMitBatterie(m, 534, config.catalog)).toMatchObject({ sitzplaetze: 38, stehplaetze: 0 });
    const ohne = [...M.values()].find((x) => x.antrieb === "Elektro" && x.plaetze_je_batterieeinheit_weniger === null && batterien(x, config.catalog).length > 1)!;
    const bat = batterien(ohne, config.catalog);
    expect(plaetzeMitBatterie(ohne, bat[bat.length - 1], config.catalog)).toMatchObject({ sitzplaetze: ohne.sitzplaetze, stehplaetze: ohne.stehplaetze });
  });

  it("Konfiguration wird geprüft: gesperrte Option, fehlende Serie, zwei Optionen einer Gruppe, falsche Batterie", () => {
    const m = M.get(MAN)!;
    const k = marktKontext(M);
    const c = standardKonfig(m, "#123456", k);
    expect(c.optionen.sort()).toEqual(["abbiegeassistent", "heizung_elektrisch", "kunststoff"]);
    expect(pruefeKonfig(m, c, k)).toBeNull();
    expect(pruefeKonfig(m, { ...c, optionen: [...c.optionen, "klimaanlage"] }, k)).toBe("option"); // erst nach Forschung
    expect(pruefeKonfig(m, { ...c, optionen: c.optionen.filter((x) => x !== "abbiegeassistent") }, k)).toBe("option");
    expect(pruefeKonfig(m, { ...c, optionen: [...c.optionen, "stoff"] }, k)).toBe("gruppe");
    expect(pruefeKonfig(m, { ...c, batterieKwh: 400 }, k)).toBe("batterie");
    expect(pruefeKonfig(m, { ...c, lackierung: "rot" }, k)).toBe("lackierung");
    // nach Freischaltung wählbar
    expect(pruefeKonfig(m, { ...c, optionen: [...c.optionen, "klimaanlage"] }, { ...k, freigeschaltet: new Set(["Klimaanlage"]) })).toBeNull();
    // Diesel hat keine Heizungsgruppe
    const d = DIESEL_SOLO();
    expect(standardKonfig(d, "#123456", k)).toMatchObject({ batterieKwh: null });
    expect(standardKonfig(d, "#123456", k).optionen).not.toContain("heizung_elektrisch");
  });

  it("nur Modelle mit im_neukauf = ja, keine O-Busse; alle Bauarten", () => {
    const kaufbar = [...M.values()].filter((m) => neuKaufbar(m, mk));
    expect(kaufbar.every((m) => m.im_neukauf === "ja" && m.fahrzeugart === "Bus")).toBe(true);
    expect(new Set(kaufbar.map((m) => m.bauart))).toEqual(new Set(["Mini", "Midi", "Solo kurz", "Solo", "Gelenk", "Doppelgelenk", "Doppeldecker"]));
    const k = kaufKontext(M);
    const alt = [...M.values()].find((m) => m.im_neukauf === "nein")!;
    expect(kaufeNeu(k, alt.modell_id!, standardKonfig(alt, "#123456", k))).toEqual({ ok: false, fehler: "nichtKaufbar" });
    const obus = [...M.values()].find((m) => m.fahrzeugart === "O-Bus")!;
    expect(kaufeNeu(k, obus.modell_id!, standardKonfig(obus, "#123456", k))).toEqual({ ok: false, fehler: "nichtKaufbar" });
  });
});

describe("Kauf: Platz, Geld, Flottennummer, Kennzeichen", () => {
  it("Neukauf bucht genau den Preis ab und stellt den Bus sofort auf den kleinsten passenden freien Platz", () => {
    const k = kaufKontext(M);
    const m = M.get(MAN)!;
    const c = { ...standardKonfig(m, "#123456", k), batterieKwh: 534 };
    const vorher = k.kasse.kontostandEur;
    const erwarteterPlatz = platzFuer(m, k)!;
    const e = kaufeNeu(k, MAN, c);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(k.kasse.kontostandEur).toBe(vorher - neupreis(m, c, k));
    expect(e.bus.platz).toEqual(erwarteterPlatz);
    expect(e.bus).toMatchObject({ herkunft: "neu", zustand: 100, batterieZustand: 100, baujahr: 2026, sitzplaetze: 44, stehplaetze: 28, flottennummer: "1" });
    expect(e.bus.kennzeichen).toMatch(/^SE-[A-Z]{1,2} \d{1,4}$/);
    // kleinster passender Platz: die Halle (3,45 × 15 m) ist kleiner als ein Stellplatz (4 × 14 m)
    expect(e.bus.platz.art).toBe("halle");
    // HU gültig für intervall_hu_monate
    expect(parts(e.bus.huBis).monat).toBe(((11 + (m.intervall_hu_monate ?? 12) - 1) % 12) + 1);
  });

  it("ohne freien passenden Platz oder ohne Geld: Meldung, nichts gebucht", () => {
    const k = kaufKontext(M);
    const m = M.get(MAN)!;
    const c = standardKonfig(m, "#123456", k);
    // Beispielhof: Halle (1 Platz) und 6 Stellplätze passen für den 12-m-Bus
    for (let i = 0; i < 7; i++) expect(kaufeNeu(k, MAN, c).ok).toBe(true);
    const vorher = k.kasse.kontostandEur;
    expect(kaufeNeu(k, MAN, c)).toEqual({ ok: false, fehler: "keinPlatz" });
    expect(k.kasse.kontostandEur).toBe(vorher);
    expect(k.fuhrpark.busse.map((b) => b.flottennummer)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(new Set(k.fuhrpark.busse.map((b) => b.kennzeichen)).size).toBe(7);
    // Gelenkbus passt auf keinen Stellplatz von 14 m
    const k2 = kaufKontext(M);
    const gelenk = [...M.values()].find((x) => x.bauart === "Gelenk" && neuKaufbar(x, mk))!;
    expect(kaufeNeu(k2, gelenk.modell_id!, standardKonfig(gelenk, "#123456", k2))).toEqual({ ok: false, fehler: "keinPlatz" });
    // zu wenig Geld
    const arm = kaufKontext(M, { kontostandEur: 1000 });
    expect(kaufeNeu(arm, MAN, c)).toEqual({ ok: false, fehler: "geldFehlt" });
    expect(arm.kasse.kontostandEur).toBe(1000);
    expect(arm.fuhrpark.busse).toEqual([]);
    // ohne Betriebshof
    expect(kaufeNeu(kaufKontext(M, { hof: null }), MAN, c)).toEqual({ ok: false, fehler: "keinHof" });
  });

  it("Umsetzen auf einen anderen freien Platz; belegte Plätze und unpassende werden abgelehnt", () => {
    const k = kaufKontext(M);
    const c = standardKonfig(M.get(MAN)!, "#123456", k);
    const a = kaufeNeu(k, MAN, c);
    const b = kaufeNeu(k, MAN, c);
    if (!a.ok || !b.ok) throw new Error("Kauf");
    expect(setzeUm(k, a.bus.id, b.bus.platz)).toBe(false);
    const frei = freiePlaetze(k.hof!, k.analyse!, belegung(k.fuhrpark, M), { laengeM: 12.2, breiteM: 2.55 }, config.betriebshof)[2].platz;
    expect(setzeUm(k, a.bus.id, frei)).toBe(true);
    expect(a.bus.platz).toEqual(frei);
    expect(alleBusseHabenPlatz(k.hof!, k.analyse!, belegung(k.fuhrpark, M), config.betriebshof)).toBe(true);
  });

  it("Umlackieren kostet die Gebühr", () => {
    const k = kaufKontext(M);
    const e = kaufeNeu(k, MAN, standardKonfig(M.get(MAN)!, "#123456", k));
    if (!e.ok) throw new Error("Kauf");
    const vorher = k.kasse.kontostandEur;
    expect(lackiereUm(k, e.bus.id, "#AA0000")).toEqual({ ok: true });
    expect(e.bus.konfig.lackierung).toBe("#aa0000");
    expect(k.kasse.kontostandEur).toBe(vorher - mk.umlackierenEur);
    k.kasse.kontostandEur = 10;
    expect(lackiereUm(k, e.bus.id, "#00aa00")).toEqual({ ok: false, fehler: "geldFehlt" });
  });
});

describe("Verkauf an den Händler (Kriterium 17)", () => {
  it("zahlt den Wert ohne Streuung abzüglich Abschlag, Bus verschwindet, Platz wird frei", () => {
    const k = kaufKontext(M);
    const m = M.get(MAN)!;
    const e = kaufeNeu(k, MAN, standardKonfig(m, "#123456", k));
    if (!e.ok) throw new Error("Kauf");
    // zwei Jahre später
    k.jetzt = addDays(JETZT, 730.5);
    const a = alterJahre(e.bus, k.jetzt);
    expect(a).toBeCloseTo(2, 6);
    const w = e.bus.neupreisKonfigEur * (1 - 0.9 * (2 / m.lebensdauer_jahre!)) * 1;
    expect(busWert(e.bus, k.jetzt, k)).toBeCloseTo(w, 1);
    const erloes = verkaufserloes(e.bus, k.jetzt, k);
    expect(erloes).toBeCloseTo(w * 0.75, 1);
    const vorher = k.kasse.kontostandEur;
    const platz = e.bus.platz;
    expect(verkaufe(k, e.bus.id)).toEqual({ ok: true, erloesEur: erloes });
    expect(k.kasse.kontostandEur).toBeCloseTo(vorher + erloes, 2);
    expect(k.fuhrpark.busse).toEqual([]);
    expect(platzFuer(m, k)).toEqual(platz);
    expect(verkaufe(k, e.bus.id)).toEqual({ ok: false, fehler: "unbekannt" });
  });

  it("Restwert: linear auf 10 % am Ende der Lebensdauer, danach 10 %; Zustand wirkt", () => {
    expect(restwert(0, 12, mk)).toBe(1);
    expect(restwert(6, 12, mk)).toBeCloseTo(0.55, 10);
    expect(restwert(12, 12, mk)).toBeCloseTo(0.1, 10);
    expect(restwert(20, 12, mk)).toBe(0.1);
    expect(wert(100000, 0, 12, 50, mk)).toBe(85000);
  });
});

describe("Gebrauchtmarkt", () => {
  const land = "DE";

  it("Angebote kommen aus dem Katalog, auch eingestellte Modelle, nie O-Busse, Baujahr im Zeitraum", () => {
    const k = kaufKontext(M, { seed: 7 });
    const z = neuerZufall(7);
    const modelleImMarkt = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const a = erzeugeAngebot(k.fuhrpark, JETZT, land, z, k)!;
      const m = M.get(a.modellId)!;
      modelleImMarkt.add(a.modellId);
      expect(m.fahrzeugart).toBe("Bus");
      const [von, bis] = baujahrSpanne(m, 2026, k)!;
      expect(a.baujahr).toBeGreaterThanOrEqual(von);
      expect(a.baujahr).toBeLessThanOrEqual(bis);
      expect(a.baujahr).toBeLessThanOrEqual(2026 - mk.gebraucht.mindestAlterJahre);
      expect(a.zustand).toBeGreaterThanOrEqual(a.zustandVon);
      expect(a.zustand).toBeLessThanOrEqual(a.zustandBis);
      expect(a.zustandBis - a.zustandVon).toBe(mk.gebraucht.zustandSpanne);
      expect(a.huRestMonate).toBeGreaterThanOrEqual(1);
      if (a.batterieZustand !== null) expect(a.batterieZustand).toBeGreaterThanOrEqual(a.batterieVon!);
      if (a.baujahr >= mk.gebraucht.assistentenPflichtAbBaujahr) expect(a.konfig.optionen).toContain("abbiegeassistent");
      expect(a.preisEur).toBeGreaterThan(0);
    }
    expect([...modelleImMarkt].some((id) => M.get(id)!.im_neukauf === "nein")).toBe(true);
    // im Neukauf gesperrte Ausstattung darf ein Gebrauchtbus haben
    expect(k.fuhrpark.naechsteAngebotId).toBe(601);
  });

  it("fehlt baujahr_von, gilt aktuelles Jahr minus Lebensdauer bis baujahr_bis (A2-34)", () => {
    const k = marktKontext(M);
    const m = [...M.values()].find((x) => x.baujahr_von === null && x.baujahr_bis === null)!;
    expect(baujahrSpanne(m, 2026, k)).toEqual([2026 - m.lebensdauer_jahre!, 2024]);
    const mitBis = { ...m, baujahr_bis: 2020 } as Bus;
    expect(baujahrSpanne(mitBis, 2026, k)).toEqual([2026 - m.lebensdauer_jahre!, 2020]);
    expect(baujahrSpanne({ ...m, baujahr_von: 2025 } as Bus, 2026, k)).toBeNull(); // jünger als das Mindestalter
    expect(gebrauchtModelle(2026, "DE", k).some((x) => x.region === "weltweit")).toBe(true);
  });

  it("Preis: ohne Streuung genau der Wert; älter ist im Mittel billiger als jünger", () => {
    const ohneStreuung = { ...marktKontext(M), markt: { ...mk, gebraucht: { ...mk.gebraucht, preisStreuung: 0 } } };
    const k = { ...kaufKontext(M), ...ohneStreuung };
    const z = neuerZufall(3);
    const relJung: number[] = [], relAlt: number[] = [];
    for (let i = 0; i < 400; i++) {
      const a = erzeugeAngebot(k.fuhrpark, JETZT, land, z, k)!;
      const m = M.get(a.modellId)!;
      expect(a.preisEur).toBeCloseTo(wert(a.neupreisKonfigEur, a.alterJahre, m.lebensdauer_jahre!, a.zustand, mk), 2);
      (a.alterJahre <= 5 ? relJung : relAlt).push(a.preisEur / a.neupreisKonfigEur);
    }
    const mittel = (x: number[]) => x.reduce((s, y) => s + y, 0) / x.length;
    expect(mittel(relAlt)).toBeLessThan(mittel(relJung));
  });

  it("Preis: Handrechnung und Streuung höchstens ±10 % um den Wert", () => {
    // 400.000 € Neupreis, 6 von 12 Jahren, Zustand 80: 400.000 × 0,55 × (0,7 + 0,3 × 0,8) = 206.800 €
    expect(wert(400000, 6, 12, 80, mk)).toBe(206800);
    const k = kaufKontext(M);
    const z = neuerZufall(21);
    for (let i = 0; i < 300; i++) {
      const a = erzeugeAngebot(k.fuhrpark, JETZT, land, z, k)!;
      const w = wert(a.neupreisKonfigEur, a.alterJahre, M.get(a.modellId)!.lebensdauer_jahre!, a.zustand, mk);
      expect(a.preisEur).toBeGreaterThanOrEqual(w * (1 - mk.gebraucht.preisStreuung) - 0.01);
      expect(a.preisEur).toBeLessThanOrEqual(w * (1 + mk.gebraucht.preisStreuung) + 0.01);
    }
  });

  it("gleicher Startwert ergibt dieselben Angebote", () => {
    const a = kaufKontext(M), b = kaufKontext(M);
    erneuereAngebote(a.fuhrpark, JETZT, land, neuerZufall(99), a);
    erneuereAngebote(b.fuhrpark, JETZT, land, neuerZufall(99), b);
    expect(a.fuhrpark.angebote).toEqual(b.fuhrpark.angebote);
    expect(a.fuhrpark.angebote).toHaveLength(mk.gebraucht.angebote);
  });

  it("Angebote erneuern sich: abgelaufene verschwinden, neue kommen dazu", () => {
    const k = kaufKontext(M);
    const z = neuerZufall(5);
    erneuereAngebote(k.fuhrpark, JETZT, land, z, k);
    const alt = k.fuhrpark.angebote.map((a) => a.id);
    // nach der längsten Laufzeit (bis zum folgenden Montag) sind alle alten weg
    const spaeter = montagAb(addDays(JETZT, 7 * mk.gebraucht.laufzeitWochenMax));
    const e = erneuereAngebote(k.fuhrpark, spaeter, land, z, k);
    expect(e.weg).toBe(alt.length);
    expect(k.fuhrpark.angebote.every((a) => !alt.includes(a.id))).toBe(true);
    expect(k.fuhrpark.angebote).toHaveLength(mk.gebraucht.angebote);
  });

  it("Inspektion kostet die Gebühr und deckt den Zustand auf; Gebrauchtkauf mit Zustand und Lackierung des Vorbesitzers", () => {
    const k = kaufKontext(M);
    const z = neuerZufall(11);
    erneuereAngebote(k.fuhrpark, JETZT, land, z, k);
    // ein Angebot, das auf einen Stellplatz passt
    const a = k.fuhrpark.angebote.find((x) => platzFuer(M.get(x.modellId)!, k) !== null)!;
    const vorher = k.kasse.kontostandEur;
    expect(inspiziere(k.fuhrpark, a.id, k.kasse, k, k.jetzt)).toEqual({ ok: true });
    expect(k.kasse.kontostandEur).toBe(vorher - mk.inspektionEur);
    expect(inspiziere(k.fuhrpark, a.id, k.kasse, k, k.jetzt)).toEqual({ ok: false, fehler: "schonInspiziert" });
    const e = kaufeGebraucht(k, a.id);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.bus).toMatchObject({ herkunft: "gebraucht", zustand: a.zustand, baujahr: a.baujahr, kaufpreisEur: a.preisEur, laufleistungKm: a.laufleistungKm });
    expect(e.bus.konfig.lackierung).toBe(a.konfig.lackierung);
    expect(k.kasse.kontostandEur).toBeCloseTo(vorher - mk.inspektionEur - a.preisEur, 2);
    expect(k.fuhrpark.angebote.some((x) => x.id === a.id)).toBe(false);
    expect(alterJahre(e.bus, k.jetzt)).toBe(a.alterJahre);
  });
});

describe("Plätze im Hof", () => {
  it("Halle: Plätze reichen nach den größten Maßen der Busse darin", () => {
    const hof = { version: 1 as const, grundstueck: { standortId: 1, standortName: "", ursprung: [10, 53.7] as [number, number], flaeche: { x: 0, y: 0, b: 60, t: 50 }, preisEurM2: 1, kaufpreisEur: 0 }, bauteile: [] as never[], naechsteId: 1 };
    const ctx = hofKontext(M);
    const bau = (typ: string, r: object) => {
      // direkt einfügen: Bau-Regeln sind im Betriebshof-Test geprüft
      (hof.bauteile as unknown as object[]).push({ id: hof.naechsteId++, typ, ...r });
    };
    bau("tor", { x: 0, y: 20, b: 4, t: 7 });
    bau("fahrweg", { x: 4, y: 20, b: 56, t: 7 });
    bau("halle", { x: 4, y: 0, b: 8, t: 20 }); // 8 m breit: zwei Solobusse (je 3,45 m)
    const a = analysiereHof(hof, ctx);
    const solo = { laengeM: 12, breiteM: 2.55 };
    expect(freiePlaetze(hof, a, [], solo, config.betriebshof).map((p) => p.platz)).toEqual([{ art: "halle", id: 3 }]);
    const eins = [{ busId: 1, platz: { art: "halle" as const, id: 3 }, mass: solo }];
    expect(freiePlaetze(hof, a, eins, solo, config.betriebshof)).toHaveLength(1);
    const zwei = [...eins, { busId: 2, platz: { art: "halle" as const, id: 3 }, mass: solo }];
    expect(freiePlaetze(hof, a, zwei, solo, config.betriebshof)).toHaveLength(0);
  });

  it("Regression: HU-Datum über den Jahreswechsel und am Monatsende", () => {
    expect(addMonate(civil(2026, 11, 30, 9, 15), 3)).toBe(civil(2027, 2, 28, 9, 15));
    expect(addMonate(civil(2026, 11, 25), 12)).toBe(civil(2027, 11, 25));
    expect(addMonate(civil(2027, 1, 31), 1)).toBe(civil(2027, 2, 28));
    const k = kaufKontext(M);
    const e = kaufeNeu(k, MAN, standardKonfig(M.get(MAN)!, "#123456", k));
    if (!e.ok) throw new Error("Kauf");
    expect(e.bus.huBis).toBe(addMonate(JETZT, M.get(MAN)!.intervall_hu_monate ?? mk.huMonateStandard));
    expect(parts(e.bus.huBis).jahr).toBe(2027);
  });

  it("Regression: Abriss eines belegten Stellplatzes oder des Fahrwegs davor wird abgelehnt (A3-22)", () => {
    const k = kaufKontext(M);
    const e = kaufeNeu(k, MAN, standardKonfig(M.get(MAN)!, "#123456", k));
    const f = kaufeNeu(k, MAN, standardKonfig(M.get(MAN)!, "#123456", k));
    if (!e.ok || !f.ok) throw new Error("Kauf");
    const bel = belegung(k.fuhrpark, M);
    const ctx = hofKontext(M);
    const stellplatz = f.bus.platz.art === "stellplatz" ? f.bus.platz.id : e.bus.platz.id;
    const fahrweg = k.hof!.bauteile.find((b) => b.typ === "fahrweg")!.id;
    expect(abrissErlaubt(k.hof!, stellplatz, bel, ctx)).toBe(false);
    expect(abrissErlaubt(k.hof!, fahrweg, bel, ctx)).toBe(false);
    // freier Stellplatz und die Waschanlage dürfen weg
    const frei = k.hof!.bauteile.find((b) => b.typ === "stellplatz" && !bel.some((x) => x.platz.id === b.id))!.id;
    expect(abrissErlaubt(k.hof!, frei, bel, ctx)).toBe(true);
    expect(abrissErlaubt(k.hof!, k.hof!.bauteile.find((b) => b.typ === "waschanlage")!.id, bel, ctx)).toBe(true);
    // ohne Busse ist alles erlaubt
    expect(abrissErlaubt(k.hof!, stellplatz, [], ctx)).toBe(true);
  });

  it("Regression: Angebote laufen am Montag ab, abgelaufene sind nicht mehr kaufbar", () => {
    expect(montagAb(civil(2026, 11, 25, 10))).toBe(civil(2026, 11, 30));
    expect(montagAb(civil(2026, 11, 30))).toBe(civil(2026, 11, 30));
    expect(montagAb(civil(2026, 11, 30, 0, 1))).toBe(civil(2026, 12, 7));
    const k = kaufKontext(M);
    erneuereAngebote(k.fuhrpark, JETZT, "DE", neuerZufall(2), k);
    for (const a of k.fuhrpark.angebote) expect(parts(a.ablauf).wochentag).toBe(1);
    const a = k.fuhrpark.angebote[0];
    k.jetzt = a.ablauf;
    expect(kaufeGebraucht(k, a.id)).toEqual({ ok: false, fehler: "unbekannt" });
    expect(inspiziere(k.fuhrpark, a.id, k.kasse, k, k.jetzt)).toEqual({ ok: false, fehler: "unbekannt" });
  });
});
