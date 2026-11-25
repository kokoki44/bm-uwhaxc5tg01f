import { addDays, civil, parts, type CivilMs } from "../calendar/civil";
import type { Bus } from "../catalog/katalog";
import type { Kasse } from "../depot/hof";
import { ganzzahl, gewichtet, ja, waehle, zwischen, type Zufall } from "../game/zufall";
import { batterien, fahrzeugartKaufbar, neupreis, wert, type Angebot, type Fuhrpark, type Konfiguration, type MarktKontext } from "./fuhrpark";

const cent = (x: number) => Math.round(x * 100) / 100;

/** Montag 0 Uhr am Tag t oder danach: Angebote laufen genau beim Wochenwechsel ab, an dem sie verschwinden. */
export function montagAb(t: CivilMs): CivilMs {
  const p = parts(t);
  const tag = civil(p.jahr, p.monat, p.tag);
  const tage = p.wochentag === 1 && tag === t ? 0 : (8 - p.wochentag) % 7 || 7;
  return civil(p.jahr, p.monat, p.tag + tage);
}
const begrenze = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Land aus dem ISO-Code der Region (DE-SH ergibt DE). */
export const landVon = (region: string | null) => (region ? region.split("-")[0] : null);

/** Passt die Katalogregion zur Startgemeinde? Unbekanntes Land: alle Regionen (Annahme A3-13). */
export function regionPasst(m: Bus, land: string | null, k: MarktKontext): boolean {
  const erlaubt = land ? k.markt.regionenNachLand[land] : undefined;
  return !erlaubt || erlaubt.includes(m.region ?? "");
}

/**
 * Baujahre, in denen ein Modell gebraucht angeboten wird: zwischen baujahr_von und baujahr_bis (sonst aktuelles Jahr).
 * Fehlt baujahr_von: ab aktuellem Jahr minus lebensdauer_jahre (A2-34). Höchstens aktuelles Jahr minus Mindestalter.
 */
export function baujahrSpanne(m: Bus, jahr: number, k: MarktKontext): [number, number] | null {
  const von = m.baujahr_von ?? jahr - (m.lebensdauer_jahre ?? 0);
  const bis = Math.min(m.baujahr_bis ?? jahr, jahr - k.markt.gebraucht.mindestAlterJahre);
  return von <= bis ? [von, bis] : null;
}

/** Modelle, die auf dem Gebrauchtmarkt vorkommen können (auch eingestellte). */
export function gebrauchtModelle(jahr: number, land: string | null, k: MarktKontext): Bus[] {
  return [...k.modelle.values()].filter(
    (m) => fahrzeugartKaufbar(m, k.markt) && regionPasst(m, land, k) && m.neupreis_eur !== null && m.lebensdauer_jahre !== null && baujahrSpanne(m, jahr, k) !== null,
  );
}

/** Spanne von festgelegter Breite um einen Wert, an zufälliger Stelle, innerhalb 0 bis 100. */
function spanne(wahr: number, breite: number, z: Zufall): [number, number] {
  let von = wahr - ganzzahl(z, 0, breite);
  von = begrenze(von, 0, 100 - breite);
  return [von, von + breite];
}

/** Ausstattung eines Gebrauchtbusses: auch Optionen, die im Neukauf noch gesperrt sind. Assistenten ab Pflichtjahr immer. */
function gebrauchtOptionen(m: Bus, baujahr: number, z: Zufall, k: MarktKontext): string[] {
  const g = k.markt.gebraucht;
  const passend = k.optionen.filter((o) => o.nurAntrieb === null || o.nurAntrieb === m.antrieb);
  const out: string[] = [];
  const gruppen = [...new Set(passend.filter((o) => o.gruppe !== null).map((o) => o.gruppe!))];
  for (const gr of gruppen) {
    const liste = passend.filter((o) => o.gruppe === gr);
    const gew = liste.map((o) => o.gebrauchtAnteil);
    out.push((gew.some((x) => x > 0) ? liste[gewichtet(z, gew)] : liste.find((o) => o.standard)!).id);
  }
  for (const o of passend.filter((x) => x.gruppe === null)) {
    const p = o.serieNeukauf ? (baujahr >= g.assistentenPflichtAbBaujahr ? 1 : g.assistentenAnteilVorher) : o.gebrauchtAnteil;
    if (ja(z, p)) out.push(o.id);
  }
  return out;
}

