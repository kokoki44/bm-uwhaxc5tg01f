// Lädt den Testdatensatz Norderstedt EINMALIG von der Overpass API, kürzt die Tags auf die benötigten,
// rundet Koordinaten auf 6 Stellen und schreibt gzip-JSON, Hash und Metadaten.
// Wird von Hand ausgeführt (npm run daten:norderstedt), nie von Tests.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const OUT = "public/data/norderstedt/norderstedt.osm.json.gz";
const QUERY = `[out:json][timeout:240];
area["name"="Norderstedt"]["boundary"="administrative"]["admin_level"="8"]->.a;
(
  way(area.a)["highway"]->.h;
  .h;
  node(area.a)["highway"~"^(bus_stop|traffic_signals)$"];
  node(area.a)["public_transport"="platform"]["bus"="yes"];
  rel(bw.h)["type"="restriction"];
  way(area.a)["building"];
  way(area.a)["landuse"];
  way(area.a)["natural"~"^(water|wood|scrub|grassland|heath|wetland)$"];
  way(area.a)["leisure"~"^(park|garden|pitch|playground|golf_course|nature_reserve|common|sports_centre|stadium|swimming_pool)$"];
  way(area.a)["waterway"~"^(river|stream|canal)$"];
  node(area.a)["amenity"];
  node(area.a)["shop"];
  way(area.a)["shop"];
  way(area.a)["amenity"~"^(school|kindergarten|college|university|hospital|clinic|marketplace|cinema|theatre|library|townhall|restaurant|cafe)$"];
  relation["boundary"="administrative"]["name"="Norderstedt"]["admin_level"="8"];
  relation(area.a)["boundary"="administrative"]["admin_level"~"^(9|10)$"];
);
out geom;`;

const KEEP = new Set([
  "highway", "junction", "oneway", "oneway:bus", "maxspeed", "access", "motor_vehicle", "bus", "psv", "service",
  "name", "building", "building:levels", "amenity", "shop", "landuse", "natural", "leisure", "waterway",
  "public_transport", "boundary", "admin_level", "type", "restriction", "except", "ISO3166-2",
  "de:amtlicher_gemeindeschluessel", "population", "tunnel",
]);

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const slim = (e) => {
  const o = { type: e.type, id: e.id };
  if (e.lat !== undefined) { o.lat = r6(e.lat); o.lon = r6(e.lon); }
  if (e.nodes) o.nodes = e.nodes;
  if (e.geometry) o.geometry = e.geometry.map((p) => (p ? { lat: r6(p.lat), lon: r6(p.lon) } : null));
  if (e.members) o.members = e.members.map((m) => ({
    type: m.type, ref: m.ref, role: m.role,
    ...(m.geometry ? { geometry: m.geometry.map((p) => (p ? { lat: r6(p.lat), lon: r6(p.lon) } : null)) } : {}),
    ...(m.lat !== undefined ? { lat: r6(m.lat), lon: r6(m.lon) } : {}),
  }));
  if (e.tags) {
    const t = Object.fromEntries(Object.entries(e.tags).filter(([k]) => KEEP.has(k)));
    if (Object.keys(t).length) o.tags = t;
  }
  return o;
};

const res = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "User-Agent": "bus-manager-dev/0.1", Accept: "*/*", "Content-Type": "application/x-www-form-urlencoded" },
  body: "data=" + encodeURIComponent(QUERY),
});
if (!res.ok) throw new Error("Overpass: HTTP " + res.status);
const raw = await res.json();
const out = { generator: raw.generator, osm3s: raw.osm3s, elements: raw.elements.map(slim) };
const gz = gzipSync(Buffer.from(JSON.stringify(out)), { level: 9 });
writeFileSync(OUT, gz);
writeFileSync(OUT.replace(".osm.json.gz", ".sha256"), createHash("sha256").update(gz).digest("hex") + "\n");
const count = {};
for (const e of out.elements) count[e.type] = (count[e.type] ?? 0) + 1;
console.log("Stand der OSM-Daten:", raw.osm3s?.timestamp_osm_base, count, (gz.length / 1e6).toFixed(2) + " MB");
writeFileSync("scripts/.query.txt", QUERY);
