import { config, PLAN_TAGE, type DiensteConfig, type PlanTag } from "../config";
import type { Grundtag } from "../linien/fahrplan";
import type { Auswertung, LinieDaten } from "./pruefung";
import type { Dienst, Dienstplan, Dienststueck, FahrtRef } from "./typen";

export type NummerFehler = "nummerLeer" | "nummerZuLang" | "nummerDoppelt";

/** Dienstnummer: nicht leer, höchstens `nummerMaxLaenge` Zeichen, je Tagesart eindeutig ohne Unterschied der Schreibweise. */
export function pruefeNummer(p: Dienstplan, nummer: string, tag: PlanTag, ausserId: number | null, cfg: DiensteConfig): NummerFehler | null {
  const n = nummer.trim();
  if (!n) return "nummerLeer";
  if (n.length > cfg.nummerMaxLaenge) return "nummerZuLang";
  if (p.dienste.some((d) => d.tag === tag && d.id !== ausserId && d.nummer.toLowerCase() === n.toLowerCase())) return "nummerDoppelt";
  return null;
}

/** Vorschlag für die nächste freie Dienstnummer einer Tagesart ("1", "2", ...). */
export function naechsteNummer(p: Dienstplan, tag: PlanTag): string {
  const belegt = new Set(p.dienste.filter((d) => d.tag === tag).map((d) => d.nummer.toLowerCase()));
  let n = 1;
  while (belegt.has(String(n))) n++;
  return String(n);
}

/** Neuer, noch nicht gespeicherter Dienst. Die Id wird erst beim Speichern vergeben. */
export function neuerEntwurf(p: Dienstplan, tag: PlanTag): Dienst {
  return { id: p.naechsteId, nummer: naechsteNummer(p, tag), tag, stuecke: [] };
}

/** Bearbeitungskopie eines gespeicherten Dienstes. */
export const entwurfVon = (d: Dienst): Dienst => structuredClone(d);

const gleich = (a: FahrtRef, b: FahrtRef) => a.variante === b.variante && a.schluessel === b.schluessel;

/**
 * Fahrten `von` bis `bis` eines Umlaufs zum Entwurf hinzufügen. Schließt das neue Stück direkt an ein vorhandenes Stück
 * im selben Umlauf an, werden beide zu einem Stück (kein Fahrerwechsel). Bereits enthaltene Fahrten werden nicht doppelt
 * aufgenommen. Liefert false bei ungültigem Bereich.
 */
export function fuegeStueckHinzu(d: Dienst, l: LinieDaten, umlaufNr: number, von: number, bis: number): boolean {
  const u = l.umlaeufe[umlaufNr];
  if (!u || von < 0 || bis < von || bis >= u.fahrten.length) return false;
  const lage = (f: FahrtRef) => u.fahrten.findIndex((x) => gleich(x, f));
  // Stücke im selben Umlauf als Bereiche, dazu der neue Bereich; überlappende oder anschließende Bereiche verschmelzen
  const eigene: [number, number][] = [];
  const rest: Dienststueck[] = [];
  for (const st of d.stuecke) {
    if (!st.fahrten.length) continue; // leere Stücke fallen weg
    const a = st.linie === l.linie ? lage(st.fahrten[0]) : -1;
    if (a >= 0 && st.fahrten.every((f, i) => u.fahrten[a + i] && gleich(u.fahrten[a + i], f))) eigene.push([a, a + st.fahrten.length - 1]);
    else rest.push(st);
  }
  eigene.push([von, bis]);
  eigene.sort((x, y) => x[0] - y[0]);
  const zusammen: [number, number][] = [];
  for (const b of eigene) {
    const z = zusammen[zusammen.length - 1];
    if (z && b[0] <= z[1] + 1) z[1] = Math.max(z[1], b[1]);
    else zusammen.push([...b]);
  }
  d.stuecke = [...rest, ...zusammen.map(([a, b]) => ({ linie: l.linie, fahrten: u.fahrten.slice(a, b + 1).map((f) => ({ ...f })) }))];
  return true;
}

export function entferneStueck(d: Dienst, index: number): boolean {
  if (index < 0 || index >= d.stuecke.length) return false;
  d.stuecke.splice(index, 1);
  return true;
}

/** Zusammenhängende Bereiche freier Fahrten in einem Umlauf (Index von, bis). */
export function freieBereiche(u: LinieDaten["umlaeufe"][number], frei: readonly FahrtRef[]): [number, number][] {
  const out: [number, number][] = [];
  u.fahrten.forEach((f, i) => {
    if (!frei.some((x) => gleich(x, f))) return;
    const z = out[out.length - 1];
    if (z && z[1] === i - 1) z[1] = i;
    else out.push([i, i]);
  });
  return out;
}

/**
 * "Umlauf bis zur Ablösung": der zusammenhängende Bereich freier Fahrten, der mit der Fahrt `bis` endet (Ablösung nach
 * dieser Fahrt). Null, wenn die Fahrt selbst nicht frei ist.
 */
export function bereichBisAbloesung(u: LinieDaten["umlaeufe"][number], frei: readonly FahrtRef[], bis: number): [number, number] | null {
  const b = freieBereiche(u, frei).find(([a, e]) => a <= bis && bis <= e);
  return b ? [b[0], bis] : null;
}

/**
 * "Rest des Umlaufs in neuen Dienst": der erste Bereich freier Fahrten nach dem zeitlich letzten Stück des Dienstes, im
 * Umlauf dieses Stücks. Null, wenn es keinen gibt.
 */
