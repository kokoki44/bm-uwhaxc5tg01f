import de from "./de.json";

export type TextKey = keyof typeof de;

const sprachen: Record<string, Record<string, string>> = { de };
let aktuell = "de";

export function setLanguage(code: string): void {
  if (!sprachen[code]) throw new Error(`Sprache nicht vorhanden: ${code}`);
  aktuell = code;
}

/** Liefert einen Text aus der Sprachdatei. Platzhalter in {geschweiften Klammern}. */
export function t(key: TextKey, werte: Record<string, string | number> = {}): string {
  const text = sprachen[aktuell][key];
  if (text === undefined) throw new Error(`Unbekannter Textschlüssel: ${String(key)}`);
  return text.replace(/\{(\w+)\}/g, (_, n: string) => String(werte[n] ?? `{${n}}`));
}
