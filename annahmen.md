# Annahmen

Einträge, die Koko prüft. Jeder Wert steht in der zentralen Konfiguration (`src/config/config.json`).

## Etappe 0

| Nr. | Wert | Gewählt | Begründung |
| --- | --- | --- | --- |
| A0-1 | Simulationstakt `sim.tickRealMs` | 100 ms (10 Takte pro Sekunde) | Fein genug für flüssige Bewegung, grob genug für 60-fachen Zeitraffer mit vielen Bussen. Spielzeit pro Takt = Tempo mal Takt. |
| A0-2 | Nachholgrenze `sim.maxCatchUpTicks` | 20 Takte | Nach einer Pause des Browser-Tabs rechnet die Simulation nicht Minuten nach, sondern höchstens 2 Sekunden. |
| A0-3 | Geschwindigkeitsstufen `sim.speeds` | 0, 1, 10, 60, 240, 600 (Tasten 1 bis 5) | Seit 25.11.2026 aus dem Konzept (vorher 1, 5, 20, 60). Der Takt bleibt fest bei 100 ms, die Spielzeit je Takt ist Stufe mal 0,1 s (bei 600-fach 60 s je Takt). |
| A0-4 | Kartenmitte und Zoom | Norderstedt, Zoom 12 | Nur Startansicht des leeren Kartenrahmens. |
| A0-5 | Testdatensatz als gzip-JSON im Overpass-Format | `norderstedt.osm.json.gz` (2,3 MB) | Eine Datei, Web und Desktop lesen sie gleich. Die Geofabrik-Datei für Schleswig-Holstein wäre viel größer und müsste erst zugeschnitten werden. Overpass liefert genau die Gemeindegrenze. |
| A0-6 | Speicher-Tabelle und Format | Ein Datensatz je Spielstand: Version, Zeitpunkt, Inhalt als JSON | Einfach und für beide Speicher gleich. Das Format der Spielstände füllt sich ab Etappe 4b. |
| A0-7 | Startversion der Speicherstände | 1 | Erste Version. Ältere Stände bleiben ladbar, neuere als die App kennt werden abgelehnt. |
| A0-8 | Platzhalter-Symbol der App | Einfarbige blaue Fläche | Nur damit der Bau funktioniert. Ein richtiges Symbol ist keine Funktion des Konzepts. |
| A0-9 | Hash-Test des Fahrzeugkatalogs | SHA-256 in `fahrzeugkatalog.sha256`, Neusetzen mit `npm run katalog:hash` | Nach deiner Vorgabe: Der Test meldet jede Veränderung der Datei. Nur bei bewusstem Austausch setzt man den Hash neu. |
| A0-10 | Bekannte `npm audit`-Warnungen | 2 Warnungen mittlerer Stufe: `uuid` in `exceljs` | Koko hat entschieden, sie nicht zu beheben. Sie betreffen nur das Lesen der lokalen Katalogdatei, keine Eingaben von außen. |
| A0-11 | Veröffentlichung auf Pages in zwei Jobs | Bau und Upload in einem Job, `deploy-pages` in einem eigenen | Ein Job fand das Artefakt manchmal nicht, weil die Artefaktliste Bruchteile einer Sekunde nach dem Upload noch leer war. |
| A0-12 | Overpass-Nutzung | Tests laden nie live von Overpass, nur den festen Datensatz im Projekt | Entscheidung von Koko. Live-Abfragen für weitere Regionen nur auf ausdrücklichen Wunsch des Spielers und mit Rücksicht auf die Nutzungsgrenzen. |

## Oberfläche (von Koko bestätigt, steht jetzt auch im Konzept)

Gebaut wird nur, was die jeweilige Etappe davon braucht.

