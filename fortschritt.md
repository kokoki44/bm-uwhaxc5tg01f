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

## Etappe 2: Fahrzeugkatalog und Betriebshof (gebaut, wartet auf Kokos Freigabe)

Stand vor Beginn: Git-Tag `etappe-1-fertig`.

Bestätigte Abnahmekriterien (Koko, 25.11.2026):

1. Katalog einlesen: in App und Web direkt aus der xlsx-Datei, nie verändert. Spalten nach Namen. Fehlende, falsche oder verschobene Spaltennamen und eine falsche Spaltenzahl werden mit Text gemeldet. Geprüft mit fehlerhaften Testdateien.
2. Werte prüfen nach Blatt "Spalten" (Pflicht, erlaubte Werte, Verhalten wenn leer). Leere Felder aus "Standardwerte" der Klasse. Zeilen ohne Identität oder ohne Länge und Breite werden mit Zeilennummer gemeldet und nicht genutzt.
3. Formelspalten: gesamtplaetze und verbrauch_datenblatt_kwh_100km rechnet das Spiel selbst, das Ergebnis stimmt mit der Datei überein.
4. Standortwahl: Grundstücke aus Gewerbe- und Industrieflächen der freigeschalteten Gemeinde mit Preis je m², verfügbarer Fläche und Anbindung. Zentrale Lagen nachweislich teurer als Randlagen.
5. Grundstückskauf bucht den Preis ab. Zukauf bis höchstens 10 Hektar, mehr wird abgelehnt.
6. Editor als eigene Ansicht, Raster wählbar (kleinste 1 m), alle Bauteile sofort baubar, Mindestmaße aus der Konfiguration, keine Überlappung, nur innerhalb des Grundstücks.
7. Baukosten je m² je Bauteil, Abriss erstattet die Hälfte, keine Bauzeit.
8. Kapazitäten je Bauteil, die Zahl der Stellplätze begrenzt den Fuhrpark.
9. Layout-Gültigkeit: ohne Zufahrt ungültig, nicht verbundene Bauteile ungültig, Bus erreicht jeden Stellplatz, Warnungen bei Sackgassen und fehlender Zufahrt, für den Betrieb nötig: Tor, Stellplatz, Werkstatt, Büro.
10. Wege im Hof: Weglänge und Fahrzeit auf dem Raster, Hofgeschwindigkeit in der Konfiguration, Pauschalwerte für hohen Zeitraffer.
11. Draufsicht aus flachen Farbflächen, je Bauteiltyp Farbe plus Symbol, Tastaturbedienung, Oberflächentest mit Screenshot.
12. Rauchtest "Betriebshof bauen" als echter Schritt, alle Tests und Workflow grün inklusive Pages-Adresse.
13. Zustand des Betriebshofs (Grundstück, Bauteile, Layout) lässt sich als Datenstruktur speichern und laden und ergibt dasselbe Layout.

Festlegungen von Koko (25.11.2026), sollen laut Koko auch im Konzept stehen:
- Startgrundstück: Rechteck in der OSM-Fläche, vom Spieler gewählt, mindestens Mindestgröße. Die verfügbare Fläche begrenzt nur das Startgrundstück. Zukauf verlängert eine gewählte Seite, auch über die OSM-Fläche hinaus, bis 10 ha, zum Preis der Lage.
- Bus passt auf Stell- oder Ladeplatz, wenn Länge plus Rangierraum und Breite plus Seitenabstand hineinpassen. Funktion "passt Bus X auf Stellplatz Y" ist vorbereitet, die Prüfung beim Kauf kommt in 3a.
- Halle: Plätze nebeneinander, jeder von der Stirnseite erreichbar, keine Blockabstellung.
- Werkstatt: Arbeitsplätze = volle Felder 5 × 15 m.
- Kauf und Bau nur bei ausreichendem Kontostand.
- Tor an die nächste Busstraße.
- Alle Bauteile sofort baubar, keine Ausbaustufen.
- Prüfanzeige im Editor: Klick auf Stellplatz zeigt Weg vom Tor und Fahrzeit.
- Katalogfehler: Fenster beim Start nur bei Fehlern, zusätzlich in der Testansicht.

