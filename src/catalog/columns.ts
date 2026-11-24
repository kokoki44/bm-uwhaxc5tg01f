/** Die 63 festen Spaltennamen im Blatt "Busse" des Fahrzeugkatalogs, in Reihenfolge. Nicht ändern. */
export const CATALOG_COLUMNS = [
  "modell_id","hersteller","modellfamilie","modell","variante","fahrzeugart","bauart","antrieb",
  "laenge_mm","breite_mm","hoehe_mm","radstand_mm","radstand_2_mm","ueberhang_vorn_mm","ueberhang_hinten_mm",
  "wendekreis_mm","leergewicht_kg","gesamtgewicht_kg","flurtyp","tueren","tuerbreite_mm","einstiegshoehe_mm",
  "sitzplaetze","stehplaetze","gesamtplaetze","rollstuhlplaetze","kinderwagenplaetze","dauerleistung_kw",
  "spitzenleistung_kw","hoechstgeschwindigkeit_kmh","abgasnorm","verbrauch_pro_100km","verbrauchseinheit",
  "tankinhalt","batterie_chemie","batterie_einbauort","batterie_kwh_min","batterie_kwh_max","batterie_kwh_schritt",
  "batterie_nutzbar_prozent","batterie_lebensdauer_jahre","plaetze_je_batterieeinheit_weniger","reichweite_km",
  "verbrauch_datenblatt_kwh_100km","ladeleistung_kw","ladeanschluss","ladeanschluss_optional","neupreis_eur",
  "wartungskosten_eur_pro_km","intervall_klein_km","intervall_gross_km","intervall_hu_monate","lebensdauer_jahre",
  "zuverlaessigkeit","teilebedarf_faktor","fiktiv","baujahr_von","baujahr_bis","im_neukauf","region",
  "farbe_standard_hex","quelle","bemerkung",
] as const;
