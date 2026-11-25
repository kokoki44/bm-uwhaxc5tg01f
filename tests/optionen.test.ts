import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  aufpreisNeukauf,
  gruppenVon,
  imNeukaufWaehlbar,
  ladeOptionen,
  OPTIONEN_SPALTEN,
  passtZuAntrieb,
  standardAuswahl,
  type Option,
  type OptionenErgebnis,
} from "../src/catalog/optionen";
import { config } from "../src/config";
import {
  echteOptionenBytes,
  optionenBlatt,
  optSpaltenNr,
  setzeOptWert,
  tauscheOptSpalten,
  veraenderteOptionen,
} from "./helpers/optionen-datei";

const cfg = config.optionen;
const lade = (b: Uint8Array) => ladeOptionen(b, cfg);
const echt = () => lade(echteOptionenBytes());
const codes = (e: OptionenErgebnis) => e.meldungen.map((m) => m.code);
const ids = (e: OptionenErgebnis) => e.optionen.map((o) => o.option_id);

const GESPERRT: Record<string, string> = {
  premium: "Premium-Sitze",
  kamera: "Kamerasystem",
  fgi_punktmatrix: "Fahrgastinformation Punktmatrix",
  fgi_lcd: "Fahrgastinformation LCD",
  fgi_led: "Fahrgastinformation LED",
  klimaanlage: "Klimaanlage",
  ansagen_automatisch: "Automatische Ansagen",
  wlan: "WLAN",
  usb: "USB-Ladeanschlüsse",
};

describe("echte Optionsdatei", () => {
  it("liest alle Zeilen ohne Meldung", async () => {
    const e = await echt();
    expect(e.meldungen).toEqual([]);
    expect(e.optionen).toHaveLength(26);
  });

  it("hat genau die 15 Spalten in fester Reihenfolge", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(echteOptionenBytes() as unknown as ArrayBuffer);
    const kopf: string[] = [];
    optionenBlatt(wb).getRow(1).eachCell((c) => kopf.push(String(c.value)));
    expect(kopf).toEqual([...OPTIONEN_SPALTEN]);
    expect(OPTIONEN_SPALTEN).toHaveLength(15);
    expect(wb.getWorksheet("Spalten")).toBeTruthy();
  });

  it("jede Gruppe hat genau einen Standard", async () => {
    const g = gruppenVon((await echt()).optionen);
    expect([...g.keys()].sort()).toEqual(["bestuhlung", "fahrgastinfo", "heizung", "rampe", "spiegel"]);
    for (const liste of g.values()) expect(liste.filter((o) => o.standard)).toHaveLength(1);
  });

  it("gesperrt sind genau die Forschungsoptionen, Fallblatt ist frei", async () => {
    const e = await echt();
    const gesperrt = Object.fromEntries(
      e.optionen.filter((o) => o.freischaltung !== cfg.frei).map((o) => [o.option_id, o.freischaltung]),
    );
    expect(gesperrt).toEqual(GESPERRT);
    expect(e.optionen.find((o) => o.option_id === "fgi_fallblatt")!.freischaltung).toBe(cfg.frei);
  });

  it("Assistenten sind serienmäßig, sonst nichts", async () => {
    const serie = (await echt()).optionen.filter((o) => o.serie_neukauf).map((o) => o.option_id);
    expect(serie.sort()).toEqual(["abbiegeassistent", "notbremsassistent"]);
  });

  it("Heizungsgruppe nur für Elektro", async () => {
    const heizung = gruppenVon((await echt()).optionen).get("heizung")!;
    expect(heizung.every((o) => o.nur_antrieb === "Elektro")).toBe(true);
  });
});

