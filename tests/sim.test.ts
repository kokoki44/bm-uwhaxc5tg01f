import { describe, expect, it } from "vitest";
import { config } from "../src/config";
import { SimCore } from "../src/sim/core";

const mk = () => new SimCore({ ...config.sim });

describe("Simulationskern", () => {
  it("tickt in festen Schritten, unabhängig von der Aufrufgröße", () => {
    const a = mk(), b = mk();
    a.advance(1000);
    for (let i = 0; i < 100; i++) b.advance(10);
    expect(a.status()).toEqual(b.status());
    expect(a.status().ticks).toBe(1000 / config.sim.tickRealMs);
  });
  it("Spielzeit wächst mit der Geschwindigkeit", () => {
    const s = mk();
    s.setSpeed(60);
    s.advance(1000);
    expect(s.status().gameSeconds).toBeCloseTo(60);
  });
  it("steht bei Pause still", () => {
    const s = mk();
    s.advance(500);
    s.setSpeed(0);
    const vorher = s.status();
    s.advance(5000);
    expect(s.status()).toEqual({ ...vorher, speed: 0 });
  });
  it("ein Spieltag bei 60-fach dauert 24 Minuten Echtzeit (60 mal Echtzeit)", () => {
    const s = mk();
    s.setSpeed(60);
    // 1440 s Echtzeit in Schritten wie im Worker
    for (let i = 0; i < 14400; i++) s.advance(config.sim.tickRealMs);
    expect(s.status().gameSeconds).toBeCloseTo(86400, 6);
  });
  it("jede Stufe: Spielzeit = Stufe mal Echtzeit", () => {
    for (const tempo of config.sim.speeds) {
      const s = mk();
      s.setSpeed(tempo);
      for (let i = 0; i < 100; i++) s.advance(config.sim.tickRealMs);
      expect(s.status().gameSeconds).toBeCloseTo((tempo * 100 * config.sim.tickRealMs) / 1000, 6);
    }
  });
  it("begrenzt das Nachholen und weist falsche Geschwindigkeiten ab", () => {
    const s = mk();
    expect(s.advance(1e7)).toBe(config.sim.maxCatchUpTicks);
    expect(() => s.setSpeed(3)).toThrow();
  });
});
