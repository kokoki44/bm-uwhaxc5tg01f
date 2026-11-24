/** Geometrie-Hilfen. Koordinaten immer als [Länge, Breite] (wie GeoJSON). */
export type LonLat = [number, number];
export type XY = [number, number];

const R = 6371008.8;
const RAD = Math.PI / 180;

export function haversine(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function lineLength(coords: LonLat[]): number {
  let l = 0;
  for (let i = 1; i < coords.length; i++) l += haversine(coords[i - 1], coords[i]);
  return l;
}

/** Ebene Näherung um einen Bezugspunkt, genau genug für Flächen und Abstände innerhalb einer Gemeinde. */
export class LocalProj {
  private readonly kx: number;
  private readonly ky = R * RAD;
  constructor(
    readonly lon0: number,
    readonly lat0: number,
  ) {
    this.kx = R * RAD * Math.cos(lat0 * RAD);
  }
  toXY(p: LonLat): XY {
    return [(p[0] - this.lon0) * this.kx, (p[1] - this.lat0) * this.ky];
  }
  toLonLat(p: XY): LonLat {
    return [p[0] / this.kx + this.lon0, p[1] / this.ky + this.lat0];
  }
}

/** Fläche eines Rings in m² (Gaußsche Trapezformel in lokaler Projektion). */
export function ringAreaM2(ring: LonLat[], proj: LocalProj): number {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = proj.toXY(ring[i]);
    const [x2, y2] = proj.toXY(ring[(i + 1) % n]);
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function ringCentroid(ring: LonLat[]): LonLat {
  let x = 0, y = 0;
  const n = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.length - 1 : ring.length;
  for (let i = 0; i < n; i++) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}

export function pointInRing(p: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Punkt liegt in einem Polygon aus äußeren Ringen (gerade-ungerade-Regel über alle Ringe, deckt Löcher ab). */
export function pointInRings(p: LonLat, rings: LonLat[][]): boolean {
  let n = 0;
  for (const r of rings) if (pointInRing(p, r)) n++;
  return n % 2 === 1;
}

export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function bboxOf(rings: LonLat[][]): BBox {
  const b = { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity };
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < b.minLon) b.minLon = x;
      if (y < b.minLat) b.minLat = y;
      if (x > b.maxLon) b.maxLon = x;
      if (y > b.maxLat) b.maxLat = y;
    }
  return b;
}

/** Setzt Ringe aus Linienstücken zusammen (Mitglieder einer Grenzrelation). Offene Reste werden verworfen. */
export function assembleRings(parts: LonLat[][]): LonLat[][] {
  const key = (p: LonLat) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
  const rest = parts.filter((p) => p.length >= 2).map((p) => [...p]);
  const rings: LonLat[][] = [];
  while (rest.length) {
    const ring = rest.shift()!;
    let changed = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && changed) {
      changed = false;
      const end = key(ring[ring.length - 1]);
      for (let i = 0; i < rest.length; i++) {
        const p = rest[i];
        if (key(p[0]) === end) ring.push(...p.slice(1));
        else if (key(p[p.length - 1]) === end) ring.push(...[...p].reverse().slice(1));
        else continue;
        rest.splice(i, 1);
        changed = true;
        break;
      }
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

export interface Projection {
  /** Anteil 0..1 entlang der Linie (nach Länge). */
  t: number;
  dist: number;
  point: LonLat;
  /** Vorzeichen des Kreuzprodukts: >0 Punkt links der Fahrtrichtung, <0 rechts. */
  side: number;
}

/** Projiziert einen Punkt auf eine Linie. */
export function projectOnLine(p: LonLat, coords: LonLat[], proj: LocalProj): Projection {
  const P = proj.toXY(p);
  let best: Projection = { t: 0, dist: Infinity, point: coords[0], side: 0 };
  let total = 0;
  const segLen: number[] = [];
  for (let i = 1; i < coords.length; i++) {
    const a = proj.toXY(coords[i - 1]);
    const b = proj.toXY(coords[i]);
    segLen.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
    total += segLen[i - 1];
  }
  let before = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = proj.toXY(coords[i - 1]);
    const b = proj.toXY(coords[i]);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((P[0] - a[0]) * dx + (P[1] - a[1]) * dy) / l2));
    const q: XY = [a[0] + u * dx, a[1] + u * dy];
    const d = Math.hypot(P[0] - q[0], P[1] - q[1]);
    if (d < best.dist) {
      best = {
        t: total === 0 ? 0 : (before + u * segLen[i - 1]) / total,
        dist: d,
        point: proj.toLonLat(q),
        side: dx * (P[1] - a[1]) - dy * (P[0] - a[0]),
      };
    }
    before += segLen[i - 1];
  }
  return best;
}

/** Teilstück einer Linie zwischen den Anteilen t0 und t1 (nach Länge). */
export function sliceLine(coords: LonLat[], t0: number, t1: number): LonLat[] {
  const total = lineLength(coords);
  if (total === 0) return [coords[0], coords[coords.length - 1]];
  const d0 = t0 * total, d1 = t1 * total;
  const out: LonLat[] = [];
  let acc = 0;
  const lerp = (a: LonLat, b: LonLat, f: number): LonLat => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  for (let i = 1; i < coords.length; i++) {
    const l = haversine(coords[i - 1], coords[i]);
    const s = acc, e = acc + l;
    if (e >= d0 && s <= d1) {
      if (out.length === 0) out.push(l === 0 ? coords[i - 1] : lerp(coords[i - 1], coords[i], Math.max(0, (d0 - s) / l)));
      if (e <= d1) out.push(coords[i]);
      else {
        out.push(l === 0 ? coords[i] : lerp(coords[i - 1], coords[i], (d1 - s) / l));
        break;
      }
    }
    acc = e;
  }
  if (out.length === 1) out.push(out[0]);
  return out;
}
