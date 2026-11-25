import type { CatalogConfig } from "../config";
import { CATALOG_COLUMNS } from "./columns";
import { checkHeader, leseKatalogDatei, type KatalogRoh, type SpaltenRegel, type Wert } from "./reader";

export type Spalte = (typeof CATALOG_COLUMNS)[number];

/** Spalten mit Zahlenwerten. */
export const ZAHL_SPALTEN = [
  "laenge_mm", "breite_mm", "hoehe_mm", "radstand_mm", "radstand_2_mm", "ueberhang_vorn_mm", "ueberhang_hinten_mm",
  "wendekreis_mm", "leergewicht_kg", "gesamtgewicht_kg", "tueren", "tuerbreite_mm", "einstiegshoehe_mm",
  "sitzplaetze", "stehplaetze", "gesamtplaetze", "rollstuhlplaetze", "kinderwagenplaetze", "dauerleistung_kw",
  "spitzenleistung_kw", "hoechstgeschwindigkeit_kmh", "verbrauch_pro_100km", "tankinhalt", "batterie_kwh_min",
  "batterie_kwh_max", "batterie_kwh_schritt", "batterie_nutzbar_prozent", "batterie_lebensdauer_jahre",
  "plaetze_je_batterieeinheit_weniger", "reichweite_km", "verbrauch_datenblatt_kwh_100km", "ladeleistung_kw",
  "neupreis_eur", "wartungskosten_eur_pro_km", "intervall_klein_km", "intervall_gross_km", "intervall_hu_monate",
  "lebensdauer_jahre", "zuverlaessigkeit", "teilebedarf_faktor", "baujahr_von", "baujahr_bis",
] as const satisfies readonly Spalte[];

/** Spalten mit festen erlaubten Werten (aus dem Blatt Spalten gelesen). */
export const AUSWAHL_SPALTEN = [
  "fahrzeugart", "bauart", "antrieb", "flurtyp", "batterie_chemie", "batterie_einbauort", "ladeanschluss",
  "im_neukauf", "region",
] as const satisfies readonly Spalte[];

type ZahlSpalte = (typeof ZAHL_SPALTEN)[number];
type TextSpalte = Exclude<Spalte, ZahlSpalte | "fiktiv">;

/** Ein Modell aus dem Katalog: genau die 63 Spalten plus die Zeilennummer in der Datei. */
export type Bus = { [K in ZahlSpalte]: number | null } & { [K in TextSpalte]: string | null } & {
  fiktiv: boolean;
  zeile: number;
};

export type SpaltenArt = "zahl" | "text" | "auswahl" | "wahrheitswert";

export const MELDUNG_CODES = [
  "dateiUnlesbar",
  "blattFehlt",
  "katalogUnbrauchbar",
  "spaltenzahlFalsch",
  "spalteFehlt",
  "spalteUnerwartet",
  "spalteVerschoben",
  "spaltenregelFehlt",
  "spaltenregelAbweichend",
  "modellIdFehlt",
  "modellIdUngueltig",
  "modellIdDoppelt",
  "pflichtfeldLeer",
  "feldLeer",
  "elektrofeldLeer",
  "keineZahl",
  "wertNichtErlaubt",
  "keinWahrheitswert",
  "formelAbweichung",
  "keineStandardwerte",
  "standardwertUngueltig",
] as const;
export type MeldungCode = (typeof MELDUNG_CODES)[number];

export interface Meldung {
  schwere: "fehler" | "hinweis";
  code: MeldungCode;
  zeile?: number;
  spalte?: string;
  modellId?: string;
  wert?: string;
}

export interface KatalogErgebnis {
  modelle: Bus[];
  meldungen: Meldung[];
  /** Zahl der gelesenen Datenzeilen (Zeilen mit mindestens einem Wert). */
  zeilenGesamt: number;
}

/** Einheiten im Blatt Spalten, die eine Zahl verlangen (erster Teil vor dem Komma). */
const ZAHL_EINHEITEN = new Set([
  "mm", "kg", "kw", "km/h", "kwh", "zahl", "jahre", "monate", "euro", "euro pro kilometer", "kilometer", "km",
  "prozent", "faktor", "jahreszahl", "1 bis 100", "liter oder kg", "kwh pro 100 km",
]);
const STANDARDWERT_DER_KLASSE = "standardwert der klasse";
const ANTRIEB_ELEKTRO = "Elektro";
/** Kleine technische Toleranz für Gleitkommavergleiche bei Batterieschritten (keine Spielregel). */
const GLEITKOMMA_EPS = 1e-9;

