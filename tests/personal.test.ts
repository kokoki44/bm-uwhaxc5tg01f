import { describe, expect, it } from "vitest";
import { config, type PersonalArt } from "../src/config/index";
import { civil } from "../src/calendar/civil";
import { neuerZufall } from "../src/game/zufall";
import namen from "../src/personal/namen.json";
import {
  addMonate,
  entferneAusgetreteneNachMonat,
  erfahrungJahre,
  inProbezeit,
  kuendige,
  kuendigungsTermin,
  ladePersonal,
  marktlohnVerhaeltnis,
  monatslohn,
  neuesPersonal,
  PersonalLadeFehler,
  raeumeAuf,
  schreibeAus,
  serialisierePersonal,
  setzeLohn,
  sichtbareBewerber,
  stelleEin,
  stufeFuer,
  stundenlohn,
  type Ausschreibung,
  type Person,
  type Personal,
} from "../src/personal/personal";

const cfg = config.personal;
const TAG = 86400000;

function person(teil: Partial<Person> = {}): Person {
  return {
    id: 1,
    name: "Anna Müller",
    art: "fahrer",
    wochenstunden: 38,
    erfahrungJahreBeiEintritt: 0,
    eintritt: civil(2027, 1, 1),
    zufriedenheit: 70,
    gesundheit: 90,
    qualifikationen: ["fuehrerschein_d", "bkf"],
    austritt: null,
    ...teil,
  };
}

function mitPersonen(...ps: Person[]): Personal {
  const p = neuesPersonal(cfg);
  p.personen = ps;
  p.naechsteId = Math.max(0, ...ps.map((x) => x.id)) + 1;
  return p;
}

function ausschreiben(p: Personal, art: PersonalArt, jetzt: number, seed = 42): Ausschreibung {
  const r = schreibeAus(p, art, 38, jetzt, neuerZufall(seed), cfg);
  if (!r.ok) throw new Error(r.fehler);
  return r.ausschreibung;
}

/** Erzeugt viele Ausschreibungen bei einem Lohnfaktor und liefert mittlere Bewerberzahl und mittlere Stufe. */
function statistik(art: PersonalArt, faktor: number, n = 400): { anzahl: number; stufe: number; max: number } {
  const p = neuesPersonal(cfg);
  cfg.marktlohnEurH[art].forEach((l, i) => setzeLohn(p, art, i + 1, l * faktor, cfg));
  const z = neuerZufall(42);
  let bewerber = 0;
  let stufen = 0;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const r = schreibeAus(p, art, 38, civil(2027, 1, 1), z, cfg);
    if (!r.ok) throw new Error(r.fehler);
    bewerber += r.ausschreibung.bewerber.length;
    max = Math.max(max, r.ausschreibung.bewerber.length);
    for (const b of r.ausschreibung.bewerber) stufen += stufeFuer(b.erfahrungJahre, art, cfg);
  }
  return { anzahl: bewerber / n, stufe: bewerber ? stufen / bewerber : 0, max };
}

describe("Namen", () => {
  it("enthält je etwa 80 Vor- und Nachnamen ohne Dubletten und eine Quelle", () => {
    expect(namen.vornamen.length).toBeGreaterThanOrEqual(80);
    expect(namen.nachnamen.length).toBeGreaterThanOrEqual(80);
    expect(new Set(namen.vornamen).size).toBe(namen.vornamen.length);
    expect(new Set(namen.nachnamen).size).toBe(namen.nachnamen.length);
    expect(namen.quelle.length).toBeGreaterThan(0);
  });
});

