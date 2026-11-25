import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, civil, parts } from "../src/calendar/civil";
import type { Bus } from "../src/catalog/katalog";
import { ladeOptionen } from "../src/catalog/optionen";
import { config } from "../src/config";
import { kaufeNeu, marktOptionen, pruefeKonfig, standardKonfig, type MarktOption } from "../src/fleet/fuhrpark";
import { FuhrparkLadeFehler, ladeFuhrpark, serialisiereFuhrpark } from "../src/fleet/speichern";
import { neuerFuhrpark } from "../src/fleet/fuhrpark";
import type { SpielZustand } from "../src/game/setup";
import { fortschreiben, kaufKontext, naechsterMonatsanfang, naechsterMontag, starteMarkt, verkaufeBus, type SpielKontext } from "../src/game/spiel";
import { legeLinieAn, weiseBusZu } from "../src/linien/linien";
import { neuesNetz } from "../src/linien/typen";
import { neuerZufall } from "../src/game/zufall";
import { ladePersonal, monatslohn, neuesPersonal, schreibeAus, serialisierePersonal, sichtbareBewerber, stelleEin } from "../src/personal/personal";
import { beispielHof, hofKontext, katalogModelle, marktKontext } from "./helpers/markt";

let M: Map<string, Bus>;
let OPT: MarktOption[];
beforeAll(async () => {
  M = await katalogModelle();
  OPT = marktOptionen((await ladeOptionen(readFileSync(config.optionen.fileName), config.optionen)).optionen);
}, 120000);

const START = civil(2026, 11, 25, 10, 0); // Mittwoch

function spiel(seed = 1): { s: SpielZustand; k: SpielKontext } {
  const s = {
    firma: { name: "Test", farbe: "#123456" },
    kontostandEur: 2_000_000,
    startZeit: START,
    gemeinde: { name: "Norderstedt", region: "DE-SH", quelle: { art: "norderstedt" } },
    freischaltungen: { gebiete: [] },
    betriebshof: beispielHof(M),
    zeit: START,
    zufall: neuerZufall(seed),
    fuhrpark: neuerFuhrpark(config.fahrzeugmarkt),
    personal: neuesPersonal(config.personal),
    netz: neuesNetz(),
  } as unknown as SpielZustand;
  const k: SpielKontext = { markt: marktKontext(M, OPT), hof: hofKontext(M), region: "DE-SH" };
  starteMarkt(s, k);
  return { s, k };
}

