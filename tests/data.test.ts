import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { config } from "../src/config";
import { parseOsmGz } from "../src/data/osm";
import { ladeNorderstedt } from "./helpers/norderstedt";

describe("Testdatensatz Norderstedt", () => {
  it("liegt im Projekt, ist lesbar und nicht leer", async () => {
    const d = await ladeNorderstedt();
    expect(d.elements.length).toBeGreaterThan(1000);
    expect(d.osm3s?.copyright).toMatch(/ODbL/);
    expect(d.elements.some((e) => e.tags?.highway)).toBe(true);
    expect(d.elements.some((e) => e.tags?.highway === "bus_stop")).toBe(true);
    expect(d.elements.some((e) => e.tags?.building)).toBe(true);
  });
  it("enthält Abbiegeverbote, Ampeln, Knotenlisten der Wege, Wasser, Grün und die Gemeindegrenze", async () => {
    const d = await ladeNorderstedt();
    expect(d.elements.filter((e) => e.tags?.type === "restriction").length).toBeGreaterThan(50);
    expect(d.elements.filter((e) => e.tags?.highway === "traffic_signals").length).toBeGreaterThan(100);
    const strassen = d.elements.filter((e) => e.type === "way" && e.tags?.highway);
    expect(strassen.every((w) => w.nodes && w.geometry && w.nodes.length === w.geometry.length)).toBe(true);
    expect(d.elements.some((e) => e.tags?.natural === "water" || e.tags?.waterway)).toBe(true);
    expect(d.elements.some((e) => e.tags?.leisure === "park" || e.tags?.landuse === "forest")).toBe(true);
    expect(d.elements.some((e) => e.tags?.boundary === "administrative" && e.tags.admin_level === "8" && e.tags.name === "Norderstedt")).toBe(true);
  });
  it("Datei ist unverändert (Hash). Nach bewusstem Neuabruf setzt npm run daten:norderstedt den Hash neu", () => {
    const pfad = "public/" + config.data.norderstedtPath;
    const soll = readFileSync(pfad.replace(".osm.json.gz", ".sha256"), "utf8").trim();
    expect(createHash("sha256").update(readFileSync(pfad)).digest("hex")).toBe(soll);
  });
  it("Quellenangabe nach ODbL mit Stand und Abfrage liegt dabei", () => {
    const q = readFileSync("public/data/norderstedt/QUELLE.md", "utf8");
    expect(q).toMatch(/OpenStreetMap-Mitwirkende/);
    expect(q).toMatch(/ODbL/);
    expect(q).toMatch(/type"="restriction/);
    expect(q).toMatch(/traffic_signals/);
    const stand = /Stand der OSM-Daten (\S+)/.exec(q)?.[1];
    expect(stand).toBeTruthy();
  });
  it("lehnt Dateien in falschem Format verständlich ab", async () => {
    const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
    await expect(parseOsmGz(bytes("kein json"))).rejects.toThrow(/kein JSON/);
    await expect(parseOsmGz(bytes('{"a":1}'))).rejects.toThrow(/keine OSM-Elemente/);
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
