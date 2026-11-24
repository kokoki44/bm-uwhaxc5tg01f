// Lädt den Testdatensatz Norderstedt EINMALIG von der Overpass API, kürzt die Tags auf die benötigten,
// rundet Koordinaten auf 6 Stellen und schreibt gzip-JSON und Prüfsumme.
// Zusätzlich ein Rand von 2 km um die Gemeinde, dort nur Straßen, die ein Bus befahren darf
// (mit Ampeln und Abbiegeregeln), keine Gebäude, kein Grün, keine Haltestellen.
// Wird von Hand ausgeführt (npm run daten:norderstedt), nie von Tests.
// Mit --nur-filtern wird nur der Zuschnitt auf die vorhandene Datei angewendet, ohne Abruf.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { filtere } from "./norderstedt-filter.mjs";

const OUT = "public/data/norderstedt/norderstedt.osm.json.gz";
const RAND_M = 2000;
const cfg = JSON.parse(readFileSync("src/config/config.json", "utf8"));
const BUS_HW = cfg.roads.busHighways.join("|");

// Overpass bittet bei Überlast um Wiederholung mit wachsender Wartezeit (30 s, 60 s, 120 s)
async function overpass(query) {
  for (let versuch = 0, warten = 30; ; versuch++, warten *= 2) {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "User-Agent": "bus-manager-dev/0.1", Accept: "*/*", "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query),
    });
    if (res.ok) return res.json();
    if (versuch >= 3 || ![429, 502, 503, 504].includes(res.status)) throw new Error("Overpass: HTTP " + res.status);
    console.log(`Overpass: HTTP ${res.status}, neuer Versuch in ${warten} s`);
    await new Promise((r) => setTimeout(r, warten * 1000));
  }
}

const KEEP = new Set([
  "highway", "junction", "oneway", "oneway:bus", "oneway:psv", "maxspeed", "access", "motor_vehicle", "vehicle", "bus", "psv", "service", "area",
  "name", "building", "building:levels", "amenity", "shop", "landuse", "natural", "leisure", "waterway",
  "public_transport", "boundary", "admin_level", "type", "restriction", "except", "ISO3166-2",
  "de:amtlicher_gemeindeschluessel", "population",
]);
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const pt = (p) => (p ? { lat: r6(p.lat), lon: r6(p.lon) } : null);
const slim = (el) => {
  const o = { type: el.type, id: el.id };
  if (el.lat !== undefined) { o.lat = r6(el.lat); o.lon = r6(el.lon); }
  if (el.nodes) o.nodes = el.nodes;
  if (el.geometry) o.geometry = el.geometry.map(pt);
  if (el.members) o.members = el.members.map((m) => ({
    type: m.type, ref: m.ref, role: m.role,
    ...(m.geometry ? { geometry: m.geometry.map(pt) } : {}),
    ...(m.lat !== undefined ? { lat: r6(m.lat), lon: r6(m.lon) } : {}),
  }));
  if (el.tags) {
    const t = Object.fromEntries(Object.entries(el.tags).filter(([k]) => KEEP.has(k)));
    if (Object.keys(t).length) o.tags = t;
  }
  return o;
};

async function abrufen() {
  // 1. Grenze der Gemeinde, daraus der Rahmen mit Rand
  const grenze = await overpass(`[out:json][timeout:60];relation["boundary"="administrative"]["name"="Norderstedt"]["admin_level"="8"];out geom;`);
  const punkte = grenze.elements[0].members.filter((m) => m.type === "way" && m.geometry).flatMap((m) => m.geometry.filter(Boolean));
  const lat0 = punkte.reduce((s, p) => s + p.lat, 0) / punkte.length;
  const dLat = RAND_M / 110540, dLon = RAND_M / (111320 * Math.cos((lat0 * Math.PI) / 180));
  const s = Math.min(...punkte.map((p) => p.lat)) - dLat, n = Math.max(...punkte.map((p) => p.lat)) + dLat;
  const w = Math.min(...punkte.map((p) => p.lon)) - dLon, e = Math.max(...punkte.map((p) => p.lon)) + dLon;
  const bbox = [s, w, n, e].map((x) => x.toFixed(5)).join(",");

  // 2. Gemeinde vollständig, Rahmen nur Busstraßen (Zuschnitt auf 2 km danach in filtere)
  const QUERY = `[out:json][timeout:300];
area["name"="Norderstedt"]["boundary"="administrative"]["admin_level"="8"]->.a;
(
  way(area.a)["highway"]->.h;
  way(${bbox})["highway"~"^(${BUS_HW})$"]->.r1;
  way(${bbox})["highway"]["bus"~"^(yes|designated|permissive)$"]->.r2;
  way(${bbox})["highway"]["psv"~"^(yes|designated|permissive)$"]->.r3;
  .h; .r1; .r2; .r3;
  node(${bbox})["highway"="traffic_signals"];
  rel(bw.h)["type"="restriction"];
  rel(bw.r1)["type"="restriction"];
  node(area.a)["highway"="bus_stop"];
  node(area.a)["public_transport"="platform"]["bus"="yes"];
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
  console.log("Rahmen:", bbox);
  const raw = await overpass(QUERY);
  return { generator: raw.generator, osm3s: raw.osm3s, elements: raw.elements.map(slim) };
}

const daten = process.argv.includes("--nur-filtern") ? JSON.parse(gunzipSync(readFileSync(OUT)).toString("utf8")) : await abrufen();
const { elements, stat } = filtere(daten.elements, cfg.roads, RAND_M);
const out = { generator: daten.generator, osm3s: daten.osm3s, elements };
const gz = gzipSync(Buffer.from(JSON.stringify(out)), { level: 9 });
writeFileSync(OUT, gz);
writeFileSync(OUT.replace(".osm.json.gz", ".sha256"), createHash("sha256").update(gz).digest("hex") + "\n");
const count = {};
for (const el of out.elements) count[el.type] = (count[el.type] ?? 0) + 1;
console.log("Stand der OSM-Daten:", daten.osm3s?.timestamp_osm_base, count, stat, (gz.length / 1e6).toFixed(2) + " MB");
