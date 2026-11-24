# Bus-Manager Spielkonzept

Oct 4, 2026 · @Koko

## Vision und Eckdaten

Das Spiel ist ein Busunternehmen-Manager für Windows und macOS sowie als Web-Version im Browser, der in Echtzeit mit Zeitraffer auf echten OpenStreetMap-Karten läuft und jede Gemeinde der Welt spielbar macht. Man baut Betriebshöfe, plant Linien und Fahrpläne, führt Personal und Fuhrpark und wirtschaftet mit realistischen Fahrgast- und Kostendaten. Vorbild im Genre ist City Bus Manager, die Karte ist aber die echte Welt.

| Bereich | Festlegung |
| --- | --- |
| Plattform | Desktop-App für Windows und macOS sowie Web-Version im Browser (GitHub Pages), alle drei von Anfang an mit demselben Code und getestet, 2D, schlichte Oberfläche |
| Spielmodus | Sandbox, Einzelspieler, Speicherstände |
| Zeit | Echtzeit mit Pause und Zeitraffer |
| Welt | OpenStreetMap, weltweit, Schwerpunkt später Deutschland |
| Zeitraum | Start immer in der Gegenwart |
| Fahrzeuge | Reale Busse (neu und gebraucht) und fiktive Fahrzeuge, später Straßenbahn, U-Bahn, S-Bahn, Seilbahn und Fähre |
| Betriebshof | Eigener Bau-Editor, getrennt von der Karte |
| Fahrgäste | Nachfragemodell mit Einzelagenten ("Agenten light") |
| Umsetzung | Claude Code baut das fertige Spiel aus diesem Dokument |

**Abgrenzung.** Dieses Dokument beschreibt zuerst den Kernzyklus und danach in eigenen Kapiteln die weiteren Systeme. Welche davon in der ersten spielbaren Version (Phase 1) stehen und welche später folgen, legt der Phasenplan fest.

## Hinweise für Claude Code

Diese Regeln gelten für das ganze Dokument:

**Festlegungen zur Präzisierung.**

- Alle Betriebshof-Bauteile der Bauteiltabelle sind von Anfang an baubar, es gibt keine Ausbaustufen.
- Fahrscheinarten: Einzelfahrschein, Tageskarte, Schüler- und Sozialticket. Monats- und Jahreskarten gibt es nicht.
- Es gibt keine Ereignisse wie Wetter, Unfälle, Streiks oder Baustellen.
- Jeder Bus hat Zustand (0 bis 100), Sauberkeit (0 bis 100) und ein Datum der nächsten Hauptuntersuchung, Elektrobusse zusätzlich einen Batteriezustand. Weitere Werte pro Bus gibt es nicht.

* Was nicht in diesem Dokument steht, wird nicht gebaut. Claude Code erfindet keine zusätzlichen Funktionen, Spielmodi, Ereignisse (zum Beispiel Wetter, Unfälle, Streiks, Baustellen) oder Inhalte.
* Fehlt für eine beschriebene Funktion ein Zahlenwert oder eine Detailregel, wählt Claude Code einen realistischen Wert, legt ihn in die zentrale Konfiguration und trägt ihn mit Begründung in die Datei annahmen.md ein, die Koko prüft. Dadurch werden keine Funktionen erweitert.
* Alle mit (Vorschlag) markierten Stellen hat Koko am 28.10.2026 geprüft und beschlossen. Sie gelten als verbindlich, soweit sie nicht später geändert werden.
* Die Technik im Kapitel Technik und Architektur ist eine Empfehlung. Claude Code darf davon nur mit Begründung abweichen und meldet jede Abweichung.
* Die Oberfläche ist auf Deutsch, alle Texte stehen in einer Sprachdatei, damit weitere Sprachen später möglich sind.
* Der Fahrzeugkatalog (fahrzeugkatalog.xlsx) ist die maßgebliche Quelle für Fahrzeugdaten. Die Spaltennamen in der ersten Zeile werden nicht geändert.
* Stellen, die ausdrücklich auf später verschoben sind (Feinabstimmung der Gemeindezustimmung, Detail der Busknotenpunkte, Regelwerk der Lenk- und Ruhezeiten, Fahrzeugkatalog für Schienenfahrzeuge, Kennzeichen und Flottennummern im Detail), baut Claude Code erst, wenn sie ausgearbeitet sind.

## Technik und Architektur

Die App wird als Desktop-Anwendung mit Web-Technik gebaut, weil sich Karte, Oberfläche und Editoren damit am schnellsten umsetzen lassen. Die Simulation läuft getrennt von der Anzeige, damit die Oberfläche auch bei hohem Zeitraffer flüssig bleibt. Das Spiel läuft auf Windows und macOS: Der Code nutzt keine plattformspezifischen Schnittstellen, Pfade und Zeilenenden werden plattformneutral behandelt, und Speicherstände sowie Einstellungen liegen im jeweils üblichen Anwenderverzeichnis des Systems. Zusätzlich gibt es eine Web-Version, die ohne Installation im Browser läuft. Sie nutzt denselben Code wie die Desktop-App, nur der Speicher (IndexedDB statt SQLite, Speicherstand zusätzlich als Datei exportierbar und importierbar) und das Laden der Kartendaten unterscheiden sich.

| Schicht | Aufgabe | Vorschlag |
| --- | --- | --- |
| Oberfläche | Karte, Menüs, Fahrplan- und Betriebshof-Editor | Tauri (Windows und macOS), TypeScript, MapLibre GL für die Karte |
| Spielzustand | Unternehmen, Fuhrpark, Linien, Finanzen, Speicherstände | Speicher hinter einer gemeinsamen Schnittstelle: SQLite in der Desktop-App, IndexedDB im Browser, Autosave |
| Simulationskern | Zeit, Busse, Fahrgäste, Verspätungen, Wirtschaft | Eigener Thread als Web Worker in TypeScript, fester Takt (kein Rust-Kern, damit derselbe Code in App und Browser läuft) |
| Kartendaten | Straßen, Haltestellen, Grenzen, Gebäude | OSM-Auszüge pro Region, lokal gespeichert, offline nutzbar |

**Kartendaten.** Pro gewählter Gemeinde lädt das Spiel den passenden OSM-Auszug (zum Beispiel von Geofabrik) und baut daraus drei Dinge: ein Straßennetz mit Geschwindigkeiten, Einbahnstraßen und Abbiegeregeln für das Busrouting, die vorhandenen Haltestellen sowie ein Nachfragegitter aus Gebäuden, Landnutzung und Orten von Interesse. Verwaltungsgrenzen aus OSM bestimmen die Gemeinden und ihre Subdivisionen. In der Web-Version liegen vorbereitete Auszüge fest bei der Seite (zuerst Norderstedt), weitere Regionen werden per Overpass-Abfrage oder als vom Spieler gewählte Datei geladen.

**Daten mit Qualitätsstufen.** Weltweit gilt eine Schätzung der Einwohner und Arbeitsplätze aus Gebäudeflächen und Landnutzung. Wo bessere Daten vorliegen (in Deutschland Zensus- und Pendlerdaten, Fahrpläne im GTFS-Format), nutzt das Spiel diese. So läuft es überall, ist aber in Deutschland am genauesten.

**Speicherstände.** Ein Spielstand ist eine lokale Datei mit Version, damit alte Stände nach Updates ladbar bleiben. Karten-Auszüge werden nicht im Spielstand dupliziert, sondern referenziert.

**Leistungsziel (Vorschlag).** Flüssig bei 60-fachem Zeitraffer mit 500 Bussen und 20.000 gleichzeitig aktiven Fahrgästen auf einem durchschnittlichen Spiele-PC.

## Zeitmodell und Simulation

Das Spiel läuft in Echtzeit mit Spielkalender. Verspätungen und Auslastung ergeben sich aus der Simulation, sie werden nicht gewürfelt.

**Zeit.** Es gibt Pause, 1-fach und mehrere Zeitraffer-Stufen (Vorschlag: 5-, 20- und 60-fach). Der Kalender kennt Uhrzeit, Wochentag, Feiertage, Schulferien und Jahreszeit, weil Fahrpläne, Schichten und Nachfrage davon abhängen. Die Simulation tickt in festen Schritten, unabhängig von der Bildrate.

**Fahrzeiten und Verspätungen.** Die Fahrzeit eines Busses auf einem Straßenabschnitt ergibt sich aus Streckenlänge, erlaubter Geschwindigkeit und Verkehrsdichte nach Tageszeit. Dazu kommen Haltezeiten, die mit der Zahl der ein- und aussteigenden Fahrgäste wachsen, sowie Ampeln und Kreuzungen. Busspuren, Ampelvorrang und Busstraßen (spätere Module) verkürzen diese Zeiten messbar. Verspätungen pflanzen sich fort: Ein verspäteter Bus kommt verspätet am Wendepunkt an und startet seine nächste Fahrt später.

**Fahrgastmodell (Agenten light).**

1. Aus dem Nachfragegitter entstehen nach Tageszeit und Wochentag Reisewünsche zwischen Gebieten (Wohnen, Arbeit, Schule, Einkauf, Freizeit).
2. Nur wer die Reise mit dem Bus erwägt, wird zum Agenten. Ob er fährt, hängt von Weg zur Haltestelle, Wartezeit, Fahrzeit, Umstiegen und Preis ab.
3. Ein Agent ist ein kleiner Zustandsautomat: zur Haltestelle gehen, warten, einsteigen, aussteigen, umsteigen, ankommen.
4. Verbindungen zwischen Gebieten werden vorab berechnet und gespeichert. Bei Netzänderungen werden nur die betroffenen Verbindungen neu berechnet.
5. Bei hohem Zeitraffer wechselt die Simulation auf Zählwerte pro Haltestelle und Bus. Einzelne Fahrgäste sind nur bei niedriger Geschwindigkeit und beim Hineinzoomen sichtbar.

Fahrgäste, die schlecht bedient werden, bewerten das Unternehmen schlechter und weichen auf andere Verkehrsmittel aus. Das speist Bewertungen und Einnahmen.

## Spielwelt: Gemeinden und Freischaltung

Jede Gemeinde der Welt ist als Startpunkt wählbar. Weitere Gemeinden werden freigeschaltet, sobald man dort fahren oder Haltestellen betreiben will.

**Gemeinden.** Die Grenzen kommen aus den OSM-Verwaltungsgrenzen. Große Städte wie Hamburg oder Berlin werden in Subdivisionen (Bezirke, Stadtteile) geteilt, die einzeln freigeschaltet werden. Ab welcher Einwohnerzahl geteilt wird, ist ein einstellbarer Schwellenwert.

**Zwei Wege zur Freischaltung.**

| Weg | Ablauf | Kosten und Bedingungen |
| --- | --- | --- |
| Konzession kaufen | Der Spieler erwirbt das Betriebsrecht für eine Gemeinde oder Subdivision, dauerhaft gültig | Preis wächst mit Einwohnerzahl und Fläche, einstellbar |
| Gemeindeauftrag | Die Gemeinde schreibt ein Linienbündel aus, der Spieler bewirbt sich | Mindestbedienung (Takt, Betriebszeiten), Vergütung pro Fahrplankilometer, Laufzeit |

Aufträge machen die Sandbox abwechslungsreicher und entsprechen der Praxis in Deutschland. Wer einen Auftrag nicht erfüllt, bekommt Abzüge oder verliert ihn.

**Durchfahrt ohne Halt.** Linien dürfen durch nicht freigeschaltete Gemeinden fahren, dürfen dort aber weder halten noch Haltestellen bauen. Fahrgäste entstehen und enden nur in freigeschalteten Gebieten.

**Leere Welt.** Zu Beginn gibt es keine anderen Busbetriebe auf der Karte. Vorhandene reale Linien können als Vorlage importiert werden (siehe Spielstart).

## Spielstart

