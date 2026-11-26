import "fake-indexeddb/auto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { civil } from "../src/calendar/civil";
import { config } from "../src/config";
import { neuesSpiel, pruefeSetup, type SpielZustand } from "../src/game/setup";
import { ladeSpielstand, migriere, SpielstandFehler, spielstandDaten, spielstandInfo, type SpielstandDaten } from "../src/game/spielstand";
import { erzeugeRichtungen, fuegeFahrtHinzu, fuegeHaltEin, fuegeWegpunktEin, Haltestellen, legeLinieAn, neueHaltestelle, osmHaltId, setzeTakt, streicheFahrt, weiseBusZu } from "../src/linien/linien";
import { ladeNetz, NetzLadeFehler } from "../src/linien/speichern";
import { IndexedDbStore } from "../src/storage/indexeddb";
import { SqliteStore, type SqlExecutor } from "../src/storage/sqlite";
import { SaveVersionError, type SaveStore } from "../src/storage/types";
import { DienstLadeFehler, ladeDienstplan } from "../src/dienste/dienste";
import { neuerDienstplan } from "../src/dienste/typen";
import type { World } from "../src/world/world";
import { geradenNetz, halt } from "./helpers/linien-netz";

const L = config.linien;

function sqlExec(db: DatabaseSync): SqlExecutor {
  return {
    execute: async (sql, p = []) => void db.prepare(sql).run(...(p as never[])),
    select: async <T>(sql: string, p: unknown[] = []) => db.prepare(sql).all(...(p as never[])) as T[],
  };
}

/** Spielstand mit Haltestellen, Linie, Varianten, Takt, Fahrtänderungen und Bus (ohne Katalog, Bus direkt eingetragen). */
function spielMitLinie(): SpielZustand {
  const setup = pruefeSetup({ gemeinde: { art: "norderstedt" }, startkapital: "1000000", firmenname: "Speichertest", firmenfarbe: "#123456" }, config.setup);
  if (!setup.ok) throw new Error();
  const world = { gemeinde: { name: "Norderstedt", region: "DE-SH" }, gebiete: [{ id: "g1" }] } as unknown as World;
  const s = neuesSpiel(setup.werte, world, civil(2026, 11, 25, 8), 42);
  const net = geradenNetz(4);
  const stops = [halt(net, 1, "A", 0, 0.5), halt(net, 2, "B", 2, 0.5)];
  const halte = new Haltestellen(stops, s.netz);
  const n = neueHaltestelle(s.netz, "Neu", [10, 53.7], stops[0].snaps, true, L);
  if (!n.ok) throw new Error();
  const l = legeLinieAn(s.netz, { nummer: "X20", name: "Express", farbe: "#00843d" }, L);
  if (!l.ok) throw new Error();
  fuegeHaltEin(l.linie.perlen, halte, osmHaltId(1), () => true, L);
  fuegeWegpunktEin(l.linie.perlen, [10.01, 53.7], [stops[1].snaps[0]]);
  fuegeHaltEin(l.linie.perlen, halte, osmHaltId(2), () => true, L);
  erzeugeRichtungen(s.netz, l.linie, halte, L, "nach");
  setzeTakt(l.linie.varianten[0], "werktag", [{ vonMin: 360, bisMin: 600, taktMin: 15 }], L);
  streicheFahrt(l.linie.varianten[0], "werktag", 6 * 3600);
  fuegeFahrtHinzu(s.netz, l.linie.varianten[0], "werktag", 7 * 3600 + 300, L);
  s.netz.namen[osmHaltId(1)] = "A umbenannt";
  // Bus direkt im Fuhrpark (Kauf ist in tests/fuhrpark.test.ts geprüft)
  s.fuhrpark.busse.push({
    id: 1, modellId: "m1", flottennummer: "1", kennzeichen: "SE-A 1", herkunft: "neu", baujahr: 2026, alterBeiKaufJahre: 0, kaufzeit: s.zeit, kaufpreisEur: 1, neupreisKonfigEur: 1,
    laufleistungKm: 0, zustand: 100, batterieZustand: null, huBis: s.zeit, konfig: { batterieKwh: null, lackierung: "#ffffff", optionen: [] }, sitzplaetze: 30, stehplaetze: 50, platz: { art: "stellplatz", id: 1 },
  });
  s.fuhrpark.naechsteBusId = 2;
  weiseBusZu(s.netz, l.linie.id, 1);
  // Dienstplan (Etappe 3c-1): ein Dienst mit einem Stück, eigene Ferien-Dienste am Samstag
  s.dienste.dienste.push({ id: 1, nummer: "D1", tag: "werktag", stuecke: [{ linie: l.linie.id, fahrten: [{ variante: l.linie.varianten[0].id, schluessel: "t22500" }, { variante: l.linie.varianten[1].id, schluessel: "z1" }] }] });
  s.dienste.naechsteId = 2;
  s.dienste.eigeneFerienDienste.samstag = true;
  return s;
}