| Nr. | Thema | Festlegung | Etappe 1 baut davon |
| --- | --- | --- | --- |
| O-1 | Tastenkürzel (fest, nicht änderbar) | Leertaste: Pause und Weiter. Tasten 1 bis 5: Geschwindigkeitsstufen. Strg+S (Mac: Cmd+S): Speichern. Esc: schließt Fenster. Karte verschieben mit gedrückter Maustaste, zoomen mit dem Mausrad. | Leertaste, Tasten 1 bis 5, Esc, Karte verschieben und zoomen. Strg+S erst mit dem Speichern in Etappe 4b. |
| O-2 | Einstellungen | Nur Ton an oder aus, Intervall des Autosave, Textgröße. | Nichts (kein Einstellungsfenster in Etappe 1). |
| O-3 | Kartenstil | Ruhiger, heller OSM-Stil mit gut lesbaren Straßen (nach Bedeutung gestaffelt), Wasser, Grün und Gebäuden. Zoomstufen vom ganzen Stadtgebiet bis zur einzelnen Haltestelle. | Stil mit Straßen nach Bedeutung, Gebäuden, Grün, Wasser, Haltestellen. Zoomstufen als Konfigurationswerte. |
| O-4 | Fahrzeugsymbole | Farbige Punkte in der Linienfarbe, ab starkem Zoom eine kleine Busform mit Fahrtrichtung. | Nichts (es gibt noch keine Fahrzeuge). |
| O-5 | Ton | In Phase 1 kein Ton. Der Schalter in den Einstellungen bleibt ohne Wirkung. | Nichts. |
| O-6 | Barrierefreiheit | Ausreichender Farbkontrast, Informationen nicht nur über Farbe (zusätzlich Symbol oder Muster), alle Menüs mit der Tastatur bedienbar. | Gilt für alles, was Etappe 1 baut (Kontrast, Symbol zusätzlich zur Farbe, Tastaturbedienung). |

## Etappe 1

### Zielkorridore Norderstedt

