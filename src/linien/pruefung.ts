import type { Bus } from "../catalog/katalog";
import type { LinienConfig } from "../config";
import type { VariantenPlan } from "./plan";

/** Warnung beim Zuweisen eines Busses zu einer Linie. Es gibt kein Verbot (Konzept: Passt der Bus zur Linie?). */
export type PassWarnung =
  | { code: "lang"; laengeM: number; klassen: string[] }
  | { code: "wendekreis"; wendekreisM: number }
  | { code: "wendekreisFehlt" };

/**
 * Prüft Länge und Wendekreis gegen die Routen der Varianten (A3b-12). Lange Busse auf engen Straßenklassen und Busse mit
 * großem Wendekreis beim Wenden in einer Sackgasse bekommen eine Warnung. Der Wendekreis im Katalog ist der Durchmesser.
 * Fehlt er, meldet das Spiel das und prüft nur die Länge.
 */
export function passtZurLinie(m: Pick<Bus, "laenge_mm" | "wendekreis_mm">, varianten: readonly VariantenPlan[], cfg: LinienConfig): PassWarnung[] {
  const w: PassWarnung[] = [];
  const laengeM = (m.laenge_mm ?? 0) / 1000;
  const klassen = [...new Set(varianten.flatMap((v) => v.strecke.engeKlassen))].sort();
  if (laengeM > cfg.engLaengeM && klassen.length) w.push({ code: "lang", laengeM, klassen });
  if (m.wendekreis_mm === null || m.wendekreis_mm === undefined) w.push({ code: "wendekreisFehlt" });
  else if (m.wendekreis_mm / 1000 > cfg.wendekreisMaxM && varianten.some((v) => v.strecke.wendetInSackgasse)) w.push({ code: "wendekreis", wendekreisM: m.wendekreis_mm / 1000 });
  return w;
}
