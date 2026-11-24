import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { config } from "../src/config";
import { parseOsmGz } from "../src/data/osm";

describe("Testdatensatz Norderstedt", () => {
  it("liegt im Projekt, ist lesbar und nicht leer", async () => {
    const buf = readFileSync("public/" + config.data.norderstedtPath);
    const d = await parseOsmGz(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    expect(d.elements.length).toBeGreaterThan(1000);
    expect(d.osm3s?.copyright).toMatch(/ODbL/);
    expect(d.elements.some((e) => e.tags?.highway)).toBe(true);
    expect(d.elements.some((e) => e.tags?.highway === "bus_stop")).toBe(true);
    expect(d.elements.some((e) => e.tags?.building)).toBe(true);
  });
  it("Quellenangabe nach ODbL liegt dabei", () => {
    expect(readFileSync("public/data/norderstedt/QUELLE.md", "utf8")).toMatch(/OpenStreetMap-Mitwirkende/);
  });
});

describe("Regression: bereits entpackte Antwort", () => {
  it("liest auch Klartext-JSON, wenn der Server Content-Encoding gzip gesetzt hat", async () => {
    const json = JSON.stringify({ elements: [{ type: "node", id: 1 }] });
    const bytes = new TextEncoder().encode(json);
    const d = await parseOsmGz(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(d.elements).toHaveLength(1);
  });
});
