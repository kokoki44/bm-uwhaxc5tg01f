import type { OsmElement, OsmExtract } from "../../src/data/osm";

/** Baut kleine OSM-Auszüge für Tests. Knoten liegen auf einem Raster um 10,0 / 53,7 (x: 0,001° Länge, y: 0,001° Breite). */
export class TestOsm {
  private readonly coords = new Map<number, [number, number]>();
  readonly elements: OsmElement[] = [];
  private nextWay = 1000;
  private nextRel = 5000;

  node(id: number, x: number, y: number, tags?: Record<string, string>): this {
    this.coords.set(id, [x, y]);
    if (tags) this.elements.push({ type: "node", id, lat: this.lat(y), lon: this.lon(x), tags });
    return this;
  }
  lon(x: number) {
    return 10 + x * 0.001;
  }
  lat(y: number) {
    return 53.7 + y * 0.001;
  }
  way(nodes: number[], tags: Record<string, string>): number {
    const id = this.nextWay++;
    this.elements.push({
      type: "way",
      id,
      nodes,
      geometry: nodes.map((n) => ({ lat: this.lat(this.coords.get(n)![1]), lon: this.lon(this.coords.get(n)![0]) })),
      tags,
    });
    return id;
  }
  restriction(kind: string, from: number, via: number, to: number, extra: Record<string, string> = {}): void {
    this.elements.push({
      type: "relation",
      id: this.nextRel++,
      members: [
        { type: "way", ref: from, role: "from" },
        { type: "node", ref: via, role: "via" },
        { type: "way", ref: to, role: "to" },
      ],
      tags: { type: "restriction", restriction: kind, ...extra },
    });
  }
  /** Verwaltungsgrenze als Rechteck (x0,y0)-(x1,y1). */
  boundary(name: string, level: number, x0: number, y0: number, x1: number, y1: number, tags: Record<string, string> = {}): void {
    const p = (x: number, y: number) => ({ lat: this.lat(y), lon: this.lon(x) });
    this.elements.push({
      type: "relation",
      id: this.nextRel++,
      members: [
        { type: "way", ref: this.nextWay++, role: "outer", geometry: [p(x0, y0), p(x1, y0), p(x1, y1)] },
        { type: "way", ref: this.nextWay++, role: "outer", geometry: [p(x1, y1), p(x0, y1), p(x0, y0)] },
      ],
      tags: { type: "boundary", boundary: "administrative", admin_level: String(level), name, ...tags },
    });
  }
  /** Gebäude als Rechteck mit Mittelpunkt (x,y) und Seitenlänge in Rastereinheiten. */
  building(x: number, y: number, size: number, tags: Record<string, string>): void {
    const h = size / 2;
    const ring = [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h], [x - h, y - h]].map(([a, b]) => ({ lat: this.lat(b), lon: this.lon(a) }));
    this.elements.push({ type: "way", id: this.nextWay++, geometry: ring, tags });
  }
  extract(): OsmExtract {
    return { elements: this.elements };
  }
}
