import { config, type PlanTag } from "../config";
import { aktuellesRegelwerk } from "../dienste/laden";
import { linienDaten, wirksameDienste, type Auswertung, type Befund, type DienstAnfrage, type LinieDaten, type TagesAuswertung } from "../dienste/pruefung";
import type { RegelId } from "../dienste/regelwerk";
import type { Dienst } from "../dienste/typen";
import { t, type TextKey } from "../i18n";
import { linienUi } from "./linienbereich";
import { aktualisiereFenster } from "./spielui";

/**
 * Gemeinsamer Stand des Dienstplans in der Oberfläche: Die Prüfung läuft im Simulations-Worker (Kriterium 13). Hier liegen
 * nur die letzten Ergebnisse je Tagesart; ändern sich Fahrten oder Dienste, wird neu geprüft.
 */
export const regelwerk = aktuellesRegelwerk();

const C = config.dienste;

/** Daten aller Linien mit Fahrten an einer Tagesart (aktive Linien, berechnete Pläne). */
export function linienFuer(tag: PlanTag): LinieDaten[] {
  const u = linienUi();
  return u.spiel.netz.linien
    .filter((l) => l.aktiv && u.plaene.has(l.id))
    .map((l) => linienDaten(u.plaene.get(l.id)!, l.nummer, l.busse.length, tag))
    .filter((d) => d.fahrten.length);
}

export function anfrage(tag: PlanTag, entwurf: Dienst | null): DienstAnfrage {
  return { tag, linien: linienFuer(tag), dienste: wirksameDienste(linienUi().spiel.dienste, tag), entwurf };
}

const stand = new Map<PlanTag, { schluessel: string; auswertung: TagesAuswertung | null; fehler: string | null }>();

/**
 * Letzte Auswertung einer Tagesart. Hat sich seit der letzten Prüfung etwas geändert, wird im Worker neu geprüft und die
 * offenen Fenster danach neu gezeichnet. Liefert solange das alte Ergebnis (oder null).
 */
export function tagesAuswertung(tag: PlanTag): TagesAuswertung | null {
  if (!regelwerk.regelwerk) return null;
  const a = anfrage(tag, null);
  const schluessel = JSON.stringify(a);
  const s = stand.get(tag);
  if (s?.schluessel !== schluessel) {
    stand.set(tag, { schluessel, auswertung: s?.auswertung ?? null, fehler: null });
    linienUi()
      .sim.pruefeDienste(a)
      .then((r) => {
        if (stand.get(tag)?.schluessel !== schluessel) return;
        stand.set(tag, { schluessel, auswertung: r, fehler: null });
        aktualisiereFenster();
      })
      .catch((e: unknown) => {
        if (stand.get(tag)?.schluessel !== schluessel) return;
        stand.set(tag, { schluessel, auswertung: null, fehler: String(e instanceof Error ? e.message : e) });
        aktualisiereFenster();
      });
  }
  return stand.get(tag)!.auswertung;
}

/** Fehler der letzten Prüfung (Worker hat abgelehnt), sonst null. */
export const pruefFehler = (tag: PlanTag): string | null => stand.get(tag)?.fehler ?? null;

/** Prüft einen Entwurf im Worker gegen die gespeicherten Dienste seiner Tagesart. */
export async function pruefeEntwurf(entwurf: Dienst): Promise<Auswertung> {
  const r = await linienUi().sim.pruefeDienste(anfrage(entwurf.tag, entwurf));
  return r.entwurf!;
}

/* ---------- Texte ---------- */

/** Dauer in Stunden: "4:30 h" oder "2:07:10 h". */
export function stunden(s: number): string {
  const neg = s < 0 ? "-" : "";
  const a = Math.abs(s);
  const h = Math.floor(a / 3600), m = String(Math.floor((a % 3600) / 60)).padStart(2, "0"), sek = a % 60;
  return neg + (sek ? t("zeit.stdSek", { h, m, s: String(sek).padStart(2, "0") }) : t("zeit.std", { h, m }));
}

/** Lesbarer Text eines Befunds: Regel, Wert, Grenze und Quelle aus dem Regelwerk. */
export function befundText(b: Befund): string {
  const rw = regelwerk.regelwerk;
  const werte: Record<string, string | number> = { ...(b.daten ?? {}) };
  if (b.wertS !== undefined) werte.wert = b.code === "anzahl" ? b.wertS : stunden(b.wertS);
  if (b.grenzeS !== undefined) werte.grenze = b.code === "anzahl" ? b.grenzeS : stunden(b.grenzeS);
  if (rw) {
    werte.nenner = rw.regeln.lenkSechstel.nenner;
    werte.teil = stunden(rw.regeln.ruhepause.minTeilS);
    werte.min = stunden(rw.regeln.lenkSechstel.minUnterbrechungS);
  }
  const text = t(`dienst.befund.${b.regel}.${b.code}` as TextKey, werte);
  if (b.regel === "ablauf" || !rw) return text;
  return t("dienst.befund.quelle", { text, quelle: rw.regeln[b.regel as RegelId].quelle });
}

/** Unterbrechungsregel als Text mit Quelle. */
export function regimeText(r: Auswertung["regime"]): string {
  const rw = regelwerk.regelwerk;
  const id: RegelId = r === "sechstel" ? "lenkSechstel" : r === "blockVO" ? "lenkBlockVO" : "lenkBlockFPersV";
  return rw ? t(`dienst.regime.${r}` as TextKey, { quelle: rw.regeln[id].quelle }) : "";
}

export const artText = (a: Auswertung["art"]) => (a ? t(`dienst.art.${a}` as TextKey) : "");

/** Gibt es Fehler in der Regelwerk-Datei, zeigt ein Fenster sie beim Start (wie bei der Optionsdatei). */
export function regelwerkFehlerTexte(): string[] {
  return regelwerk.meldungen.map((m) => t(`regelwerk.meldung.${m.code}` as TextKey, { datei: regelwerk.datei, ort: m.ort, feld: m.feld ?? "" }));
}

export const diensteConfig = C;
