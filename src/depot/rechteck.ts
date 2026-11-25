/**
 * Rechtecke im Betriebshof. Koordinaten in Metern, x nach Osten, y nach Süden (Draufsicht, Norden oben).
 * b ist die Ausdehnung in x, t die Ausdehnung in y.
 */
export interface Rechteck {
  x: number;
  y: number;
  b: number;
  t: number;
}

/** Seiten eines Rechtecks: n oben (kleines y), s unten, w links, o rechts. */
export type Seite = "n" | "o" | "s" | "w";
export const SEITEN: readonly Seite[] = ["n", "o", "s", "w"];

const EPS = 1e-9;

export const flaecheM2 = (r: Rechteck): number => r.b * r.t;

/** Kurze und lange Seite. */
export const kurzLang = (r: { b: number; t: number }): [number, number] => (r.b <= r.t ? [r.b, r.t] : [r.t, r.b]);

export function ueberlappt(a: Rechteck, b: Rechteck): boolean {
  return a.x < b.x + b.b - EPS && b.x < a.x + a.b - EPS && a.y < b.y + b.t - EPS && b.y < a.y + a.t - EPS;
}

export function enthaelt(aussen: Rechteck, innen: Rechteck): boolean {
  return innen.x >= aussen.x - EPS && innen.y >= aussen.y - EPS && innen.x + innen.b <= aussen.x + aussen.b + EPS && innen.y + innen.t <= aussen.y + aussen.t + EPS;
}

/** Länge der Seite s. */
export const seitenLaenge = (r: Rechteck, s: Seite): number => (s === "n" || s === "s" ? r.b : r.t);
/** Ausdehnung senkrecht zur Seite s (Tiefe, wenn man von dieser Seite hineinfährt). */
export const seitenTiefe = (r: Rechteck, s: Seite): number => (s === "n" || s === "s" ? r.t : r.b);

export interface Kontakt {
  /** Seite von a, an der b anliegt. */
  seite: Seite;
  /** Abschnitt entlang der Seite in absoluten Koordinaten (x bei n/s, y bei o/w). */
  von: number;
  bis: number;
}

/** Gemeinsame Kante zweier Rechtecke, die sich nicht überlappen. null, wenn sie sich nicht berühren. */
export function kontakt(a: Rechteck, b: Rechteck): Kontakt | null {
  const ueber = (a0: number, a1: number, b0: number, b1: number) => [Math.max(a0, b0), Math.min(a1, b1)] as const;
  if (Math.abs(b.x + b.b - a.x) < EPS || Math.abs(a.x + a.b - b.x) < EPS) {
    const [von, bis] = ueber(a.y, a.y + a.t, b.y, b.y + b.t);
    if (bis - von > EPS) return { seite: Math.abs(b.x + b.b - a.x) < EPS ? "w" : "o", von, bis };
  }
  if (Math.abs(b.y + b.t - a.y) < EPS || Math.abs(a.y + a.t - b.y) < EPS) {
    const [von, bis] = ueber(a.x, a.x + a.b, b.x, b.x + b.b);
    if (bis - von > EPS) return { seite: Math.abs(b.y + b.t - a.y) < EPS ? "n" : "s", von, bis };
  }
  return null;
}

/** Fasst Abschnitte zusammen, die sich berühren oder überlappen. */
export function vereinige(iv: [number, number][]): [number, number][] {
  const s = [...iv].sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  for (const [a, b] of s) {
    const l = out[out.length - 1];
    if (l && a <= l[1] + EPS) l[1] = Math.max(l[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Liegt eine Seite von r auf dem Rand des Grundstücks? Liefert die erste solche Seite. */
export function randSeite(grund: Rechteck, r: Rechteck): Seite | null {
  if (Math.abs(r.y - grund.y) < EPS) return "n";
  if (Math.abs(r.x + r.b - (grund.x + grund.b)) < EPS) return "o";
  if (Math.abs(r.y + r.t - (grund.y + grund.t)) < EPS) return "s";
  if (Math.abs(r.x - grund.x) < EPS) return "w";
  return null;
}
