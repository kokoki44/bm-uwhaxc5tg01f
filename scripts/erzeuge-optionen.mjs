// Erzeugt die Optionsdatei optionen.xlsx (Ausstattung beim Neukauf) einmalig.
// Die Datei wird danach von Hand in Excel gepflegt. Das Skript bricht ab, wenn sie schon existiert.
import { existsSync } from "node:fs";
import ExcelJS from "exceljs";

const DATEI = "optionen.xlsx";
if (existsSync(DATEI)) {
  console.error(`${DATEI} existiert bereits und wird nicht überschrieben.`);
  process.exit(1);
}

const SPALTEN = [
  ["option_id", "Eindeutige Kennung der Option", "Kleinbuchstaben, Ziffern, Unterstrich", "ja", 24],
  ["gruppe", "Optionen derselben Gruppe schließen sich aus, genau eine ist gewählt. Leer: einzelne Option zum An- und Abwählen", "Text", "nein", 16],
  ["name", "Anzeigename im Spiel", "Text", "ja", 40],
  ["aufpreis_eur", "Aufpreis beim Neukauf", "Euro, Zahl ab 0", "ja", 14],
  ["nur_antrieb", "Option nur für diesen Antrieb. Leer: alle Antriebe. Alle Zeilen einer Gruppe haben denselben Wert", "Diesel, Elektro, Hybrid, Erdgas oder Wasserstoff", "nein", 14],
  ["standard", "In einer Gruppe die voreingestellte Wahl, genau eine je Gruppe mit ja", "ja oder nein", "ja", 10],
  ["serie_neukauf", "Beim Neukauf immer enthalten, ohne Aufpreis, nicht abwählbar", "ja oder nein", "ja", 14],
  ["freischaltung", "frei oder Name der Technologie, die die Option im Neukauf freischaltet", "Text", "ja", 34],
  ["gebraucht_anteil", "Anteil der Gebrauchtbusse mit dieser Option, bei Gruppen Gewicht der Auswahl", "Zahl 0 bis 1", "ja", 16],
  ["wirkung_zufriedenheit", "Wirkung auf die Fahrgastzufriedenheit (ab späteren Etappen)", "Punkte, positiv = mehr", "nein", 20],
  ["wirkung_verbrauch_prozent", "Wirkung auf den Verbrauch (ab späteren Etappen)", "Prozent, positiv = mehr", "nein", 24],
  ["wirkung_teilebedarf_prozent", "Wirkung auf den Teilebedarf (ab späteren Etappen)", "Prozent, positiv = mehr", "nein", 26],
  ["wirkung_wartung_prozent", "Wirkung auf die Wartungskosten (ab späteren Etappen)", "Prozent, positiv = mehr", "nein", 22],
  ["quelle", "Herkunft der Werte", "Text", "nein", 30],
  ["bemerkung", "Freie Bemerkung", "Text", "nein", 34],
];

