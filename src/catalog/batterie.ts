/**
 * Batteriegrößen aus dem Katalog. Eigenes kleines Modul ohne Excel-Leser, damit Fahrzeugmarkt und Oberfläche es
 * nutzen können, ohne ExcelJS in das Hauptpaket der Web-Version zu ziehen.
 */

/** Kleine technische Toleranz für Gleitkommavergleiche bei Batterieschritten (keine Spielregel). */
const GLEITKOMMA_EPS = 1e-9;

interface BatterieAngaben {
  batterie_kwh_min: number | null;
  batterie_kwh_max: number | null;
  batterie_kwh_schritt: number | null;
}

/**
 * Wählbare Batteriegrößen in kWh: von batterie_kwh_min bis batterie_kwh_max in Schritten von batterie_kwh_schritt.
 * Der Bereich endet beim letzten vollen Schritt.
 * Bereich ohne Schritt: Schritte des Standardschritts aus der Konfiguration ab dem Minimum; das Maximum aus dem
 * Datenblatt ist immer wählbar, auch wenn es kein volles Vielfaches ist (Annahme A2-30).
 */
export function batterieOptionen(bus: BatterieAngaben, standardSchrittKwh: number): number[] {
  const min = bus.batterie_kwh_min ?? bus.batterie_kwh_max;
  const max = bus.batterie_kwh_max ?? bus.batterie_kwh_min;
  if (min === null || max === null || min > max) return [];
  const eps = GLEITKOMMA_EPS * Math.max(1, Math.abs(max));
  if (max - min <= eps) return [max];
  const eigenerSchritt = bus.batterie_kwh_schritt !== null && bus.batterie_kwh_schritt > 0;
  const schritt = eigenerSchritt ? bus.batterie_kwh_schritt! : standardSchrittKwh;
  const out: number[] = [];
  for (let i = 0; ; i++) {
    const v = min + i * schritt;
    if (v > max + eps) break;
    out.push(Number(v.toFixed(9)));
  }
  if (!eigenerSchritt && Math.abs(out[out.length - 1] - max) > eps) out.push(max);
  return out;
}

/** Ist ein Batteriebereich (min kleiner als max) angegeben? */
export function hatBatterieBereich(min: number | null, max: number | null): boolean {
  return min !== null && max !== null && max - min > GLEITKOMMA_EPS * Math.max(1, Math.abs(max));
}