describe("Zeitereignisse (Kriterium 13)", () => {
  it("nächster Montag und Monatsanfang, auch genau auf der Grenze", () => {
    expect(naechsterMontag(START)).toBe(civil(2026, 11, 30));
    expect(naechsterMontag(civil(2026, 11, 30))).toBe(civil(2026, 12, 7));
    expect(naechsterMonatsanfang(START)).toBe(civil(2026, 12, 1));
    expect(naechsterMonatsanfang(civil(2026, 12, 1))).toBe(civil(2027, 1, 1));
  });

  it("ein großer Sprung und viele kleine Schritte (wie bei 600-fach) ergeben dasselbe; jedes Ereignis genau einmal", () => {
    const a = spiel(5), b = spiel(5);
    // Fahrer einstellen, damit Lohn anfällt
    for (const x of [a, b]) {
      const e = schreibeAus(x.s.personal, "fahrer", 38, x.s.zeit, x.s.zufall, config.personal);
      if (!e.ok) throw new Error();
      e.ausschreibung.bewerber.push({ ...(e.ausschreibung.bewerber[0] ?? { id: 9999, name: "Test Person", erfahrungJahre: 0, zufriedenheit: 80, gesundheit: 90, qualifikationen: [] }), id: 9999, ankunft: x.s.zeit });
      expect(stelleEin(x.s.personal, e.ausschreibung.id, 9999, x.s.zeit).ok).toBe(true);
    }
    const ende = civil(2027, 3, 1, 12, 0);
    const ea = fortschreiben(a.s, ende, a.k);
    const eb: ReturnType<typeof fortschreiben> = [];
    // Schritte von 60 Spielsekunden mal 0,1 s Takt (600-fach) = 6000 s, hier in 1,7-Stunden-Schritten
    for (let t = START; t < ende; t = Math.min(ende, t + 6_000_000)) eb.push(...fortschreiben(b.s, Math.min(ende, t + 6_000_000), b.k));
    expect(eb).toEqual(ea);
    expect(b.s.kontostandEur).toBe(a.s.kontostandEur);
    expect(b.s.fuhrpark.angebote).toEqual(a.s.fuhrpark.angebote);
    // Monatsenden Nov, Dez, Jan, Feb: genau 4 Lohnbuchungen; Montage vom 30.11. bis 1.3.: 14
    expect(ea.filter((e) => e.art === "lohn").map((e) => (e.art === "lohn" ? `${e.jahr}-${e.monat}` : ""))).toEqual(["2026-11", "2026-12", "2027-1", "2027-2"]);
    expect(ea.filter((e) => e.art === "angebote")).toHaveLength(14);
    expect(a.s.zeit).toBe(ende);
    // nochmal bis zum selben Zeitpunkt: nichts passiert
    expect(fortschreiben(a.s, ende, a.k)).toEqual([]);
  });

  it("eingestellte Person kostet Lohn: Abbuchung am Monatsende nach Handrechnung, Konto darf ins Minus", () => {
    const { s, k } = spiel(8);
    s.kontostandEur = 100;
    const e = schreibeAus(s.personal, "fahrer", 38, s.zeit, s.zufall, config.personal);
    if (!e.ok) throw new Error();
    e.ausschreibung.bewerber = [{ id: 500, name: "Erika Muster", erfahrungJahre: 0, zufriedenheit: 80, gesundheit: 90, qualifikationen: ["fuehrerschein_d", "bkf"], ankunft: s.zeit }];
    s.personal.naechsteId = Math.max(s.personal.naechsteId, 501);
    const st = stelleEin(s.personal, e.ausschreibung.id, 500, civil(2026, 12, 1));
    expect(st.ok).toBe(true);
    fortschreiben(s, civil(2027, 1, 1, 0, 0, 1), k);
    // Dezember ganz: (20,85 × 38 × 4,348 + 1800 / 12) × 1,22
    const erwartet = Math.round((20.85 * 38 * 4.348 + 1800 / 12) * 1.22 * 100) / 100;
    expect(monatslohn(s.personal, 2026, 12, config.personal).summeEur).toBe(erwartet);
    expect(s.kontostandEur).toBeCloseTo(100 - erwartet, 2);
    expect(s.kontostandEur).toBeLessThan(0);
  });

  it("Gebrauchtangebote erneuern sich am Montag", () => {
    const { s, k } = spiel(3);
    const vorher = s.fuhrpark.angebote.map((a) => a.id);
    expect(vorher).toHaveLength(config.fahrzeugmarkt.gebraucht.angebote);
    fortschreiben(s, addDays(START, 7 * config.fahrzeugmarkt.gebraucht.laufzeitWochenMax + 7), k);
    expect(s.fuhrpark.angebote.some((a) => vorher.includes(a.id))).toBe(false);
    expect(s.fuhrpark.angebote).toHaveLength(config.fahrzeugmarkt.gebraucht.angebote);
    expect(s.fuhrpark.angebote.every((a) => parts(a.erstellt).wochentag === 1)).toBe(true);
  });
});

describe("Optionsdatei im Fahrzeugmarkt", () => {
  it("Standardkonfiguration mit der echten Optionsdatei ist gültig, gesperrte Optionen sind nicht wählbar, Assistenten serienmäßig", () => {
    const k = marktKontext(M, OPT);
    for (const id of ["man_lions_city_12_e_2t", [...M.values()].find((m) => m.antrieb === "Diesel" && m.im_neukauf === "ja")!.modell_id!]) {
      const m = M.get(id)!;
      const c = standardKonfig(m, "#123456", k);
      expect(pruefeKonfig(m, c, k)).toBeNull();
      expect(c.optionen).toEqual(expect.arrayContaining(["abbiegeassistent", "notbremsassistent"]));
      for (const gesperrt of ["klimaanlage", "wlan", "usb", "kamera", "fgi_punktmatrix"]) expect(pruefeKonfig(m, { ...c, optionen: [...c.optionen, gesperrt] }, k)).not.toBeNull();
    }
    const m = M.get("man_lions_city_12_e_2t")!;
    const c = standardKonfig(m, "#123456", k);
    const mitFallblatt = { ...c, optionen: [...c.optionen.filter((x) => x !== "fgi_keine"), "fgi_fallblatt"] };
    expect(pruefeKonfig(m, mitFallblatt, k)).toBeNull();
  });
});

