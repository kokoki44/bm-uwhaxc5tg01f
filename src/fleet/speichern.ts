import type { Angebot, EigenerBus, Fuhrpark, Konfiguration } from "./fuhrpark";

/** Speichern und Laden des Fuhrparks (Kriterium 15). Das Format trägt eine Version, damit alte Stände ladbar bleiben. */
export class FuhrparkLadeFehler extends Error {}

export const serialisiereFuhrpark = (f: Fuhrpark): string => JSON.stringify(f);

const zahl = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const zahlOderNull = (v: unknown) => v === null || zahl(v);
const text = (v: unknown): v is string => typeof v === "string";

function konfig(c: Konfiguration | undefined, wo: string): Konfiguration {
  if (!c || !zahlOderNull(c.batterieKwh) || !text(c.lackierung) || !Array.isArray(c.optionen) || !c.optionen.every(text)) throw new FuhrparkLadeFehler(`Konfiguration ungültig: ${wo}`);
  return { batterieKwh: c.batterieKwh, lackierung: c.lackierung, optionen: [...c.optionen] };
}

function bus(b: EigenerBus): EigenerBus {
  const zahlen = [b.id, b.baujahr, b.alterBeiKaufJahre, b.kaufzeit, b.kaufpreisEur, b.neupreisKonfigEur, b.laufleistungKm, b.zustand, b.huBis];
  if (!zahlen.every(zahl) || ![b.modellId, b.flottennummer, b.kennzeichen].every(text) || (b.herkunft !== "neu" && b.herkunft !== "gebraucht"))
    throw new FuhrparkLadeFehler(`Bus ungültig: ${JSON.stringify(b)}`);
  if (!b.platz || (b.platz.art !== "stellplatz" && b.platz.art !== "halle") || !zahl(b.platz.id) || ![b.batterieZustand, b.sitzplaetze, b.stehplaetze].every(zahlOderNull))
    throw new FuhrparkLadeFehler(`Bus ungültig: ${JSON.stringify(b)}`);
  return {
    id: b.id, modellId: b.modellId, flottennummer: b.flottennummer, kennzeichen: b.kennzeichen, herkunft: b.herkunft, baujahr: b.baujahr,
    alterBeiKaufJahre: b.alterBeiKaufJahre, kaufzeit: b.kaufzeit, kaufpreisEur: b.kaufpreisEur, neupreisKonfigEur: b.neupreisKonfigEur,
    laufleistungKm: b.laufleistungKm, zustand: b.zustand, batterieZustand: b.batterieZustand, huBis: b.huBis, konfig: konfig(b.konfig, `Bus ${b.id}`),
    sitzplaetze: b.sitzplaetze, stehplaetze: b.stehplaetze, platz: { art: b.platz.art, id: b.platz.id },
  };
}

function angebot(a: Angebot): Angebot {
  if (!a || typeof a !== "object") throw new FuhrparkLadeFehler(`Angebot ungültig: ${JSON.stringify(a)}`);
  const zahlen = [a.id, a.baujahr, a.alterJahre, a.laufleistungKm, a.zustand, a.zustandVon, a.zustandBis, a.huRestMonate, a.neupreisKonfigEur, a.preisEur, a.erstellt, a.ablauf];
  if (!zahlen.every(zahl) || !text(a.modellId) || typeof a.inspiziert !== "boolean" || ![a.batterieZustand, a.batterieVon, a.batterieBis].every(zahlOderNull))
    throw new FuhrparkLadeFehler(`Angebot ungültig: ${JSON.stringify(a)}`);
  return {
    id: a.id, modellId: a.modellId, baujahr: a.baujahr, alterJahre: a.alterJahre, laufleistungKm: a.laufleistungKm, zustand: a.zustand,
    zustandVon: a.zustandVon, zustandBis: a.zustandBis, batterieZustand: a.batterieZustand, batterieVon: a.batterieVon, batterieBis: a.batterieBis,
    huRestMonate: a.huRestMonate, konfig: konfig(a.konfig, `Angebot ${a.id}`), neupreisKonfigEur: a.neupreisKonfigEur, preisEur: a.preisEur,
    erstellt: a.erstellt, ablauf: a.ablauf, inspiziert: a.inspiziert,
  };
}

/**
 * Lädt einen Fuhrpark und prüft ihn. Mit `modellIds` wird außerdem geprüft, dass jedes Modell im Katalog vorkommt.
 * Wirft bei jedem Fehler FuhrparkLadeFehler (auch bei kaputtem JSON).
 */
export function ladeFuhrpark(json: string | unknown, modellIds?: ReadonlySet<string>): Fuhrpark {
  let o: Fuhrpark;
  try {
    o = (typeof json === "string" ? JSON.parse(json) : json) as Fuhrpark;
  } catch (e) {
    throw new FuhrparkLadeFehler(`Fuhrpark nicht lesbar: ${String(e)}`);
  }
  if (o?.version !== 1) throw new FuhrparkLadeFehler(`Unbekannte Version des Fuhrparks: ${String(o?.version)}`);
  if (!Array.isArray(o.busse) || !Array.isArray(o.angebote) || ![o.naechsteBusId, o.naechsteFlottennummer, o.naechsteAngebotId].every(zahl)) throw new FuhrparkLadeFehler("Fuhrpark unvollständig");
  const busse = o.busse.map((b) => {
    if (!b || typeof b !== "object") throw new FuhrparkLadeFehler(`Bus ungültig: ${JSON.stringify(b)}`);
    return bus(b);
  });
  const angebote = o.angebote.map(angebot);
  if (new Set(busse.map((b) => b.id)).size !== busse.length || busse.some((b) => b.id >= o.naechsteBusId)) throw new FuhrparkLadeFehler("Bus-Ids doppelt oder zu groß");
  if (new Set(angebote.map((a) => a.id)).size !== angebote.length || angebote.some((a) => a.id >= o.naechsteAngebotId)) throw new FuhrparkLadeFehler("Angebots-Ids doppelt oder zu groß");
  if (new Set(busse.map((b) => b.kennzeichen)).size !== busse.length) throw new FuhrparkLadeFehler("Kennzeichen doppelt");
  if (new Set(busse.map((b) => b.flottennummer)).size !== busse.length) throw new FuhrparkLadeFehler("Flottennummer doppelt");
  const stellplaetze = busse.filter((b) => b.platz.art === "stellplatz").map((b) => b.platz.id);
  if (new Set(stellplaetze).size !== stellplaetze.length) throw new FuhrparkLadeFehler("Zwei Busse auf demselben Stellplatz");
  if (modellIds) for (const x of [...busse, ...angebote]) if (!modellIds.has(x.modellId)) throw new FuhrparkLadeFehler(`Modell nicht im Katalog: ${x.modellId}`);
  return { version: 1, busse, angebote, naechsteBusId: o.naechsteBusId, naechsteFlottennummer: o.naechsteFlottennummer, naechsteAngebotId: o.naechsteAngebotId };
}