function statischeArt(s: string): SpaltenArt {
  if (s === "fiktiv") return "wahrheitswert";
  if ((ZAHL_SPALTEN as readonly string[]).includes(s)) return "zahl";
  if ((AUSWAHL_SPALTEN as readonly string[]).includes(s)) return "auswahl";
  return "text";
}

/** Leitet die Art einer Spalte aus dem Blatt Spalten ab. */
export function artAusRegel(r: SpaltenRegel): SpaltenArt {
  if (r.spalte === "fiktiv") return "wahrheitswert";
  if ((AUSWAHL_SPALTEN as readonly string[]).includes(r.spalte)) return "auswahl";
  const erster = r.einheit.split(",")[0].trim().toLowerCase();
  return ZAHL_EINHEITEN.has(erster) ? "zahl" : "text";
}

/** Erlaubte Werte aus "Einheit oder erlaubte Werte": getrennt an ", " und " oder ". */
export function erlaubteWerte(einheit: string): string[] {
  return einheit
    .split(/, | oder /)
    .map((s) => s.trim())
    .filter(Boolean);
}

function alsText(w: Wert): string {
  return w === null ? "" : String(w);
}

type Pruefung = { ok: true; wert: Wert } | { ok: false; code: MeldungCode };

function pruefeWert(art: SpaltenArt, w: Wert, erlaubt: string[] | null): Pruefung {
  if (w === null) return { ok: true, wert: null };
  switch (art) {
    case "zahl":
      return typeof w === "number" && Number.isFinite(w) ? { ok: true, wert: w } : { ok: false, code: "keineZahl" };
    case "wahrheitswert": {
      if (typeof w === "boolean") return { ok: true, wert: w };
      const t = String(w).trim().toLowerCase();
      if (t === "wahr" || t === "true") return { ok: true, wert: true };
      if (t === "falsch" || t === "false") return { ok: true, wert: false };
      return { ok: false, code: "keinWahrheitswert" };
    }
    case "auswahl": {
      const t = String(w);
      if (erlaubt && !erlaubt.includes(t)) return { ok: false, code: "wertNichtErlaubt" };
      return { ok: true, wert: t };
    }
    default:
      return { ok: true, wert: String(w) };
  }
}

function zahl(w: Wert | undefined): number | null {
  return typeof w === "number" && Number.isFinite(w) ? w : null;
}

function weichtAb(a: number | null, b: number | null, tol: number): boolean {
  if (a === null || b === null) return a !== b;
  const m = Math.max(Math.abs(a), Math.abs(b));
  return m === 0 ? false : Math.abs(a - b) / m > tol;
}

const MODELL_ID_MUSTER = /^[a-z0-9_]+$/;

