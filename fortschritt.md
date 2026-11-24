# Fortschritt

## Etappe 0: ProjektgerÃ¼st und Testinfrastruktur (wartet auf Freigabe)

Fertig:
- ProjektgerÃ¼st: Vite, TypeScript, MapLibre GL (leerer Kartenrahmen), Tauri 2 fÃ¼r die Desktop-App.
- Simulation als Web Worker mit festem Takt (`src/sim`), Pause und Zeitraffer-Stufen.
- Speicherschnittstelle mit SQLite (Desktop) und IndexedDB (Browser), VersionsprÃ¼fung (`src/storage`).
- Zentrale Konfiguration (`src/config/config.json`) und Sprachdatei Deutsch (`src/i18n/de.json`).
- Testdatensatz Norderstedt mit Quellenangabe nach ODbL (`public/data/norderstedt`).
- Fahrzeugkatalog wird gelesen, 63 Spaltennamen werden geprÃ¼ft, Hash-Test (Datei nur gelesen).
- Tests mit `npm test`: Einzeltests, Rauchtest-GrundgerÃ¼st, OberflÃ¤chentest der Web-Version.
- GitHub-Workflow (`.github/workflows/ci.yml`): Bau und Test auf Windows und macOS, Web-Version auf GitHub Pages, Test der Pages-Adresse.

Offen:
- Nichts. Workflow repariert (Bau und Veröffentlichung getrennte Jobs), README angelegt, `npm test` meldet fehlenden Browser verständlich.

GeÃ¤ndert gegenÃ¼ber Konzept: nichts.

## Etappe 1: Karte, Welt und Zeit (Entwurf der Abnahmekriterien, wartet auf Kokos Bestätigung, es wurde noch nichts gebaut)

Automatisch geprüft, ausgehend von der Beispieltabelle des Konzepts:

1. Norderstedt lädt offline: Der Test sperrt das Netz und lädt nur den Datensatz im Projekt. Kein Test fragt Overpass live ab.
2. Das Straßennetz entsteht aus dem Auszug mit Geschwindigkeit je Abschnitt (maxspeed, sonst Standardwert je Straßenklasse aus der Konfiguration), Einbahnstraßen (auch Kreisverkehre) und Abbiegeregeln. Nur Straßen, die ein Bus befahren darf, gehören zum Busnetz.
3. Routing zwischen zwei Haltestellen liefert eine Route auf dem Straßennetz. Die Route ist zusammenhängend, nicht kürzer als die Luftlinie, respektiert Einbahnstraßen und Abbiegeverbote (geprüft an einem kleinen Testnetz mit bekanntem Ergebnis und an echten Haltestellenpaaren in Norderstedt), und die Fahrzeit ergibt sich aus Länge und Geschwindigkeit.
4. Haltestellen aus OSM sind eingelesen, jede ist einem Straßenabschnitt zugeordnet, die Anzahl liegt in einem plausiblen Bereich.
5. Das Nachfragegitter ist nicht leer. Zellen tragen geschätzte Einwohner und Arbeitsplätze aus Gebäudeflächen und Landnutzung sowie Orte von Interesse. Die Summe der Einwohner liegt im Zielkorridor, der in annahmen.md steht. Die Berechnung ist deterministisch.
6. Die Gemeindegrenze aus OSM wird erkannt. Der Schwellenwert für die Teilung in Subdivisionen steht in der Konfiguration: Norderstedt wird nicht geteilt, mit künstlich niedrigem Schwellenwert im Test schon.
7. Der Kalender kennt Uhrzeit, Wochentag, Feiertage, Schulferien und Jahreszeit. Geprüft an bekannten Tagen (zum Beispiel 3. Oktober, Ostern, Sommerferien Schleswig-Holstein).
8. Die Zeit läuft in festen Schritten und steht bei Pause still. Pause, 1-, 5-, 20- und 60-fach sind über Bedienelemente und Tasten (Leertaste, 1 bis 4) wählbar. Ein Spieltag bei 60-fach ergibt dieselbe Zeit wie 60 mal Echtzeit.
9. Der Einrichtungsdialog nimmt Startgemeinde, Startkapital, Firmenname und Firmenfarbe entgegen und prüft sie. Danach lädt das Spiel die Welt mit Fortschrittsanzeige, ohne dass die Oberfläche einfriert. Alle Texte stehen in der Sprachdatei.
10. Die Karte zeigt Straßen nach Bedeutung, Gebäude, Grün, Wasser und Haltestellen. Verschieben und Zoomen funktionieren. Ein Oberflächentest mit Screenshot prüft das auf Windows und macOS.
11. Alles ist mit der Tastatur bedienbar, Informationen stehen nicht nur in Farbe.
12. Der Rauchtest hat den Schritt "Gemeinde wählen" als echten Schritt. Alle bisherigen Tests bleiben grün, der Workflow ist auf Windows, macOS und für die Pages-Adresse grün.