const Q = "Annahme A3-15 (Koko bestätigt)";
const B = "Schätzung, in Etappe 6 prüfen";
// id, gruppe, name, aufpreis, nur_antrieb, standard, serie, freischaltung, gebraucht, zufr, verbr, teile, wartung
const ZEILEN = [
  ["kunststoff", "bestuhlung", "Kunststoffschalen", 0, null, "ja", "nein", "frei", 0.4, 0, 0, 0, 0],
  ["kunststoff_polster", "bestuhlung", "Kunststoffschalen mit Stoffpolster", 3000, null, "nein", "nein", "frei", 0.3, 1, 0, 0, 1],
  ["stoff", "bestuhlung", "Stoffsitze", 6000, null, "nein", "nein", "frei", 0.25, 2, 0, 0, 2],
  ["premium", "bestuhlung", "Premium-Sitze", 12000, null, "nein", "nein", "Premium-Sitze", 0.05, 4, 0, 0, 3],
  ["konventionell", "spiegel", "Konventionelle Spiegel", 0, null, "ja", "nein", "frei", 0.9, 0, 0, 0, 0],
  ["kamera", "spiegel", "Kamerasystem", 8000, null, "nein", "nein", "Kamerasystem", 0.1, 0, -1, 1, 1],
  ["heizung_elektrisch", "heizung", "Elektrische Heizung", 0, "Elektro", "ja", "nein", "frei", 0.7, 0, 0, 0, 0],
  ["waermepumpe", "heizung", "Wärmepumpe", 20000, "Elektro", "nein", "nein", "frei", 0.3, 0, -8, 1, 1],
  ["fgi_keine", "fahrgastinfo", "Keine Innenanzeige", 0, null, "ja", "nein", "frei", 0.3, 0, 0, 0, 0],
  ["fgi_fallblatt", "fahrgastinfo", "Fahrgastinformation Fallblattanzeiger", 15000, null, "nein", "nein", "frei", 0.25, 1, 0, 1, 1],
  ["fgi_punktmatrix", "fahrgastinfo", "Fahrgastinformation Punktmatrix", 20000, null, "nein", "nein", "Fahrgastinformation Punktmatrix", 0.25, 2, 0, 1, 1],
  ["fgi_lcd", "fahrgastinfo", "Fahrgastinformation LCD-Monitore", 25000, null, "nein", "nein", "Fahrgastinformation LCD", 0.15, 3, 0, 1, 1],
  ["fgi_led", "fahrgastinfo", "Fahrgastinformation LED-Monitore", 28000, null, "nein", "nein", "Fahrgastinformation LED", 0.05, 3, 0, 1, 1],
  ["rampe_keine", "rampe", "Keine Rampe", 0, null, "ja", "nein", "frei", 0.2, 0, 0, 0, 0],
  ["rampe_manuell", "rampe", "Rampe manuell", 1500, null, "nein", "nein", "frei", 0.6, 1, 0, 0, 0],
  ["rampe_elektrisch", "rampe", "Rampe elektrisch", 6000, null, "nein", "nein", "frei", 0.2, 2, 0, 1, 1],
  ["klimaanlage", null, "Klimaanlage Fahrgastraum", 25000, null, "nein", "nein", "Klimaanlage", 0.4, 4, 5, 2, 3],
  ["ansagen_automatisch", null, "Automatische Ansagen", 5000, null, "nein", "nein", "Automatische Ansagen", 0.4, 1, 0, 0, 0],
  ["fahrgastzaehlung", null, "Fahrgastzählsystem", 8000, null, "nein", "nein", "frei", 0.3, 0, 0, 0, 1],
  ["video", null, "Videoüberwachung", 6000, null, "nein", "nein", "frei", 0.5, 1, 0, 0, 1],
  ["wlan", null, "WLAN", 3000, null, "nein", "nein", "WLAN", 0.2, 1, 0, 0, 0],
  ["usb", null, "USB-Steckdosen", 2000, null, "nein", "nein", "USB-Ladeanschlüsse", 0.2, 1, 0, 0, 0],
  ["abbiegeassistent", null, "Abbiegeassistent", 3000, null, "nein", "ja", "frei", 0.5, 0, 0, 0, 1],
  ["notbremsassistent", null, "Notbremsassistent", 4000, null, "nein", "ja", "frei", 0.5, 0, 0, 0, 1],
  ["fahrscheindrucker", null, "Fahrscheindrucker", 4000, null, "nein", "nein", "frei", 0.6, 0, 0, 0, 1],
  ["entwerter", null, "Entwerter", 1500, null, "nein", "nein", "frei", 0.3, 0, 0, 0, 0],
];

const wb = new ExcelJS.Workbook();
const opt = wb.addWorksheet("Optionen", { views: [{ state: "frozen", ySplit: 1 }] });
opt.columns = SPALTEN.map(([name, , , , breite]) => ({ header: name, key: name, width: breite }));
for (const z of ZEILEN) opt.addRow([...z, Q, B]);
opt.getRow(1).font = { bold: true };

const sp = wb.addWorksheet("Spalten", { views: [{ state: "frozen", ySplit: 1 }] });
sp.columns = [
  { header: "Spalte", width: 28 },
  { header: "Bedeutung", width: 90 },
  { header: "Einheit oder erlaubte Werte", width: 46 },
  { header: "Pflicht", width: 10 },
];
for (const [name, bedeutung, einheit, pflicht] of SPALTEN) sp.addRow([name, bedeutung, einheit, pflicht]);
sp.getRow(1).font = { bold: true };

await wb.xlsx.writeFile(DATEI);
console.log(`${DATEI} erzeugt: ${ZEILEN.length} Optionen.`);