Fertig:
- Fahrzeugkatalog (`src/catalog`): alle Blätter lesen, Kopfzeile, Werteprüfung nach Blatt Spalten, Standardwerte, Formelspalten, Batterieoptionen. Fehlerfenster beim Start, Zusammenfassung in der Testansicht (F3). Subagent.
- Standorte (`src/world/standorte.ts`): Gewerbe- und Industrieflächen mit Preis nach Lage, Anbindung, Vorschlag für die Lage; Startgrundstück prüfen und kaufen; Tor-Anbindung.
- Betriebshof (`src/depot`): Datenmodell, Bauen, Abriss, Zukauf, Ladeleistung, Mindestmaße, Prüfung des Layouts, Kapazitäten, Fuhrparkgrenze, Wege auf dem Raster, Pauschalwerte, Speichern und Laden.
- Oberfläche: Standortliste und Grundstücksfenster (`src/ui/standortwahl.ts`), Standorte auf der Karte, Editor (`src/ui/editor.ts`), Knopf "Betriebshof" in der Kopfleiste, Hilfe ergänzt.
- Tests: `tests/katalog.test.ts`, `tests/betriebshof.test.ts`, `tests/standorte.test.ts`, `tests/texte.test.ts`, Rauchtest-Schritt "Betriebshof bauen", Oberflächentest `e2e/betriebshof.spec.ts`.

Offen:
- `docs/konzept.md` auf der Platte ist unverändert (gespeichert am 24.11.2026 um 23:39, im Kernzyklus steht noch "Ausbaustufen"). Die angekündigte Ergänzung lag nicht vor und ist deshalb nicht committet. Gebaut wurde nach den Festlegungen oben.
- Fragen an Koko: siehe Bericht und unten.

Offene Fragen zu Funktionen:
1. Batterien mit Bereich, aber ohne Schritt (zum Beispiel Ebusco 2.2: 350 bis 500 kWh): Nach der Festlegung gibt es nur das Maximum. Ist das so gewollt, oder sollen Minimum und Maximum wählbar sein?
2. batterie_kwh_schritt ist im Blatt Spalten "nur Elektro" Pflicht. Bei fester Batterie ist er zu Recht leer und erzeugt 76 Hinweise. Hinweis nur bei Bereich ohne Schritt?
3. verbrauchseinheit hat im Blatt Spalten die erlaubten Werte "Liter, kWh, kg", wird aber bisher als freier Text behandelt. Soll sie geprüft werden?
4. Zwei getrennte Hofnetze mit je eigenem Tor (zum Beispiel Stellplätze im Norden, Werkstatt im Süden, untereinander nicht verbunden) gelten zurzeit als gültig. Das Konzept sagt "Tor, Fahrwege und alle Bauteile verbunden". Muss alles ein zusammenhängendes Netz sein, oder dürfen Bereiche nur über die Straße verbunden sein?
5. Sackgasse: Zurzeit warnt das Spiel nur bei einem Stichweg, an dem nichts liegt. Soll es auch bei einem Fahrweg warnen, der ohne Wendemöglichkeit endet, aber Stellplätze hat (Busse müssten dort rückwärts fahren)?

Unabhängige Prüfung (Subagent, 25.11.2026): alle 13 Kriterien erfüllt, keine Erfindungen, keine Gedankenstriche. Behoben nach der Prüfung (mit Regressionstests): Wege nutzten Durchgänge schmaler als 3,5 m; Anbindung nur an den Ecken der Fläche gemessen; Zukauf an der Torseite ohne Warnung; feste Farben und Werte im Editor (jetzt in der Konfiguration); Einheiten und Zeichen außerhalb der Sprachdatei; leere Kopfzelle wurde ohne Namen gemeldet; Tastaturauswahl über die Bauteilliste ungetestet. Offen als Fragen 4 und 5.

Geändert gegenüber Konzept: nichts.
