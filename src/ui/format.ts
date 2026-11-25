const euroFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const euroGanz = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const zahlFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export const euro = (n: number): string => euroFmt.format(n);
export const euroRund = (n: number): string => euroGanz.format(n);
export const zahl = (n: number): string => zahlFmt.format(n);

/** Datum der Spielzeit als TT.MM.JJJJ (Spielzeit in UTC-Feldern, siehe calendar/civil). */
export const datum = (ms: number): string => {
  const d = new Date(ms);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(d.getUTCDate())}.${z(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
};
