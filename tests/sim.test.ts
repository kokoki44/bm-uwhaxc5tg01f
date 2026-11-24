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
  it("begrenzt das Nachholen und weist falsche Geschwindigkeiten ab", () => {
    const s = mk();
    expect(s.advance(1e7)).toBe(config.sim.maxCatchUpTicks);
    expect(() => s.setSpeed(3)).toThrow();
  });
});
