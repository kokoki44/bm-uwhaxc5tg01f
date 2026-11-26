/**
 * Regelwerk für Lenk-, Arbeits- und Ruhezeiten als austauschbare Datei je Land (Konzept: Personal und Schichtplan).
 * Im Code stehen nur die Rechenarten; alle Grenzen, ob eine Regel hart ist oder nur warnt, und die Quelle stehen in der
 * Datei (`regelwerk/<land>.json`). Die Datei wird beim Start geprüft.
 */

interface Quelle {
  /** true: Ein Verstoß verhindert das Speichern. false: nur Warnung. */
  hart: boolean;
  quelle: string;
  url: string;
  /** Wortlaut oder Sinn der Regel in einer Zeile. */
  sinn: string;
}

export interface Teilung {
  minS: number[];
  /** true: Die Teile müssen in dieser Reihenfolge liegen (VO Art. 7: 15 min, danach 30 min). */
  geordnet: boolean;
}

export interface Regelwerk {
  land: string;
  name: string;
  stand: string;
  anwendung: { linieMaxM: number; haltestellenabstandMaxM: number; quelle: string; url: string; sinn: string };
  regeln: {
    lenkSechstel: Quelle & { nenner: number; minUnterbrechungS: number; maxAmStueckS: number; pauseDanachS: number };
    lenkBlockFPersV: Quelle & { maxLenkS: number; vollS: number; teilungen: Teilung[] };
    lenkBlockVO: Quelle & { maxLenkS: number; vollS: number; teilungen: Teilung[] };
    tageslenkzeit: Quelle & { maxS: number };
    arbeitszeit: Quelle & { maxS: number };
    ruhepause: Quelle & { stufen: { abS: number; pauseS: number }[]; minTeilS: number; maxOhnePauseS: number };
    pausenAbgeltung: Quelle & { nenner: number; minUnterbrechungS: number };
    nachtarbeit: Quelle & { vonH: number; bisH: number; mehrAlsS: number };
    tarifArbeitszeit: Quelle & { maxS: number };
    tarifLenkzeit: Quelle & { maxS: number };
    tarifDienstschicht: Quelle & { maxS: number; dringendMaxS: number };
    tarifTeilung: Quelle & { maxTeilungen: number; minTeilS: number };
  };
}

export type RegelId = keyof Regelwerk["regeln"];

export const REGEL_IDS: RegelId[] = [
  "lenkSechstel", "lenkBlockFPersV", "lenkBlockVO", "tageslenkzeit", "arbeitszeit", "ruhepause", "pausenAbgeltung",
  "nachtarbeit", "tarifArbeitszeit", "tarifLenkzeit", "tarifDienstschicht", "tarifTeilung",
];

/** Zahlenfelder je Regel (positiv, ganze Sekunden außer beim Nenner). */
const ZAHLEN: Record<RegelId, string[]> = {
  lenkSechstel: ["nenner", "minUnterbrechungS", "maxAmStueckS", "pauseDanachS"],
  lenkBlockFPersV: ["maxLenkS", "vollS"],
  lenkBlockVO: ["maxLenkS", "vollS"],
  tageslenkzeit: ["maxS"],
  arbeitszeit: ["maxS"],
  ruhepause: ["minTeilS", "maxOhnePauseS"],
  pausenAbgeltung: ["nenner", "minUnterbrechungS"],
  nachtarbeit: ["mehrAlsS"],
  tarifArbeitszeit: ["maxS"],
  tarifLenkzeit: ["maxS"],
  tarifDienstschicht: ["maxS", "dringendMaxS"],
  tarifTeilung: ["maxTeilungen", "minTeilS"],
};

export interface RegelwerkMeldung {
  code: "unlesbar" | "regelFehlt" | "feldFehlt" | "wertUngueltig";
  /** Regel oder Abschnitt, zum Beispiel "lenkSechstel" oder "anwendung". */
  ort: string;
  feld?: string;
}

const pos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Prüft eine Regelwerk-Datei. Bei einem Fehler ist `regelwerk` null und die Meldungen nennen Regel und Feld. */
export function ladeRegelwerk(raw: unknown): { regelwerk: Regelwerk | null; meldungen: RegelwerkMeldung[] } {
  const m: RegelwerkMeldung[] = [];
  const r = raw as Regelwerk;
  if (!r || typeof r !== "object" || !r.regeln || typeof r.regeln !== "object") return { regelwerk: null, meldungen: [{ code: "unlesbar", ort: "datei" }] };
  for (const f of ["land", "name", "stand"] as const) if (!text(r[f])) m.push({ code: "feldFehlt", ort: "datei", feld: f });
  const a = r.anwendung;
  if (!a) m.push({ code: "feldFehlt", ort: "anwendung" });
  else {
    for (const f of ["linieMaxM", "haltestellenabstandMaxM"] as const) if (!pos(a[f])) m.push({ code: "wertUngueltig", ort: "anwendung", feld: f });
    for (const f of ["quelle", "url", "sinn"] as const) if (!text(a[f])) m.push({ code: "feldFehlt", ort: "anwendung", feld: f });
  }
  for (const id of REGEL_IDS) {
    const g = r.regeln[id] as unknown as Record<string, unknown> | undefined;
    if (!g) {
      m.push({ code: "regelFehlt", ort: id });
      continue;
    }
    if (typeof g.hart !== "boolean") m.push({ code: "feldFehlt", ort: id, feld: "hart" });
    for (const f of ["quelle", "url", "sinn"]) if (!text(g[f])) m.push({ code: "feldFehlt", ort: id, feld: f });
    for (const f of ZAHLEN[id]) if (!pos(g[f])) m.push({ code: "wertUngueltig", ort: id, feld: f });
  }
  const g = r.regeln;
  for (const id of ["lenkBlockFPersV", "lenkBlockVO"] as const) {
    const t = g[id]?.teilungen;
    if (!Array.isArray(t) || t.some((x) => !Array.isArray(x?.minS) || !x.minS.length || !x.minS.every(pos) || typeof x.geordnet !== "boolean")) m.push({ code: "wertUngueltig", ort: id, feld: "teilungen" });
  }
  const st = g.ruhepause?.stufen;
  if (!Array.isArray(st) || !st.length || st.some((x, i) => !pos(x?.abS) || !pos(x?.pauseS) || (i > 0 && !(x.abS > st[i - 1].abS)))) m.push({ code: "wertUngueltig", ort: "ruhepause", feld: "stufen" });
  const n = g.nachtarbeit;
  if (n && !(Number.isInteger(n.vonH) && Number.isInteger(n.bisH) && n.vonH >= 0 && n.vonH < 24 && n.bisH >= 0 && n.bisH < 24)) m.push({ code: "wertUngueltig", ort: "nachtarbeit", feld: "vonH/bisH" });
  if (g.tarifDienstschicht && !(g.tarifDienstschicht.dringendMaxS >= g.tarifDienstschicht.maxS)) m.push({ code: "wertUngueltig", ort: "tarifDienstschicht", feld: "dringendMaxS" });
  return { regelwerk: m.length ? null : r, meldungen: m };
}
