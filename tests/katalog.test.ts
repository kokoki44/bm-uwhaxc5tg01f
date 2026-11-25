import { describe, expect, it } from "vitest";
import { CATALOG_COLUMNS } from "../src/catalog/columns";
import {
  AUSWAHL_SPALTEN,
  artAusRegel,
  batterieOptionen,
  erlaubteWerte,
  ladeKatalog,
  MELDUNG_CODES,
  ZAHL_SPALTEN,
  type Bus,
  type KatalogErgebnis,
  type Meldung,
} from "../src/catalog/katalog";
import { leseKatalogDatei } from "../src/catalog/reader";
import { config } from "../src/config";
import {
  busse,
  echteKatalogBytes,
  entferneBlatt,
  spaltenNr,
  tauscheSpalten,
  veraenderterKatalog,
  zeilenNr,
} from "./helpers/katalog-datei";

const cfg = config.catalog;
const fehler = (e: KatalogErgebnis) => e.meldungen.filter((m) => m.schwere === "fehler");
const finde = (e: KatalogErgebnis, m: Partial<Meldung>) =>
  e.meldungen.filter((x) => Object.entries(m).every(([k, v]) => x[k as keyof Meldung] === v));
const modell = (e: KatalogErgebnis, id: string) => e.modelle.find((b) => b.modell_id === id);

/** Spalten, die laut Blatt Spalten aus den Standardwerten der Klasse gefüllt werden und dort vorkommen. */
const KLASSEN_SPALTEN = [
  "neupreis_eur", "wartungskosten_eur_pro_km", "intervall_klein_km", "intervall_gross_km", "intervall_hu_monate",
  "lebensdauer_jahre", "zuverlaessigkeit", "teilebedarf_faktor",
] as const;

describe("Fahrzeugkatalog einlesen: echte Datei", () => {
  it("liest 208 Zeilen, 206 Modelle sind nutzbar, nur die zwei Altas Novus ohne Länge sind Fehler", async () => {
    const e = await ladeKatalog(echteKatalogBytes(), cfg);
    expect(e.zeilenGesamt).toBe(208);
    expect(e.modelle).toHaveLength(206);
    expect(fehler(e)).toEqual([
      { schwere: "fehler", code: "pflichtfeldLeer", zeile: 4, modellId: "altas_novus_cityline", spalte: "laenge_mm" },
      { schwere: "fehler", code: "pflichtfeldLeer", zeile: 5, modellId: "altas_novus_ecoline", spalte: "laenge_mm" },
    ]);
    expect(modell(e, "altas_novus_cityline")).toBeUndefined();
    expect(modell(e, "altas_novus_ecoline")).toBeUndefined();
    for (const b of e.modelle) for (const s of cfg.pflichtFuerNutzung) expect(b[s as keyof Bus], `${b.modell_id} ${s}`).not.toBeNull();
  });

  it("jedes Modell hat genau die 63 Spalten plus Zeilennummer, Typen stimmen", async () => {
    const e = await ladeKatalog(echteKatalogBytes(), cfg);
    const zahlen = new Set<string>(ZAHL_SPALTEN);
    for (const b of e.modelle) {
      expect(Object.keys(b).sort()).toEqual([...CATALOG_COLUMNS, "zeile"].sort());
      for (const s of CATALOG_COLUMNS) {
        const v = b[s];
        if (s === "fiktiv") expect(typeof v).toBe("boolean");
        else if (zahlen.has(s)) expect(v === null || typeof v === "number", `${b.modell_id} ${s}`).toBe(true);
        else expect(v === null || typeof v === "string", `${b.modell_id} ${s}`).toBe(true);
      }
    }
    expect(new Set(e.modelle.map((b) => b.modell_id)).size).toBe(206);
  });

  it("Blatt Spalten beschreibt alle 63 Spalten, und die Art je Spalte passt zum Programm", async () => {
    const roh = await leseKatalogDatei(echteKatalogBytes(), cfg);
    expect(roh.fehlendeBlaetter).toEqual([]);
    const regeln = roh.spaltenRegeln!;
    for (const s of CATALOG_COLUMNS) expect(regeln[s], s).toBeDefined();
    for (const s of ZAHL_SPALTEN) expect(artAusRegel(regeln[s]), s).toBe("zahl");
    for (const s of AUSWAHL_SPALTEN) expect(artAusRegel(regeln[s]), s).toBe("auswahl");
    expect(artAusRegel(regeln.abgasnorm)).toBe("text");
    expect(artAusRegel(regeln.verbrauchseinheit)).toBe("text");
    expect(["ja", "nein", "nur Elektro", "automatisch"]).toEqual(
      expect.arrayContaining([...new Set(Object.values(regeln).map((r) => r.pflicht))]),
    );
    expect(erlaubteWerte(regeln.batterie_einbauort.einheit)).toEqual(["Dach", "Heck", "Heck und Dach", "Unterflur"]);
    expect(erlaubteWerte(regeln.im_neukauf.einheit)).toEqual(["ja", "nein"]);
    expect(erlaubteWerte(regeln.bauart.einheit)).toEqual([
      "Mini", "Midi", "Solo kurz", "Solo", "Gelenk", "Doppelgelenk", "Doppeldecker",
    ]);
  });

  it("Zeilen ab 210 mit reinen Formeln zählen nicht", async () => {
    const roh = await leseKatalogDatei(echteKatalogBytes(), cfg);
    expect(roh.zeilen).toHaveLength(208);
    expect(roh.zeilen[0].zeile).toBe(2);
    expect(roh.zeilen.at(-1)!.zeile).toBe(209);
  });

  it("Standardwerte sind je Klasse Bauart|Antrieb gelesen", async () => {
    const roh = await leseKatalogDatei(echteKatalogBytes(), cfg);
    expect(roh.standardwerte!["Solo|Diesel"].neupreis_eur).toBe(242197);
    expect(roh.standardwerte!["Gelenk|Elektro"].batterie_nutzbar_prozent).toBe(90);
    expect(Object.keys(roh.standardwerte!)).toHaveLength(19);
  });
});

