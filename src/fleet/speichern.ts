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
  const zahlen = [a.id, a.baujahr, a.alterJahre, a.laufleistungKm, a.zustand, a.zustandVon, a.zustandBis, a.huRestMonate, a.neupreisKonfigEur, a.preisEur, a.erstellt, a.ablauf];
  if (!zahlen.every(zahl) || !text(a.modellId) || typeof a.inspiziert !== "boolean" || ![a.batterieZustand, a.batterieVon, a.batterieBis].every(zahlOderNull))
    throw new FuhrparkLadeFehler(`Angebot ungültig: ${JSON.stringify(a)}`);
  return { ...a, konfig: konfig(a.konfig, `Angebot ${a.id}`) };
}

export function ladeFuhrpark(json: string | unknown): Fuhrpark {
  const o = (typeof json === "string" ? JSON.parse(json) : json) as Fuhrpark;
  if (o?.version !== 1) throw new FuhrparkLadeFehler(`Unbekannte Version des Fuhrparks: ${String(o?.version)}`);
  if (!Array.isArray(o.busse) || !Array.isArray(o.angebote) || ![o.naechsteBusId, o.naechsteFlottennummer, o.naechsteAngebotId].every(zahl)) throw new FuhrparkLadeFehler("Fuhrpark unvollständig");
  const busse = o.busse.map(bus);
  const angebote = o.angebote.map(angebot);
  if (new Set(busse.map((b) => b.id)).size !== busse.length || busse.some((b) => b.id >= o.naechsteBusId)) throw new FuhrparkLadeFehler("Bus-Ids doppelt oder zu groß");
  if (new Set(angebote.map((a) => a.id)).size !== angebote.length || angebote.some((a) => a.id >= o.naechsteAngebotId)) throw new FuhrparkLadeFehler("Angebots-Ids doppelt oder zu groß");
  return { version: 1, busse, angebote, naechsteBusId: o.naechsteBusId, naechsteFlottennummer: o.naechsteFlottennummer, naechsteAngebotId: o.naechsteAngebotId };
}