describe("Lohntabelle", () => {
  it("Standard ist der Marktlohn je Art und Stufe", () => {
    const p = neuesPersonal(cfg);
    for (const art of cfg.arten) {
      expect(p.lohntabelle[art]).toEqual(cfg.marktlohnEurH[art]);
      expect(marktlohnVerhaeltnis(p, art, cfg)).toBeCloseTo(1, 12);
    }
    expect(p.lohntabelle.reinigung).toHaveLength(1);
    // Kopie, nicht dieselbe Liste wie in der Konfiguration
    p.lohntabelle.fahrer[0] = 99;
    expect(cfg.marktlohnEurH.fahrer[0]).toBe(20.85);
  });

  it("setzeLohn wirkt auf alle Personen der Art, ungültige Werte werden abgelehnt", () => {
    const a = person({ id: 1 });
    const b = person({ id: 2, name: "Thomas Schmidt" });
    const m = person({ id: 3, art: "mechaniker" });
    const p = mitPersonen(a, b, m);
    const jetzt = civil(2027, 3, 1);
    expect(setzeLohn(p, "fahrer", 1, 25, cfg)).toBe(true);
    expect(stundenlohn(p, a, jetzt, cfg)).toBe(25);
    expect(stundenlohn(p, b, jetzt, cfg)).toBe(25);
    expect(stundenlohn(p, m, jetzt, cfg)).toBe(20.85);
    expect(setzeLohn(p, "fahrer", 1, 0, cfg)).toBe(false);
    expect(setzeLohn(p, "fahrer", 1, -3, cfg)).toBe(false);
    expect(setzeLohn(p, "fahrer", 1, Number.NaN, cfg)).toBe(false);
    expect(setzeLohn(p, "fahrer", 7, 22, cfg)).toBe(false);
    expect(setzeLohn(p, "reinigung", 2, 22, cfg)).toBe(false);
    expect(setzeLohn(p, "fahrer", 0, 22, cfg)).toBe(false);
    expect(p.lohntabelle.fahrer[0]).toBe(25);
    expect(marktlohnVerhaeltnis(p, "fahrer", cfg)).toBeCloseTo((25 / 20.85 + 5) / 6, 12);
  });
});

describe("Erfahrungsstufen", () => {
  it("Stufe aus Jahren Erfahrung", () => {
    expect(stufeFuer(0, "fahrer", cfg)).toBe(1);
    expect(stufeFuer(2.9, "fahrer", cfg)).toBe(1);
    expect(stufeFuer(3, "fahrer", cfg)).toBe(2);
    expect(stufeFuer(8.99, "fahrer", cfg)).toBe(3);
    expect(stufeFuer(13, "kontrolle", cfg)).toBe(5);
    expect(stufeFuer(17, "fahrer", cfg)).toBe(6);
    expect(stufeFuer(40, "fahrer", cfg)).toBe(6);
    for (const j of [0, 3, 10, 30]) expect(stufeFuer(j, "reinigung", cfg)).toBe(1);
  });

  it("Stufenaufstieg durch Dienstjahre: 2 Jahre Erfahrung, nach 1 Jahr im Unternehmen Stufe 2, Lohn steigt", () => {
    const a = person({ erfahrungJahreBeiEintritt: 2, eintritt: civil(2027, 1, 1) });
    const p = mitPersonen(a);
    expect(erfahrungJahre(a, civil(2027, 1, 1))).toBe(2);
    expect(stundenlohn(p, a, civil(2027, 12, 31, 23, 59), cfg)).toBe(20.85);
    expect(erfahrungJahre(a, civil(2028, 1, 1))).toBe(3);
    expect(stundenlohn(p, a, civil(2028, 1, 1), cfg)).toBe(21.17);
    expect(erfahrungJahre(a, civil(2028, 7, 1))).toBeGreaterThan(3.4);
    expect(erfahrungJahre(a, civil(2028, 7, 1))).toBeLessThan(3.6);
  });

  it("addMonate kürzt auf das Monatsende", () => {
    expect(addMonate(civil(2027, 1, 31), 1)).toBe(civil(2027, 2, 28));
    expect(addMonate(civil(2028, 2, 29), 12)).toBe(civil(2029, 2, 28));
    expect(addMonate(civil(2027, 11, 15, 8, 30), 3)).toBe(civil(2028, 2, 15, 8, 30));
  });
});

