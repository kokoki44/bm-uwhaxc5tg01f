import { describe, expect, it } from "vitest";
import { jahreszeit, schulferienAm, tagesInfo } from "../src/calendar/calendar";
import { civil, isoDay, jetztCivil, parts } from "../src/calendar/civil";
import { BUNDESLAENDER, feiertagAm, feiertage, ostersonntag } from "../src/calendar/holidays";
import { schulferien, validateSchulferien } from "../src/config";

describe("Ostern", () => {
  it.each([
    [2019, "2019-04-21"], [2024, "2024-03-31"], [2025, "2025-04-20"], [2026, "2026-04-05"],
    [2027, "2027-03-28"], [2028, "2028-04-16"], [2030, "2030-04-21"], [2038, "2038-04-25"],
  ])("Ostersonntag %i ist am %s", (j, d) => expect(isoDay(ostersonntag(j))).toBe(d));
});

describe("Gesetzliche Feiertage per Regel", () => {
  // Anzahl je Bundesland 2026 (bundesweit 9 plus Landesfeiertage)
  const anzahl2026: Record<string, number> = {
    "DE-BW": 12, "DE-BY": 13, "DE-BE": 10, "DE-BB": 12, "DE-HB": 10, "DE-HH": 10, "DE-HE": 10, "DE-MV": 11,
    "DE-NI": 10, "DE-NW": 11, "DE-RP": 11, "DE-SL": 12, "DE-SN": 11, "DE-ST": 11, "DE-SH": 10, "DE-TH": 11,
  };
  it("deckt alle 16 Bundesländer ab", () => {
    expect([...BUNDESLAENDER].sort()).toEqual(Object.keys(anzahl2026).sort());
    for (const l of BUNDESLAENDER) expect(feiertage(2026, l), l).toHaveLength(anzahl2026[l]);
  });
  it("bekannte Tage 2026", () => {
    expect(feiertagAm("2026-04-03", "DE-SH")).toBe("Karfreitag");
    expect(feiertagAm("2026-05-14", "DE-SH")).toBe("Christi Himmelfahrt");
    expect(feiertagAm("2026-05-25", "DE-HH")).toBe("Pfingstmontag");
    expect(feiertagAm("2026-10-03", "DE-BY")).toBe("Tag der Deutschen Einheit");
    expect(feiertagAm("2026-06-04", "DE-NW")).toBe("Fronleichnam");
    expect(feiertagAm("2026-06-04", "DE-SH")).toBeNull();
    expect(feiertagAm("2026-10-31", "DE-SH")).toBe("Reformationstag");
    expect(feiertagAm("2026-10-31", "DE-BW")).toBeNull();
    expect(feiertagAm("2026-11-01", "DE-BW")).toBe("Allerheiligen");
    expect(feiertagAm("2026-11-18", "DE-SN")).toBe("Buß- und Bettag");
    expect(feiertagAm("2026-11-18", "DE-SH")).toBeNull();
    expect(feiertagAm("2026-01-06", "DE-ST")).toBe("Heilige Drei Könige");
    expect(feiertagAm("2026-04-05", "DE-BB")).toBe("Ostersonntag");
    expect(feiertagAm("2026-09-20", "DE-TH")).toBe("Weltkindertag");
    expect(feiertagAm("2026-08-15", "DE-SL")).toBe("Mariä Himmelfahrt");
  });
  it("bekannte Tage anderer Jahre und Einführungsjahre", () => {
    expect(feiertagAm("2027-11-17", "DE-SN")).toBe("Buß- und Bettag");
    expect(feiertagAm("2028-06-15", "DE-BW")).toBe("Fronleichnam");
    expect(feiertagAm("2030-05-30", "DE-SH")).toBe("Christi Himmelfahrt");
    // Reformationstag in SH, HH, NI, HB seit 2018, 2017 bundesweit einmalig
    expect(feiertagAm("2016-10-31", "DE-SH")).toBeNull();
    expect(feiertagAm("2017-10-31", "DE-BY")).toBe("Reformationstag");
    expect(feiertagAm("2018-10-31", "DE-HH")).toBe("Reformationstag");
    // Frauentag Berlin seit 2019, Mecklenburg-Vorpommern seit 2023
    expect(feiertagAm("2022-03-08", "DE-MV")).toBeNull();
    expect(feiertagAm("2023-03-08", "DE-MV")).toBe("Internationaler Frauentag");
    expect(feiertagAm("2025-05-08", "DE-BE")).toBe("Tag der Befreiung");
    expect(feiertagAm("2026-05-08", "DE-BE")).toBeNull();
  });
  it("ohne Bundesland nur die bundesweit einheitlichen Feiertage", () => {
    const f = feiertage(2026, null);
    expect(f).toHaveLength(9);
    expect(f.map((x) => x.name)).not.toContain("Reformationstag");
  });
});