describe("Kopfzeile", () => {
  it("fehlende Spalte", async () => {
    const e = await lade(await veraenderteOptionen((wb) => optionenBlatt(wb).spliceColumns(optSpaltenNr(wb, "bemerkung"), 1)));
    expect(codes(e)).toContain("spaltenzahlFalsch");
    expect(e.meldungen).toContainEqual(expect.objectContaining({ code: "spalteFehlt", spalte: "bemerkung" }));
    expect(e.optionen).toHaveLength(26);
  });

  it("fehlende Pflichtspalte macht die Datei unbrauchbar", async () => {
    const e = await lade(await veraenderteOptionen((wb) => optionenBlatt(wb).spliceColumns(optSpaltenNr(wb, "aufpreis_eur"), 1)));
    expect(e.meldungen).toContainEqual(expect.objectContaining({ code: "spalteFehlt", spalte: "aufpreis_eur" }));
    expect(e.optionen).toEqual([]);
  });

  it("umbenannte Spalte", async () => {
    const e = await lade(
      await veraenderteOptionen((wb) => (optionenBlatt(wb).getRow(1).getCell(optSpaltenNr(wb, "quelle")).value = "Quelle")),
    );
    expect(e.meldungen).toContainEqual(expect.objectContaining({ code: "spalteFehlt", spalte: "quelle" }));
    expect(e.meldungen).toContainEqual(expect.objectContaining({ code: "spalteUnerwartet", spalte: "Quelle" }));
    expect(codes(e)).not.toContain("spaltenzahlFalsch");
  });

  it("verschobene Spalten, Werte werden trotzdem nach Namen gelesen", async () => {
    const e = await lade(await veraenderteOptionen((wb) => tauscheOptSpalten(wb, "name", "aufpreis_eur")));
    expect(e.meldungen.filter((m) => m.code === "spalteVerschoben").map((m) => m.spalte).sort()).toEqual(["aufpreis_eur", "name"]);
    expect(e.optionen).toHaveLength(26);
    expect(e.optionen.find((o) => o.option_id === "wlan")!.aufpreis_eur).toBe(3000);
  });

  it("zusätzliche Spalte", async () => {
    const e = await lade(
      await veraenderteOptionen((wb) => (optionenBlatt(wb).getRow(1).getCell(OPTIONEN_SPALTEN.length + 1).value = "extra")),
    );
    expect(codes(e)).toContain("spaltenzahlFalsch");
    expect(e.meldungen).toContainEqual(expect.objectContaining({ code: "spalteUnerwartet", spalte: "extra" }));
  });

  it("fehlendes Blatt", async () => {
    const e = await lade(await veraenderteOptionen((wb) => wb.removeWorksheet(optionenBlatt(wb).id)));
    expect(codes(e)).toEqual(["blattFehlt"]);
    expect(e.optionen).toEqual([]);
  });
});

describe("Werte", () => {
  it("Text in aufpreis_eur: Zeile fällt weg, Rest bleibt", async () => {
    const e = await lade(await veraenderteOptionen((wb) => setzeOptWert(wb, "wlan", "aufpreis_eur", "teuer")));
    expect(e.meldungen).toEqual([
      expect.objectContaining({ schwere: "fehler", code: "keineZahl", spalte: "aufpreis_eur", modellId: "wlan", wert: "teuer" }),
    ]);
    expect(ids(e)).not.toContain("wlan");
    expect(e.optionen).toHaveLength(25);
  });

  it("negativer Aufpreis und Gebrauchtanteil über 1", async () => {
    const e = await lade(
      await veraenderteOptionen((wb) => {
        setzeOptWert(wb, "wlan", "aufpreis_eur", -5);
        setzeOptWert(wb, "usb", "gebraucht_anteil", 1.5);
      }),
    );
    expect(e.meldungen).toContainEqual(expect.objectContaining({ code: "wertNichtErlaubt", spalte: "aufpreis_eur", modellId: "wlan" }));
    expect(e.meldungen).toContainEqual(expect.objectContaining({ code: "wertNichtErlaubt", spalte: "gebraucht_anteil", modellId: "usb" }));
    expect(ids(e)).not.toContain("wlan");
    expect(ids(e)).not.toContain("usb");
  });

  it("ungültiges ja/nein", async () => {
    const e = await lade(await veraenderteOptionen((wb) => setzeOptWert(wb, "video", "serie_neukauf", "vielleicht")));
    expect(e.meldungen).toEqual([expect.objectContaining({ code: "keinJaNein", spalte: "serie_neukauf", modellId: "video" })]);
    expect(ids(e)).not.toContain("video");
  });

  it("unbekannter Antrieb", async () => {
    const e = await lade(await veraenderteOptionen((wb) => setzeOptWert(wb, "video", "nur_antrieb", "Dampf")));
    expect(e.meldungen).toEqual([expect.objectContaining({ code: "wertNichtErlaubt", spalte: "nur_antrieb", wert: "Dampf" })]);
  });

  it("leeres Pflichtfeld", async () => {
    const e = await lade(await veraenderteOptionen((wb) => setzeOptWert(wb, "video", "name", null)));
    expect(e.meldungen).toEqual([expect.objectContaining({ code: "pflichtfeldLeer", spalte: "name", modellId: "video" })]);
  });

  it("doppelte und ungültige option_id", async () => {
    const e = await lade(
      await veraenderteOptionen((wb) => {
        setzeOptWert(wb, "usb", "option_id", "wlan");
        setzeOptWert(wb, "video", "option_id", "Video Kamera");
      }),
    );
    expect(e.meldungen).toContainEqual(expect.objectContaining({ code: "optionIdDoppelt", wert: "wlan" }));
    expect(e.meldungen).toContainEqual(expect.objectContaining({ code: "optionIdUngueltig", wert: "Video Kamera" }));
    expect(ids(e).filter((i) => i === "wlan")).toHaveLength(1);
    expect(e.optionen).toHaveLength(24);
  });

  it("leere Zeilen am Ende werden ignoriert", async () => {
    const e = await lade(
      await veraenderteOptionen((wb) => {
        const s = optionenBlatt(wb);
        const r = s.getRow(s.rowCount + 3);
        r.getCell(1).value = "";
        r.getCell(2).value = "   ";
      }),
    );
    expect(e.meldungen).toEqual([]);
    expect(e.optionen).toHaveLength(26);
  });

  it("Zufallsbytes ergeben dateiUnlesbar ohne Ausnahme", async () => {
    const zufall = new Uint8Array(2048).map((_, i) => (i * 7919 + 13) % 256);
    const e = await lade(zufall);
    expect(codes(e)).toEqual(["dateiUnlesbar"]);
    expect(e.optionen).toEqual([]);
  });
});