describe("Ausschreibung und Bewerber", () => {
  it("ungültige Wochenstunden werden abgelehnt", () => {
    const p = neuesPersonal(cfg);
    const z = neuerZufall(42);
    for (const w of [9, 39, 20.5, Number.NaN]) {
      expect(schreibeAus(p, "fahrer", w, civil(2027, 1, 1), z, cfg)).toEqual({ ok: false, fehler: "wochenstunden" });
    }
    expect(p.ausschreibungen).toHaveLength(0);
    expect(schreibeAus(p, "fahrer", 10, civil(2027, 1, 1), z, cfg).ok).toBe(true);
    expect(schreibeAus(p, "fahrer", 38, civil(2027, 1, 1), z, cfg).ok).toBe(true);
  });

  it("Laufzeit, Ankunft im Fenster, unsichtbar vorher und nach dem Ende", () => {
    const p = neuesPersonal(cfg);
    const start = civil(2027, 3, 1, 9);
    const z = neuerZufall(7);
    let gesehen = 0;
    for (let i = 0; i < 50; i++) {
      const r = schreibeAus(p, "mechaniker", 30, start, z, cfg);
      if (!r.ok) throw new Error();
      const a = r.ausschreibung;
      expect(a.ende).toBe(start + cfg.bewerbung.laufzeitTage * TAG);
      expect(a.wochenstunden).toBe(30);
      for (const b of a.bewerber) {
        const tage = (b.ankunft - start) / TAG;
        expect(Number.isInteger(tage)).toBe(true);
        expect(tage).toBeGreaterThanOrEqual(cfg.bewerbung.wartezeitTageMin);
        expect(tage).toBeLessThanOrEqual(cfg.bewerbung.wartezeitTageMax);
        expect(sichtbareBewerber(a, b.ankunft - 1)).not.toContain(b);
        expect(sichtbareBewerber(a, b.ankunft)).toContain(b);
        gesehen++;
      }
      expect(sichtbareBewerber(a, start)).toHaveLength(0);
      expect(sichtbareBewerber(a, a.ende)).toHaveLength(0);
    }
    expect(gesehen).toBeGreaterThan(0);
  });

  it("120 % Lohn bringt mehr und erfahrenere Bewerber, 80 % weniger, nie mehr als hoechstens", () => {
    const s100 = statistik("mechaniker", 1);
    const s120 = statistik("mechaniker", 1.2);
    const s80 = statistik("mechaniker", 0.8);
    expect(s100.anzahl).toBeGreaterThan(1.7);
    expect(s100.anzahl).toBeLessThan(2.3);
    expect(s120.anzahl).toBeGreaterThan(s100.anzahl * 1.5);
    expect(s80.anzahl).toBeLessThan(s100.anzahl * 0.6);
    expect(s120.stufe).toBeGreaterThan(s100.stufe + 1);
    expect(s80.stufe).toBeLessThan(s100.stufe - 0.5);
    for (const s of [s100, s120, s80, statistik("buero", 2)]) expect(s.max).toBeLessThanOrEqual(cfg.bewerbung.hoechstens);
    expect(statistik("buero", 2).max).toBe(cfg.bewerbung.hoechstens);
  });

  it("Fahrer haben bei Marktlohn im Mittel weniger Bewerber als andere Arten", () => {
    const fahrer = statistik("fahrer", 1).anzahl;
    for (const art of ["mechaniker", "buero", "kontrolle", "reinigung", "kundenservice"] as const) {
      expect(fahrer).toBeLessThan(statistik(art, 1).anzahl);
    }
  });

  it("Bewerber haben gültige Werte und Qualifikationen je Art", () => {
    const p = neuesPersonal(cfg);
    cfg.arten.forEach((art) => cfg.marktlohnEurH[art].forEach((l, i) => setzeLohn(p, art, i + 1, l * 1.2, cfg)));
    const z = neuerZufall(42);
    const fachrichtungen = new Set<string>();
    let einweisungen = 0;
    for (const art of cfg.arten) {
      for (let i = 0; i < 40; i++) {
        const r = schreibeAus(p, art, 20, civil(2027, 1, 1), z, cfg);
        if (!r.ok) throw new Error();
        for (const b of r.ausschreibung.bewerber) {
          expect(namen.vornamen).toContain(b.name.split(" ")[0]);
          expect(namen.nachnamen).toContain(b.name.split(" ")[1]);
          expect(Number.isInteger(b.zufriedenheit)).toBe(true);
          expect(b.zufriedenheit).toBeGreaterThanOrEqual(cfg.zufriedenheitStart[0]);
          expect(b.zufriedenheit).toBeLessThanOrEqual(cfg.zufriedenheitStart[1]);
          expect(Number.isInteger(b.gesundheit)).toBe(true);
          expect(b.gesundheit).toBeGreaterThanOrEqual(cfg.gesundheitStart[0]);
          expect(b.gesundheit).toBeLessThanOrEqual(cfg.gesundheitStart[1]);
          expect(b.erfahrungJahre).toBeGreaterThanOrEqual(0);
          expect(b.erfahrungJahre).toBeLessThanOrEqual(cfg.stufeAbJahren[5] + 5);
          if (art === "reinigung") expect(b.erfahrungJahre).toBeLessThan(cfg.stufeAbJahren[1]);
          if (art === "fahrer") {
            expect(b.qualifikationen.slice(0, 2)).toEqual(["fuehrerschein_d", "bkf"]);
            for (const q of b.qualifikationen.slice(2)) {
              expect(cfg.einweisungen.map((e) => `einweisung_${e}`)).toContain(q);
              einweisungen++;
            }
          } else if (art === "mechaniker") {
            expect(b.qualifikationen).toHaveLength(1);
            expect(cfg.fachrichtungen.map((f) => `fachrichtung_${f}`)).toContain(b.qualifikationen[0]);
            fachrichtungen.add(b.qualifikationen[0]);
          } else {
            expect(b.qualifikationen).toEqual([]);
          }
        }
      }
    }
    expect(einweisungen).toBeGreaterThan(0);
    expect(fachrichtungen.size).toBe(cfg.fachrichtungen.length);
  });

  it("gleicher Startwert ergibt gleiche Bewerber", () => {
    const a = ausschreiben(neuesPersonal(cfg), "kontrolle", civil(2027, 5, 1), 123);
    const b = ausschreiben(neuesPersonal(cfg), "kontrolle", civil(2027, 5, 1), 123);
    expect(a).toEqual(b);
  });

  it("raeumeAuf entfernt beendete Ausschreibungen", () => {
    const p = neuesPersonal(cfg);
    const a = ausschreiben(p, "buero", civil(2027, 1, 1));
    ausschreiben(p, "buero", civil(2027, 1, 20));
    expect(raeumeAuf(p, a.ende - 1)).toBe(0);
    expect(raeumeAuf(p, a.ende)).toBe(1);
    expect(p.ausschreibungen).toHaveLength(1);
    expect(p.ausschreibungen[0].id).not.toBe(a.id);
  });
});