describe("Fahrzeugkatalog: Formelspalten", () => {
  it("gerechnete Werte stimmen bei allen Zeilen mit der Datei überein", async () => {
    const e = await ladeKatalog(echteKatalogBytes(), cfg);
    expect(finde(e, { code: "formelAbweichung" })).toEqual([]);
    const roh = await leseKatalogDatei(echteKatalogBytes(), cfg);
    for (const b of e.modelle) {
      const z = roh.zeilen.find((r) => r.zeile === b.zeile)!.werte;
      for (const s of ["gesamtplaetze", "verbrauch_datenblatt_kwh_100km"] as const) {
        const datei = z[s] as number | null;
        if (datei === null) expect(b[s], `${b.modell_id} ${s}`).toBeNull();
        else expect(Math.abs(b[s]! - datei) / Math.abs(datei), `${b.modell_id} ${s}`).toBeLessThanOrEqual(cfg.formelToleranz);
      }
    }
  });

  it("Handrechnung an Beispielzeilen", async () => {
    const e = await ladeKatalog(echteKatalogBytes(), cfg);
    // Sitz plus Steh: 15 + 9
    expect(modell(e, "altas_cityline_dsl")!.gesamtplaetze).toBe(24);
    // Eigener nutzbarer Anteil: 534 kWh * 90 / 500 km
    expect(modell(e, "man_lions_city_12_e_2t")!.verbrauch_datenblatt_kwh_100km).toBeCloseTo(96.12, 10);
    // Anteil leer, also Standardwert Gelenk|Elektro (90): 777 kWh * 90 / 480 km
    expect(modell(e, "mercedes_ecitaro_g_3t")!.verbrauch_datenblatt_kwh_100km).toBeCloseTo(145.6875, 10);
    // Diesel ohne Batterie
    expect(modell(e, "altas_cityline_dsl")!.verbrauch_datenblatt_kwh_100km).toBeNull();
  });

  it("falscher Formelwert in der Datei ergibt Hinweis, im Modell steht der gerechnete Wert", async () => {
    let zeile = 0;
    const bytes = await veraenderterKatalog((wb) => {
      zeile = zeilenNr(wb, "altas_cityline_dsl");
      busse(wb).getCell(zeile, spaltenNr(wb, "gesamtplaetze")).value = 99;
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "formelAbweichung", zeile, spalte: "gesamtplaetze", schwere: "hinweis" })).toHaveLength(1);
    expect(modell(e, "altas_cityline_dsl")!.gesamtplaetze).toBe(24);
  });
});