describe("Gruppenregeln", () => {
  it("Gruppe ohne Standard fällt ganz weg", async () => {
    const e = await lade(await veraenderteOptionen((wb) => setzeOptWert(wb, "kunststoff", "standard", "nein")));
    expect(e.meldungen).toEqual([expect.objectContaining({ code: "gruppeOhneStandard", wert: "bestuhlung" })]);
    expect(gruppenVon(e.optionen).has("bestuhlung")).toBe(false);
    expect(e.optionen).toHaveLength(22);
  });

  it("Gruppe mit zwei Standards fällt ganz weg", async () => {
    const e = await lade(await veraenderteOptionen((wb) => setzeOptWert(wb, "rampe_manuell", "standard", "ja")));
    expect(e.meldungen).toEqual([expect.objectContaining({ code: "gruppeMehrereStandard", wert: "rampe" })]);
    expect(gruppenVon(e.optionen).has("rampe")).toBe(false);
  });

  it("Gruppe mit gemischtem Antrieb fällt ganz weg", async () => {
    const e = await lade(await veraenderteOptionen((wb) => setzeOptWert(wb, "waermepumpe", "nur_antrieb", null)));
    expect(e.meldungen).toEqual([expect.objectContaining({ code: "gruppeGemischterAntrieb", wert: "heizung" })]);
    expect(gruppenVon(e.optionen).has("heizung")).toBe(false);
  });
});

describe("Hilfsfunktionen", () => {
  const nach = (liste: Option[], id: string) => liste.find((o) => o.option_id === id)!;

  it("Aufpreis: Serienausstattung kostet nichts", async () => {
    const o = (await echt()).optionen;
    expect(aufpreisNeukauf(["abbiegeassistent", "notbremsassistent"], o)).toBe(0);
    expect(aufpreisNeukauf(["stoff", "abbiegeassistent", "video", "video"], o)).toBe(6000 + 6000);
    expect(aufpreisNeukauf([], o)).toBe(0);
  });

  it("Standardauswahl für Diesel ohne Heizungsgruppe", async () => {
    const o = (await echt()).optionen;
    expect(standardAuswahl(o, "Diesel").sort()).toEqual(
      ["abbiegeassistent", "fgi_keine", "konventionell", "kunststoff", "notbremsassistent", "rampe_keine"].sort(),
    );
    expect(aufpreisNeukauf(standardAuswahl(o, "Diesel"), o)).toBe(0);
  });

  it("Standardauswahl für Elektro mit Heizung", async () => {
    const o = (await echt()).optionen;
    const a = standardAuswahl(o, "Elektro");
    expect(a).toContain("heizung_elektrisch");
    expect(a).not.toContain("waermepumpe");
    expect(a).toHaveLength(7);
  });

  it("passtZuAntrieb", async () => {
    const o = (await echt()).optionen;
    expect(passtZuAntrieb(nach(o, "waermepumpe"), "Elektro")).toBe(true);
    expect(passtZuAntrieb(nach(o, "waermepumpe"), "Diesel")).toBe(false);
    expect(passtZuAntrieb(nach(o, "wlan"), "Hybrid")).toBe(true);
  });

  it("imNeukaufWaehlbar mit und ohne Freischaltung", async () => {
    const o = (await echt()).optionen;
    expect(imNeukaufWaehlbar(nach(o, "fgi_fallblatt"), new Set(), cfg)).toBe(true);
    expect(imNeukaufWaehlbar(nach(o, "klimaanlage"), new Set(), cfg)).toBe(false);
    expect(imNeukaufWaehlbar(nach(o, "klimaanlage"), new Set(["Klimaanlage"]), cfg)).toBe(true);
    expect(imNeukaufWaehlbar(nach(o, "fgi_led"), new Set(["Fahrgastinformation LCD"]), cfg)).toBe(false);
  });
});