describe("Einstellen", () => {
  function mitBewerber(): { p: Personal; a: Ausschreibung } {
    const p = neuesPersonal(cfg);
    for (let seed = 1; seed < 100; seed++) {
      const a = ausschreiben(p, "fahrer", civil(2027, 1, 1), seed);
      if (a.bewerber.length) return { p, a };
    }
    throw new Error("kein Bewerber");
  }

  it("nur sichtbare Bewerber, Person hat alle Felder, Ausschreibung ist danach weg", () => {
    const { p, a } = mitBewerber();
    const b = a.bewerber[0];
    expect(stelleEin(p, a.id, b.id, b.ankunft - 1)).toEqual({ ok: false, fehler: "nichtSichtbar" });
    expect(stelleEin(p, a.id, b.id, a.ende)).toEqual({ ok: false, fehler: "nichtSichtbar" });
    expect(stelleEin(p, 9999, b.id, b.ankunft)).toEqual({ ok: false, fehler: "ausschreibungUnbekannt" });
    expect(stelleEin(p, a.id, 9999, b.ankunft)).toEqual({ ok: false, fehler: "bewerberUnbekannt" });
    const jetzt = b.ankunft + 3600000;
    const r = stelleEin(p, a.id, b.id, jetzt);
    if (!r.ok) throw new Error(r.fehler);
    expect(r.person).toEqual({
      id: r.person.id,
      name: b.name,
      art: "fahrer",
      wochenstunden: 38,
      erfahrungJahreBeiEintritt: b.erfahrungJahre,
      eintritt: jetzt,
      zufriedenheit: b.zufriedenheit,
      gesundheit: b.gesundheit,
      qualifikationen: b.qualifikationen,
      austritt: null,
    });
    expect(p.personen).toEqual([r.person]);
    expect(p.ausschreibungen.find((x) => x.id === a.id)).toBeUndefined();
    expect(stelleEin(p, a.id, b.id, jetzt)).toEqual({ ok: false, fehler: "ausschreibungUnbekannt" });
  });
});

