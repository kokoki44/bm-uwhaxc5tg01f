/**
 * Zufall mit festem Startwert (mulberry32). Der Zustand ist eine Zahl und gehört zum Spielstand,
 * damit dieselbe Zufallszahl immer dieselben Ergebnisse liefert (Konzept: Simulationstests mit fester Zufallszahl).
 */
export interface Zufall {
  zustand: number;
}

export function neuerZufall(startwert: number): Zufall {
  return { zustand: startwert >>> 0 };
}

/** Gleichverteilt in [0, 1). */
export function zufall(z: Zufall): number {
  z.zustand = (z.zustand + 0x6d2b79f5) >>> 0;
  let t = z.zustand;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Gleichverteilt in [a, b). */
export const zwischen = (z: Zufall, a: number, b: number): number => a + (b - a) * zufall(z);

/** Ganze Zahl in [a, b] (beide eingeschlossen). */
export const ganzzahl = (z: Zufall, a: number, b: number): number => a + Math.floor(zufall(z) * (b - a + 1));

export function waehle<T>(z: Zufall, liste: readonly T[]): T {
  if (!liste.length) throw new Error("Leere Liste");
  return liste[Math.floor(zufall(z) * liste.length)];
}

/** Wahr mit Wahrscheinlichkeit p. */
export const ja = (z: Zufall, p: number): boolean => zufall(z) < p;

/** Index nach Gewichten. */
export function gewichtet(z: Zufall, gewichte: readonly number[]): number {
  const summe = gewichte.reduce((a, b) => a + b, 0);
  let r = zufall(z) * summe;
  for (let i = 0; i < gewichte.length; i++) {
    r -= gewichte[i];
    if (r < 0) return i;
  }
  return gewichte.length - 1;
}

/** Poisson-verteilte Zahl mit Mittelwert m (Knuth, für kleine m). */
export function poisson(z: Zufall, m: number): number {
  if (!(m > 0)) return 0;
  const grenze = Math.exp(-m);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= zufall(z);
  } while (p > grenze);
  return k - 1;
}
