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

## Etappe 2: Fahrzeugkatalog und Betriebshof (freigegeben von Koko am 25.11.2026, Nachträge eingearbeitet)

Stand vor Beginn: Git-Tag `etappe-1-fertig`. Freigegebener Stand: Git-Tag `etappe-2-fertig` (Commit mit Kokos Konzeptfassung vom 25.11.2026).

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

Unabhängige Prüfung (Subagent, 25.11.2026): alle 13 Kriterien erfüllt, keine Erfindungen, keine Gedankenstriche. Behoben nach der Prüfung (mit Regressionstests): Wege nutzten Durchgänge schmaler als 3,5 m; Anbindung nur an den Ecken der Fläche gemessen; Zukauf an der Torseite ohne Warnung; feste Farben und Werte im Editor (jetzt in der Konfiguration); Einheiten und Zeichen außerhalb der Sprachdatei; leere Kopfzelle wurde ohne Namen gemeldet; Tastaturauswahl über die Bauteilliste ungetestet.

Nachträge nach der Freigabe (25.11.2026), Antworten von Koko auf die offenen Fragen:
- Konzept: Kokos Fassung vom 25.11.2026 (Festlegungen zum Betriebshof, Kernzyklus ohne Ausbaustufen, Seitenverhältnis) ist committet.
- Seitenverhältnis des Grundstücks höchstens 1 zu 10 bei Startgrundstück und Zukauf, mit Meldung; die Zukauf-Anzeige nennt den kleineren Höchstwert aus Fläche und Seitenverhältnis (A2-33).
- Standortliste unverändert: alle Gewerbe- und Industrieflächen, OSM-Gebäude auf dem Grundstück zählen nicht.
- Batteriebereich ohne Schritt: Standardschritt 50 kWh, das Maximum bleibt wählbar (A2-30). Hinweis zum leeren Batterieschritt nur bei einem Bereich (jetzt 184 statt 235 Elektro-Hinweise).
- verbrauchseinheit wird gegen "Liter, kWh, kg" geprüft, Abweichung ist ein Hinweis.
- Ein Layout muss ein zusammenhängendes Netz sein, mehrere Tore im selben Netz sind erlaubt; getrennte Netze sind ein Fehler (A2-32).
- Warnung bei Fahrwegen mit Stellplätzen ohne Wendemöglichkeit, Layout bleibt gültig (A2-31). Das Beispiel-Layout hat deshalb zwei Tore als Durchfahrt, die Summe bleibt 1.319.620 € bzw. 1.615.620 €.
- baujahr_von leer: Regel für den Gebrauchtmarkt als A2-34 festgehalten, gebaut wird sie in 3a. Die 16 fehlenden Standardwerte für fiktive Busse bleiben bis Etappe 7a liegen.
- Altas Novus Cityline und Ecoline bleiben gemeldet und ungenutzt, bis Koko die Länge ergänzt.

Prüfung der Nachträge (Subagent): alle Vorgaben erfüllt. Behoben mit Regressionstest: Die Meldung "getrennte Netze" hing am zuletzt gebauten Tor statt am kleineren Netz; ein Zukauf, der ein schon zu schmales Grundstück verbessert, wurde abgelehnt. Offen als Frage: Die Wendemöglichkeit wird über das Netz der Rechtecke erkannt. Zwei Tore direkt nebeneinander oder drei Fahrwege, die sich an einer Einmündung gegenseitig berühren, gelten dadurch als Rundweg, obwohl ein Bus dort nicht wenden kann.

Ebenfalls behoben (Regressionstest): Der Oberflächentest "600-fach" schlug auf macOS fehl, weil die Messung begann, bevor der Worker umgestellt hatte. Der Welttest bekam für den Aufbau der Welt dasselbe Zeitlimit wie der Standorttest.

Geändert gegenüber Konzept: nichts.

## Etappe 3a: Fahrzeugmarkt und Personal (freigegeben von Koko am 25.11.2026)

Stand vor Beginn: Git-Tag `etappe-2-fertig`. Freigegebener Stand: Git-Tag `etappe-3a-fertig`.