describe("Fahrzeugkatalog: Standardwerte füllen leere Felder", () => {
  it("Klassenwerte sind bei allen nutzbaren Modellen gesetzt und gleich dem Wert der Klasse", async () => {
    const e = await ladeKatalog(echteKatalogBytes(), cfg);
    const roh = await leseKatalogDatei(echteKatalogBytes(), cfg);
    expect(finde(e, { code: "keineStandardwerte" })).toEqual([]);
    for (const b of e.modelle) {
      const std = roh.standardwerte![`${b.bauart}|${b.antrieb}`];
      expect(std, b.modell_id!).toBeDefined();
      for (const s of KLASSEN_SPALTEN) {
        expect(b[s], `${b.modell_id} ${s}`).not.toBeNull();
        expect(b[s], `${b.modell_id} ${s}`).toBe(std[s]);
      }
      expect(b.fiktiv).toBe(false);
      expect(b.fahrzeugart).not.toBeNull();
    }
  });

  it("ein in der Zeile gesetzter Wert wird nicht überschrieben, leere Klassenfelder werden gefüllt", async () => {
    const bytes = await veraenderterKatalog((wb) => {
      const z = zeilenNr(wb, "altas_cityline_dsl");
      busse(wb).getCell(z, spaltenNr(wb, "neupreis_eur")).value = 123456;
      busse(wb).getCell(z, spaltenNr(wb, "zuverlaessigkeit")).value = 55;
    });
    const e = await ladeKatalog(bytes, cfg);
    const b = modell(e, "altas_cityline_dsl")!;
    expect(b.neupreis_eur).toBe(123456);
    expect(b.zuverlaessigkeit).toBe(55);
    // Mini|Diesel: Wartungskosten aus der Klasse
    expect(b.wartungskosten_eur_pro_km).toBe(0.18);
    // Höchstgeschwindigkeit steht in der Zeile (90), nicht der Klassenwert
    expect(b.hoechstgeschwindigkeit_kmh).toBe(90);
  });

  it("fehlende Klasse im Blatt Standardwerte ergibt einen Hinweis je Klasse", async () => {
    const bytes = await veraenderterKatalog((wb) => {
      const s = wb.getWorksheet(cfg.standardwerteBlatt)!;
      s.eachRow((r) => {
        if (r.getCell(2).value === "Mini" && r.getCell(3).value === "Diesel") {
          r.getCell(1).value = null;
          r.getCell(2).value = null;
          r.getCell(3).value = null;
        }
      });
    });
    const e = await ladeKatalog(bytes, cfg);
    const h = finde(e, { code: "keineStandardwerte" });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ schwere: "hinweis", wert: "Mini|Diesel" });
    expect(modell(e, "altas_cityline_dsl")!.neupreis_eur).toBeNull();
    expect(fehler(e)).toHaveLength(2);
  });
});