Ein neues Spiel beginnt mit einem Einrichtungsdialog und danach mit der Suche nach dem ersten Betriebshof-Standort.

1. **Einstellungen.** Startgemeinde (Suche nach Name, jede Gemeinde der Welt), Startkapital (frei einstellbar, in Euro, weitere Währungen kommen später), Firmenname und Firmenfarbe.
2. **Welt laden.** Das Spiel lädt den OSM-Auszug der Gemeinde und berechnet Straßennetz, Haltestellen und Nachfragegitter.
3. **Linienimport (optional).** Reale Linien können importiert werden, zum Beispiel aus GTFS-Daten, und erscheinen als Vorlagen. Der Spieler übernimmt sie ganz oder in Teilen, sie laufen nicht automatisch.
4. **Standort wählen.** Auf der Karte sucht der Spieler ein Grundstück für den ersten Betriebshof.

**Standortwahl.** Jedes Grundstück zeigt Preis, verfügbare Fläche und Anbindung ans Straßennetz. Gewerbegebiete am Stadtrand sind billig, liegen aber weit von den Linien entfernt. Zentrale Lagen sind teuer, bringen aber kurze Ein- und Ausrückfahrten. Die Lage wirkt damit direkt auf Leerkilometer, Zeit und Kosten.

Der Spieler startet ohne Fahrzeuge und ohne Personal. Alles muss er mit dem Startkapital selbst aufbauen.

## Kernzyklus

Der Kernzyklus ist die erste spielbare Phase: Betriebshof bauen, Busse und Fahrer beschaffen, Linie anlegen, Fahrplan festlegen, fahren lassen, Geld verdienen und reinvestieren.

1. **Betriebshof bauen.** Im eigenen Rastereditor, getrennt von der Karte, ohne Einschränkungen durch Straßen oder Nachbargrundstücke. Ein Betriebshof darf höchstens 10 Hektar groß sein. Das Raster ist variabel, die kleinste Rastergröße ist 1 Meter. Phase 1 braucht Ein- und Ausfahrt, Stellplätze, eine Werkstatt und ein Büro. Waschanlage, Lager, Toiletten, Küche und Pausenraum kommen als Ausbaustufen, Nebendepots werden später genauso gebaut. Die Zahl der Stellplätze begrenzt den Fuhrpark.
2. **Busse kaufen.** Aus einem Katalog realer Modelle, neu vom Hersteller oder gebraucht vom Gebrauchtbusmarkt. Kennzeichen und Flottennummer vergibt das Spiel automatisch, die Zielanzeige wird aus der Linie erzeugt.
3. **Fahrer einstellen.** Personal wird nach dem Kapitel Personal und Schichtplan eingestellt. Ein Bus fährt nur mit Fahrer.
4. **Haltestellen festlegen.** Vorhandene OSM-Haltestellen nutzen oder neue setzen. Haltestellen lassen sich umbenennen.
5. **Linie anlegen.** Haltestellen und Wegpunkte auf der Karte wählen, Nummer, Name und Farbe vergeben, Richtungen und Wendepunkte festlegen. Das Spiel berechnet die Route über das Straßennetz. Linien lassen sich aktivieren und deaktivieren.
6. **Fahrplan festlegen.** Takt je Tageszeit und Wochentag, dazu manuelle Fahrzeiten. Das Spiel zeigt an, wie viele Busse der Fahrplan braucht, und warnt bei Engpässen.
7. **Betrieb.** Busse rücken aus, fahren die Linie, wenden und rücken wieder ein. Fahrgäste steigen ein und aus, Verspätungen entstehen.
8. **Ergebnis.** Einnahmen aus Fahrscheinen, Kosten für Personal, Kraftstoff oder Strom, Wartung, Grundstück und Gebäude. Bewertungen der Fahrgäste. Mit dem Gewinn wächst das Unternehmen.

**Fahrzeugdaten.** Alle Felder eines Fahrzeugs stehen im Fahrzeugkatalog, siehe das Kapitel Fuhrpark, Ersatzteile und Wartung.

## Betriebshof-Editor

Der Betriebshof wird in einer eigenen Ansicht gebaut, getrennt von der Karte. Gebäude und Räume werden frei als Rechtecke aufgezogen, jedes Bauteil hat eine Mindestlänge und Mindestbreite. Alles steht sofort nach dem Bau. Die Busse fahren echte Wege durch den Hof, deshalb entscheidet das Layout über Zeit, Staus und Kosten.

**Bauteile.** Jedes Bauteil ist ein Rechteck mit einer zugewiesenen Funktion. Die Mindestmaße sind Vorschläge und liegen in der zentralen Konfiguration.

| Bauteil | Funktion | Mindestmaß (Vorschlag) | Kapazität |
| --- | --- | --- | --- |
| Zufahrt und Tor | Verbindung zur Straße | 4 m breit | Ein Bus pro Durchfahrt, Wartezeit bei Andrang |
| Fahrweg | Verbindung im Hof | 3,5 m breit, 7 m bei Gegenverkehr | Keine |
| Stellplatz | Abstellen unter freiem Himmel | Fahrzeuglänge plus Rangierraum | Ein Bus pro Stellplatz |
| Halle | Überdachte Stellplätze, schont die Busse im Winter | 4 × 15 m | Plätze nach Fläche und Fahrzeuglänge |
| Werkstatt | Wartung und Reparatur | 5 × 15 m je Arbeitsplatz | Arbeitsplätze = gleichzeitige Wartungen |
| Waschanlage | Reinigung | 5 × 18 m | Fester Durchsatz, zum Beispiel 10 Busse pro Stunde |
| Lager | Ersatzteile | 4 × 4 m | Lagermenge nach Fläche |
| Büro | Verwaltung und Disposition | 4 × 4 m | Voraussetzung für den Betrieb |
| Tankstelle (Diesel) | Betankung | 4 × 8 m | Ein Bus pro Zapfsäule |
| Ladeplatz (Elektro) | Laden von Elektrobussen per Stecker | Fahrzeuglänge plus Rangierraum | Ein Bus pro Ladepunkt, Ladeleistung einstellbar |
| Toiletten, Küche, Pausenraum | Zufriedenheit und Pausen des Personals | 2 × 2 m, 3 × 3 m, 4 × 4 m | Plätze nach Fläche, wirkt auf die Schichten |

Elektrobusse sind von Anfang an kaufbar und laden im Betriebshof am Ladeplatz per Stecker. Es gibt nur einen Typ Ladepunkt, der Spieler stellt die Ladeleistung selbst ein. Geladen wird mit der eingestellten Leistung, höchstens mit der ladeleistung\_kw des Busses, die Dauer ergibt sich aus der Batteriegröße. Die Ladeleistung wirkt nur auf die Ladedauer, es gibt keine weiteren Nebenwirkungen. Ladeinfrastruktur an der Strecke (zum Beispiel Stromabnehmer an Endhaltestellen) folgt mit einem späteren Infrastruktur-Modul. Die Werkstatt bleibt in Phase 1 einfach: Es zählt nur die Zahl der Arbeitsplätze, einzelne Geräte wie Hebebühne oder Grube gibt es nicht.

**Raster und Platzierung.** Das Raster ist variabel, die kleinste Rastergröße ist 1 Meter. Ein Layout ist nur gültig, wenn Tor, Fahrwege und alle Bauteile verbunden sind und ein Bus jeden Stellplatz erreichen kann. Das Spiel warnt bei Sackgassen und fehlenden Zufahrten.

**Betrieb im Hof.**

1. Der Bus fährt durch das Tor ein.
2. Er fährt zur Tankstelle oder zum Ladeplatz, wenn er das braucht.
3. Er fährt durch die Waschanlage, wenn eine Reinigung ansteht.
4. Ist Wartung fällig, fährt er in die Werkstatt. Sind alle Arbeitsplätze belegt, wartet er.
5. Er parkt auf einem freien Stellplatz oder in der Halle.
6. Zum Ausrücken fährt er vom Stellplatz zum Tor.

Die Busse folgen echten Wegen auf dem Raster. Bei hohem Zeitraffer rechnet das Spiel stattdessen pauschal mit Wegzeit und Auslastung des Hofs. Staus am Tor und lange Wege entstehen so aus dem Layout und kosten Zeit und Geld.

**Grundstück und Bauen.** Man kauft zu Beginn ein kleines Grundstück und kauft angrenzende freie Fläche zu, bis der Betriebshof 10 Hektar erreicht. Der Preis pro Quadratmeter hängt von der Lage ab. Die verfügbaren Grundstücke leitet das Spiel aus der OSM-Landnutzung ab, vor allem Gewerbe- und Industrieflächen. Bauen kostet je nach Bauteil einen Preis pro Quadratmeter, Abriss erstattet einen Teil (Vorschlag: die Hälfte). Es gibt keine Bauzeit.

**Optik.** Der Betriebshof ist bewusst schlicht. Er wird als Draufsicht aus flachen Farbflächen gezeichnet, je eine Farbe pro Bauteiltyp, mit einfachen Symbolen statt Details. Busse sind kleine Rechtecke in der Linienfarbe. Es gibt keine Texturen, keine Gebäudemodelle und keine Animationen außer der Bewegung der Busse. Das hält das Spiel schnell und die Umsetzung überschaubar.

## Fuhrpark, Ersatzteile und Wartung

Jeder Bus hat einen Zustand, der mit der Nutzung sinkt. Die Werkstatt hebt ihn wieder an, braucht dafür aber einen freien Arbeitsplatz und Ersatzteile aus dem Lager. Fehlen Arbeitsplätze oder Teile, bleiben Busse stehen, und das kostet Fahrten, Einnahmen und Bewertungen.

**Fahrzeugkatalog.** Alle Modelle stehen in einer handgepflegten Datei (fahrzeugkatalog.xlsx, aktuell Version 19), die das Spiel direkt einliest. Eine Zeile entspricht einer Variante (zum Beispiel 2 oder 3 Türen), die Spaltennamen in der ersten Zeile sind fest und dürfen nicht umbenannt werden. Alle Längenmaße stehen in Millimetern (Suffix \_mm). Die Datei enthält 63 Spalten in diesen Gruppen:

| Gruppe | Spalten (Auswahl) |
| --- | --- |
| Identität | modell\_id, modellfamilie, hersteller, modell, variante, fahrzeugart (Bus, O-Bus, Tram), bauart, antrieb |
| Maße | laenge\_mm, breite\_mm, hoehe\_mm, radstand\_mm, radstand\_2\_mm, ueberhang\_vorn\_mm, ueberhang\_hinten\_mm, wendekreis\_mm |
| Gewicht | leergewicht\_kg, gesamtgewicht\_kg |
| Fahrgastraum | flurtyp, tueren, tuerbreite\_mm, einstiegshoehe\_mm, sitzplaetze, stehplaetze, gesamtplaetze (automatisch berechnet), rollstuhlplaetze, kinderwagenplaetze |
| Antrieb | dauerleistung\_kw, spitzenleistung\_kw, hoechstgeschwindigkeit\_kmh, abgasnorm |
| Energie und Batterie | verbrauch\_pro\_100km, verbrauchseinheit, tankinhalt, batterie\_chemie, batterie\_einbauort, batterie\_kwh\_min, batterie\_kwh\_max, batterie\_kwh\_schritt, batterie\_nutzbar\_prozent, batterie\_lebensdauer\_jahre, plaetze\_je\_batterieeinheit\_weniger, reichweite\_km, verbrauch\_datenblatt\_kwh\_100km (automatisch berechnet), ladeleistung\_kw, ladeanschluss, ladeanschluss\_optional |
| Wirtschaft und Wartung | neupreis\_eur, wartungskosten\_eur\_pro\_km, intervall\_klein\_km, intervall\_gross\_km, intervall\_hu\_monate, lebensdauer\_jahre, zuverlaessigkeit, teilebedarf\_faktor |
| Verfügbarkeit und Quellen | baujahr\_von, baujahr\_bis, im\_neukauf, region, farbe\_standard\_hex, fiktiv (Kontrollkästchen), quelle, bemerkung |