describe("Schulferien aus Tabellen", () => {
  it("Tabellen sind gültig und haben Quellen", () => {
    expect(() => validateSchulferien(schulferien)).not.toThrow();
    expect(Object.keys(schulferien.ferien).sort()).toEqual(["DE-HH", "DE-SH"]);
    expect(() => validateSchulferien({ quellen: {}, ferien: { "DE-XX": [] } })).toThrow(/Quelle/);
  });
  it("bekannte Ferientage Schleswig-Holstein und Hamburg", () => {
    expect(schulferienAm("2026-12-24", "DE-SH", schulferien)).toBe("Weihnachtsferien");
    expect(schulferienAm("2027-07-10", "DE-SH", schulferien)).toBe("Sommerferien");
    expect(schulferienAm("2027-05-07", "DE-SH", schulferien)).toBe("Himmelfahrtsferien");
    expect(schulferienAm("2027-08-15", "DE-SH", schulferien)).toBeNull();
    expect(schulferienAm("2026-10-20", "DE-HH", schulferien)).toBe("Herbstferien");
    expect(schulferienAm("2027-03-05", "DE-HH", schulferien)).toBe("Frühjahrsferien");
    expect(schulferienAm("2029-08-10", "DE-HH", schulferien)).toBe("Sommerferien");
    expect(schulferienAm("2029-08-13", "DE-HH", schulferien)).toBeNull();
  });
  it("ohne Tabelle keine Schulferien (andere Länder, Jahre ohne Tabelle)", () => {
    expect(schulferienAm("2027-07-10", "DE-BY", schulferien)).toBeNull();
    expect(schulferienAm("2027-07-10", null, schulferien)).toBeNull();
    expect(schulferienAm("2033-07-10", "DE-SH", schulferien)).toBeNull();
  });
});

describe("Kalender", () => {
  it("Wochentag, Tagesart, Jahreszeit", () => {
    const sa = tagesInfo(civil(2026, 11, 28, 10), "DE-SH", schulferien);
    expect(sa).toMatchObject({ wochentag: 6, tagesart: "samstag", jahreszeit: "herbst", feiertag: null });
    const weihnachten = tagesInfo(civil(2026, 12, 25), "DE-SH", schulferien);
    expect(weihnachten).toMatchObject({ tagesart: "sonnFeiertag", feiertag: "1. Weihnachtstag", schulferien: "Weihnachtsferien", jahreszeit: "winter" });
    // Reformationstag 2026 fällt auf einen Samstag: Feiertag geht vor
    expect(tagesInfo(civil(2026, 10, 31), "DE-SH", schulferien).tagesart).toBe("sonnFeiertag");
    expect(tagesInfo(civil(2026, 11, 24), "DE-SH", schulferien).tagesart).toBe("werktag");
    expect(tagesInfo(civil(2026, 11, 29), "DE-SH", schulferien).tagesart).toBe("sonnFeiertag");
  });
  it("Jahreszeiten meteorologisch, Südhalbkugel umgekehrt", () => {
    expect([3, 6, 9, 12].map((m) => jahreszeit(m))).toEqual(["fruehling", "sommer", "herbst", "winter"]);
    expect(jahreszeit(1, true)).toBe("sommer");
  });
  it("Spielstart in der Gegenwart, Uhrzeit läuft über Mitternacht und Jahreswechsel", () => {
    const start = jetztCivil(new Date(2026, 11, 31, 23, 59, 30));
    expect(parts(start)).toMatchObject({ jahr: 2026, monat: 12, tag: 31, stunde: 23, minute: 59, sekunde: 0 });
    expect(parts(start + 60_000)).toMatchObject({ jahr: 2027, monat: 1, tag: 1, stunde: 0, minute: 0, wochentag: 5 });
  });
});
