import { describe, expect, it } from "vitest";
import { MELDUNG_CODES } from "../src/catalog/katalog";
import { OPTIONEN_MELDUNG_CODES } from "../src/catalog/optionen";
import { config, PLAN_TAGE } from "../src/config";
import { BAUTEIL_TYPEN } from "../src/depot/hof";
import de from "../src/i18n/de.json";

const texte = de as Record<string, string>;
const hat = (k: string) => expect(texte[k], `Text fehlt: ${k}`).toBeTruthy();

describe("Sprachdatei Etappe 2", () => {
  it("jede Katalogmeldung hat einen Text", () => {
    for (const c of MELDUNG_CODES) hat(`katalog.${c}`);
  });
  it("jedes Bauteil hat Namen und Symbol, jede Layoutmeldung und jeder Baufehler einen Text", () => {
    for (const b of BAUTEIL_TYPEN) (hat(`bauteil.${b}`), hat(`bauteil.symbol.${b}`));
    for (const c of ["keinTor", "torNichtAmRand", "nichtVerbunden", "stellplatzNichtErreichbar", "halleNichtErreichbar", "sackgasse", "getrennteNetze", "keineWendemoeglichkeit"]) hat(`editor.meldung.${c}`);
    for (const c of ["ungueltigeMasse", "zuKlein", "ausserhalb", "ueberlappung", "geldFehlt"]) hat(`editor.baufehler.${c}`);
    for (const c of ["ungueltig", "zuGross", "seitenverhaeltnis", "geldFehlt"]) hat(`editor.zukaufFehler.${c}`);
    for (const c of ["ungueltigeMasse", "zuKlein", "zuGross", "seitenverhaeltnis", "nichtInFlaeche", "geldFehlt", "hierNicht"]) hat(`grundstueck.fehler.${c}`);
    for (const l of config.grundstueck.landnutzung) hat(`standort.art.${l}`);
    for (const s of ["n", "o", "s", "w"]) hat(`seite.${s}`);
  });
  it("Etappe 3a: jede Meldung der Optionsdatei, jeder Kauf- und Personalfehler, jede Personalart und Gruppe hat einen Text", () => {
    for (const c of OPTIONEN_MELDUNG_CODES) hat(`optionen.${c}`);
    for (const c of ["nichtKaufbar", "batterie", "lackierung", "option", "gruppe", "keinHof", "keinPlatz", "geldFehlt", "unbekannt"]) hat(`markt.fehler.${c}`);
    for (const c of ["unbekannt", "schonInspiziert", "geldFehlt"]) hat(`gebraucht.fehler.${c}`);
    for (const c of ["unbekannt", "lackierung", "geldFehlt"]) hat(`fahrzeuge.fehler.${c}`);
    for (const c of ["wochenstunden", "unbekannt", "schonGekuendigt", "ausschreibungUnbekannt", "bewerberUnbekannt", "nichtSichtbar", "lohn"]) hat(`personal.fehler.${c}`);
    for (const a of config.personal.arten) hat(`personal.art.${a}`);
    for (const q of ["fuehrerschein_d", "bkf", ...config.personal.einweisungen.map((e) => `einweisung_${e}`), ...config.personal.fachrichtungen.map((f) => `fachrichtung_${f}`)]) hat(`personal.quali.${q}`);
    for (const g of ["bestuhlung", "spiegel", "heizung", "fahrgastinfo", "rampe"]) hat(`markt.gruppe.${g}`);
    for (const b of ["fahrzeuge", "fahrzeugmarkt", "personal", "betriebshof"]) (hat(`menue.${b}`), hat(`menue.zeichen.${b}`));
  });
  it("Etappe 3b: jede Tagesart, jeder Fehler und jedes Werkzeug des Linienbereichs hat einen Text", () => {
    for (const tag of PLAN_TAGE) hat(`tagesart.${tag}`);
    for (const c of ["nummerLeer", "nummerZuLang", "nummerDoppelt", "nameLeer", "nameZuLang", "farbe", "unbekannt"]) hat(`linie.fehler.${c}`);
    for (const c of ["unbekannt", "bereich"]) hat(`linie.kurzFehler.${c}`);
    for (const c of ["ohneNetz", "gesperrt", "unbekannt", "doppelt"]) hat(`perle.fehler.${c}`);
    for (const c of ["nameLeer", "nameZuLang", "ohneNetz", "gesperrt", "unbekannt"]) hat(`haltestelle.fehler.${c}`);
    for (const c of ["unbekannt", "benutzt"]) hat(`haltestelle.loeschFehler.${c}`);
    for (const w of ["halt", "neu", "weg", "aus"]) (hat(`perle.werkzeug.${w}`), hat(`perle.hinweis.${w}`));
    for (const c of ["zeit", "bereich", "takt"]) hat(`takt.fehler.${c}`);
    for (const a of ["hin", "rueck", "kurz"]) hat(`variante.art.${a}`);
    for (const s of ["takt", "verschoben", "gestrichen", "zusatz"]) hat(`fahrplan.status.${s}`);
    for (const k of config.linien.engKlassen) hat(`strassenklasse.${k}`);
    for (const r of ["norden", "nordosten", "osten", "suedosten", "sueden", "suedwesten", "westen", "nordwesten"]) hat(`richtung.${r}`);
    for (const k of ["takt.vonKopf", "takt.bisKopf", "takt.taktKopf", "linie.art", "linie.halte", "linie.laenge", "linie.fahrzeitWerktag", "linie.route", "linie.fahrten", "linie.busseNoetig",
      "linien.status", "linien.varianten", "linien.bedarf", "linien.zugewiesen", "linien.hinweis", "fahrplan.abfahrt", "fahrplan.variante", "fahrplan.von", "fahrplan.nach", "fahrplan.ankunft",
      "fahrplan.status", "fahrplan.umlauf", "fahrplan.fahrtenZahl", "fahrplan.beginn", "fahrplan.ende", "fahrplan.ausruecken", "variante.halt", "variante.an", "variante.ab", "variante.abschnitt"]) hat(k);
    (hat("menue.linien"), hat("menue.zeichen.linien"));
  });
  it("keine Gedankenstriche in den Texten", () => {
    for (const [k, v] of Object.entries(texte)) expect(/[–—]/.test(v), k).toBe(false);
  });
});

describe("Konfiguration Betriebshof", () => {
  it("Mindestmaße entsprechen der Bauteiltabelle im Konzept", () => {
    const b = config.betriebshof.bauteile;
    const soll: Record<string, [number, number]> = {
      tor: [4, 4], fahrweg: [3.5, 3.5], halle: [4, 15], werkstatt: [5, 15], waschanlage: [5, 18], lager: [4, 4],
      buero: [4, 4], tankstelle: [4, 8], toilette: [2, 2], kueche: [3, 3], pausenraum: [4, 4],
    };
    for (const [typ, [a, l]] of Object.entries(soll)) expect([b[typ].minA, b[typ].minB], typ).toEqual([a, l]);
    expect(b.stellplatz.nachBus && b.ladeplatz.nachBus).toBe(true);
    expect(config.betriebshof.raster[0]).toBe(1);
    expect(config.grundstueck.hoechstflaecheM2).toBe(100000);
    expect(config.grundstueck.maxSeitenverhaeltnis).toBe(10);
    expect(config.betriebshof.abrissErstattung).toBe(0.5);
    expect(config.betriebshof.waschDurchsatzProStunde).toBe(10);
  });
});