Die Bauart (Mini, Midi, Solo kurz, Solo, Gelenk, Doppelgelenk, Doppeldecker) bestimmt den Platzbedarf im Betriebshof (Länge und Breite aus dem Katalog); der Flurtyp ist Niederflur, Low-Entry oder Hochflur. Die Spalte region ermöglicht später, Modelle nach Land zu filtern. Die Spalte fahrzeugart unterscheidet Bus, O-Bus und Tram. Als O-Bus gelten nur Fahrzeuge mit Oberleitungsbetrieb, also HESS lighTram DC, lighTram 25 DC und Solaris Trollino; die HESS-Varianten OPP, TOSA und Plug sind reine Batteriebusse. Straßenbahnen kommen erst mit dem Straßenbahn-Modul ins Spiel.

**Verfügbarkeit und fiktive Busse.** Neu kaufbar sind nur aktuelle Modelle, also solche mit im\_neukauf = ja. Eingestellte Modelle sind im Katalog grau markiert, haben im\_neukauf = nein und meist ein baujahr\_bis; sie gibt es nur gebraucht auf dem Gebrauchtbusmarkt, der von Anfang an verfügbar ist. Orange markierte Angaben sind Schätzungen ohne Herstellerdaten. Die Spalte fiktiv ist ein Kontrollkästchen: Leer oder FALSCH bedeutet reales Modell, WAHR bedeutet erfundenes Modell. Fiktive Busse gibt es auf zwei Wegen: Zeilen in der Excel-Datei gelten in allen Spielständen, mit einem Editor im Spiel angelegte Busse gelten nur im jeweiligen Spielstand und liegen in dessen Spielstandsdaten. Fiktive Busse sind genauso nutzbar wie reale und in der Tabelle hellblau hervorgehoben. Sie brauchen mindestens die Identitäts-, Maß- und Platzspalten, alles andere füllt das Spiel aus dem Tabellenblatt Standardwerte.