describe("Speichern und Laden (Kriterium 15)", () => {
  it("Fuhrpark, Angebote, Ausschreibungen und Personal ergeben denselben Zustand", () => {
    const { s, k } = spiel(4);
    const kk = kaufKontext(s, k);
    const m = M.get("man_lions_city_12_e_2t")!;
    expect(kaufeNeu(kk, m.modell_id!, standardKonfig(m, "#123456", kk)).ok).toBe(true);
    schreibeAus(s.personal, "mechaniker", 30, s.zeit, s.zufall, config.personal);
    // 10 Tage: die Ausschreibung (28 Tage) läuft noch und wird mit gespeichert
    fortschreiben(s, addDays(START, 10), k);
    expect(s.personal.ausschreibungen).toHaveLength(1);
    const f = ladeFuhrpark(serialisiereFuhrpark(s.fuhrpark), new Set(M.keys()));
    expect(f).toEqual(s.fuhrpark);
    const p = ladePersonal(serialisierePersonal(s.personal), config.personal);
    expect(p).toEqual(s.personal);
    // die geladenen Daten rechnen weiter wie die alten
    expect(sichtbareBewerber(p.ausschreibungen[0], s.zeit)).toEqual(sichtbareBewerber(s.personal.ausschreibungen[0], s.zeit));
    expect(() => ladeFuhrpark({ ...s.fuhrpark, version: 2 })).toThrow(FuhrparkLadeFehler);
    expect(() => ladeFuhrpark({ ...s.fuhrpark, busse: [{ ...s.fuhrpark.busse[0], zustand: "gut" }] })).toThrow(FuhrparkLadeFehler);
    expect(() => ladeFuhrpark({ ...s.fuhrpark, naechsteBusId: 1 })).toThrow(FuhrparkLadeFehler);
    // Regression: kaputtes JSON, leere Einträge, doppelte Kennzeichen, unbekanntes Modell ergeben FuhrparkLadeFehler
    expect(() => ladeFuhrpark("{kaputt")).toThrow(FuhrparkLadeFehler);
    expect(() => ladeFuhrpark({ ...s.fuhrpark, busse: [null] })).toThrow(FuhrparkLadeFehler);
    expect(() => ladeFuhrpark({ ...s.fuhrpark, angebote: [null] })).toThrow(FuhrparkLadeFehler);
    const b = s.fuhrpark.busse[0];
    expect(() => ladeFuhrpark({ ...s.fuhrpark, busse: [b, { ...b, id: b.id + 1, flottennummer: "99" }], naechsteBusId: b.id + 2 })).toThrow(FuhrparkLadeFehler);
    expect(() => ladeFuhrpark({ ...s.fuhrpark, busse: [{ ...b, modellId: "gibt_es_nicht" }] }, new Set(M.keys()))).toThrow(FuhrparkLadeFehler);
    // fremde Felder in Angeboten werden nicht übernommen
    const mitFremd = ladeFuhrpark({ ...s.fuhrpark, angebote: s.fuhrpark.angebote.map((a) => ({ ...a, fremd: 1 })) });
    expect(mitFremd.angebote[0]).not.toHaveProperty("fremd");
  });
});

describe("Verkauf und Linie (Regression Prüfung 3b)", () => {
  it("ein verkaufter Bus verlässt seine Linie, auch ohne Oberfläche", () => {
    const { s, k } = spiel();
    const m = M.get("man_lions_city_12_e_2t")!;
    const kk = kaufKontext(s, k);
    const r = kaufeNeu(kk, m.modell_id!, standardKonfig(m, "#ffffff", kk));
    if (!r.ok) throw new Error(r.fehler);
    const l = legeLinieAn(s.netz, { nummer: "1", name: "x", farbe: "#000000" }, config.linien);
    if (!l.ok) throw new Error();
    weiseBusZu(s.netz, l.linie.id, r.bus.id);
    expect(verkaufeBus(s, k, r.bus.id).ok).toBe(true);
    expect(l.linie.busse).toEqual([]);
    expect(s.fuhrpark.busse).toEqual([]);
    expect(verkaufeBus(s, k, 999).ok).toBe(false);
  });
});