describe("Probezeit und Kündigung", () => {
  it("Probezeit dauert probezeitMonate", () => {
    const a = person({ eintritt: civil(2027, 1, 1) });
    expect(inProbezeit(a, civil(2027, 6, 30, 23, 59), cfg)).toBe(true);
    expect(inProbezeit(a, civil(2027, 7, 1), cfg)).toBe(false);
  });

  it("in der Probezeit: 2 Wochen zum Monatsende", () => {
    const e = civil(2027, 1, 1);
    // 10.3. + 14 Tage = 24.3., Ende März, Austritt 1.4.
    expect(kuendigungsTermin(e, civil(2027, 3, 10, 15), cfg)).toBe(civil(2027, 4, 1));
    // 17.3. + 14 Tage = 31.3., genau Monatsende
    expect(kuendigungsTermin(e, civil(2027, 3, 17), cfg)).toBe(civil(2027, 4, 1));
    // 18.3. + 14 Tage = 1.4., Ende April
    expect(kuendigungsTermin(e, civil(2027, 3, 18), cfg)).toBe(civil(2027, 5, 1));
  });

  it("nach 8 Monaten: 1 Monat zum Monatsende", () => {
    // 10.9. + 1 Monat = 10.10., Ende Oktober, Austritt 1.11.
    expect(kuendigungsTermin(civil(2027, 1, 1), civil(2027, 9, 10), cfg)).toBe(civil(2027, 11, 1));
  });

  it("nach 2 Jahren: 6 Wochen zum Quartalsende", () => {
    const e = civil(2025, 1, 1);
    // 20.2. + 42 Tage = 3.4., Quartalsende 30.6., Austritt 1.7.
    expect(kuendigungsTermin(e, civil(2027, 2, 20), cfg)).toBe(civil(2027, 7, 1));
    // 15.2. + 42 Tage = 29.3., Quartalsende 31.3., Austritt 1.4.
    expect(kuendigungsTermin(e, civil(2027, 2, 15), cfg)).toBe(civil(2027, 4, 1));
    // 20.11. + 42 Tage = 1.1.2028, Quartalsende 31.3.2028
    expect(kuendigungsTermin(e, civil(2027, 11, 20), cfg)).toBe(civil(2028, 4, 1));
  });

  it("nach 6 Jahren: 3 Monate zum Quartalsende, Staffel bis 12 Jahre", () => {
    // 10.5.2026 + 3 Monate = 10.8., Quartalsende 30.9., Austritt 1.10.
    expect(kuendigungsTermin(civil(2020, 1, 1), civil(2026, 5, 10), cfg)).toBe(civil(2026, 10, 1));
    // 9 Jahre: 4 Monate, 10.5. + 4 = 10.9., Austritt 1.10.
    expect(kuendigungsTermin(civil(2017, 1, 1), civil(2026, 5, 10), cfg)).toBe(civil(2026, 10, 1));
    // 12 Jahre: 6 Monate, 10.5. + 6 = 10.11., Austritt 1.1.2027
    expect(kuendigungsTermin(civil(2014, 1, 1), civil(2026, 5, 10), cfg)).toBe(civil(2027, 1, 1));
  });

  it("kuendige setzt den Austritt, doppelt kündigen und unbekannte Person werden abgelehnt", () => {
    const p = mitPersonen(person({ id: 5, eintritt: civil(2027, 1, 1) }));
    expect(kuendige(p, 5, civil(2027, 3, 10), cfg)).toEqual({ ok: true, austritt: civil(2027, 4, 1) });
    expect(p.personen[0].austritt).toBe(civil(2027, 4, 1));
    expect(kuendige(p, 5, civil(2027, 3, 11), cfg)).toEqual({ ok: false, fehler: "schonGekuendigt" });
    expect(kuendige(p, 6, civil(2027, 3, 11), cfg)).toEqual({ ok: false, fehler: "unbekannt" });
  });
});

