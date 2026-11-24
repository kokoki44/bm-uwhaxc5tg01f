// Zuschnitt des Norderstedt-Datensatzes: Gemeinde vollständig, Rand von RAND_M nur Busstraßen.
// Wird vom Abrufskript genutzt und kann allein auf die vorhandene Datei angewendet werden.

/** Darf ein Linienbus diesen Weg befahren? Gleiche Regel wie isBusWay in src/world/roads.ts. */
export function istBusWeg(t, roads) {
  if (!t?.highway || t.area === "yes") return false;
  const busTag = t.bus ?? t.psv;
  if (busTag === "no") return false;
  if (busTag && ["yes", "designated", "permissive"].includes(busTag)) return true;
  if (!roads.busHighways.includes(t.highway)) return false;
  const gesperrt = (v) => v === "no" || v === "private";
  return !(gesperrt(t.access) || gesperrt(t.motor_vehicle) || gesperrt(t.vehicle));
}

// Wege, die weder befahren noch gezeichnet werden
const NICHT_BENOETIGT = new Set(["footway", "path", "cycleway", "steps", "track", "bridleway", "pedestrian", "corridor", "elevator", "construction", "proposed", "platform", "via_ferrata"]);

export function filtere(elements, roads, randM) {
  const grenze = elements.find((e) => e.type === "relation" && e.tags?.boundary === "administrative" && e.tags.admin_level === "8" && e.tags.name === "Norderstedt");
  const segs = grenze.members.filter((m) => m.type === "way" && m.geometry).flatMap((m) => m.geometry.slice(1).map((p, i) => [m.geometry[i], p]));
  const lat0 = segs.reduce((s, [a]) => s + a.lat, 0) / segs.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  const xy = (p) => [p.lon * kx, p.lat * ky];
  const abstand = (p) => {
    const [px, py] = xy(p);
    let best = Infinity;
    for (const [a, b] of segs) {
      const [ax, ay] = xy(a), [bx, by] = xy(b);
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const u = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(px - ax - u * dx, py - ay - u * dy));
    }
    return best;
  };
  const innen = (p) => {
    let c = false;
    for (const [a, b] of segs) if (a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) c = !c;
    return c;
  };
  const punkte = (el) => (el.lat !== undefined ? [el] : (el.geometry ?? []).filter(Boolean));
  const stat = { randWege: 0, entfernt: 0 };
  const behalten = elements.filter((el) => {
    if (el.type === "relation") return true;
    const drinnen = punkte(el).some(innen);
    if (el.type === "way" && el.tags?.highway) {
      if (drinnen && !(NICHT_BENOETIGT.has(el.tags.highway) && !istBusWeg(el.tags, roads))) return true;
      if (!drinnen && istBusWeg(el.tags, roads) && punkte(el).some((p) => abstand(p) <= randM)) return (stat.randWege++, true);
      return (stat.entfernt++, false);
    }
    if (el.type === "node" && el.tags?.highway === "traffic_signals") return drinnen || abstand(el) <= randM;
    // alles andere (Gebäude, Grün, Haltestellen, Orte) nur innerhalb der Gemeinde
    if (drinnen) return true;
    stat.entfernt++;
    return false;
  });
  // Abbiegeregeln nur behalten, wenn ihre Wege im Auszug liegen
  const wegIds = new Set(behalten.filter((el) => el.type === "way").map((el) => el.id));
  const ergebnis = behalten.filter((el) => !(el.type === "relation" && el.tags?.type === "restriction" && !el.members.every((m) => m.type !== "way" || wegIds.has(m.ref))));
  stat.entfernt += behalten.length - ergebnis.length;
  return { elements: ergebnis, stat };
}