/** Erzeugt ein Gebrauchtangebot. Alle Zufallswerte kommen aus dem Spielzufall (fester Startwert je Spielstand). */
export function erzeugeAngebot(f: Fuhrpark, jetzt: CivilMs, land: string | null, z: Zufall, k: MarktKontext): Angebot | null {
  const jahr = parts(jetzt).jahr;
  const kandidaten = gebrauchtModelle(jahr, land, k);
  if (!kandidaten.length) return null;
  const g = k.markt.gebraucht;
  const m = waehle(z, kandidaten);
  const [von, bis] = baujahrSpanne(m, jahr, k)!;
  const baujahr = ganzzahl(z, von, bis);
  const alter = jahr - baujahr;
  const ld = m.lebensdauer_jahre!;
  const zuv = m.zuverlaessigkeit ?? 100;
  const zustand = Math.round(
    begrenze(100 - g.zustandAbnahmeUeberLebensdauer * (alter / ld) - (100 - zuv) * g.zustandAbschlagJeZuverlaessigkeitspunkt + zwischen(z, -g.zustandStreuung, g.zustandStreuung), g.zustandMin, 100),
  );
  const [zustandVon, zustandBis] = spanne(zustand, g.zustandSpanne, z);
  const bat = batterien(m, k.katalog);
  const batterieKwh = bat.length ? waehle(z, bat) : null;
  let batterieZustand: number | null = null, batterieVon: number | null = null, batterieBis: number | null = null;
  if (batterieKwh !== null) {
    const bld = m.batterie_lebensdauer_jahre ?? ld;
    batterieZustand = Math.round(Math.max(g.batterieZustandMin, 100 - (100 - g.batterieZustandEnde) * (alter / bld)));
    [batterieVon, batterieBis] = spanne(batterieZustand, g.batterieSpanne, z);
  }
  const konfig: Konfiguration = { batterieKwh, lackierung: (m.farbe_standard_hex ?? waehle(z, g.palette)).toLowerCase(), optionen: gebrauchtOptionen(m, baujahr, z, k) };
  const neupreisKonfigEur = neupreis(m, konfig, k);
  const preisEur = cent(wert(neupreisKonfigEur, alter, ld, zustand, k.markt) * (1 + zwischen(z, -g.preisStreuung, g.preisStreuung)));
  const laufleistungKm = Math.round((alter * g.kmJeJahr * (1 + zwischen(z, -g.kmStreuung, g.kmStreuung))) / 100) * 100;
  return {
    id: f.naechsteAngebotId++,
    modellId: m.modell_id!,
    baujahr,
    alterJahre: alter,
    laufleistungKm,
    zustand,
    zustandVon,
    zustandBis,
    batterieZustand,
    batterieVon,
    batterieBis,
    huRestMonate: ganzzahl(z, 1, m.intervall_hu_monate ?? k.markt.huMonateStandard),
    konfig,
    neupreisKonfigEur,
    preisEur,
    erstellt: jetzt,
    ablauf: montagAb(addDays(jetzt, 7 * ganzzahl(z, g.laufzeitWochenMin, g.laufzeitWochenMax))),
    inspiziert: false,
  };
}

/** Erneuert das Angebot: abgelaufene Angebote verschwinden, neue füllen bis zur Zahl aus der Konfiguration auf. */
export function erneuereAngebote(f: Fuhrpark, jetzt: CivilMs, land: string | null, z: Zufall, k: MarktKontext): { weg: number; neu: number } {
  const vorher = f.angebote.length;
  f.angebote = f.angebote.filter((a) => a.ablauf > jetzt);
  const weg = vorher - f.angebote.length;
  let neu = 0;
  while (f.angebote.length < k.markt.gebraucht.angebote) {
    const a = erzeugeAngebot(f, jetzt, land, z, k);
    if (!a) break;
    f.angebote.push(a);
    neu++;
  }
  return { weg, neu };
}

/** Inspektion gegen Gebühr: zeigt den genauen Zustand und den Batteriezustand (Mängel erst mit Etappe 5). */
export function inspiziere(f: Fuhrpark, angebotId: number, kasse: Kasse, k: MarktKontext, jetzt: CivilMs): { ok: true } | { ok: false; fehler: "unbekannt" | "schonInspiziert" | "geldFehlt" } {
  const a = f.angebote.find((x) => x.id === angebotId);
  if (!a || a.ablauf <= jetzt) return { ok: false, fehler: "unbekannt" };
  if (a.inspiziert) return { ok: false, fehler: "schonInspiziert" };
  if (kasse.kontostandEur < k.markt.inspektionEur) return { ok: false, fehler: "geldFehlt" };
  kasse.kontostandEur = cent(kasse.kontostandEur - k.markt.inspektionEur);
  a.inspiziert = true;
  return { ok: true };
}
