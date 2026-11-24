import { describe, expect, it } from "vitest";
import { config } from "../src/config";
import { pruefeSetup } from "../src/game/setup";
import { aktionFuer, Zeitsteuerung } from "../src/ui/keys";

const gut = { gemeinde: { art: "norderstedt" as const }, startkapital: "2000000", firmenname: "Nordbus", firmenfarbe: "#0B6E4F" };

describe("Einrichtungsdialog: Prüfung", () => {
  it("nimmt gültige Eingaben an", () => {
    const r = pruefeSetup(gut, config.setup);
    expect(r).toEqual({ ok: true, werte: { gemeinde: { art: "norderstedt" }, startkapital: 2000000, firmenname: "Nordbus", firmenfarbe: "#0b6e4f" } });
  });
  it("Startkapital frei einstellbar, auch mit deutscher Schreibweise", () => {
    expect(pruefeSetup({ ...gut, startkapital: "1.500.000,50" }, config.setup)).toMatchObject({ ok: true, werte: { startkapital: 1500000.5 } });
    expect(pruefeSetup({ ...gut, startkapital: 1 }, config.setup).ok).toBe(true);
  });
  it.each([
    [{ gemeinde: null }, "gemeinde"],
    [{ startkapital: "" }, "startkapital"],
    [{ startkapital: "0" }, "startkapital"],
    [{ startkapital: "-5" }, "startkapital"],
    [{ startkapital: "abc" }, "startkapital"],
    [{ firmenname: "   " }, "firmenname"],
    [{ firmenname: "x".repeat(61) }, "firmenname"],
    [{ firmenfarbe: "rot" }, "firmenfarbe"],
  ])("meldet Fehler bei %o", (aenderung, feld) => {
    const r = pruefeSetup({ ...gut, ...aenderung } as never, config.setup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fehler)).toEqual([feld]);
  });
});

describe("Tastenkürzel", () => {
  it("Leertaste, 1 bis 5, Esc, F3, Strg+S und Cmd+S", () => {
    expect(aktionFuer({ key: " " })).toEqual({ art: "pauseUmschalten" });
    expect(aktionFuer({ key: "1" })).toEqual({ art: "tempo", stufe: 1 });
    expect(aktionFuer({ key: "5" })).toEqual({ art: "tempo", stufe: 5 });
    expect(aktionFuer({ key: "6" })).toBeNull();
    expect(aktionFuer({ key: "0" })).toBeNull();
    expect(aktionFuer({ key: "F3" })).toEqual({ art: "testansicht" });
    expect(aktionFuer({ key: "Escape" })).toEqual({ art: "fensterSchliessen" });
    expect(aktionFuer({ key: "s", ctrlKey: true })).toEqual({ art: "speichern" });
    expect(aktionFuer({ key: "s", metaKey: true })).toEqual({ art: "speichern" });
  });
  it("in Eingabefeldern gelten nur Esc und Speichern", () => {
    expect(aktionFuer({ key: " ", inEingabe: true })).toBeNull();
    expect(aktionFuer({ key: "2", inEingabe: true })).toBeNull();
    expect(aktionFuer({ key: "Escape", inEingabe: true })).toEqual({ art: "fensterSchliessen" });
  });
  it("Zeitsteuerung: Leertaste kehrt zur letzten Stufe zurück", () => {
    const z = new Zeitsteuerung(config.sim.speeds, 1);
    expect(z.setzeStufe(4)).toBe(240);
    expect(z.umschalten()).toBe(0);
    expect(z.pausiert).toBe(true);
    expect(z.umschalten()).toBe(240);
    z.pause();
    expect(z.setzeStufe(5)).toBe(600);
    expect([1, 2, 3, 4, 5].map((s) => z.setzeStufe(s as 1 | 2 | 3 | 4 | 5))).toEqual([1, 10, 60, 240, 600]);
  });
});