/** Prüft den eingelesenen Katalog und baut daraus die nutzbaren Modelle. */
export function pruefeKatalog(roh: KatalogRoh, cfg: CatalogConfig): KatalogErgebnis {
  const meldungen: Meldung[] = [];
  const fehler = (m: Omit<Meldung, "schwere">) => meldungen.push({ schwere: "fehler", ...m });
  const hinweis = (m: Omit<Meldung, "schwere">) => meldungen.push({ schwere: "hinweis", ...m });
  const ergebnis = (modelle: Bus[]): KatalogErgebnis => ({ modelle, meldungen, zeilenGesamt: roh.zeilen.length });

  for (const blatt of roh.fehlendeBlaetter) fehler({ code: "blattFehlt", wert: blatt });
  if (!roh.kopf) {
    fehler({ code: "katalogUnbrauchbar", wert: cfg.sheetName });
    return ergebnis([]);
  }

  // a) Kopfzeile
  const kopf = roh.kopf;
  if (kopf.length !== cfg.columnCount) fehler({ code: "spaltenzahlFalsch", wert: String(kopf.length) });
  const k = checkHeader(kopf);
  for (const s of k.missing) fehler({ code: "spalteFehlt", spalte: s });
  for (const s of k.unexpected) fehler({ code: "spalteUnerwartet", spalte: s });
  for (const s of k.moved) fehler({ code: "spalteVerschoben", spalte: s });
  const fehlendePflicht = cfg.pflichtFuerNutzung.filter((s) => k.missing.includes(s));
  if (fehlendePflicht.length) {
    fehler({ code: "katalogUnbrauchbar", spalte: fehlendePflicht.join(", ") });
    return ergebnis([]);
  }

  // Regeln je Spalte
  const regeln = roh.spaltenRegeln;
  const art: Record<string, SpaltenArt> = {};
  const erlaubt: Record<string, string[] | null> = {};
  for (const s of CATALOG_COLUMNS) {
    const r = regeln?.[s];
    art[s] = statischeArt(s);
    erlaubt[s] = null;
    if (regeln && !r) fehler({ code: "spaltenregelFehlt", spalte: s });
    if (!r) continue;
    const ausRegel = artAusRegel(r);
    if (ausRegel !== art[s]) fehler({ code: "spaltenregelAbweichend", spalte: s, wert: r.einheit });
    if (art[s] === "auswahl") erlaubt[s] = erlaubteWerte(r.einheit);
  }
  const pflicht = (s: string) => regeln?.[s]?.pflicht.trim().toLowerCase() ?? "";
  const wennLeer = (s: string) => regeln?.[s]?.wennLeer.trim() ?? "";
  const nutzungsPflicht = new Set(cfg.pflichtFuerNutzung);
  const stdSpalten = new Set(roh.standardwerteSpalten);
  const klassenOhneStandard = new Set<string>();
  const ungueltigeStandardwerte = new Set<string>();
  const gesehen = new Set<string>();
  const modelle: Bus[] = [];

  for (const z of roh.zeilen) {
    const rohId = z.werte.modell_id ?? null;
    const modellId = rohId === null ? undefined : String(rohId);
    const ort = { zeile: z.zeile, modellId };
    let nutzbar = true;

    if (rohId === null) {
      fehler({ code: "modellIdFehlt", zeile: z.zeile });
      continue;
    }

    // b) Werteprüfung
    const w: Record<string, Wert> = {};
    for (const s of CATALOG_COLUMNS) {
      const roherWert = z.werte[s] ?? null;
      const p = pruefeWert(art[s], roherWert, erlaubt[s]);
      if (p.ok) {
        w[s] = p.wert;
        continue;
      }
      w[s] = null;
      const m = { code: p.code, ...ort, spalte: s, wert: alsText(roherWert) };
      if (nutzungsPflicht.has(s)) {
        fehler(m);
        nutzbar = false;
      } else hinweis(m);
    }

    const id = w.modell_id as string;
    if (!MODELL_ID_MUSTER.test(id)) {
      fehler({ code: "modellIdUngueltig", ...ort, spalte: "modell_id", wert: id });
      nutzbar = false;
    }
    if (gesehen.has(id)) {
      fehler({ code: "modellIdDoppelt", ...ort, spalte: "modell_id", wert: id });
      nutzbar = false;
    }
    gesehen.add(id);

    // d) Formelspalten selbst rechnen
    const klasse = `${w.bauart ?? ""}|${w.antrieb ?? ""}`;
    const std = roh.standardwerte?.[klasse];
    const sitz = zahl(w.sitzplaetze);
    const steh = zahl(w.stehplaetze);
    const gesamt = sitz !== null && steh !== null ? sitz + steh : null;
    const kwhMax = zahl(w.batterie_kwh_max);
    const reichweite = zahl(w.reichweite_km);
    let verbrauch: number | null = null;
    if (kwhMax !== null && reichweite !== null && reichweite > 0) {
      const anteil = zahl(w.batterie_nutzbar_prozent) ?? zahl(std?.batterie_nutzbar_prozent);
      if (anteil !== null) verbrauch = (kwhMax * anteil) / reichweite;
    }
    const formeln: [Spalte, number | null][] = [
      ["gesamtplaetze", gesamt],
      ["verbrauch_datenblatt_kwh_100km", verbrauch],
    ];
    for (const [s, gerechnet] of formeln) {
      const datei = zahl(w[s]);
      if (weichtAb(gerechnet, datei, cfg.formelToleranz)) {
        hinweis({
          code: "formelAbweichung",
          ...ort,
          spalte: s,
          wert: `Datei ${datei ?? "leer"}, gerechnet ${gerechnet ?? "leer"}`,
        });
      }
      w[s] = gerechnet;
    }

    // e) Leere Felder füllen
    let klasseGemeldet = false;
    for (const s of CATALOG_COLUMNS) {
      if (w[s] !== null) continue;
      if (s === "fiktiv") {
        w[s] = false;
        continue;
      }
      const regel = wennLeer(s);
      if (art[s] === "auswahl" && erlaubt[s]?.includes(regel)) {
        w[s] = regel;
        continue;
      }
      if (regel.toLowerCase() !== STANDARDWERT_DER_KLASSE || !stdSpalten.has(s)) continue;
      if (!std) {
        const klasseBekannt = w.bauart !== null && w.antrieb !== null;
        if (klasseBekannt && !klasseGemeldet && !klassenOhneStandard.has(klasse)) {
          hinweis({ code: "keineStandardwerte", ...ort, wert: klasse });
          klassenOhneStandard.add(klasse);
        }
        klasseGemeldet = true;
        continue;
      }
      const p = pruefeWert(art[s], std[s] ?? null, erlaubt[s]);
      if (p.ok) w[s] = p.wert;
      else if (!ungueltigeStandardwerte.has(`${klasse}#${s}`)) {
        ungueltigeStandardwerte.add(`${klasse}#${s}`);
        hinweis({ code: "standardwertUngueltig", spalte: s, wert: `${klasse}: ${alsText(std[s] ?? null)}` });
      }
    }

    // c) Pflichtfelder
    const elektro = w.antrieb === ANTRIEB_ELEKTRO;
    for (const s of CATALOG_COLUMNS) {
      if (w[s] !== null) continue;
      const p = pflicht(s);
      if (nutzungsPflicht.has(s)) {
        // Bereits als falscher Wert gemeldet: nicht doppelt melden.
        if (z.werte[s] === null || z.werte[s] === undefined) fehler({ code: "pflichtfeldLeer", ...ort, spalte: s });
        nutzbar = false;
      } else if (p === "ja") hinweis({ code: "feldLeer", ...ort, spalte: s });
      else if (p === "nur elektro" && elektro) hinweis({ code: "elektrofeldLeer", ...ort, spalte: s });
    }

    if (nutzbar) modelle.push({ ...(w as Omit<Bus, "zeile">), zeile: z.zeile } as Bus);
  }
  return ergebnis(modelle);
}