| Nr. | Größe | Korridor | Quelle | Ergebnis des Modells |
| --- | --- | --- | --- | --- |
| A1-K1 | Einwohner | 56.000 bis 104.000 (80.000 plus/minus 30 Prozent, Vorgabe Koko) | Stadt Norderstedt, Zahlen, Daten, Fakten: 85.547 Einwohner am 31.12.2025 (https://www.norderstedt.de/Politik-und-Rathaus/Stadtportrait/Zahlen-Daten-Fakten/). Pendleratlas: 81.880 Einwohner. | 85.688 |
| A1-K2 | Arbeitsplätze | 25.918 bis 48.134 (37.026 plus/minus 30 Prozent) | Pendleratlas nach der Pendlerstatistik der Bundesagentur für Arbeit, Stand 2023: 27.250 Einpendler und 9.776 Binnenpendler, zusammen 37.026 sozialversicherungspflichtig Beschäftigte am Arbeitsort (https://pendleratlas.de/schleswig-holstein/kreis-segeberg/norderstedt/). Zum Vergleich: Wohnungsmarktprofil der IB.SH, 35.873 sozialversicherungspflichtig Beschäftigte 2023. | 40.967 |

Das Modell schätzt Arbeitsplätze, die mit sozialversicherungspflichtig Beschäftigten vergleichbar sind. Beamte, Selbständige und geringfügig Beschäftigte sind darin nicht gesondert enthalten.

### Straßennetz und Routing

| Nr. | Wert | Gewählt | Begründung |
| --- | --- | --- | --- |
| A1-1 | Zeitzuschlag je Ampel `roads.ampelZuschlagS` | 15 s | Im Konzept nicht festgelegt (Vorgabe Koko: pauschaler Zuschlag). Übliche Umlaufzeiten städtischer Ampeln liegen bei 60 bis 90 s, ein Bus trifft im Mittel etwa die Hälfte der Ampeln bei Rot und wartet dann im Mittel die halbe Rotzeit. Das ergibt 10 bis 20 s je Ampel. |
| A1-2 | Zeitzuschlag je Kreuzung ohne Ampel `roads.kreuzungZuschlagS` | 2 s | Das Konzept nennt Kreuzungen als Teil der Fahrzeit. Abbremsen und Vorfahrt achten an Knoten mit drei oder mehr Armen. |
| A1-3 | Standardgeschwindigkeit je Straßenklasse ohne maxspeed `roads.defaultSpeedKmh` | zum Beispiel Hauptstraßen 50, Wohnstraßen 30, verkehrsberuhigt 7, Autobahn 100 km/h | Innerorts gilt in Deutschland 50 km/h, Wohngebiete sind meist Tempo-30-Zonen, verkehrsberuhigte Bereiche Schrittgeschwindigkeit, Busse auf Autobahnen höchstens 100 km/h. |
| A1-4 | Für Busse befahrbare Straßen `roads.busHighways` | Autobahn bis Wohnstraße, verkehrsberuhigte Bereiche, Busstraßen. Wirtschaftswege (service) nur mit bus=yes | Fuß-, Rad- und Feldwege sind für Busse nicht befahrbar. Zufahrten (service) sind meist privat, Busbahnhöfe sind in OSM mit bus=yes markiert. |
| A1-5 | Wenden | Nur in Sackgassen | Linienbusse wenden nicht mitten auf der Straße. |
| A1-6 | Abbiegeregeln mit Weg als "via" | werden nicht ausgewertet. Mit dem Rand von 2 km bleiben 13 von 215 Regeln unberücksichtigt (Weg als "via", Ausnahme für Busse oder unvollständige Relation); vorher 17 von 131. Von Koko akzeptiert. | Weg als "via" ist selten und aufwendig. Regeln mit Knoten als "via" werden ausgewertet, Ausnahmen für Busse (except=bus oder psv) beachtet. |
| A1-7 | Haltestellen | highway=bus_stop, dazu Bussteige (public_transport=platform mit bus=yes) ohne bus_stop-Knoten im Umkreis von 15 m | Vermeidet doppelte Haltestellen, wenn Haltestelle und Bussteig beide erfasst sind. |
| A1-8 | Zuordnung der Haltestelle zur Straße | Fangradius 60 m; neben der Straße zählt die rechte Fahrtrichtung, direkt auf der Straße beide Richtungen | Rechtsverkehr. Mit 60 m werden alle 259 Haltestellen in Norderstedt zugeordnet. |

### Nachfragegitter

| Nr. | Wert | Gewählt | Begründung |
| --- | --- | --- | --- |
| A1-9 | Zellgröße `demand.zellgroesseM` | 250 m | Etwa drei Minuten Fußweg, fein genug für Einzugsbereiche von Haltestellen. |
| A1-10 | Wohnfläche je Einwohner | 47,4 m² | Größenordnung der Wohnfläche je Einwohner in Deutschland laut Statistischem Bundesamt (rund 47 m² in den letzten Jahren). |
| A1-11 | Wohnanteil der Geschossfläche | 80 Prozent | Wände, Treppenhäuser und Keller zählen nicht zur Wohnfläche. |
| A1-12 | Geschosse ohne Angabe in OSM | Einfamilienhaus 1,5, Mehrfamilienhaus 4, Wohngebäude 2,5, unbestimmtes Gebäude 2, Arbeitsgebäude 1,5 | Einfamilienhäuser mit ausgebautem Dachgeschoss, Gewerbehallen meist eingeschossig. |
| A1-13 | Fläche je Arbeitsplatz | Büro 25 m², Gewerbe 60 m², Einzelhandel 45 m², Industrie 90 m², Lager 150 m², Schule 120 m², sonstige 80 m² | Erfahrungswerte der Flächenplanung je Nutzung. Gewerbe zuerst mit 35 m² ergab 69.313 Arbeitsplätze, deutlich über dem Korridor. 60 m² passt zu gemischt genutzten Gewerbebauten mit Hallenanteil. **Nur an Norderstedt kalibriert: muss in Etappe 6 an einer zweiten Region gegengeprüft werden.** |
| A1-14 | Gebäude ohne Art (building=yes) | Nutzung aus der umgebenden Landnutzung; außerhalb von Wohn- und Gewerbeflächen zur Hälfte als Wohnen gezählt | Viele Wohnhäuser sind in OSM nur als building=yes erfasst. |
| A1-15 | Nebengebäude | Garagen, Schuppen, Carports, Parkhäuser und Gebäude unter 30 m² zählen nicht | Dort wohnt und arbeitet niemand. |
| A1-16 | Orte von Interesse | Kategorien Schule, Einkauf, Freizeit, Versorgung aus amenity, shop und leisure | Entsprechen den Reisezwecken im Konzept (Schule, Einkauf, Freizeit), Versorgung für Ärzte, Ämter und Krankenhäuser. |

### Gebiete und Kalender

| Nr. | Wert | Gewählt | Begründung |
| --- | --- | --- | --- |
| A1-17 | Schwellenwert für Subdivisionen `world.teilungAbEinwohnern` | 250.000 geschätzte Einwohner | Teilt Großstädte wie Hamburg und Berlin, lässt mittlere Städte ganz. Verglichen wird mit der eigenen Schätzung, damit es weltweit gleich funktioniert. |
| A1-18 | Bundesland der Gemeinde | Tag ISO3166-2 an der Grenze, sonst die ersten zwei Stellen des amtlichen Gemeindeschlüssels | Norderstedt hat kein ISO-Tag, aber den Gemeindeschlüssel 01060063 (01 = Schleswig-Holstein). |
| A1-19 | Feiertage ohne bekanntes Bundesland | Nur die neun bundesweit einheitlichen Feiertage | Vorgabe Koko, vorläufig auch für andere Länder. |
| A1-20 | Feiertage, die nur in Teilen eines Landes gelten | Mariä Himmelfahrt gilt für ganz Bayern, Fronleichnam in Sachsen und Thüringen sowie das Augsburger Friedensfest entfallen | In Bayern hat die große Mehrheit der Gemeinden Mariä Himmelfahrt. Die Fronleichnamsgemeinden in Sachsen und Thüringen sind wenige. |
| A1-21 | Schulferien Schleswig-Holstein | Ab Weihnachten 2026 bis Himmelfahrt 2031 | Landesverordnung über Ferientermine 2024/25 bis 2030/31 (https://www.schleswig-holstein.de/DE/landesregierung/themen/bildung-hochschulen/ferientermine, Stand 27.10.2026). Die Seite nennt frühere Termine nicht mehr. Bewegliche Ferientage legt jede Schule selbst fest und sind nicht enthalten, ebenso die Sonderregeln für die Inseln. |
| A1-22 | Schulferien Hamburg | Schuljahre 2024/25 bis 2029/30 mit Brückentagen und Halbjahrespausen | Ferienordnung für die Schuljahre 2024/25 bis 2029/30 in Hamburg (https://dokumente.hamburg.de/resource/blob/134372/5bc131bdd36a604f67b361d21f7df37e/ferienordnung-hamburg-2024-2030-data.pdf). Brückentage und Halbjahrespausen sind unterrichtsfrei und zählen deshalb wie Ferien. |
| A1-23 | Schulferien anderer Länder und Jahre ohne Tabelle | Keine Schulferien | Vorgabe Koko, vorläufig. |
| A1-24 | Jahreszeit | Meteorologisch (Frühling März bis Mai usw.), auf der Südhalbkugel umgekehrt | Einfach und eindeutig. |
| A1-25 | Spielzeit | Start mit Datum und Uhrzeit des Rechners, auf die Minute; keine Zeitzonen und keine Sommerzeitumstellung im Spiel | Das Konzept verlangt den Start in der Gegenwart. Eine Zeitumstellung würde Fahrpläne mitten in der Nacht verschieben. |
| A1-26 | Standard-Startkapital `setup.startkapitalStandard` | 2.000.000 Euro | Nur Vorbelegung, frei änderbar. Reicht für einen kleinen Betriebshof und einige Gebrauchtbusse. |
| A1-27 | Abbruch eines Ladevorgangs | Bei Fehler zurück zur Einrichtung | Klare Rückmeldung statt halb geladener Welt. |

### Nachträge nach der Freigabe von Etappe 1 (25.11.2026)

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A1-28 | Rand um die Gemeinde | 2 km, nur Straßen, die ein Bus befahren darf, mit Ampeln und Abbiegeregeln. Haltestellen, Gebäude, Grün und Nachfrage nur in der Gemeinde | Vorgabe Koko. Ergebnis: alle 259 Haltestellen liegen im zusammenhängenden Netz (hin und zurück erreichbar), es gibt keine Ausnahmen. Datei 2,15 MB. |
| A1-29 | Statuszeile | Nur als Testansicht, standardmäßig ausgeblendet, F3 schaltet sie ein und aus (auch im Einrichtungsdialog). F3 steht in der Hilfe | Vorgabe Koko. |
| A1-30 | Strg+S (Mac: Cmd+S) | Belegt, aber ohne Wirkung bis Etappe 4b (Speichern und Laden) | Von Koko akzeptiert. |
| A1-31 | Fahrzeiten | Ohne Verkehrsdichte nach Tageszeit bis Etappe 4a | Von Koko akzeptiert. Die Verkehrsdichte gehört zum Betrieb. |
| A1-32 | Ortsteile von Norderstedt | In OSM nicht als Verwaltungsgrenzen erfasst. Die Teilung in Subdivisionen ist nur an einer Teststadt geprüft | Von Koko akzeptiert. |
| A1-33 | Leistung bei 600-fach | Gemessen im Browsertest: 100 von 100 Takten in 10 s, Spielzeit genau 600 mal Echtzeit, längste Lücke zwischen zwei Takten 102 ms | Der Worker rechnet bisher nur die Zeit. Die Messung läuft bei jeder Abgabe weiter mit und wird mit jeder Etappe aussagekräftiger. Zählwerte statt Einzelfahrgästen kommen mit Etappe 4a. |
