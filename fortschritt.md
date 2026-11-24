# Fortschritt

## Etappe 0: Projektgerüst und Testinfrastruktur (freigegeben von Koko)

Fertig:
- Projektgerüst: Vite, TypeScript, MapLibre GL, Tauri 2 für die Desktop-App.
- Simulation als Web Worker mit festem Takt (`src/sim`), Pause und Zeitraffer-Stufen.
- Speicherschnittstelle mit SQLite (Desktop) und IndexedDB (Browser), Versionsprüfung (`src/storage`).
- Zentrale Konfiguration (`src/config/config.json`) und Sprachdatei Deutsch (`src/i18n/de.json`).
- Testdatensatz Norderstedt mit Quellenangabe nach ODbL (`public/data/norderstedt`).
- Fahrzeugkatalog wird gelesen, 63 Spaltennamen werden geprüft, Hash-Test (Datei nur gelesen).
- Tests mit `npm test`: Einzeltests, Rauchtest-Grundgerüst, Oberflächentest der Web-Version.
- GitHub-Workflow (`.github/workflows/ci.yml`): Bau und Test auf Windows und macOS, Web-Version auf GitHub Pages, Test der Pages-Adresse. Bau und Veröffentlichung in getrennten Jobs.
- README mit Einrichtung für Windows und macOS, `npm test` meldet fehlenden Browser verständlich.

## Etappe 1: Karte, Welt und Zeit (freigegeben von Koko, Nachträge vom 25.11.2026 eingearbeitet)

Bestätigte Abnahmekriterien (Koko, 24.11.2026; Kriterien 4 und 8 am 25.11.2026 angepasst):

1. Norderstedt lädt offline: Der Test sperrt das Netz und lädt nur den Datensatz im Projekt. Kein Test fragt Overpass live ab.
2. Das Straßennetz entsteht aus dem Auszug mit Geschwindigkeit je Abschnitt (maxspeed, sonst Standardwert je Straßenklasse aus der Konfiguration), Einbahnstraßen (auch Kreisverkehre) und Abbiegeregeln. Nur Straßen, die ein Bus befahren darf, gehören zum Busnetz. Ampeln werden eingelesen und im Straßennetz gespeichert, mit pauschalem Zeitzuschlag aus der Konfiguration.
3. Routing zwischen zwei Haltestellen liefert eine Route auf dem Straßennetz. Die Route ist zusammenhängend, nicht kürzer als die Luftlinie, respektiert Einbahnstraßen und Abbiegeverbote (geprüft an einem kleinen Testnetz mit bekanntem Ergebnis und an echten Haltestellenpaaren in Norderstedt), und die Fahrzeit ergibt sich aus Länge und Geschwindigkeit.
4. Haltestellen aus OSM sind eingelesen, jede ist einem Straßenabschnitt zugeordnet, die Anzahl liegt in einem plausiblen Bereich. Dank eines Randes von 2 km mit Busstraßen liegen alle Haltestellen im zusammenhängenden Netz (Ausnahmen nur mit Begründung in annahmen.md).
5. Das Nachfragegitter ist nicht leer. Zellen tragen geschätzte Einwohner und Arbeitsplätze aus Gebäudeflächen und Landnutzung sowie Orte von Interesse. Einwohner und Arbeitsplätze liegen in den Zielkorridoren aus annahmen.md. Die Berechnung ist deterministisch.
6. Die Gemeindegrenze aus OSM wird erkannt. Der Schwellenwert für die Teilung in Subdivisionen steht in der Konfiguration: Norderstedt wird nicht geteilt, mit künstlich niedrigem Schwellenwert im Test schon.
7. Der Kalender kennt Uhrzeit, Wochentag, Feiertage, Schulferien und Jahreszeit. Feiertage werden per Regel für alle 16 Bundesländer berechnet und für mehrere Bundesländer und Jahre an bekannten Tagen geprüft. Schulferien aus amtlichen Tabellen für Schleswig-Holstein und Hamburg.
8. Die Zeit läuft in festen Schritten und steht bei Pause still. Pause, 1-, 10-, 60-, 240- und 600-fach sind über Bedienelemente und Tasten (Leertaste, 1 bis 5) wählbar. Ein Spieltag dauert bei 60-fach 24 Minuten, bei 240-fach 6 Minuten und bei 600-fach 2,4 Minuten. Der Worker schafft 600-fach ohne Stocken (Messung im Browsertest).
9. Der Einrichtungsdialog nimmt Startgemeinde, Startkapital, Firmenname und Firmenfarbe entgegen und prüft sie. Danach lädt das Spiel die Welt mit Fortschrittsanzeige, ohne dass die Oberfläche einfriert. Alle Texte stehen in der Sprachdatei.
10. Die Karte zeigt Straßen nach Bedeutung, Gebäude, Grün, Wasser und Haltestellen. Verschieben und Zoomen funktionieren. Ein Oberflächentest mit Screenshot prüft das auf Windows und macOS.
11. Alles ist mit der Tastatur bedienbar, Informationen stehen nicht nur in Farbe.
12. Der Rauchtest hat den Schritt "Gemeinde wählen" als echten Schritt. Alle bisherigen Tests bleiben grün, der Workflow ist auf Windows, macOS und für die Pages-Adresse grün.

Fertig:
- Datensatz Norderstedt neu geladen (Abbiegeverbote, Ampeln, Knotenlisten, Wasser, Grün), Skript `npm run daten:norderstedt`, Prüfsumme und Quellenangabe.
- Welt (`src/world`): Verwaltungsgrenzen und Bundesland, Straßennetz mit Einbahnstraßen, Abbiegeregeln, Ampeln und Kreuzungen, Routing, Haltestellen mit Zuordnung zum Netz, Nachfragegitter, Gebiete mit Schwellenwert für Subdivisionen, Datenstruktur für Konzessionen und Aufträge.
- Kalender (`src/calendar`): Feiertage per Regel für alle 16 Länder, Schulferien SH und HH aus amtlichen Tabellen (`src/config/schulferien.json`), Tagesart, Jahreszeit.
- Oberfläche: Einrichtungsdialog, Ladeanzeige (Welt-Worker), Kopfleiste mit Kontostand, Datum und Uhrzeit, Zeitsteuerung, Hilfe-Fenster, Haltestellen-Fenster, Tastenkürzel, Kartenstil.

Nachträge nach der Freigabe (25.11.2026):
- Datensatz mit 2 km Rand (nur Busstraßen), alle 259 Haltestellen im zusammenhängenden Netz.
- Geschwindigkeitsstufen 1, 10, 60, 240, 600 auf den Tasten 1 bis 5, Messung bei 600-fach.
- Statuszeile nur als Testansicht, F3 schaltet sie ein und aus.
- Fahrzeugkatalog v19 übernommen (gegenüber v18 nur ein Anleitungstext geändert), Hash neu gesetzt.
- Neue Regeln in CLAUDE.md (Dateikodierung, Subagenten).

Geändert gegenüber Konzept: nichts. Das Konzept (`docs/konzept.md`) wurde von Koko aktualisiert und ist im Repository.

## Etappe 2: Fahrzeugkatalog und Betriebshof (Entwurf der Abnahmekriterien, wartet auf Kokos Bestätigung, es wurde noch nichts gebaut)

Siehe Bericht vom 25.11.2026. Die bestätigte Fassung wird hier eingetragen.