/**
 * Wählbare Batteriegrößen in kWh: von batterie_kwh_min bis batterie_kwh_max in Schritten von batterie_kwh_schritt.
 * Der Bereich endet beim letzten vollen Schritt.
 */
export function batterieOptionen(bus: Pick<Bus, "batterie_kwh_min" | "batterie_kwh_max" | "batterie_kwh_schritt">): number[] {
  const min = bus.batterie_kwh_min ?? bus.batterie_kwh_max;
  const max = bus.batterie_kwh_max ?? bus.batterie_kwh_min;
  if (min === null || max === null || min > max) return [];
  const schritt = bus.batterie_kwh_schritt;
  if (schritt === null || !(schritt > 0)) return [max];
  const eps = GLEITKOMMA_EPS * Math.max(1, Math.abs(max));
  const out: number[] = [];
  for (let i = 0; ; i++) {
    const v = min + i * schritt;
    if (v > max + eps) break;
    out.push(Number(v.toFixed(9)));
  }
  return out;
}

/** Liest und prüft den Katalog. Wirft nie: eine unlesbare Datei ergibt den Fehler dateiUnlesbar. */
export async function ladeKatalog(bytes: ArrayBuffer | Uint8Array, cfg: CatalogConfig): Promise<KatalogErgebnis> {
  let roh: KatalogRoh;
  try {
    roh = await leseKatalogDatei(bytes, cfg);
  } catch (e) {
    return {
      modelle: [],
      meldungen: [{ schwere: "fehler", code: "dateiUnlesbar", wert: e instanceof Error ? e.message : String(e) }],
      zeilenGesamt: 0,
    };
  }
  return pruefeKatalog(roh, cfg);
}