Nachträge nach der Freigabe (25.11.2026): Arbeitgeberanteil auf die Jahressonderzahlung bestätigt. Batteriebereich ohne Schritt, der kleiner als der Standardschritt ist, bietet nur das Maximum (A3-33, Yutong U12 LE nur 466 kWh, Regressionstest). Detailansicht: Modellreihe als Überschrift, Variante als Zusatz; in Listen "Reihe, Variante". A3-20 bis A3-32 bestätigt. Konzept mit Kokos Festlegungen zu Kauf, Ausstattung und Lohn (25.11.2026) committet.

Bestätigte Abnahmekriterien (Koko, 25.11.2026):
1. Neukauf: Liste der neu kaufbaren Modelle (im_neukauf = ja, nur Fahrzeugart Bus), filterbar nach Hersteller, Bauart und Antrieb. Zeilen mit gleichem Hersteller, Modellfamilie und Modell erscheinen als ein Modell mit wählbarer Variante. Die Ansicht zeigt die Daten aus dem Katalog.
2. Konfiguration: Batteriegröße (nur Elektro), Lackierung (Standard Firmenfarbe), Bestuhlung, Spiegelart, weitere Ausstattung aus der Optionsdatei. Preis = neupreis_eur plus Aufpreise, laufend angezeigt, geprüft gegen Handrechnung.
3. Kauf nur mit freiem Platz, auf den der Bus passt (Stellplatz nach passtBus, Hallenplatz nach Busgröße), und ausreichendem Kontostand, sonst lesbare Meldung ohne Buchung. Der Neukauf bucht genau den Preis ab und stellt den Bus sofort auf einen freien Platz. Die gewählte Batteriegröße bestimmt Preis und Platzzahl, geprüft gegen Handrechnung an einem MAN-Modell.
4. Jeder gekaufte Bus bekommt automatisch Flottennummer und Kennzeichen (vorläufig aus dem Kreisschlüssel der Startgemeinde und einem Zufallsrest).
5. Gebrauchtmarkt: Angebote aus dem Katalog, auch eingestellte Modelle, passend zu Region und Zeitraum (A2-34). Jedes Angebot zeigt Modell, Baujahr, Laufleistung, Preis, Restzeit der HU, Konfiguration, Lackierung des Vorbesitzers und den Zustand als Spanne (Elektro auch Batteriezustand). Mit fester Zufallszahl immer dieselben Angebote.
6. Preis aus Neupreis, Wertverlust nach Alter und Zustand, Streuung; geprüft gegen Handrechnung.
7. Die Angebote erneuern sich wöchentlich, geprüft über einen Wochenwechsel der Spielzeit.
8. Inspektion gegen Gebühr zeigt den genauen Zustand. Gebrauchtkauf mit denselben Bedingungen wie Neukauf, der Bus startet mit seinem Zustand. Umlackieren gegen Bezahlung.
9. Fahrzeugliste mit Flottennummer, Modell, Baujahr, Zustand und Platz; im Editor stehen die Busse als kleine Rechtecke auf ihren Plätzen.
10. Personal: Ausschreibung für alle sechs Personalarten; nach einer Wartezeit erscheinen Bewerber, Zahl und Erfahrung hängen vom Lohn im Verhältnis zum Marktlohn ab (Test mit fester Zufallszahl). Einstellen ergibt eine Person mit Namen, Personalart, Lohn, Arbeitszeit, Erfahrung, Zufriedenheit, Gesundheit und Qualifikationen.
11. Probezeit und Kündigungsfrist: Der Spieler kann kündigen, der Lohn läuft bis zum Ende der Frist.
12. Lohn je Personalart und Erfahrungsstufe pro Stunde (Marktlohn nach TV-N SH in der Konfiguration). Abbuchung am Monatsende, anteilig bei Eintritt oder Austritt im Monat; das Konto darf dadurch ins Minus. Test: eine eingestellte Person kostet genau den erwarteten Betrag.
13. Wochenwechsel und Monatsende werden aus der Spielzeit auch bei 600-fach genau einmal ausgelöst.
14. Menüleiste am Rand mit Fahrzeuge, Fahrzeugmarkt, Personal und Betriebshof, alles per Tastatur, Texte in der Sprachdatei.
15. Fuhrpark, Angebote, Ausschreibungen und Personal lassen sich als Datenstruktur speichern und laden und ergeben denselben Zustand.
16. Rauchtest mit den echten Schritten "Bus kaufen" und "Fahrer einstellen", Oberflächentest mit Screenshot, alle Tests und Workflow grün inklusive Pages-Adresse.
17. Verkauf an den Händler: Wert ohne Streuung abzüglich Abschlag, der Bus verschwindet aus der Flotte, der Platz ist wieder frei, im Spielstand abgebildet; ein Test prüft Betrag und Platz.