describe("Monatslohn", () => {
  const voll = (20.85 * 38 * 4.348 + 1800 / 12) * 1.22; // 4385,802888

  it("Vollzeit-Fahrer Stufe 1, ganzer Monat", () => {
    const p = mitPersonen(person({ id: 1 }));
    const r = monatslohn(p, 2027, 4, cfg);
    expect(r.posten).toEqual([{ personId: 1, eur: 4385.8 }]);
    expect(r.summeEur).toBe(Math.round(voll * 100) / 100);
  });

  it("Eintritt am 16. eines Monats mit 30 Tagen: 15/30", () => {
    const p = mitPersonen(person({ id: 1, eintritt: civil(2027, 4, 16, 10, 30) }));
    expect(monatslohn(p, 2027, 4, cfg).summeEur).toBe(2192.9);
    expect(monatslohn(p, 2027, 3, cfg)).toEqual({ summeEur: 0, posten: [] });
  });

  it("Teilzeit 20 Stunden", () => {
    const p = mitPersonen(person({ id: 1, wochenstunden: 20 }));
    // (20,85 × 20 × 4,348 + 1800 × 20/38 / 12) × 1,22 = 2308,317...
    expect(monatslohn(p, 2027, 4, cfg).summeEur).toBe(2308.32);
  });

  it("Austritt mitten im Monat, danach entfernt", () => {
    const p = mitPersonen(person({ id: 1, austritt: civil(2027, 4, 11) }), person({ id: 2 }));
    const r = monatslohn(p, 2027, 4, cfg);
    // 10 von 30 Tagen
    expect(r.posten).toEqual([
      { personId: 1, eur: 1461.93 },
      { personId: 2, eur: 4385.8 },
    ]);
    expect(r.summeEur).toBe(5847.73);
    entferneAusgetreteneNachMonat(p, 2027, 3);
    expect(p.personen).toHaveLength(2);
    entferneAusgetreteneNachMonat(p, 2027, 4);
    expect(p.personen.map((x) => x.id)).toEqual([2]);
  });

  it("Austritt am Monatsende wird nach diesem Monat entfernt und kostet im Folgemonat nichts", () => {
    const p = mitPersonen(person({ id: 1, austritt: civil(2027, 5, 1) }));
    expect(monatslohn(p, 2027, 4, cfg).summeEur).toBe(4385.8);
    expect(monatslohn(p, 2027, 5, cfg).summeEur).toBe(0);
    entferneAusgetreteneNachMonat(p, 2027, 4);
    expect(p.personen).toHaveLength(0);
  });

  it("Stufe am Monatsende: Aufstieg zum 1. des Folgemonats zählt erst im Folgemonat", () => {
    const p = mitPersonen(person({ id: 1, erfahrungJahreBeiEintritt: 2, eintritt: civil(2027, 1, 1) }));
    expect(monatslohn(p, 2027, 12, cfg).summeEur).toBe(4385.8);
    const stufe2 = Math.round((21.17 * 38 * 4.348 + 150) * 1.22 * 100) / 100;
    expect(monatslohn(p, 2028, 1, cfg).summeEur).toBe(stufe2);
  });
});

describe("Speichern und Laden", () => {
  it("ergibt denselben Zustand", () => {
    const p = neuesPersonal(cfg);
    setzeLohn(p, "buero", 2, 23.5, cfg);
    ausschreiben(p, "mechaniker", civil(2027, 1, 1));
    const a = ausschreiben(p, "kundenservice", civil(2027, 1, 1), 5);
    p.personen.push(person({ id: p.naechsteId++, austritt: civil(2027, 7, 1) }));
    const geladen = ladePersonal(serialisierePersonal(p), cfg);
    expect(geladen).toEqual(p);
    expect(ladePersonal(JSON.parse(serialisierePersonal(p)), cfg)).toEqual(p);
    expect(geladen.ausschreibungen.find((x) => x.id === a.id)).toEqual(a);
  });

  it("kaputte Daten werfen PersonalLadeFehler", () => {
    const gut = JSON.parse(serialisierePersonal(mitPersonen(person({ id: 1 }))));
    const kaputt: unknown[] = [
      "kein json",
      null,
      { ...gut, version: 2 },
      { ...gut, naechsteId: "x" },
      { ...gut, lohntabelle: { ...gut.lohntabelle, fahrer: [20] } },
      { ...gut, lohntabelle: { ...gut.lohntabelle, reinigung: [-1] } },
      { ...gut, personen: "nein" },
      { ...gut, personen: [{ ...gut.personen[0], art: "pilot" }] },
      { ...gut, personen: [{ ...gut.personen[0], wochenstunden: 50 }] },
      { ...gut, personen: [{ ...gut.personen[0], id: 1 }, { ...gut.personen[0], id: 1 }] },
      { ...gut, personen: [{ ...gut.personen[0], id: 7 }] },
      { ...gut, ausschreibungen: [{ id: 1, art: "fahrer", wochenstunden: 38, erstellt: 0, ende: 1, bewerber: [{}] }] },
    ];
    for (const k of kaputt) expect(() => ladePersonal(typeof k === "string" ? k : JSON.stringify(k), cfg)).toThrow(PersonalLadeFehler);
  });
});
