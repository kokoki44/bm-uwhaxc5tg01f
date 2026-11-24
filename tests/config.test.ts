import { describe, expect, it } from "vitest";
import { config, validateConfig } from "../src/config";
import de from "../src/i18n/de.json";
import { setLanguage, t } from "../src/i18n";

describe("Konfiguration", () => {
  it("wird geladen und enthält die Simulationswerte", () => {
    expect(config.sim.tickRealMs).toBeGreaterThan(0);
    expect(config.sim.speeds).toEqual([0, 1, 5, 20, 60]);
  });
  it("lehnt unvollständige Konfiguration ab", () => {
    expect(() => validateConfig({})).toThrow(/Konfiguration ungültig/);
    expect(() => validateConfig({ ...config, sim: { ...config.sim, tickRealMs: 0 } })).toThrow();
  });
});

describe("Sprachdatei", () => {
  it("liefert Texte mit Platzhaltern", () => {
    expect(t("app.titel")).toBe("Bus-Manager");
    expect(t("status.daten", { anzahl: 5 })).toContain("5");
  });
  it("wirft bei unbekanntem Schlüssel und Sprache", () => {
    expect(() => t("gibt.es.nicht" as never)).toThrow();
    expect(() => setLanguage("xx")).toThrow();
  });
  it("enthält keine Gedankenstriche", () => {
    for (const v of Object.values(de)) expect(v).not.toMatch(/[–—]/);
  });
});