Fertig:
- Zufall mit Startwert (`src/game/zufall.ts`), Konfiguration (`optionen`, `fahrzeugmarkt`, `personal`), Kreisschlüssel der Gemeinde, Monatsaddition im Kalender.
- Optionsdatei `optionen.xlsx` mit Leser und Prüfung der Spalten (`src/catalog/optionen.ts`, Subagent). Batteriegrößen als eigenes kleines Modul ohne Excel-Leser.
- Fuhrpark (`src/fleet`): Plätze im Hof, Neukauf mit Konfiguration, Plätze und Preis nach Batterie, Wert, Verkauf, Umsetzen, Umlackieren, Kennzeichen, Flottennummer, Gebrauchtmarkt mit Inspektion, Speichern und Laden, Abriss belegter Plätze gesperrt.
- Personal (`src/personal`, Subagent): Lohntabelle, Ausschreibung, Bewerber, Einstellen, Kündigung, Stufenaufstieg, Monatslohn, Speichern und Laden.
- Spielzustand und Zeitereignisse (`src/game/spiel.ts`): Wochenwechsel und Monatsende genau einmal.
- Oberfläche: Menüleiste am linken Rand, Fenster Fahrzeugmarkt (Neukauf, Gebrauchtmarkt), Fahrzeuge, Personal; Busse im Editor; Fehler der Optionsdatei im Startfenster und in F3; Hilfe ergänzt.
- Tests: `tests/fuhrpark.test.ts`, `tests/spiel.test.ts`, `tests/optionen.test.ts`, `tests/personal.test.ts`, Ergänzungen in `tests/betriebshof.test.ts` und `tests/texte.test.ts`, Rauchtest mit "Bus kaufen" und "Fahrer einstellen", Oberflächentest `e2e/markt.spec.ts` mit drei Screenshots.
- Nachtrag Etappe 2 (Antwort 15): Durchfahrt nur bei mindestens 27 m Torabstand, Rundweg nur wenn er eine Fläche umschließt und im Netz einen Kreis bildet.
- Annahmen A3-1 bis A3-32 in `annahmen.md` (A3-20 bis A3-32 warten auf Bestätigung).

Unabhängige Prüfung (Subagent, 25.11.2026): keine erfundenen Funktionen, keine Gedankenstriche, Annahmen passen zum Code. Behoben nach der Prüfung (mit Regressionstests): Abriss belegter Plätze ohne Test; Scheintest zum HU-Datum; schwacher Speichertest der Ausschreibungen; Ecken-Kontakt galt als Rundweg; Zahlen im Code (Erfahrungsspanne, Fahrerqualifikationen, HU-Standard); Laden kaputter Fuhrpark-Daten warf falsche Fehler und prüfte Kennzeichen, Plätze und Modelle nicht; gemischte Reihen öffneten die falsche Variante; Gebrauchtangebote zeigten die Standardausstattung nicht; Lackierung und Auswahl nur über Farbe; Neuzeichnen beim Tageswechsel zerstörte Eingaben und Bestätigungen; Personaltabelle ohne Zufriedenheit, Gesundheit, Qualifikationen und Erfahrung; abgelaufene Angebote noch kaufbar; Bewerber erschienen erst zum Tageswechsel; Testzugang im normalen Spiel; doppelte Formeln; Batterieeinheiten bei Maximum ohne volles Vielfaches.

Ebenfalls behoben (Regressionstest): Der Oberflächentest aus Etappe 1 prüfte die Pause, bevor der Worker angehalten hatte (im Workflow kam auf Windows und macOS noch ein Takt dazu).

Offene Fragen an Koko:
1. Arbeitgeberanteil auf die Jahressonderzahlung: Gerechnet wird (Bruttolohn + Sonderzahlung / 12) × 1,22, also der Arbeitgeberanteil auch auf die Sonderzahlung (sachlich richtig, A3-18). Bestätigen?
2. Yutong U12 LE hat einen Batteriebereich von 465 bis 466 kWh ohne Schritt; nach der Regel A2-30 sind beide Größen wählbar (1 kWh für 700 €). Katalogwert prüfen?
3. Annahmen A3-20 bis A3-32 bestätigen.

