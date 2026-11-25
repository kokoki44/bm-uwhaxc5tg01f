import { bauen, type BauteilTyp, type Betriebshof, type HofKontext, type Kasse } from "../../src/depot/hof";
import type { Rechteck } from "../../src/depot/rechteck";

/** Grundstücksgröße des Beispiel-Layouts: Mindestgröße 2.000 m². */
export const BEISPIEL_B = 50;
export const BEISPIEL_T = 40;

/**
 * Vollständiges erstes Layout mit jedem Bauteiltyp, auf 50 × 40 m:
 * Tore am West- und Ostrand (Durchfahrt, damit die Busse nicht wenden müssen), Fahrweg 7 m breit quer durch,
 * nördlich 6 Stellplätze, Ladeplatz, Halle und Tankstelle,
 * südlich Werkstatt, Waschanlage, Büro, Lager, Toilette, Küche und Pausenraum.
 */
export const BEISPIEL_LAYOUT: [BauteilTyp, Rechteck][] = [
  ["tor", { x: 0, y: 16, b: 4, t: 7 }],
  ["fahrweg", { x: 4, y: 16, b: 42, t: 7 }],
  ["tor", { x: 46, y: 16, b: 4, t: 7 }],
  ...[4, 8, 12, 16, 20, 24].map((x) => ["stellplatz", { x, y: 2, b: 4, t: 14 }] as [BauteilTyp, Rechteck]),
  ["ladeplatz", { x: 28, y: 2, b: 4, t: 14 }],
  ["halle", { x: 32, y: 1, b: 4, t: 15 }],
  ["tankstelle", { x: 36, y: 8, b: 4, t: 8 }],
  ["werkstatt", { x: 4, y: 23, b: 5, t: 15 }],
  ["waschanlage", { x: 9, y: 23, b: 18, t: 5 }],
  ["buero", { x: 27, y: 23, b: 4, t: 4 }],
  ["lager", { x: 31, y: 23, b: 4, t: 4 }],
  ["toilette", { x: 35, y: 23, b: 2, t: 2 }],
  ["kueche", { x: 37, y: 23, b: 3, t: 3 }],
  ["pausenraum", { x: 40, y: 23, b: 4, t: 4 }],
];

/** Baut das Beispiel-Layout und liefert die Baukosten. Wirft, wenn ein Bauteil nicht gebaut werden kann. */
export function baueBeispiel(hof: Betriebshof, kasse: Kasse, ctx: HofKontext): number {
  let summe = 0;
  for (const [typ, r] of BEISPIEL_LAYOUT) {
    const e = bauen(hof, kasse, typ, r, ctx);
    if (!e.ok) throw new Error(`Beispiel-Layout: ${typ} ${JSON.stringify(r)} ${e.fehler}`);
    summe += e.kostenEur;
  }
  return Math.round(summe * 100) / 100;
}