const stores: [string, (v: number, db?: DatabaseSync, name?: string) => SaveStore][] = [
  ["SQLite", (v, db = new DatabaseSync(":memory:")) => new SqliteStore(sqlExec(db), v)],
  ["IndexedDB", (v, _db, name = "spielstand-" + Math.random()) => new IndexedDbStore(name, "s", v)],
];

describe.each(stores)("Spielstand speichern und laden (%s)", (_n, make) => {
  it("Linien, Varianten, Takt, Fahrtänderungen, neue und umbenannte Haltestellen und Busszuweisung bleiben erhalten", async () => {
    const s = spielMitLinie();
    const store = make(config.storage.saveVersion);
    await store.init();
    await store.save("autosave", spielstandDaten(s));
    const rec = await store.load("autosave");
    expect(rec?.version).toBe(3);
    const geladen = ladeSpielstand(rec!, new Set(["m1"]));
    expect(geladen).toEqual(s);
    expect(geladen.dienste.dienste[0].stuecke[0].fahrten).toHaveLength(2);
    expect(geladen.netz.linien[0].varianten[0].aenderungen.map((a) => a.art)).toEqual(["streichen", "zusatz"]);
    expect(spielstandInfo(rec)).toEqual({ firma: "Speichertest", gemeinde: "Norderstedt", zeit: s.zeit, datei: null });
  });

  it("Migration: ein Stand der Etappe 3a (Version 1, ohne Linien) lädt mit leerem Liniennetz", async () => {
    const db = new DatabaseSync(":memory:");
    const name = "migration-" + Math.random();
    const s = spielMitLinie();
    const { netz: _weg, dienste: _d, ...v1 } = spielstandDaten(s);
    const alt = make(1, db, name);
    await alt.init();
    await alt.save("autosave", v1);
    const neu = make(config.storage.saveVersion, db, name);
    await neu.init();
    const rec = await neu.load("autosave");
    expect(rec?.version).toBe(1);
    const geladen = ladeSpielstand(rec!, new Set(["m1"]));
    expect(geladen.netz).toEqual({ version: 1, linien: [], neueHaltestellen: [], namen: {}, naechsteLinieId: 1, naechsteVarianteId: 1, naechsteHaltestelleId: 1, naechsteZusatzId: 1 });
    expect({ ...geladen, netz: s.netz, dienste: s.dienste }).toEqual(s);
    expect(geladen.dienste).toEqual(neuerDienstplan());
  });

  it("Migration: ein Stand der Etappe 3b (Version 2, ohne Dienste) lädt mit leerem Dienstplan, Linien bleiben", async () => {
    const db = new DatabaseSync(":memory:");
    const name = "migration2-" + Math.random();
    const s = spielMitLinie();
    const { dienste: _weg, ...v2 } = spielstandDaten(s);
    const alt = make(2, db, name);
    await alt.init();
    await alt.save("autosave", v2);
    const neu = make(config.storage.saveVersion, db, name);
    await neu.init();
    const rec = await neu.load("autosave");
    expect(rec?.version).toBe(2);
    const geladen = ladeSpielstand(rec!, new Set(["m1"]));
    expect(geladen.dienste).toEqual(neuerDienstplan());
    expect(geladen.netz).toEqual(s.netz);
  });

  it("ein Stand mit neuerer Version wird abgelehnt", async () => {
    const db = new DatabaseSync(":memory:");
    const name = "neuer-" + Math.random();
    const neuer = make(config.storage.saveVersion + 1, db, name);
    await neuer.init();
    await neuer.save("autosave", spielstandDaten(spielMitLinie()));
    const app = make(config.storage.saveVersion, db, name);
    await app.init();
    await expect(app.load("autosave")).rejects.toThrow(SaveVersionError);
  });
});