Geändert gegenüber Konzept: nichts.

## Etappe 3b: Linien und Fahrplan (freigegeben von Koko am 26.11.2026, Nachträge eingearbeitet)

Kriterien, Antworten F1 bis F16 und Annahmen A3b-1 bis A3b-14 von Koko am 25.11.2026 bestätigt (mit Ergänzungen: Route nach kürzester Fahrzeit, Meldung ohne Route, Zuschläge nicht mit dem Faktor multipliziert, minimaler Autosave, Beispiellinie; Faktoren nie unter 1).

Fertig:
- Haltestellen: vorhandene aus OSM, neue per Klick oder Kartenmitte (Fangradius 60 m, rechte Fahrbahnseite, nur in freigeschalteten Gebieten, kostenlos), Umbenennen im Haltestellenfenster, Löschen ungenutzter neuer Haltestellen. Suche mit Straße und Fahrtrichtung (`src/linien/linien.ts`, `src/linien/fangen.ts`, `src/ui/linien.ts`, `src/ui/perlen.ts`).
- Linie als Perlenkette: Nummer (eindeutig, höchstens 6 Zeichen), Name, Farbe, aktiv/inaktiv; Haltestellen und Wegpunkte per Karte, Suche oder Kartenmitte; Route nach kürzester Fahrzeit über Busstraßen mit Einbahnstraßen und Abbiegeverboten; Lücken werden an der Stelle gemeldet, die Linie bleibt gespeichert (`src/linien/strecke.ts`).
- Varianten: Hin und Rück aus der Grundlinie (Rück mit Gegenhaltestellen), jede einzeln bearbeitbar (eigene Route, ⇄ Haltestelle ersetzen), Kurzläufer als Teilstrecke, eigene Wendezeit, Standzeit je Haltestelle.
- Fahrzeiten automatisch aus Länge, erlaubter Geschwindigkeit (höchstens 80 km/h), Verkehrsfaktor nach Tagesart und Uhrzeit, Ampeln, Kreuzungen und Halt-Zuschlag, je Abschnitt auf 10 s gerundet (`src/linien/fahrplan.ts`).
- Takt je Variante und Tagesart (sechs Tagesarten, Ferien nur auf Wunsch eigen), Vorlagen, Fahrten verschieben, streichen, wiederherstellen und zusätzlich einfügen; Änderungen bleiben bei neuer Berechnung, verwaiste werden verworfen und gemeldet.
- Busbedarf je Linie und Tagesart durch Verkettung zu Umläufen, Warnung bei zu wenigen Bussen je Linie und im Fuhrpark, Ausrückzeit je Umlauf (`src/linien/plan.ts`).
- Bus zuweisen (Stammlinie) mit Warnung nach Länge und Wendekreis, Meldung bei fehlendem Wendekreis (`src/linien/pruefung.ts`); Busse im Betriebshof-Editor in der Linienfarbe mit Liniennummer; Fahrzeugdetail zeigt die Linie.
- Tagesart eines Datums mit Betriebstag ab 4 Uhr (`src/linien/tagesart.ts`), in der Linienliste als "Heute gilt".
- Berechnung im Simulations-Worker: Das Straßennetz geht beim Start einmal hinüber, danach Anfragen ohne Netzzugriff, deterministisch (`src/sim/worker.ts`, `src/sim/client.ts`).
- Spielstand mit Version 2 und Migration vom Stand 3a (Version 1), geprüft mit SQLite und IndexedDB (`src/game/spielstand.ts`, `src/linien/speichern.ts`). Minimaler Autosave alle 10 s und beim Verlassen, "Weiterspielen" im Einrichtungsdialog.
- Oberfläche: Menüpunkt "Linien", Linienliste, Linieneditor, Varianteneditor mit Takt und Fahrzeitprobe, Fahrplan mit Umläufen, Linien in ihrer Farbe auf der Karte (inaktive gestrichelt), Hervorhebung der bearbeiteten Variante. Schriftgrößen der neuen Ansichten relativ.

Tests: `tests/linien.test.ts` (Handrechnungen Fahrzeit, Kurzläufer, Busbedarf, Routen, Takt, Tagesart), `tests/linien-norderstedt.test.ts` (Beispiellinie auf dem echten Netz), `tests/spielstand.test.ts` (beide Speicher, Migration), Rauchtest mit "Linie anlegen", "Takt setzen", "Fahrplan erzeugen", "Bus zuweisen" und Laden des ganzen Spielstands, Oberflächentest `e2e/linien.spec.ts` mit Screenshots und Neuladen.