export function restDesUmlaufs(d: Dienst, linien: readonly LinieDaten[], frei: (l: LinieDaten) => readonly FahrtRef[]): { linie: LinieDaten; umlaufNr: number; von: number; bis: number } | null {
  let best: { linie: LinieDaten; umlaufNr: number; idx: number; an: number } | null = null;
  for (const st of d.stuecke) {
    const l = linien.find((x) => x.linie === st.linie);
    const f = st.fahrten[st.fahrten.length - 1];
    if (!l || !f) continue;
    const k = l.umlaeufe.findIndex((um) => um.fahrten.some((x) => gleich(x, f)));
    const an = l.fahrten.find((x) => gleich(x, f))?.ankunftS;
    if (k < 0 || an === undefined) continue;
    if (!best || an > best.an) best = { linie: l, umlaufNr: k, idx: l.umlaeufe[k].fahrten.findIndex((x) => gleich(x, f)), an };
  }
  if (!best) return null;
  const um = best.linie.umlaeufe[best.umlaufNr];
  const b = freieBereiche(um, frei(best.linie)).find(([a]) => a > best!.idx);
  return b ? { linie: best.linie, umlaufNr: best.umlaufNr, von: b[0], bis: b[1] } : null;
}

export type SpeicherFehler = NummerFehler | "regelverstoss" | "nichtGeprueft";

/**
 * Speichert einen Entwurf. Nur ein geprüfter Dienst ohne harten Verstoß lässt sich speichern (Kriterium 4); die
 * Auswertung muss zum Entwurf gehören (gleiche Id und gleicher Inhalt wie bei der Prüfung).
 */
export function speichereDienst(p: Dienstplan, entwurf: Dienst, a: Auswertung | null, geprueft: string | null, cfg: DiensteConfig): SpeicherFehler | null {
  const f = pruefeNummer(p, entwurf.nummer, entwurf.tag, entwurf.id, cfg);
  if (f) return f;
  if (!a || a.dienstId !== entwurf.id || geprueft !== JSON.stringify(entwurf.stuecke)) return "nichtGeprueft";
  if (!a.gueltig) return "regelverstoss";
  const d: Dienst = { ...structuredClone(entwurf), nummer: entwurf.nummer.trim() };
  const i = p.dienste.findIndex((x) => x.id === d.id);
  if (i >= 0) p.dienste[i] = d;
  else {
    p.dienste.push(d);
    p.naechsteId = Math.max(p.naechsteId, d.id + 1);
  }
  return null;
}

export function loescheDienst(p: Dienstplan, id: number): boolean {
  const i = p.dienste.findIndex((d) => d.id === id);
  if (i < 0) return false;
  p.dienste.splice(i, 1);
  return true;
}

/**
 * Eigene Dienste an Ferientagen ein- oder ausschalten (F7, wie der Ferientakt in 3b): Beim Einschalten werden die Dienste
 * des Tages ohne Ferien als Ausgangspunkt kopiert, beim Ausschalten werden die Ferien-Dienste gelöscht.
 */
export function setzeEigeneFerienDienste(p: Dienstplan, grund: Grundtag, an: boolean): void {
  const ferien = `${grund}Ferien` as PlanTag;
  if (p.eigeneFerienDienste[grund] === an) return;
  p.eigeneFerienDienste[grund] = an;
  p.dienste = p.dienste.filter((d) => d.tag !== ferien);
  if (an) for (const d of p.dienste.filter((x) => x.tag === grund)) p.dienste.push({ ...structuredClone(d), id: p.naechsteId++, tag: ferien });
}

/* ---------- Laden ---------- */

export class DienstLadeFehler extends Error {}

const ganz = (v: unknown): v is number => Number.isInteger(v);

/** Lädt und prüft den Dienstplan aus dem Spielstand. Wirft DienstLadeFehler. */
export function ladeDienstplan(o: unknown): Dienstplan {
  const p = o as Dienstplan;
  const fehler = (was: string): never => {
    throw new DienstLadeFehler(`Dienstplan ungültig: ${was}`);
  };
  if (p?.version !== 1) fehler(`Version ${String(p?.version)}`);
  if (!Array.isArray(p.dienste) || !ganz(p.naechsteId) || !p.eigeneFerienDienste) fehler("unvollständig");
  const e = p.eigeneFerienDienste;
  if (![e.werktag, e.samstag, e.sonnFeiertag].every((x) => typeof x === "boolean")) fehler("Ferien");
  const dienste = p.dienste.map((d) => {
    if (!d || !ganz(d.id) || d.id >= p.naechsteId || typeof d.nummer !== "string" || !d.nummer.trim() || d.nummer.trim().length > config.dienste.nummerMaxLaenge || !PLAN_TAGE.includes(d.tag) || !Array.isArray(d.stuecke)) fehler(`Dienst ${JSON.stringify(d)?.slice(0, 120)}`);
    const stuecke = d.stuecke.map((s) => {
      if (!s || !ganz(s.linie) || !Array.isArray(s.fahrten) || !s.fahrten.length || s.fahrten.some((f) => !f || !ganz(f.variante) || typeof f.schluessel !== "string" || !/^[tz]\d+$/.test(f.schluessel))) fehler(`Dienststück in Dienst ${d.nummer}`);
      return { linie: s.linie, fahrten: s.fahrten.map((f) => ({ variante: f.variante, schluessel: f.schluessel })) };
    });
    return { id: d.id, nummer: d.nummer, tag: d.tag, stuecke };
  });
  if (new Set(dienste.map((d) => d.id)).size !== dienste.length) fehler("Ids doppelt");
  if (new Set(dienste.map((d) => `${d.tag}|${d.nummer.toLowerCase()}`)).size !== dienste.length) fehler("Dienstnummer doppelt");
  return { version: 1, dienste, eigeneFerienDienste: { werktag: e.werktag, samstag: e.samstag, sonnFeiertag: e.sonnFeiertag }, naechsteId: p.naechsteId };
}