describe("Prüfung beim Laden", () => {
  it("unbekannte Modelle, kaputte Linien und neuere Versionen werden mit SpielstandFehler gemeldet", () => {
    const d = spielstandDaten(spielMitLinie());
    expect(() => ladeSpielstand({ version: 2, savedAt: "", payload: d }, new Set(["anderes"]))).toThrow(SpielstandFehler);
    const kaputt = structuredClone(d);
    (kaputt.netz!.linien[0] as { farbe: string }).farbe = "rot";
    expect(() => ladeSpielstand({ version: 2, savedAt: "", payload: kaputt })).toThrow(/Linie ungültig/);
    expect(() => migriere(config.storage.saveVersion + 1, d)).toThrow(SpielstandFehler);
    expect(spielstandInfo(null)).toBeNull();
    expect(spielstandInfo({ version: 2, savedAt: "", payload: { quatsch: 1 } })).toBeNull();
  });

  it("Liniennetz: doppelte Nummern und Ids werden erkannt, Busse, die es nicht mehr gibt, fallen aus der Linie", () => {
    const n = spielMitLinie().netz;
    expect(ladeNetz(structuredClone(n), new Set()).linien[0].busse).toEqual([]);
    const doppelt = structuredClone(n);
    doppelt.linien.push({ ...structuredClone(doppelt.linien[0]), id: 99, nummer: "x20", varianten: [] });
    doppelt.naechsteLinieId = 100;
    expect(() => ladeNetz(doppelt)).toThrow(NetzLadeFehler);
    const idZuGross = structuredClone(n);
    idZuGross.naechsteVarianteId = 1;
    expect(() => ladeNetz(idZuGross)).toThrow(/Varianten-Ids/);
    const takt = structuredClone(n) as unknown as { linien: { varianten: { takt: Record<string, unknown> }[] }[] };
    delete takt.linien[0].varianten[0].takt.samstag;
    expect(() => ladeNetz(takt)).toThrow(/Takt ungültig/);
    expect(() => ladeNetz({ version: 2 })).toThrow(/Version/);
    const v: SpielstandDaten = spielstandDaten(spielMitLinie());
    expect(ladeNetz(v.netz)).toEqual(v.netz);
  });

  it("Dienstplan: ungültige Dienste, doppelte Nummern je Tagesart und zu große Ids werden erkannt", () => {
    const p = spielMitLinie().dienste;
    expect(ladeDienstplan(structuredClone(p))).toEqual(p);
    const doppelt = structuredClone(p);
    doppelt.dienste.push({ ...structuredClone(p.dienste[0]), id: 5, nummer: "d1" });
    doppelt.naechsteId = 6;
    expect(() => ladeDienstplan(doppelt)).toThrow(/Dienstnummer doppelt/);
    // gleiche Nummer an einer anderen Tagesart ist erlaubt
    doppelt.dienste[1].tag = "samstag";
    expect(ladeDienstplan(doppelt).dienste).toHaveLength(2);
    const zuGross = structuredClone(p);
    zuGross.naechsteId = 1;
    expect(() => ladeDienstplan(zuGross)).toThrow(DienstLadeFehler);
    const schluessel = structuredClone(p);
    schluessel.dienste[0].stuecke[0].fahrten[0].schluessel = "x1";
    expect(() => ladeDienstplan(schluessel)).toThrow(/Dienststück/);
    expect(() => ladeDienstplan({ version: 2 })).toThrow(/Version/);
    // Regression Prüfung 3c-1, Befund 9: leere Stücke und zu lange Nummern werden abgelehnt
    const leer = structuredClone(p);
    leer.dienste[0].stuecke.push({ linie: 1, fahrten: [] });
    expect(() => ladeDienstplan(leer)).toThrow(/Dienststück/);
    const lang = structuredClone(p);
    lang.dienste[0].nummer = "x".repeat(config.dienste.nummerMaxLaenge + 1);
    expect(() => ladeDienstplan(lang)).toThrow(DienstLadeFehler);
    const v3 = spielstandDaten(spielMitLinie());
    expect(() => ladeSpielstand({ version: 3, savedAt: "", payload: { ...v3, dienste: { ...v3.dienste, dienste: [{ id: 1 }] } } }, new Set(["m1"]))).toThrow(SpielstandFehler);
  });
});