Unabhängige Prüfung (Subagent, 25.11.2026): kein Fehler, der ein Kriterium bricht; Handrechnungen nachgerechnet, Annahmen passen zum Code, keine Gedankenstriche, UTF-8 ohne BOM. Behoben nach der Prüfung (Regressionstests in `tests/linien-pruefung.test.ts` und `tests/spiel.test.ts`): gespeicherte Netzanschlüsse wurden beim Laden nicht gegen die Karte geprüft; Verkauf nahm den Bus nur in der Oberfläche aus der Linie; Gegenhaltestelle konnte in einem gesperrten Gebiet liegen; Ersetzen erlaubte dieselbe Haltestelle doppelt; verwaiste neue Haltestelle bei gescheitertem Einfügen; Fehler des Workers blieben unbemerkt (jetzt Hinweis in der Linienliste); Zahlen im Code (neue Taktzeile, Probezeit, Zellgröße) und in Texten (60 m, 4 Uhr) jetzt aus der Konfiguration; Einheit und Symbole außerhalb der Sprachdatei; "Es fehlen 1 Busse" jetzt "Es fehlt 1 Bus"; fehlende Tests für die Prüfung der Verkehrsfaktoren, zusätzliche Fahrten, Kreuzungszuschlag und eigenen Ferientakt; zwei Füllaussagen in Tests entfernt. Annahmen ergänzt: A3b-21 (Halt-Zuschlag bei der Ausrückfahrt), A3-32 (Testzugang speichert), A3b-29 bis A3b-31.

Geändert gegenüber Konzept: nichts. Annahmen A3b-15 bis A3b-31 mit der Freigabe bestätigt (A3b-23 mit Rückfrage vor dem Überschreiben).

Nachträge zur Freigabe (26.11.2026):
- Lücken: Linienliste und Kopf des Linieneditors nennen deutlich die Varianten, die wegen einer Lücke keine Fahrten erzeugen (A3b-34). Oberflächentest mit einem Wegpunkt, dessen Anschluss beim Laden wegfällt.
- Erschließungswege: nachgerechnet, keine Änderung nötig. Im Busnetz sind nur Erschließungswege mit bus oder psv freigegeben (60 Abschnitte, alle freigegeben), alle 259 Haltestellen in beide Richtungen erreichbar, Haltestellen und Hofanschluss unverändert, Beispiellinie gleich (A3b-32, Regressionstest in `tests/linien-norderstedt.test.ts`).
- Gegenhaltestelle bleibt bei 100 m, Wendekreis bleibt wie gebaut (Nachtrag zu A3b-12: 12,5 m Außenradius nicht recherchiert).
- Autosave: Ein neues Spiel fragt vor dem Überschreiben nach, Vorgabe Abbrechen (A3b-23, Regressionstest in `e2e/linien.spec.ts`).
- Karte: Beim Öffnen einer Linie zoomt die Karte auf die Linie, neben den Fenstern sichtbar (A3b-33, Tests in `tests/linien-pruefung.test.ts` und `e2e/linien.spec.ts`).
- Fahrtrichtung in der Suche: Die Richtung des Straßenstücks an der Haltestelle ist geographisch richtig, die Segeberger Chaussee knickt am Kirchenweg von etwa 15° auf etwa 55° ab. Ein längeres Straßenstück ändert daran nichts. Nicht geändert, Vorschlag im Bericht.

Anleitung Beispiellinie (berichtigt): Linien, Nummer 1, "Linie anlegen". In der Suche nacheinander "Harksheide, Wilhelm-Busch-Platz" und "Harksheide, Kielort" mit "Segeberger Chaussee, Fahrtrichtung Osten" und "Glashütte, Glashütter Kirchenweg" mit "Segeberger Chaussee, Fahrtrichtung Nordosten" einfügen. "Hin- und Rückrichtung aus der Grundlinie erzeugen", in beiden Richtungen Takt 06:00 bis 20:00 alle 20 min. Erwartung Werktag 7 Uhr: Hin 6:30 min, Rück 6:40 min, 84 Fahrten, 2 Busse.