describe("Fahrzeugkatalog: fehlerhafte Dateien", () => {
  it("fehlende Spalte", async () => {
    const bytes = await veraenderterKatalog((wb) => busse(wb).spliceColumns(spaltenNr(wb, "neupreis_eur"), 1));
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "spalteFehlt", spalte: "neupreis_eur", schwere: "fehler" })).toHaveLength(1);
    expect(finde(e, { code: "spaltenzahlFalsch", wert: "62" })).toHaveLength(1);
    expect(e.modelle).toHaveLength(206);
  });

  it("fehlende Pflichtspalte macht den Katalog unbrauchbar", async () => {
    const bytes = await veraenderterKatalog((wb) => busse(wb).spliceColumns(spaltenNr(wb, "laenge_mm"), 1));
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "spalteFehlt", spalte: "laenge_mm" })).toHaveLength(1);
    expect(finde(e, { code: "katalogUnbrauchbar" })).toHaveLength(1);
    expect(e.modelle).toEqual([]);
  });

  it("umbenannte Spalte", async () => {
    const bytes = await veraenderterKatalog((wb) => {
      busse(wb).getCell(1, spaltenNr(wb, "bemerkung")).value = "Bemerkung";
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "spalteFehlt", spalte: "bemerkung" })).toHaveLength(1);
    expect(finde(e, { code: "spalteUnerwartet", spalte: "Bemerkung" })).toHaveLength(1);
    expect(e.modelle).toHaveLength(206);
    expect(e.modelle[0].bemerkung).toBeNull();
  });

  it("verschobene Spalten werden gemeldet, Werte werden trotzdem nach Namen zugeordnet", async () => {
    const bytes = await veraenderterKatalog((wb) => tauscheSpalten(wb, "laenge_mm", "breite_mm"));
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "spalteVerschoben" }).map((m) => m.spalte)).toEqual(["laenge_mm", "breite_mm"]);
    expect(modell(e, "altas_cityline_dsl")).toMatchObject({ laenge_mm: 7367, breite_mm: 2020 });
  });

  it("eine Spalte zu viel (64)", async () => {
    const bytes = await veraenderterKatalog((wb) => {
      busse(wb).getCell(1, 64).value = "extra";
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "spaltenzahlFalsch", wert: "64" })).toHaveLength(1);
    expect(finde(e, { code: "spalteUnerwartet", spalte: "extra" })).toHaveLength(1);
  });

  it("fehlendes Blatt Spalten", async () => {
    const bytes = await veraenderterKatalog((wb) => entferneBlatt(wb, cfg.spaltenBlatt));
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "blattFehlt", wert: cfg.spaltenBlatt, schwere: "fehler" })).toHaveLength(1);
  });

  it("Blatt Spalten ohne Zeile für eine Spalte", async () => {
    const bytes = await veraenderterKatalog((wb) => {
      wb.getWorksheet(cfg.spaltenBlatt)!.eachRow((r) => {
        if (r.getCell(1).value === "tankinhalt") r.getCell(1).value = null;
      });
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "spaltenregelFehlt", spalte: "tankinhalt", schwere: "fehler" })).toHaveLength(1);
  });

  it("fehlendes Blatt Standardwerte", async () => {
    const bytes = await veraenderterKatalog((wb) => entferneBlatt(wb, cfg.standardwerteBlatt));
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "blattFehlt", wert: cfg.standardwerteBlatt, schwere: "fehler" })).toHaveLength(1);
  });

  it("fehlendes Blatt Busse", async () => {
    const bytes = await veraenderterKatalog((wb) => entferneBlatt(wb, cfg.sheetName));
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "blattFehlt", wert: cfg.sheetName, schwere: "fehler" })).toHaveLength(1);
    expect(e.modelle).toEqual([]);
  });

  it("unerlaubter Wert in bauart: Fehler, Zeile nicht genutzt", async () => {
    let zeile = 0;
    const bytes = await veraenderterKatalog((wb) => {
      zeile = zeilenNr(wb, "altas_cityline_dsl");
      busse(wb).getCell(zeile, spaltenNr(wb, "bauart")).value = "Riesig";
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "wertNichtErlaubt", zeile, spalte: "bauart", wert: "Riesig" })).toEqual([
      { schwere: "fehler", code: "wertNichtErlaubt", zeile, spalte: "bauart", wert: "Riesig", modellId: "altas_cityline_dsl" },
    ]);
    expect(modell(e, "altas_cityline_dsl")).toBeUndefined();
    expect(e.modelle).toHaveLength(205);
  });

  it("unerlaubter Wert in einer anderen Auswahlspalte: Hinweis, Wert leer, Zeile genutzt", async () => {
    let zeile = 0;
    const bytes = await veraenderterKatalog((wb) => {
      zeile = zeilenNr(wb, "altas_cityline_dsl");
      busse(wb).getCell(zeile, spaltenNr(wb, "flurtyp")).value = "Tiefflur";
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "wertNichtErlaubt", zeile, spalte: "flurtyp", schwere: "hinweis" })).toHaveLength(1);
    expect(modell(e, "altas_cityline_dsl")!.flurtyp).toBeNull();
  });

  it("Text in laenge_mm: Fehler, Zeile nicht genutzt", async () => {
    let zeile = 0;
    const bytes = await veraenderterKatalog((wb) => {
      zeile = zeilenNr(wb, "altas_cityline_dsl");
      busse(wb).getCell(zeile, spaltenNr(wb, "laenge_mm")).value = "sieben Meter";
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "keineZahl", zeile, spalte: "laenge_mm", wert: "sieben Meter", schwere: "fehler" })).toHaveLength(1);
    expect(finde(e, { code: "pflichtfeldLeer", zeile })).toEqual([]);
    expect(modell(e, "altas_cityline_dsl")).toBeUndefined();
  });

  it("Text in einer anderen Zahlenspalte: Hinweis, Wert leer, Zeile genutzt", async () => {
    let zeile = 0;
    const bytes = await veraenderterKatalog((wb) => {
      zeile = zeilenNr(wb, "altas_cityline_dsl");
      busse(wb).getCell(zeile, spaltenNr(wb, "hoehe_mm")).value = "hoch";
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "keineZahl", zeile, spalte: "hoehe_mm", wert: "hoch", schwere: "hinweis" })).toHaveLength(1);
    expect(modell(e, "altas_cityline_dsl")!.hoehe_mm).toBeNull();
  });

  it("leere laenge_mm: Fehler mit richtiger Zeilennummer, Zeile nicht genutzt", async () => {
    let zeile = 0;
    const bytes = await veraenderterKatalog((wb) => {
      zeile = zeilenNr(wb, "yutong_u18_18_7");
      busse(wb).getCell(zeile, spaltenNr(wb, "laenge_mm")).value = null;
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(zeile).toBe(209);
    expect(finde(e, { code: "pflichtfeldLeer", modellId: "yutong_u18_18_7" })).toEqual([
      { schwere: "fehler", code: "pflichtfeldLeer", zeile: 209, modellId: "yutong_u18_18_7", spalte: "laenge_mm" },
    ]);
    expect(modell(e, "yutong_u18_18_7")).toBeUndefined();
    expect(e.modelle).toHaveLength(205);
  });

  it("doppelte modell_id: Fehler, die spätere Zeile wird nicht genutzt", async () => {
    let zeile = 0;
    const bytes = await veraenderterKatalog((wb) => {
      zeile = zeilenNr(wb, "altas_cityline_l_dsl");
      busse(wb).getCell(zeile, 1).value = "altas_cityline_dsl";
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "modellIdDoppelt" })).toEqual([
      { schwere: "fehler", code: "modellIdDoppelt", zeile, spalte: "modell_id", modellId: "altas_cityline_dsl", wert: "altas_cityline_dsl" },
    ]);
    const treffer = e.modelle.filter((b) => b.modell_id === "altas_cityline_dsl");
    expect(treffer).toHaveLength(1);
    expect(treffer[0].zeile).toBe(2);
  });

  it("ungültige modell_id: Fehler, Zeile nicht genutzt", async () => {
    const bytes = await veraenderterKatalog((wb) => {
      busse(wb).getCell(zeilenNr(wb, "altas_cityline_dsl"), 1).value = "Altas Cityline";
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "modellIdUngueltig", wert: "Altas Cityline", schwere: "fehler" })).toHaveLength(1);
    expect(e.modelle).toHaveLength(205);
  });

  it("Zeile mit Werten, aber ohne modell_id: Fehler mit Zeilennummer", async () => {
    const bytes = await veraenderterKatalog((wb) => {
      busse(wb).getCell(215, spaltenNr(wb, "hersteller")).value = "Niemand";
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(finde(e, { code: "modellIdFehlt" })).toEqual([{ schwere: "fehler", code: "modellIdFehlt", zeile: 215 }]);
    expect(e.modelle).toHaveLength(206);
  });

  it("fiktiv als Text WAHR wird gelesen, unbekannter Text ist ein Hinweis", async () => {
    const bytes = await veraenderterKatalog((wb) => {
      busse(wb).getCell(zeilenNr(wb, "altas_cityline_dsl"), spaltenNr(wb, "fiktiv")).value = "WAHR";
      busse(wb).getCell(zeilenNr(wb, "altas_cityline_l_dsl"), spaltenNr(wb, "fiktiv")).value = "vielleicht";
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(modell(e, "altas_cityline_dsl")!.fiktiv).toBe(true);
    expect(modell(e, "altas_cityline_l_dsl")!.fiktiv).toBe(false);
    expect(finde(e, { code: "keinWahrheitswert", spalte: "fiktiv", schwere: "hinweis" })).toHaveLength(1);
  });

  it("leere fahrzeugart wird Bus", async () => {
    const bytes = await veraenderterKatalog((wb) => {
      busse(wb).getCell(zeilenNr(wb, "altas_cityline_dsl"), spaltenNr(wb, "fahrzeugart")).value = null;
    });
    const e = await ladeKatalog(bytes, cfg);
    expect(modell(e, "altas_cityline_dsl")!.fahrzeugart).toBe("Bus");
  });

  it("kein xlsx (Zufallsbytes): Fehler dateiUnlesbar, keine Ausnahme", async () => {
    const zufall = new Uint8Array(4096);
    for (let i = 0; i < zufall.length; i++) zufall[i] = (i * 7919 + 13) % 256;
    const e = await ladeKatalog(zufall, cfg);
    expect(e.modelle).toEqual([]);
    expect(e.zeilenGesamt).toBe(0);
    expect(fehler(e).map((m) => m.code)).toEqual(["dateiUnlesbar"]);
  });

  it("alle Meldungscodes sind bekannt", async () => {
    const e = await ladeKatalog(echteKatalogBytes(), cfg);
    for (const m of e.meldungen) expect(MELDUNG_CODES).toContain(m.code);
  });
});

describe("Batteriegrößen", () => {
  const bus = (min: number | null, max: number | null, schritt: number | null) =>
    ({ batterie_kwh_min: min, batterie_kwh_max: max, batterie_kwh_schritt: schritt }) as Bus;

  it("Beispiele aus dem Katalog", async () => {
    const e = await ladeKatalog(echteKatalogBytes(), cfg);
    expect(batterieOptionen(modell(e, "man_lions_city_12_e_2t")!)).toEqual([356, 445, 534]);
    expect(batterieOptionen(modell(e, "mercedes_ecitaro_g_3t")!)).toEqual([444, 555, 666, 777]);
    expect(batterieOptionen(modell(e, "iveco_crossway_le_city_12_elec")!)).toEqual([346, 415, 484]);
    expect(batterieOptionen(modell(e, "altas_cityline_dsl")!)).toEqual([]);
  });

  it("künstliche Fälle", () => {
    expect(batterieOptionen(bus(300, 500, null))).toEqual([500]);
    expect(batterieOptionen(bus(300, 500, 0))).toEqual([500]);
    expect(batterieOptionen(bus(null, 422, null))).toEqual([422]);
    expect(batterieOptionen(bus(165, null, null))).toEqual([165]);
    expect(batterieOptionen(bus(null, 400, 50))).toEqual([400]);
    expect(batterieOptionen(bus(null, null, 89))).toEqual([]);
    expect(batterieOptionen(bus(null, null, null))).toEqual([]);
    expect(batterieOptionen(bus(207, 414, 207))).toEqual([207, 414]);
  });

  it("Gleitkommaschritte enden sauber beim Maximum", () => {
    expect(batterieOptionen(bus(0.1, 0.4, 0.1))).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(batterieOptionen(bus(10, 10.35, 0.1))).toEqual([10, 10.1, 10.2, 10.3]);
  });
});