Batterien sind ein Bereich: Der Spieler wählt beim Kauf eine Kapazität zwischen batterie\_kwh\_min und batterie\_kwh\_max in Schritten von batterie\_kwh\_schritt (zum Beispiel MAN Lion's City 12 E: 356 bis 534 kWh in Schritten von 89 kWh, eCitaro: 444 bis 777 kWh in Schritten von 111 kWh). Je Batterieeinheit weniger entfallen plaetze\_je\_batterieeinheit\_weniger Plätze, wo die Batterie im Fahrgastraum oder Dach sitzt. Nutzbar sind batterie\_nutzbar\_prozent der Kapazität, die Alterung läuft über batterie\_lebensdauer\_jahre.

Bleibt ein Feld leer, nutzt das Spiel das Tabellenblatt Standardwerte, das je Klasse (Bauart und Antrieb) Ersatzwerte vorgibt, zum Beispiel für Neupreis, Wartungskosten, Intervalle und Zuverlässigkeit. Gelb markierte Felder sind Spielwerte (Vorschläge), nicht gelb markierte stammen aus Datenblättern oder Studien; die Quelle steht je Zeile in der Spalte quelle. Die Startdatei enthält aktuell rund 200 reale Fahrzeugzeilen von vielen Herstellern, zum Beispiel MAN, Mercedes (Citaro als C1, C1 Facelift und C2 sowie eCitaro), Solaris, Yutong und HESS.

**Zustand.** Jeder Bus hat genau einen Zustandswert von 0 bis 100 Prozent, neu gekaufte Busse starten bei 100. Der Wert sinkt mit gefahrenen Kilometern und mit dem Alter, schneller bei niedriger Zuverlässigkeit des Modells. Er steigt nur durch Wartung. Einen Zustand je Bauteil gibt es nicht.

**Wartung.** Zu Beginn plant der Spieler jede Wartung selbst. Das Spiel zeigt an, welcher Bus wann fällig ist, und warnt rechtzeitig. Eine automatische Wartungsplanung wird erst durch Forschung im Technologiebaum freigeschaltet. Es gibt drei Wartungsarten, deren Intervalle pro Modell im Katalog stehen:

| Wartungsart | Intervall | Wirkung (Vorschlag) |
| --- | --- | --- |
| Kleine Inspektion | intervall\_klein\_km | Hebt den Zustand um wenige Punkte, braucht Verbrauchsteile |
| Große Inspektion | intervall\_gross\_km | Hebt den Zustand deutlich, braucht mehr Teile und mehr Zeit |
| Hauptuntersuchung (HU) | intervall\_hu\_monate | Pflicht: Ohne gültige HU darf der Bus nicht fahren |

Jede Wartung belegt einen Arbeitsplatz in der Werkstatt für ihre Dauer und verbraucht Ersatzteile. Der Verbrauch wird mit dem Faktor teilebedarf\_faktor des Modells multipliziert. Wer ein Intervall überschreitet, riskiert schnelleren Verschleiß und höhere Pannenwahrscheinlichkeit.

**Ersatzteile.** Teile liegen im Lager des Betriebshofs. Die Lagerkapazität ergibt sich aus der Fläche der Lagerbauteile. Teile werden zunächst manuell bestellt und kommen nach einer Lieferzeit. Fehlt ein Teil, wartet der Bus in der Werkstatt, bis es da ist.

Die Teile stehen wie die Fahrzeuge in einer eigenen handgepflegten Datei, damit sie später leicht erweiterbar sind. Zum Start gibt es vier Kategorien mit einigen Einzelteilen. Die folgende Aufteilung ist ein Vorschlag, den du erweitern kannst:

| Kategorie | Beispielteile (Vorschlag) |
| --- | --- |
| Verschleißteile | Bremsbeläge, Reifen, Wischerblätter, Filter, Öl und Betriebsstoffe |
| Antrieb | Motor, Getriebe, Kupplung, Abgasanlage, Elektromotor, Batterie |
| Karosserie | Türen, Scheiben, Spiegel, Sitze, Beleuchtung |
| Elektrik und Technik | Klimaanlage, Zielanzeige, Fahrscheindrucker, Bordelektronik, Lüftung |

Jedes Teil hat Preis, Lieferzeit, Lagerplatzbedarf und die Angabe, in welchen Wartungsarten es gebraucht wird. Elektroteile wie die Batterie gelten nur für Elektro- und Hybridbusse. Automatische Nachbestellung bei Mindestbestand ist ein späteres Modul, das sich ebenfalls über Forschung freischalten lässt.

**Pannen.** Je niedriger der Zustand, desto höher die Wahrscheinlichkeit einer Panne. Als Startwerte zum Balancing: unter 70 Prozent leicht erhöht, unter 40 Prozent deutlich erhöht, unter 20 Prozent sehr hoch. Eine Panne bedeutet Fahrtausfall, Verspätung der betroffenen Fahrten, Abschleppkosten und eine Reparatur in der Werkstatt. Ist ein Ersatzbus frei, fährt er die Linie weiter.

**Wertverlust und Verkauf.** Der Wert eines Busses sinkt mit dem Alter bis zur lebensdauer\_jahre aus dem Katalog und mit dem Zustand. Der Gebrauchtbusmarkt ist von Anfang an Teil des Spiels, weil ein neues Unternehmen realistisch zuerst Altbusse anderer Betriebe übernimmt, statt sich eine komplett neue Flotte zu leisten. Er bietet wechselnde Angebote mit Modell, Baujahr, Laufleistung, Zustand und Preis (Vorschlag), auch eingestellte Modelle aus dem Katalog. Gebrauchte Busse starten mit ihrem Alterszustand statt bei 100 Prozent. Beim Verkauf nimmt ein Händler einen Abschlag auf den Wert. Die Details stehen im Kapitel Fahrzeugmarkt.

**Kennzeichen und Flottennummern.** Die Flottennummer wird fortlaufend vergeben, das Schema ist einstellbar (zum Beispiel Jahr plus laufende Nummer). Das Kennzeichen folgt dem Format des Landes der Startgemeinde, in Deutschland mit dem Unterscheidungszeichen des Landkreises und zufälligem Rest. Beides wird später noch im Detail ausgearbeitet.

## Fahrzeugmarkt: Neu und gebraucht

Busse bekommt der Spieler auf zwei Wegen: neu vom Hersteller oder gebraucht auf dem Gebrauchtbusmarkt. Beide stehen von Anfang an zur Verfügung. Der Gebrauchtmarkt ist für ein junges Unternehmen oft der realistischere Einstieg, weil Altbusse deutlich billiger sind.

**Neukauf.** Der Spieler wählt ein Modell mit im\_neukauf = ja aus dem Katalog, konfiguriert es und kauft es. Der Bus steht sofort im Betriebshof, es gibt keine Lieferzeit. Der Preis ist der neupreis\_eur des Katalogs plus die gewählten Optionen, Rabatte für größere Bestellungen gibt es zunächst nicht (Vorschlag). Voraussetzung sind ein freier Stellplatz und genug Geld.

**Konfiguration beim Neukauf.** Der Spieler legt beim Kauf fest:

- Batteriegröße bei Elektrobussen, im Bereich batterie\_kwh\_min bis batterie\_kwh\_max aus dem Katalog
- Türen und Variante, soweit der Katalog dazu Zeilen hat (zum Beispiel 2 oder 3 Türen)
- Lackierung, zum Beispiel in der Firmenfarbe
- Bestuhlungsart: Kunststoffschalen, stoffüberzogene Kunststoffschalen, Stoffsitze und weitere
- Spiegelart: konventionelle Spiegel oder Kamerasystem
- weitere Ausstattung gegen Aufpreis

**Weitere Optionen (Vorschlag).** Klimaanlage im Fahrgastraum, Heizung oder Wärmepumpe bei Elektrobussen, Fahrgastinformation (Innenanzeigen und Ansagen), Fahrgastzählsystem, Videoüberwachung, WLAN und USB-Steckdosen, Rampe für Rollstühle (manuell oder elektrisch), Abbiegeassistent und Notbremsassistent sowie Fahrscheindrucker oder Entwerter. Jede Option hat Aufpreis und wirkt auf Fahrgastzufriedenheit, Verbrauch, Teilebedarf oder Wartungskosten. Die Optionen stehen nicht im Fahrzeugkatalog, sondern in einer eigenen Optionsdatei, damit der Katalog keine Liste kaufbarer Extras braucht und die Optionen leicht erweiterbar bleiben.

**Gebrauchtangebote.** Das Spiel erzeugt wechselnde Angebote, es gibt keine festen Verkäufer. Jedes Angebot zeigt Modell, Baujahr, Laufleistung, Preis, die Restzeit der Hauptuntersuchung und eine Konfiguration (Bestuhlung, Spiegel, Ausstattung). Die Modelle kommen aus dem Katalog, auch eingestellte Modelle. Sie passen zum Zeitraum (zwischen baujahr\_von und baujahr\_bis) und zur Region der Startgemeinde. Das Angebot erneuert sich regelmäßig (Vorschlag: wöchentlich), alte Angebote verschwinden, neue kommen dazu. Gebrauchte Busse tragen die Lackierung des Vorbesitzers und lassen sich gegen Bezahlung umlackieren.

**Preisbildung.** Der Preis ergibt sich aus dem Neupreis, abgezogen um den Wertverlust nach Alter (bis lebensdauer\_jahre) und Zustand, mit einer zufälligen Streuung je Angebot. Ein stark gebrauchter Bus ist billig, kostet aber mehr Wartung und fällt häufiger aus.

**Zustand und Risiko.** Der Zustand eines Gebrauchtbusses wird vor dem Kauf nur teilweise gezeigt, als Spanne (zum Beispiel 55 bis 70 Prozent). Eine Inspektion gegen Gebühr zeigt den genauen Wert und versteckte Mängel. Bei Elektrobussen gehört der Batteriezustand dazu: Eine alte Batterie hat weniger nutzbare Kapazität, die Restlebensdauer richtet sich nach batterie\_lebensdauer\_jahre. Der Bus kommt nach dem Kauf sofort in den Betriebshof (Vorschlag).

**Verkauf.** Eigene Busse verkauft der Spieler pauschal an einen Händler, der einen Abschlag auf den Wert nimmt. Ein Verkauf über eigene Inserate mit Wartezeit und besserem Preis ist ein späterer Ausbau.

## Personal und Schichtplan

Personal besteht aus einzelnen Personen mit Lohn, Qualifikation und Arbeitszeit. Das Unternehmen startet ohne Personal, jede Stelle muss ausgeschrieben, besetzt und bezahlt werden. Ein Bus fährt nur mit Fahrer, Wartung braucht Werkstattpersonal.

**Personalarten in Phase 1.** Die Liste ist ein Vorschlag, der auf den Betriebshof-Bauteilen und dem Bewertungssystem aufbaut:

| Personalart | Aufgabe | Wirkung im Spiel (Vorschlag) |
| --- | --- | --- |
| Fahrer | Fahren die Dienste auf den Linien | Ohne Fahrer fährt kein Bus, Erfahrung wirkt auf Fahrzeit und Verschleiß |
| Werkstatt (Mechaniker) | Führen Wartung und Reparatur aus | Die Zahl der Mechaniker bestimmt, wie viele Werkstattplätze gleichzeitig arbeiten |
| Büro | Verwaltung und Disposition | Senkt Verwaltungskosten, ab einer Flottengröße nötig |
| Fahrkartenkontrolleure | Prüfen Fahrscheine in den Bussen | Senken die Zahl der Schwarzfahrer, bringen Einnahmen aus erhöhtem Beförderungsentgelt |
| Reinigungskräfte | Reinigen Busse und Betriebshof | Sauberkeit wirkt auf die Fahrgastbewertung |
| Kundenservice | Beschwerden, Fundsachen, Auskunft | Wirkt auf Bewertungen und Ruf |

**Fahrer im Detail.** Fahrer fahren die Dienste, verkaufen Fahrscheine, wenn der Vordereinstieg gilt, und sind Ansprechpartner der Fahrgäste. Real brauchen sie Führerschein Klasse D und die Berufskraftfahrer-Qualifikation, im Spiel sind das Eigenschaften der Person, ebenso Einweisungen auf Fahrzeugtypen (Gelenkbus, Doppeldecker, Elektrobus) und Streckenkenntnis je Linie. Fahrer sind die größte Kostenposition und der Engpass des Unternehmens. Nur sie unterliegen den Lenk- und Ruhezeiten. Erfahrung wirkt auf Fahrzeit, Verschleiß und Pannenrisiko, Zufriedenheit auf Krankheit und Kündigung.

**Werkstatt im Detail.** Mechaniker erledigen Wartung nach Intervall (kleine und große Inspektion, Vorbereitung der Hauptuntersuchung) und Reparaturen nach Pannen. Sie sind in Antrieb, Karosserie und Elektrik gegliedert, passend zu den Teilekategorien. Alle Mechaniker dürfen alle Busse warten, eine eigene Hochvolt-Qualifikation für Elektrobusse gibt es in Phase 1 nicht. Die Zahl der Mechaniker begrenzt, wie viele Werkstattplätze gleichzeitig arbeiten. Zu wenige verlängern die Standzeiten, sodass Busse ausfallen. Die Hauptwartung läuft nachts im Betriebshof, die Reparaturqualität wirkt auf die Haltbarkeit.

**Büro im Detail.** Das Büro übernimmt Verwaltung, Abrechnung, Personalverwaltung und das Vorsortieren von Bewerbungen. Der Bedarf wächst mit Flotte und Personalzahl. Zu wenig Büropersonal erhöht die Verwaltungskosten und verzögert Einstellungen und Bestellungen. Im Fahrbetrieb ist das Büro nicht sichtbar, deshalb wird es leicht unterschätzt.

**Fahrkartenkontrolleure im Detail.** Sie fahren in Zivil mit und prüfen Fahrscheine. Wer keinen hat, zahlt ein erhöhtes Beförderungsentgelt (in Deutschland meist 60 Euro). Sie wirken zusammen mit dem Einstiegsmodell: Der Spieler wählt, ob an der vorderen Tür eingestiegen und beim Fahrer gekauft wird oder ob an allen Türen eingestiegen wird. Die Wahl gilt als Standardwert für alle Linien und kann pro Linie abweichen. Vordereinstieg bedeutet kaum Schwarzfahrer, aber längere Haltezeiten. Einstieg an allen Türen ist schneller, braucht aber Kontrolleure. Zu viele Kontrollen belasten die Fahrgastzufriedenheit, zu wenige kosten Einnahmen.

**Reinigungskräfte im Detail.** Sie reinigen die Busse innen nach dem Betrieb, übernehmen die Außenwäsche in der Waschanlage und beseitigen gelegentlich Schmierereien. Jeder Bus hat einen eigenen Sauberkeitswert, der mit Fahrten und Fahrgästen sinkt, durch Reinigung steigt und die Bewertung beeinflusst. Die Arbeit passiert nachts am Stellplatz und braucht dort Zeit. Die Waschanlage ist als Bauteil Voraussetzung für die Außenwäsche.

**Kundenservice im Detail.** Der Kundenservice bearbeitet Beschwerden, Fundsachen, Auskunft und Rückfragen. Beschwerden entstehen aus Verspätungen, Ausfällen und mangelnder Sauberkeit und werden pro Unternehmen gezählt, nicht pro Bus. Der Kundenservice arbeitet sie in einer Frist ab. Unbearbeitete Beschwerden senken den Ruf, bearbeitete schwächen die Folgen schlechter Bewertungen ab.

**Weitere Ideen für spätere Module.** Leitstelle mit Disponenten (Ersatzfahrer und Umleitungen in Echtzeit), Verkehrsaufsicht an großen Knoten, Lagerpersonal für das Ersatzteillager, Werkstattmeister als höhere Qualifikation, Ausbilder für neue Fahrer, Sicherheitsdienst für Nachtbetrieb, Haltestellenpflege (Reinigung und Reparatur von Haltestellen) und eine Personalabteilung, die Bewerbungen vorsortiert.

**Einzelne Personen.** Jede Person hat Namen, Personalart, Lohn, Erfahrung, Zufriedenheit und Gesundheit. Erfahrene Fahrer fahren gleichmäßiger, verursachen weniger Verschleiß und weniger Pannen. Niedrige Zufriedenheit führt zu mehr Krankheitstagen und irgendwann zur Kündigung. Dazu kommen Qualifikationen, zum Beispiel die Einweisung auf Elektrobusse, Gelenkbusse oder Doppeldecker, die später über Schulungen erworben werden können.

**Einstellen.** Der Spieler schreibt Stellen aus und legt den Lohn fest. Bewerber erscheinen nach einer Wartezeit, wie viele und wie gut sie sind, hängt vom gebotenen Lohn im Vergleich zum Marktlohn ab. Es gibt Probezeit und Kündigungsfrist.

**Lohn und Arbeitszeit.** Der Lohn gilt je Personalart und Erfahrungsstufe pro Stunde. Hinzu kommen Zuschläge für Nacht, Sonntag und Feiertag sowie für Überstunden, außerdem Urlaub und Krankheit. Die Größenordnungen richtet Claude Code an realen Tarifen aus, alle Werte stehen in der zentralen Konfigurationsdatei.

**Lenk- und Ruhezeiten.** Die Dienste müssen sich an realistische Regeln halten, ein regelwidriger Dienst lässt sich nicht speichern. Als Grundlage dienen die EU-Lenk- und Ruhezeiten (zum Beispiel höchstens 4,5 Stunden Lenkzeit am Stück, danach mindestens 45 Minuten Pause) sowie das Arbeitszeitgesetz. Welche Regeln im Linienverkehr genau gelten, unterscheidet sich je nach Land und Streckenlänge. Deshalb liegen die Regeln als austauschbares Regelwerk pro Land vor, das wir vor der Umsetzung noch genau prüfen.

**Schichtplan.** Der Fahrplan besteht aus Fahrten. Ein Umlauf ist die Folge von Fahrten eines Busses, ein Dienst die Folge von Abschnitten eines Fahrers (Ausrücken, Fahrten, Pausen, Einrücken). Der Spieler weist Fahrten Bussen und Fahrern zu. Dienstarten sind Frühdienst, Spätdienst, Nachtdienst und geteilter Dienst mit langer Unterbrechung in der Mitte. Fahrerwechsel sind an Wendepunkten und am Betriebshof möglich.

**Planung von Hand und per Automatik.** Zu Beginn zieht der Spieler Fahrer auf einer Zeitleiste auf die Fahrten, das Spiel zeigt freie Fahrten und Regelverstöße sofort an. Eine automatische Dienstplanung, die aus dem Fahrplan Umläufe und Dienste erzeugt, wird wie die automatische Wartung erst über den Technologiebaum freigeschaltet. Der Spieler kann das Ergebnis immer anpassen.

**Ausfälle.** Krankheit, Urlaub und Pannen schaffen Lücken. Der Spieler kann Reservefahrer und Reservebusse einplanen. Gibt es keinen Ersatz, fällt die Fahrt aus, die Fahrgäste sind unzufrieden und die Einnahmen und Vergütungen sinken.

**Zufriedenheit.** Sie sinkt durch viele Überstunden, geteilte Dienste, Nachtdienste ohne Zuschlag und fehlende Pausenräume oder Toiletten im Betriebshof, sie steigt durch faire Löhne, planbare Dienste und gute Ausstattung.

## Linien und Fahrplan

Eine Linie ist eine Folge von Haltestellen mit Nummer, Name und Farbe. Aus der Linie und einem Takt entstehen Fahrten, aus den Fahrten die Dienste von Bussen und Fahrern. Alle Zeiten rechnet das Spiel auf 10 Sekunden genau.

**Linie als Perlenkette.** Der Spieler legt eine Linie an, indem er Haltestellen und bei Bedarf Wegpunkte auf der Karte nacheinander anklickt, wie Perlen auf einer Kette. Das Spiel berechnet die Route zwischen den Perlen über das Straßennetz. Vorhandene OSM-Haltestellen können genutzt oder neue gesetzt werden. Linien lassen sich aktivieren und deaktivieren.

**Richtungen und Kurzläufer.** Die Perlenkette ist die Grundlinie. In einem eigenen Editor bearbeitet der Spieler daraus einzeln die Varianten: jede Richtung für sich (zum Beispiel abweichende Route wegen Einbahnstraßen oder andere Haltestellen) und Kurzläufer, die nur eine Teilstrecke der Linie fahren. Eine Variante hat ihre eigenen Wendepunkte. Das Vorbild ist die Linienbearbeitung in City Bus Manager.

**Linientypen.** Es gibt in Phase 1 nur normale Linien. Nachtbusse und Expressbusse sind keine eigenen Typen, sie erkennt man nur an der Liniennummer (zum Beispiel N1 oder X20). Schulbusse sind einzelne Fahrten auf normalen Linien, keine eigene Linienart. Die Nummer vergibt der Spieler frei.

**Takt und Einzelfahrten.** Der Spieler stellt den Takt je Tageszeit und Tagesart ein, die Tagesarten sind Werktag, Samstag, Sonn- und Feiertag, jeweils mit und ohne Schulferien. Aus dem Takt erzeugt das Spiel die einzelnen Fahrten. Jede Fahrt lässt sich danach verschieben oder streichen, und es lassen sich zusätzliche Fahrten einfügen, zum Beispiel für den Schulbeginn. Dabei darf eine Fahrt auch nur auf einer Variante oder einem Kurzläufer verkehren.

**Fahrzeiten.** Die Fahrzeit zwischen zwei Haltestellen berechnet das Spiel automatisch aus Streckenlänge, erlaubter Geschwindigkeit, Verkehrsdichte nach Tageszeit, Ampeln und Kreuzungen (siehe Zeitmodell). Der Spieler kann sie nicht von Hand ändern. Er kann sie nur indirekt beeinflussen, etwa durch die Routenwahl oder später durch Busspuren und Ampelvorrang.

**Standzeit an Haltestellen.** Dafür stellt der Spieler an jeder Haltestelle eine Standzeit ein, die der Bus mindestens dort bleibt. So lassen sich Umstiege und Anschlüsse planen: Wartet Linie A an der Umsteigehaltestelle genau so lange, dass Linie B erreicht wird, können Fahrgäste umsteigen. Reicht die Standzeit nicht für das Ein- und Aussteigen, verlängert sich der Halt entsprechend und der Bus wird verspätet.

**Wendezeit.** Am Endpunkt jeder Variante gibt es eine einstellbare Wendezeit (Vorschlag). Sie dient als Puffer, damit sich Verspätungen nicht endlos fortpflanzen.

**Einstiegsmodell.** Ob an der vorderen Tür eingestiegen oder an allen Türen, gilt als Standardwert für alle Linien und lässt sich pro Linie abweichend einstellen (siehe Fahrkartenkontrolleure). Vordereinstieg verlängert die Haltezeiten, die das Spiel in die Fahrzeit einrechnet.

**Bedarf an Bussen.** Aus Takt, Fahrzeit und Wendezeit rechnet das Spiel aus, wie viele Busse der Fahrplan braucht. Es warnt bei Engpässen, zum Beispiel wenn zu wenige Busse oder Fahrer vorhanden sind oder ein Bus nicht rechtzeitig zur ersten Fahrt am Stellplatz ist.

**Passt der Bus zur Linie? (Vorschlag)** Das Spiel prüft beim Zuweisen eines Busses, ob er auf die Strecke passt. Grundlage sind Länge und Wendekreis aus dem Fahrzeugkatalog. Ein Gelenkbus auf einer engen Strecke bekommt eine Warnung, kein Verbot.

## Fahrgastfeedback und Bewertungen

Bewertungen ergeben sich aus der Simulation, sie werden nicht gewürfelt. Sie sagen dem Spieler, wo sein Netz gut und wo es schlecht läuft, und sie beeinflussen Nachfrage, Preise und Konzessionen.

**Ebenen.** Bewertet wird auf drei Ebenen: pro Linie, pro Gemeinde und für das ganze Unternehmen. Die Linienbewertung entsteht aus den Kriterien (siehe unten). Die Gemeindebewertung ist der Durchschnitt der Linien in dieser Gemeinde, gewichtet nach Fahrgästen. Die Unternehmensbewertung ist der Durchschnitt aller Gemeinden, gewichtet nach Fahrgästen, und wird zusätzlich von den Beschwerden beeinflusst. Die Skala ist 1 bis 5 Sterne (Vorschlag). Eine neue Gemeinde startet neutral.

**Kriterien.** Vier Kriterien fließen in die Linienbewertung ein:

| Kriterium | Gemessen an (Vorschlag) |
| --- | --- |
| Pünktlichkeit und Ausfälle | Abweichung von der Fahrplanzeit, Anteil ausgefallener Fahrten |
| Sauberkeit und Komfort | Sauberkeit der eingesetzten Busse (pro Bus geführt), Bestuhlung, Klimaanlage, Ausstattung, Alter und Zustand |
| Auslastung | Anteil überfüllter Fahrten, Fahrgäste die nicht mehr mitkommen |
| Takt, Fahrzeit und Preis | Wartezeit an der Haltestelle, Reisezeit mit Umstiegen im Vergleich zu Alternativen, Fahrpreis |

Die Gewichtung der Kriterien liegt in der zentralen Konfigurationsdatei. Die Bewertungen sind träge: Sie folgen einem gleitenden Durchschnitt über mehrere Wochen (Vorschlag), damit ein einzelner schlechter Tag nicht sofort wirkt, dauerhafte Probleme aber sichtbar werden.

**Beschwerden.** Beschwerden werden pro Unternehmen gezählt. Sie entstehen aus schlechten Erlebnissen, zum Beispiel Ausfällen, großen Verspätungen, vollen Bussen oder schmutzigen Fahrzeugen. Der Kundenservice bearbeitet sie in einer Frist. Unbearbeitete Beschwerden senken die Unternehmensbewertung, bearbeitete schwächen die Folgen ab.

**Kommentare.** Zusätzlich zur Note erzeugt das Spiel Fahrgastkommentare, die ein konkretes Problem nennen, mit Bezug auf Linie, Haltestelle und Ursache. Sie landen in einem Postfach, das sich nach Linie, Gemeinde und Kriterium filtern lässt. Es gibt positive und negative Kommentare. Bei hohem Zeitraffer erzeugt das Spiel nur eine Auswahl und fasst den Rest zu Zahlen zusammen.

**Wirkung der Bewertung.** Bewertung wirkt auf zwei Dinge:

- Nachfrage: Die Bewertung einer Linie und Gemeinde verändert, wie viele Reisewünsche den Bus erwägen (siehe Fahrgastmodell). Gut bewertete Linien ziehen mehr Fahrgäste an, schlecht bewertete verlieren sie an andere Verkehrsmittel.
- Preise und Konzessionen: Ein guter Ruf in einer Gemeinde macht Konzessionen dort günstiger und erlaubt höhere Tarife ohne starken Nachfragerückgang, ein schlechter Ruf bewirkt das Gegenteil (Vorschlag).

Bewerber für Stellen und Gemeindeaufträge hängen nicht am Ruf. Aufträge richten sich nach ihren eigenen Bedingungen (Mindestbedienung und Abzüge).

## Haltestellen und Verkehrsinfrastruktur

Haltestellen und Infrastruktur am Straßennetz bestimmen Komfort, Nachfrage und Fahrzeit. Haltestellen lassen sich ausbauen, auf der Strecke kann der Spieler Bevorrechtigungen bauen, und für große Umstiege gibt es Busknotenpunkte.

**Haltestellenausstattung.** Jede Haltestelle kann folgende Ausstattung bekommen, jeweils mit Baukosten und laufendem Unterhalt:

| Ausstattung | Wirkung (Vorschlag) |
| --- | --- |
| Wartehäuschen und Sitzbank | Wetterschutz und Sitzgelegenheit, steigern den Komfort beim Warten |
| Dynamische Fahrgastinformation | Zeigt die nächsten Abfahrten in Echtzeit, senkt die gefühlte Wartezeit |
| Barrierefreiheit | Hochbord, Blindenleitsystem und ebener Zugang, verkürzen die Einstiegszeit und machen die Haltestelle für Rollstuhlnutzer und Eltern mit Kinderwagen nutzbar |
| Beleuchtung | Sicherheit und Komfort bei Dunkelheit, wichtig für Nachtlinien |
| Fahrradständer | Mehr Fahrgäste aus dem Umland, die mit dem Rad zur Haltestelle kommen |
| Ticketautomat | Fahrscheinverkauf an der Haltestelle, verkürzt die Haltezeit bei Vordereinstieg |
| Mülleimer | Hält die Haltestelle sauber, wirkt auf die Bewertung |
| Werbefläche | Bringt Einnahmen, kann den Komfort mindern (siehe Kapitel Werbung) |

**Wirkung der Upgrades.** Die Ausstattung wirkt auf drei Dinge: auf die Bewertung der Haltestelle und damit der Linie (Komfort), auf die Nachfrage an dieser Haltestelle und auf die Haltezeit. Alle Werte stehen in der zentralen Konfiguration. Wirkungen mehrerer Upgrades addieren sich nicht unbegrenzt, sie haben abnehmenden Nutzen.

**Verkehrsinfrastruktur.** Auf der Strecke kann der Spieler diese Bauten errichten oder beantragen:

| Bauwerk | Wirkung (Vorschlag) |
| --- | --- |
| Busspur | Eigene Fahrspur, verkürzt die Fahrzeit auf dem Abschnitt bei hohem Verkehr |
| Ampelvorrang | Bevorrechtigte Schaltung für Busse, verkürzt die Wartezeit an Kreuzungen |
| Busbucht und Bussonderfahrstreifen | Halt neben der Fahrbahn, damit der Bus den Verkehr nicht aufhält, oder abgetrennter Streifen |
| Busstraße | Straße, die nur Busse befahren dürfen, verkürzt Fahrzeit und Umwege |
| Neue Straße | Antrag zum Bau einer neuen Straße, die auch der Individualverkehr nutzt |

**Busknotenpunkte.** Für große Umstiege kann der Spieler Busknotenpunkte wie Zentrale Omnibusbahnhöfe (ZOB) bauen. Sie bestehen aus Modulen und sind flexibler als normale Haltestellen: Bussteige, Überliegerplätze zum Abstellen wartender Busse während der Wendezeit, Fahrgastbereich und Aufenthaltsräume (Vorschlag). Der Spieler setzt die Module in einem eigenen Editor zusammen, ähnlich dem Betriebshof-Editor. Das Detail arbeiten wir später aus.

**Genehmigung.** Gebaut wird nur mit Zustimmung der Gemeinde. Die Gemeinde stimmt grundsätzlich zu, wenn das Grundstück dem Spieler gehört. Werden für einen Plan viel Natur oder Privateigentum beschädigt, sinkt die Zustimmung. Die genauen Schwellen stimmen wir nach dem Programmieren fein ab.

**Bau und Kosten.** Je nach Nutzen baut der Spieler selbst oder die Gemeinde. Die Kosten werden anteilig aufgeteilt, wie hoch der Anteil der Gemeinde ist, richtet sich nach dem Nutzen für die Allgemeinheit. Bauten wie Busspuren und Busstraßen nützen auch anderen Verkehrsteilnehmern oder der Gemeinde, daher zahlt sie dort mehr. Reine Haltestellenausstattung zahlt der Spieler allein (Vorschlag).

## Werbung

Werbung ist von Anfang an Teil des Spiels und zusätzliche Einnahmequelle. Der Spieler vermarktet seine Werbeflächen selbst und kann umgekehrt Werbung für das eigene Unternehmen schalten.

**Werbeflächen.** Es gibt vier Arten, die sich je nach Ausbaustand belegen lassen:

| Fläche | Beispiele | Reichweite hängt ab von |
| --- | --- | --- |
| Außenwerbung am Bus | Seitenfläche, Heck, Vollverklebung | Einsatzlinie, Fahrten und Gebiet |
| Innenwerbung im Bus | Plakate, Bildschirme | Fahrgäste an Bord |
| Haltestellenwerbung | Plakatvitrine im Wartehäuschen, Bildschirm | Fahrgäste und Passanten an der Haltestelle |
| Sponsoring | Ansage einer Haltestelle, Linienname | Zahl der Fahrgäste und Reichweite der Linie |

**Werbekunden.** Die Kunden erzeugt das Spiel als fiktive Firmen mit Branche und Budget. Sie schicken Angebote mit gewünschter Fläche, Laufzeit und Preis pro Monat. Der Spieler nimmt an, lehnt ab oder macht ein Gegenangebot. Ob die Verhandlung klappt, hängt von der Reichweite der Fläche, dem Ruf und der Marktlage ab.

**Preise.** Der Preis einer Fläche schwankt mit Lage und Nachfrage. Innenstadt und stark genutzte Linien bringen mehr, ruhige Randlagen weniger. Er ist verhandelbar, der Spieler kann sich auch auf einen niedrigen Preis einlassen, um eine Fläche zu füllen.

**Verträge.** Jeder Vertrag hat Laufzeit, Fläche und monatlichen Betrag. Fällt eine zugesagte Fläche längere Zeit aus, zum Beispiel weil der Bus nicht fährt, gibt es eine Minderung (Vorschlag).

**Wirkung auf die Zufriedenheit.** Werbung beeinträchtigt die Zufriedenheit generell nur minimal. Je nach Branche kann ein kleiner Teil der Fahrgäste die Werbung ablehnen. Zum Beispiel kann militärische Werbung bei friedensbewegten Fahrgästen auf Ablehnung stoßen, Werbung für vegane Fleischersatzprodukte bei Menschen, die solche Produkte ablehnen. Jede Branche hat dazu einen Polarisierungswert, die Wirkung bleibt klein.

**Darstellung.** Werbung erscheint nur als Zahlen und Verträge. An einem Bus mit Werbung steht eine Anmerkung (Kunde, Fläche, Laufzeit). Werbung wird nicht grafisch auf den Bussen dargestellt.

**Eigenwerbung.** Der Spieler kann für das eigene Unternehmen werben, über Internet, Zeitung, Fernsehen und eigene Fahrzeuge und Haltestellen. Jede Kampagne hat Budget, Dauer und Zielgemeinde, die Kanäle unterscheiden sich in Kosten und Reichweite (Fernsehen breit und teuer, Internet gezielt und günstiger). Die Wirkung ist eine höhere Bekanntheit, die die Nachfrage in der Zielgemeinde steigert, mit abnehmendem Nutzen bei wiederholten Kampagnen (Vorschlag). Eigenwerbung auf eigenen Fahrzeugen belegt eine Fläche, die sonst Einnahmen bringen könnte.

**Technologiebaum (Vorschlag).** Digitale Werbeflächen mit wechselnden Motiven (Bildschirme im Bus und an der Haltestelle) werden über Forschung freigeschaltet und bringen mehr als Plakate.

## Technologiebaum

Forschung schaltet Fahrzeugklassen, Ausstattung, Automatisierung und Verbesserungen frei. Der Aufbau orientiert sich an der Technologieübersicht in City Bus Manager: Karten in Bereichen, manche einmalig, manche in Stufen.

**Kosten und Ablauf.** Jede Technologie kostet Geld, Forschungspunkte und Zeit. Der Spieler startet beliebig viele Projekte gleichzeitig, solange Geld und Punkte reichen. Technologien mit Stufen (zum Beispiel 0 von 5) werden Stufe für Stufe erforscht, jede Stufe bringt den gleichen Nutzen noch einmal. Die Kopfleiste zeigt Kontostand und Forschungspunkte.

**Forschungspunkte.** Die Punkte entstehen durch den Betrieb: gefahrene Kilometer, beförderte Fahrgäste und gute Bewertung (Vorschlag). Wer viel und gut fährt, forscht schneller. Die Umrechnung steht in der zentralen Konfiguration.

**Bereiche.** Die folgende Aufteilung ist ein Vorschlag, der auf deinen Screenshots aufbaut:

| Bereich | Inhalt |
| --- | --- |
| Fahrzeuge | Bauarten freischalten (Mini, Midi, Solo kurz, Solo, Gelenk, Doppelgelenk, Doppeldecker). Innerhalb einer Bauart sind alle aktuellen Modelle kaufbar. Antriebsarten bleiben wie entschieden von Anfang an verfügbar. Verbesserungen in Stufen: Verbrauch, Verschmutzung und Verschleiß je Stufe um 10 Prozent senken, Reichweite um 10 Prozent erhöhen, 10 Prozent schneller laden |
| Fahrzeugausstattung | Klimaanlage, WLAN, USB-Ladeanschlüsse, Premium-Sitze und Kamerasystem als Neukauf-Optionen werden erst nach Forschung wählbar. Die Fahrgastinformation hat Stufen: erst Fallblattanzeiger, dann Punktmatrix-Anzeigen, dann LCD-Monitore, dann LED-Monitore. Ansagen kommen zuerst vom Fahrer und später automatisiert |
| Betrieb und Fahrgäste | Haltestellen-Upgrades freischalten, mobile App entwickeln, Fahrkartenautomat, Ampelvorrang freischalten, digitale Werbeflächen |
| Betriebshof | Nebendepots (externe Depots) freischalten. Das Betriebsgelände wächst weiter über den Kauf von Grundstücken, nicht über Forschung |
| Personal | Automatische Reinigung, Wasch- und Tankvorgänge, Reparatur in Nebendepots, automatische Wartungs- und Dienstplanung, Teile-Nachbestellung; Arbeitsweise der Kontrolleure in Stufen; besseres Essen für Mitarbeiter in Stufen (Zufriedenheit) |
| Werkstatt | Ersatzteilpreise und Reparaturdauer je Stufe um 10 Prozent senken |

**Abhängigkeiten (Vorschlag).** Spätere Technologien setzen frühere voraus, zum Beispiel die automatische Dienstplanung die manuelle Planung mit einer bestimmten Zahl von Fahrern, oder Automatisierung in Nebendepots die Nebendepots selbst. Die Verknüpfungen legt die Konfigurationsdatei fest.

**Nicht übernommen.** Das Einsatzgebiet vergrößern entfällt, weil Gemeinden über Konzessionen und Aufträge freigeschaltet werden. Photovoltaikanlagen am Betriebshof sind ein mögliches späteres Bauteil.

## Schienenverkehr und weitere Verkehrsmittel

Neben dem Bus gibt es weitere Verkehrsmittel, die das Spiel zu einem Verkehrsunternehmen mit mehreren Betriebszweigen machen. In welcher Umsetzungsphase sie kommen, legt der Phasenplan fest. Alles Gemeinsame (Gemeinden, Konzessionen, Personal, Finanzen, Bewertungen, Werbung) gilt auch für sie.

**Verkehrsmittel.** Die Merkmale sind Vorschläge:

| Verkehrsmittel | Merkmale |
| --- | --- |
| Straßenbahn und Stadtbahn | Gleise im oder neben dem Straßenraum, Ampeln und teils Mischverkehr mit Autos, Stadtbahn teils auf eigenem Gleiskörper |
| U-Bahn | Tunnel oder Hochbahn, kreuzungsfrei, hohe Baukosten und hohe Kapazität |
| S-Bahn und Regionalbahn | Eigene Bahnstrecken mit größeren Haltestellenabständen, längeren Zügen und Bahnhöfen |
| Seilbahn | Stationen und Trasse, kontinuierlicher Umlauf, kaum Flächenbedarf am Boden |
| Fähre | Wasserwege mit Anlegern, Fahrzeiten hängen von Strömung und Wetter ab |

**Gleise aus OpenStreetMap als Bauvorlage.** Vorhandene Gleise aus OSM sind keine fertige Infrastruktur, sondern Bauvorlagen (Blueprints). Der Spieler kann sie realitätsgetreu im Spiel bauen und dann nutzen, muss es aber nicht. Er kann sie bearbeiten (verschieben, verkürzen, verändern) und mit eigenen Gleisen erweitern. Komplett eigene Strecken ohne Vorlage sind ebenso möglich. Gebaut wird in einem eigenen Gleisbau-Modus auf der Karte.

**Bau und Kosten (Vorschlag).** Die Baukosten richten sich nach Länge, Art (ebenerdig, Brücke, Tunnel) und Ausrüstung (Elektrifizierung). Gebaut wird mit Zustimmung der Gemeinde, nach denselben Regeln wie die Verkehrsinfrastruktur für Busse (eigenes Grundstück, Natur und Privateigentum). Der Spieler legt Spurweite und Stromsystem der Strecke fest, wobei die Vorlage aus OSM Vorgaben macht, soweit dort vorhanden. Fahrzeuge fahren nur auf passender Spurweite und passendem Stromsystem.

**Linien und Fahrplan.** Linien funktionieren wie Buslinien: Der Spieler legt sie als Perlenkette aus Haltestellen an, jetzt auf dem Gleisnetz, mit Richtungen und Kurzläufern im Editor. Takt, Einzelfahrten, Standzeiten und Wendezeiten gelten genauso. Die Fahrzeit rechnet das Spiel aus Streckentempo, Haltestellen und Fahrzeug. Signaltechnik wird vereinfacht: Das Spiel hält einen Mindestabstand zwischen Zügen auf demselben Abschnitt und zeigt Engpässe an (Vorschlag). Straßenbahnen im Mischverkehr unterliegen Ampeln und Verkehr, Ampelvorrang verkürzt auch ihre Fahrzeiten.

**Betriebshof.** Schienenfahrzeuge nutzen denselben Betriebshof-Editor mit eigenen Bauteilen: Gleisanlage, Abstellgleis, Weiche, Schienenwerkstatt, Fahrleitung und Waschanlage für Bahnen (Vorschlag). Alles andere (Büro, Lager, Pausenräume) wird mit den Bussen geteilt.

**Personal und Fahrzeuge.** Triebfahrzeugführer und Werkstattpersonal für Schienenfahrzeuge sind weitere Personalarten oder Qualifikationen (Vorschlag), mit denselben Dienstplan- und Ruhezeitregeln, soweit sie für den Bahnbetrieb gelten. Der Fahrzeugkatalog hat für Straßenbahnen bereits die Fahrzeugart Tram. Wie weitere Fahrzeugarten (Stadtbahn, U-Bahn, S-Bahn, Seilbahn, Fähre) in den Katalog kommen, entscheiden wir später.

**Umstiege und Verknüpfung.** Haltestellen verschiedener Verkehrsmittel lassen sich zu Umstiegsknoten verknüpfen, zum Beispiel am ZOB oder am Bahnhof. Das Fahrgastmodell berücksichtigt Wege und Wartezeiten beim Umstieg zwischen Bus und Bahn. Ein gemeinsamer Tarif gilt für alle Verkehrsmittel des Unternehmens.

## Oberfläche und Bedienung

Die Oberfläche ist schlicht und auf Deutsch. Alle Texte stehen in der Sprachdatei.

**Hauptfenster.** Die Karte füllt das ganze Fenster. Oben liegt eine Kopfleiste mit Kontostand, Datum und Uhrzeit, der Zeitsteuerung (Pause, 1-fach, Zeitraffer) und den Forschungspunkten. Am Rand liegt eine Menüleiste mit den Bereichen des Spiels, die sich aus den Kapiteln ergeben: Linien, Fahrzeuge, Fahrzeugmarkt, Personal, Betriebshof, Finanzen, Bewertungen, Werbung, Forschung und Meldungen. Listen, Detailansichten und Dialoge öffnen sich als Fenster über der Karte. Der Betriebshof-Editor und der Gleisbau-Modus sind eigene Ansichten, getrennt von der Karte.

**Karten-Ansichten.** Über die Karte lassen sich vier Ansichten legen, jeweils zuschaltbar:

| Ansicht | Zeigt |
| --- | --- |
| Nachfrage und Einzugsgebiet | Farbige Flächen, wo viele Fahrgäste wohnen und hinwollen, und welche Haltestelle sie erreichen |
| Auslastung und Verspätung | Linien farbig nach Auslastung oder Pünktlichkeit |
| Bewertung | Gemeinden und Linien farbig nach Zufriedenheit |
| Verkehrsdichte | Dichte und Geschwindigkeit auf dem Straßennetz |

**Meldungen.** Das Spiel meldet Fälligkeiten (zum Beispiel Wartung, Hauptuntersuchung), Pannen, Beschwerden, neue Aufträge und Werbeangebote auf zwei Wegen: als kurze Einblendungen am Rand und in einer Meldungsliste, die sich nach Art und Linie filtern lässt. Wichtige Meldungen können die Zeit pausieren. Das ist einstellbar, pro Meldungsart.

**Hilfe.** Es gibt kein Tutorial. Bedienelemente haben Hilfetexte, und es gibt ein Hilfemenü.

**Noch offen.** Diese Punkte sind nicht festgelegt und werden vor Beginn der Etappe 1 geklärt, Claude Code baut sie nicht auf eigene Faust: Tastenkürzel, Einstellungen (Grafik, Ton, Autosave), Kartenstil und Zoomstufen, Fahrzeugsymbole auf der Karte, Musik und Geräusche, Barrierefreiheit.

## Phasenplan und Abnahme

Claude Code baut das Spiel in Etappen, nicht in einem Durchgang. Jede Etappe hat ein Ziel, prüfbare Abnahmekriterien und endet erst, wenn alle automatischen Tests grün sind und Koko die Etappe freigegeben hat. Danach beginnt die nächste. Dieses Kapitel ersetzt die Bezeichnung „Phase 1“ im restlichen Dokument: Phase 1 ist die erste spielbare Version, also die Etappen 0 bis 4b.

**Phasen und Etappen.**

| Phase | Etappe | Ziel | Inhalt (Kapitel) |
| --- | --- | --- | --- |
| Phase 1: erste spielbare Version | 0 | Projektgerüst und Testinfrastruktur | App startet, Konfigurationsdatei, Sprachdatei, Testwerkzeuge, automatischer Bau und Test auf Windows und macOS sowie Veröffentlichung der Web-Version auf GitHub Pages (GitHub Actions), Testdatensatz Norderstedt, annahmen.md, fortschritt.md |
|  | 1 | Karte, Welt und Zeit | Gemeinde wählen, OSM-Auszug laden, Straßennetz, Haltestellen, Nachfragegitter, Kalender, Pause und Zeitraffer (Technik, Zeitmodell, Spielwelt, Spielstart) |
|  | 2 | Fahrzeugkatalog und Betriebshof | Katalog einlesen und prüfen, Betriebshof-Editor mit allen Bauteilen, Grundstückskauf, Layout-Gültigkeit, Wege im Hof (Betriebshof-Editor, Katalog) |
|  | 3a | Fahrzeugmarkt und Personal | Neukauf mit Konfiguration, Gebrauchtmarkt, einzelne Personen einstellen, Lohn (Fahrzeugmarkt, Personal) |
|  | 3b | Linien und Fahrplan | Linie als Perlenkette mit Richtungen und Kurzläufern, Takt und Einzelfahrten, automatische Fahrzeiten, Standzeiten, Bedarf an Bussen (Linien und Fahrplan) |
|  | 3c | Dienstplan | Dienste von Hand planen, Lenk- und Ruhezeiten (Personal und Schichtplan) |
|  | 4a | Betrieb und Fahrgäste | Busse fahren die Fahrpläne, Fahrgastmodell, Verspätungen, Tarif und Fahrscheinarten (Zeitmodell, Wirtschaft) |
|  | 4b | Finanzen und Speichern | Einnahmen und Kosten, Kredite, Subventionen, Finanzberichte, Speichern und Laden (Wirtschaft, Finanzen) |
| Phase 2: Tiefe und Balancing | 5 | Zustand, Wartung und Bewertungen | Zustand, Sauberkeit, Wartung, Ersatzteile, Pannen, Wertverlust, Bewertungen, Fahrgastkommentare, Beschwerden, Zufriedenheit (Fuhrpark, Fahrgastfeedback) |
|  | 6 | Balancing und Langzeittests | Bots, Zielkorridore, Parameterläufe, Langzeitläufe (siehe unten) |
| Phase 3: Ausbau | 7a | Haltestellen und Infrastruktur | Haltestellenausstattung, Verkehrsinfrastruktur, Editor für fiktive Busse |
|  | 7b | Werbung und Forschung | Werbung, Technologiebaum |
| Phase 4: weitere Verkehrsmittel | 8 | Schiene und weitere Verkehrsmittel | Erst nach den offenen Festlegungen (Fahrzeugkatalog für weitere Fahrzeugarten, Regelwerk, Busknotenpunkte im Detail), je Verkehrsmittel eine eigene Etappe |

In Phase 1 gibt es noch keinen Verschleiß: Busse behalten ihren Zustand, Wartung und Pannen folgen in Etappe 5. Der Kernzyklus ist damit nach Etappe 4b spielbar, aber noch nicht ausbalanciert.

**Abnahme je Etappe.** Eine Etappe gilt als fertig, wenn alle folgenden Punkte erfüllt sind:

- Alle automatischen Tests der Etappe und aller vorherigen Etappen sind grün.
- Der Rauchtest läuft durch: Spiel starten, Gemeinde wählen, Betriebshof bauen, Bus kaufen, Fahrer einstellen, Linie anlegen, einen Spieltag simulieren, speichern, laden. Der Rauchtest wird mit jeder Etappe um die neuen Schritte erweitert.
- Claude Code liefert einen kurzen Bericht: was gebaut ist, welche Tests laufen, welche Einträge neu in annahmen.md stehen und welche Fragen offen sind.
- Koko spielt die Etappe und gibt sie frei oder nennt Änderungen. Erst danach geht es weiter.

**Abnahmekriterien pro Etappe (Beispiele, Claude Code ergänzt sie vor Beginn der Etappe und lässt sie von Koko bestätigen).**

| Etappe | Automatisch geprüft |
| --- | --- |
| 0 | App startet, Test-Befehl läuft grün, Konfigurations- und Sprachdatei werden geladen, Testdatensatz Norderstedt liegt im Projekt, der automatische Bau und alle Tests laufen auf Windows und macOS grün, die Web-Version ist unter der Pages-Adresse erreichbar und startet |
| 1 | Norderstedt lädt offline, Routing zwischen zwei Haltestellen liefert eine Route auf dem Straßennetz, Nachfragegitter ist nicht leer, Zeit läuft in festen Schritten und ist bei Pause stehen geblieben |
| 2 | Katalog wird eingelesen, falsche oder fehlende Spaltennamen werden gemeldet, Layout ohne Zufahrt ist ungültig, Bus erreicht jeden Stellplatz, Grundstück höchstens 10 Hektar |
| 3a | Neukauf bucht Geld ab und stellt den Bus auf einen freien Platz, Gebrauchtangebote erneuern sich, eingestellte Person kostet Lohn |
| 3b | Linie mit Kurzläufer erzeugt die richtigen Fahrten, Bedarf an Bussen stimmt mit Handrechnung überein, Fahrzeiten sind auf 10 Sekunden gerundet |
| 3c | Dienst mit Lenkzeitverletzung lässt sich nicht speichern, freie Fahrten werden angezeigt |
| 4a | Ein Spieltag mit fester Zufallszahl liefert immer dasselbe Ergebnis, Busse halten die berechneten Fahrzeiten ein, Tarif wirkt auf Einnahmen |
| 4b | Einnahmen und Kosten stimmen mit der Summe der Einzelposten überein, Speichern und Laden ergibt denselben Zustand, Finanzberichte zeigen dieselben Zahlen wie das Konto |
| 5 | Zustand sinkt mit Kilometern und steigt durch Wartung, ohne Teile bleibt der Bus in der Werkstatt, Bewertung folgt den Kriterien |
| 6 | Siehe Balancing |
| 7a | Jede Ausstattung und jedes Bauwerk wirkt wie beschrieben auf Fahrzeit, Nachfrage oder Bewertung, fiktive Busse aus dem Editor sind nutzbar |
| 7b | Werbeverträge bringen Einnahmen wie berechnet, Technologien kosten und schalten frei wie beschrieben |

**Teststrategie.** Claude Code schreibt zu jeder Funktion Tests mit und führt sie vor jeder Abgabe aus:

- Einzeltests für Formeln und Regeln (Preise, Wertverlust, Lenkzeiten, Kosten).
- Simulationstests ohne Grafik mit fester Zufallszahl, damit Ergebnisse wiederholbar sind.
- Oberflächentests mit automatisch gestarteter App und Screenshots, die Claude Code selbst ansieht.
- Rauchtest durch den ganzen Kernzyklus.
- Regressionstests: Ein einmal behobener Fehler bekommt einen eigenen Test.

Alles läuft mit einem einzigen Befehl. Ein Test, der nach einer Änderung rot wird, muss behoben werden, bevor Claude Code weiterbaut. Tests dürfen nicht gelöscht oder abgeschwächt werden, damit sie wieder grün werden.

**Balancing und Langzeittests (Etappe 6).** Claude Code prüft die Wirtschaft automatisch, kann aber Spielspaß nicht beurteilen.

- Bots: Einfache Spielstrategien (gut geführt, mittelmäßig, schlecht geführt) spielen Testregionen ohne Grafik in hoher Geschwindigkeit, zum Beispiel zehn Spieljahre in einem Lauf.
- Zielkorridore: Claude Code recherchiert reale Kennzahlen (zum Beispiel Kosten je Buskilometer, Lohn je Stunde, Fahrgäste je Fahrt) mit Quellen und schlägt Korridore vor, die in annahmen.md stehen und von Koko bestätigt werden. Ein gut geführtes Unternehmen soll im Korridor Gewinn machen, ein schlecht geführtes nicht.
- Parameterläufe: Wichtige Stellschrauben der Konfiguration werden systematisch variiert, der Bericht zeigt, welche das Ergebnis am stärksten verändern.
- Langzeitprüfungen: Das Spiel stürzt in langen Läufen nicht ab, Geschäftszahlen laufen nicht aus dem Ruder (keine unendlichen Beträge, keine Brüche), kein Bus bleibt dauerhaft hängen, Speichern und Laden bleiben nach vielen Jahren stimmig, Speicher und Rechenzeit bleiben im Rahmen des Leistungsziels.
- Ergebnis ist ein Bericht mit Zahlen und Diagrammen. Ob das Spiel sich gut anfühlt, entscheidet Koko durch Spielen. Seine Rückmeldungen fließen in die Konfiguration.

**Arbeitsanleitung für Claude Code (Inhalt der CLAUDE.md im Projekt).**

- Dieses Dokument ist die Quelle der Wahrheit. Was nicht darin steht, wird nicht gebaut.
- Arbeite eine Etappe nach der anderen, in der Reihenfolge der Tabelle. Beginne eine Etappe erst nach Freigabe der vorherigen.
- Vor Beginn jeder Etappe: Schreibe die Abnahmekriterien der Etappe auf und lasse sie bestätigen.
- Teste vor jeder Abgabe mit dem Testbefehl und dem Rauchtest. Gib nichts ab, solange ein Test rot ist, auf Windows oder auf macOS.
- Fehlt ein Wert, wähle einen realistischen, lege ihn in die Konfiguration und trage ihn mit Begründung in annahmen.md ein.
- Führe fortschritt.md: was ist fertig, was ist offen, was wurde geändert.
- Alle Texte der Oberfläche stehen in der Sprachdatei, alle Zahlenwerte in der Konfiguration.
- Weiche von der empfohlenen Technik nur mit Begründung ab und melde es.
- Der Fahrzeugkatalog fahrzeugkatalog.xlsx wird nur gelesen, nie verändert, und die Spaltennamen sind fest.
- Frage Koko bei Unklarheiten, statt zu raten, wenn es um Funktionen und Regeln geht. Bei Zahlenwerten gilt die Regel mit annahmen.md.

**Voraussetzungen auf Kokos Rechnern.** Claude Code baut und testet auf Kokos Rechner, zuerst auf dem Windows-PC. Dafür nötig: Git, Node.js, Rust mit den Microsoft C++ Build Tools und WebView2. Claude Code prüft diese Voraussetzungen zu Beginn von Etappe 0 und meldet, was fehlt. Für macOS gelten die Xcode Command Line Tools, Node.js und Rust. Da Claude Code auf einem Rechner jeweils nur ein System selbst bauen kann, richtet es in Etappe 0 einen GitHub-Workflow (GitHub Actions) ein, der die App bei jeder Abgabe auf Windows und macOS baut und alle Tests ausführt. Koko spielt jede Etappe auf beiden Systemen und in der Web-Version, bevor er sie freigibt. Das GitHub-Repository ist öffentlich (Gratis-Konto, damit Actions und Pages ohne Minutenlimit laufen), sein Name ist eine zufällige, schwer zu erratende Zeichenfolge. Die Seite ist dadurch nur schwer auffindbar, nicht geschützt. Es dürfen keine Zugangsdaten und keine privaten Daten im Repository liegen.&#32;

## Wirtschaft und Tarif

Tarife und Wirtschaftsparameter sind frei einstellbar. Claude Code baut das Wirtschaftssystem und balanciert es so, dass ein vernünftig geführtes Unternehmen mit realistischen Preisen Gewinn machen kann, ein schlecht geführtes aber nicht.

**Tarif.** Der Spieler wählt pro Unternehmen oder pro Gemeinde zwischen Einheitspreis, Preis nach Entfernung und Zonenpreis. Preise, Ermäßigungen und Tageskarten sind frei einstellbar. Der Preis wirkt auf die Nachfrage: Teure Fahrten werden seltener gebucht.

**Einnahmen.** Fahrscheinerlöse, Subventionen, Gemeindeaufträge und Werbung.

**Kosten.** Personal, Kraftstoff oder Strom, Wartung und Ersatzteile, Grundstück und Gebäude, Versicherung und Verwaltung, später Kreditzinsen.

**Balancing.** Claude Code soll die Kostenwerte an realen Größenordnungen ausrichten (Kosten pro Buskilometer, Lohn pro Stunde, Fahrgäste pro Fahrt) und das Spiel mit automatisierten Testläufen prüfen. Beispiele für Testläufe: eine kleine Gemeinde mit zwei Linien und ein Großstadtbezirk mit zehn Linien, jeweils über ein Spieljahr. Die Ergebnisse (Gewinn, Auslastung, Verspätungen) müssen plausibel sein. Alle Stellschrauben liegen in einer zentralen Konfigurationsdatei, damit das Balancing später ohne Codeänderung möglich ist.

## Finanzen

Die Finanzen ergänzen das Wirtschaftssystem um Kredite, Subventionen und Übersichten. Alle Beträge laufen in Euro, weitere Währungen kommen später.

**Kredite.** Der Spieler kann bei einer Bank Kredite aufnehmen. Wie viel er bekommt und zu welchem Zins, hängt von der Bonität des Unternehmens ab, die sich aus Eigenkapital, Gewinn der letzten Monate und bestehender Verschuldung ergibt (Vorschlag). Ein Kredit hat Betrag, feste Laufzeit und einen Zinssatz, der bei Aufnahme festgelegt wird. Der Spieler tilgt in monatlichen Raten, Sondertilgungen sind möglich, und mehrere Kredite können gleichzeitig laufen. Zinsen sind Kosten.

**Subventionen.** Es gibt drei Arten, die sich an realen Förderungen orientieren:

| Art | Wofür | Wirkung (Vorschlag) |
| --- | --- | --- |
| Förderung für Elektrobusse | Kauf von Elektrobussen und Ladepunkten | Anteil am Kaufpreis, der als Zuschuss zurückfließt, mit Obergrenze pro Bus |
| Ausgleich für Schüler- und Sozialtickets | Einnahmeausfälle durch vergünstigte Tickets | Erstattung eines Teils des Differenzbetrags zum Normalpreis |
| Defizitausgleich der Gemeinde | Verluste auf bestellten Linien (Gemeindeaufträge) | Die Gemeinde gleicht den Verlust ganz oder teilweise aus, mit Obergrenze |

Alle Prozentsätze und Obergrenzen liegen in der zentralen Konfigurationsdatei.

**Subventionsmodus.** Im Einrichtungsdialog wählt der Spieler, wie Subventionen funktionieren: realistisch mit den drei Arten oben, oder einfach mit einem festen Prozentsatz vom Umsatz als Zuschuss, wie in City Bus Manager. Das ist eine Spieleinstellung und keine Schwierigkeitsstufe, weil das Spiel weiter keine Schwierigkeitsstufen kennt. Der Prozentsatz im einfachen Modus ist einstellbar.

**Kontostand im Minus.** Das Konto darf ins Minus rutschen. Es gibt nur Warnungen, keine Zwangsmaßnahmen und kein Spielende. Ein negativer Kontostand kostet Sollzinsen (Vorschlag).

**Finanzberichte und Diagramme.** Das Spiel zeigt Einnahmen und Kosten übersichtlich nach Kostenart, Linie, Bus, Gemeinde und Zeitraum (Tag, Woche, Monat, Jahr). Diagramme zeigen den Verlauf von Kontostand, Gewinn und Fahrgästen, Tabellen zeigen die Kosten je Buskilometer und die Einnahmen je Fahrgast. Der Spieler sieht so, welche Linien und Busse Geld verdienen und welche kosten. Abgerechnet wird monatlich (Vorschlag), Gehalt, Kreditraten und Zinsen fallen am Monatsende an.

## Entscheidungen und nächste Module

**Entschiedene Fragen zum Kernzyklus.**

- Betriebshof-Grundstück: höchstens 10 Hektar, der Preis richtet sich nach Lage und Fläche
- Raster im Betriebshof-Editor: variabel, kleinste Rastergröße 1 Meter
- Konzession: dauerhaft, kein Auslaufen und keine Verlängerung
- Währung: zunächst nur Euro, weitere Währungen vielleicht später
- Schwierigkeitsstufen: keine, nur das frei einstellbare Startkapital
- Neukauf nur aktuelle Modelle (im\_neukauf = ja), eingestellte Modelle nur gebraucht; der Gebrauchtbusmarkt ist von Anfang an verfügbar
- Fiktive Busse: Excel-Datei spielstandsübergreifend, Editor im Spiel pro Spielstand
- O-Busse und Oberleitungen: erst mit dem Infrastruktur-Modul, bis dahin nicht kaufbar
- Flottengröße: nur durch Betriebshoffläche und Geld begrenzt
- Personal in Phase 1: Fahrer, Werkstatt, Büro, Fahrkartenkontrolleure, Reinigungskräfte, Kundenservice, als einzelne Personen
- Dienstplanung: zu Beginn manuell, Automatik per Forschung
- Lenk- und Ruhezeiten: realistisch, Verstöße nicht möglich
- Mechaniker: keine Hochvolt-Qualifikation, alle dürfen alle Busse warten
- Einstiegsmodell (Vordereinstieg oder alle Türen): Standardwert fürs Unternehmen, pro Linie abweichend einstellbar
- Sauberkeit pro Bus, Beschwerden pro Unternehmen
- Linien: Perlenkette mit Richtungen und Kurzläufern im Editor bearbeitbar, nur normale Linien, Nacht- und Expressbusse nur über die Liniennummer, Schulbusse als einzelne Fahrten
- Fahrplan: Takt erzeugt Einzelfahrten, die verschiebbar und streichbar sind
- Fahrzeiten: nur automatisch, Standzeit an Haltestellen einstellbar, alle Zeiten auf 10 Sekunden genau
- Neukauf: sofort verfügbar, konfigurierbar (Batteriegröße, Türen und Varianten, Lackierung, Bestuhlung, Spiegelart, Ausstattung)
- Gebrauchtangebote: vom Spiel erzeugt, Zustand vor dem Kauf nur als Spanne sichtbar
- Elektrobusse: von Anfang an kaufbar, Laden im Betriebshof per Stecker am Ladeplatz, Streckenladung später
- Ladepunkt: nur ein Typ, Ladeleistung vom Spieler einstellbar
- Bewertungen: pro Linie, Gemeinde und Unternehmen, aus den Kriterien Pünktlichkeit und Ausfälle, Sauberkeit und Komfort, Auslastung sowie Takt, Fahrzeit und Preis
- Anzeige: Gesamtnote plus erzeugte Fahrgastkommentare
- Wirkung des Rufs: nur auf Nachfrage sowie Preise und Konzessionen, nicht auf Bewerber oder Gemeindeaufträge
- Kredite: Bankkredit mit Bonität, feste Laufzeit mit Tilgung
- Subventionen: Elektrobus-Förderung, Ausgleich für Schüler- und Sozialtickets, Defizitausgleich der Gemeinde; optional einfach als fester Prozentsatz vom Umsatz
- Kontostand im Minus: nur Warnung, keine Zwangsmaßnahmen, kein Spielende
- Finanzberichte nach Kostenart, Linie, Bus, Gemeinde und Zeitraum mit Diagrammen
- Haltestellenausstattung: Wartehäuschen und Sitzbank, Fahrgastinformation, Barrierefreiheit, Beleuchtung, Fahrradständer, Ticketautomat, Mülleimer, Werbefläche; Wirkung auf Komfort, Nachfrage und Haltezeit
- Verkehrsinfrastruktur: Busspuren, Ampelvorrang, Busbuchten und Bussonderfahrstreifen, Busstraßen, Antrag für neue Straßen, modulare Busknotenpunkte (ZOB mit Überliegerplätzen)
- Bauen: mit Zustimmung der Gemeinde (eigenes Grundstück generell, bei viel Natur oder Privateigentum eher nicht), Spieler oder Gemeinde baut, Kosten je nach Nutzen anteilig; Feinabstimmung nach dem Programmieren
- Werbung: von Anfang an dabei, Eigenvermarktung mit fiktiven Kunden, Preis nach Lage und Nachfrage und verhandelbar
- Werbung wirkt nur minimal auf die Zufriedenheit, je nach Branche leicht polarisierend; Darstellung nur als Zahlen, Verträge und Anmerkung am Bus
- Eigenwerbung über Internet, Zeitung, Fernsehen und eigene Fahrzeuge möglich
- Technologiebaum: Forschung kostet Geld, Forschungspunkte und Zeit, mehrere Projekte parallel, Stufen möglich
- Forschungspunkte: durch den Betrieb (Kilometer, Fahrgäste, Bewertung)
- Freischaltung: Bauarten per Forschung, innerhalb einer Bauart alle aktuellen Modelle kaufbar; Komfortausstattung und Kamerasystem erst nach Forschung; Fahrgastinformation in Stufen (Fallblatt, Punktmatrix, LCD, LED), Ansagen erst vom Fahrer, dann automatisch
- Weitere Verkehrsmittel: Straßenbahn und Stadtbahn, U-Bahn, S-Bahn und Regionalbahn, Seilbahn und Fähre
- Gleise: OSM-Gleise sind Bauvorlagen, die man bauen, bearbeiten und erweitern kann, aber nicht muss; eigene Strecken ebenfalls möglich
- Betriebshof für Schienenfahrzeuge: gleicher Editor mit eigenen Bauteilen
- Fahrzeugkatalog für weitere Fahrzeugarten: später entscheiden
- Oberfläche: Karte vollflächig mit Kopfleiste und Menüleiste, vier Karten-Ansichten (Nachfrage, Auslastung und Verspätung, Bewertung, Verkehrsdichte), Meldungsliste mit Filter und einstellbarer Pause, kein Tutorial nur Hilfetexte
- Etappenaufteilung: 3a, 3b, 3c, 4a, 4b, 7a, 7b

**Nächste Module, die wir ausarbeiten.**

1. Betriebshof-Editor im Detail (Bauteile, Kapazitäten, Betriebsabläufe), Kapitel steht
2. Fuhrpark, Ersatzteile und Wartung, Kapitel steht
3. Fahrzeugmarkt (Neu und gebraucht), Kapitel steht
4. Personal und Schichtplan, Kapitel steht
5. Linien und Fahrplan, Kapitel steht
6. Haltestellen-Upgrades und Verkehrsinfrastruktur (Busspuren, Ampelvorrang), Kapitel steht
7. Fahrgastfeedback und Bewertungen, Kapitel steht
8. Finanzen: Kredite, Subventionen, Berichte, Kapitel steht (mehrere Währungen später)
9. Technologiebaum, Kapitel steht
10. Schienenverkehr und weitere Verkehrsmittel, Kapitel steht
11. Phasenplan für die Umsetzung durch Claude Code, Kapitel steht
12. Oberfläche und Bedienung, Kapitel steht (offene Punkte siehe Kapitel)
