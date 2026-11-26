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

## Etappe 2

Von Koko am 25.11.2026 bestätigte Werte. "Schätzung, in Etappe 6 prüfen" heißt: Es gibt keine belastbare Quelle, der Wert wird beim Balancing geprüft. Alle Werte stehen in `src/config/config.json` (Abschnitte `grundstueck` und `betriebshof`).

### Grundstück und Standortwahl

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A2-1 | Bodenpreis | 150 €/m² in der Randlage bis 300 €/m² in der zentralen Lage. Linear nach der Dichte: Einwohner plus Arbeitsplätze im Umkreis von 1.000 m um die Mitte der Fläche, bezogen auf den dichtesten Standort der Gemeinde. Ganze Euro | **Schätzung, in Etappe 6 prüfen.** BORIS-SH und der Gutachterausschuss Segeberg waren nicht abfragbar, nur private Portale (etwa 150 €/m² im Süden Norderstedts, bis 300 €/m² in Garstedt, Median Kreis Segeberg 80 €/m²). Besonders zu prüfen: Die Spanne gilt in jeder Gemeinde gleich, unabhängig von ihrer Größe. |
| A2-2 | Mindestgröße des Startgrundstücks | 2.000 m², jede Seite mindestens 20 m. Vorschlag beim Öffnen 50 × 40 m | 2.000 m²: Richtwert aus der Betriebshofrichtlinie Baden-Württemberg 2025 (Fläche = (1 + Fahrzeuge/5) × 1.000 m², verweist auf VDV 822). 20 m Mindestseite: **Schätzung, in Etappe 6 prüfen**, damit keine unbrauchbar schmalen Streifen entstehen. |
| A2-3 | Höchstfläche | 100.000 m² (10 Hektar) einschließlich aller Zukäufe | Konzept. |
| A2-4 | Standorte | Geschlossene OSM-Wege mit landuse=commercial oder industrial, Mittelpunkt in der Gemeinde, mindestens 2.000 m² und Platz für ein Rechteck 50 × 40 m (Suche in 5-m-Schritten, möglichst nah an der Mitte der Fläche). Norderstedt: 42 Standorte, davon 15 Industrieflächen, 152 bis 300 €/m² | Konzept: "vor allem Gewerbe- und Industrieflächen". Flächen als Multipolygon-Relation sind im Auszug nicht enthalten und werden nicht angeboten. |
| A2-5 | Anbindung | Kürzeste Entfernung von der Grenze der Fläche (Messpunkte höchstens 20 m auseinander) zur nächsten Straße, die ein Bus befahren darf (Suchradius 1.500 m). Das Tor wird von der Mitte seiner Seite am Grundstücksrand an die nächste Busstraße angebunden | Vorgabe Koko (Tor an die nächste Busstraße). Erschließungsstraßen mit highway=service zählen nicht, weil sie nicht zum Busnetz gehören. Die Entfernung zählt später als Leerweg. |
| A2-6 | Lage und Ausrichtung | Das Grundstück ist ein nach Norden ausgerichtetes Rechteck. Ein Klick in die Fläche setzt seine Mitte | Einfachste eindeutige Form. Hofkoordinaten: x nach Osten, y nach Süden, in ganzen Metern. |

### Bauteile und Kosten

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A2-7 | Baukosten je m² | Fahrweg, Stellplatz, Zufahrt und Tor 120 €; Halle 1.400 €; Werkstatt 2.300 €; Büro 2.200 €; Toiletten, Küche, Pausenraum 2.400 €; Lager 600 € | Teils umgerechnete Richtsätze, teils Schätzungen, gegengeprüft mit den Förderobergrenzen Baden-Württemberg (270.000 € je Fahrzeug bis 10 Fahrzeuge) und dem E-Bus-Hof Meiendorf. **Schätzung, in Etappe 6 prüfen.** |
| A2-8 | Baukosten ohne Quelle | Waschanlage 4.400 €/m² (rund 400.000 € für die Mindestanlage 5 × 18 m), Tankstelle 3.100 €/m² (rund 100.000 € für 4 × 8 m), Ladeplatz 1.200 €/m² (Ladepunkt 150 kW rund 75.000 €) | **Schätzung, in Etappe 6 prüfen.** Keine Quelle gefunden. |
| A2-9 | Beispiel-Layout und Startkapital | Komplettes erstes Layout mit jedem Bauteiltyp auf 50 × 40 m (seit 25.11.2026 mit zwei Toren als Durchfahrt, siehe A2-31): Bau 1.015.620 €. Mit Grundstück am billigsten Standort (152 €/m²) 1.319.620 €, am teuersten (300 €/m²) 1.615.620 €. Bei 2 Mio. € Startkapital bleiben 680.380 € bzw. 384.380 € | Vorgabe Koko: Mit 2 Mio. € muss ein komplettes erstes Layout bezahlbar sein. Geprüft in `tests/standorte.test.ts`. Die Waschanlage ist mit 396.000 € der größte Posten. |
| A2-10 | Stell- und Ladeplatz | Länge des Busses plus 1,5 m Rangierraum, Breite plus 0,9 m Seitenabstand. Mindestmaß nach dem kleinsten Bus im Katalog (Mini 5,998 × 1,993 m, also 7,5 × 2,9 m, auf ganzen Metern 8 × 3 m) | Seitenabstand: VDV-Schrift 825. Rangierraum: **Schätzung, in Etappe 6 prüfen.** |
| A2-11 | Raster und Maße | Rasterstufen 1, 2, 5 und 10 m. Bauteile liegen auf ganzen Metern. Mindestmaße gelten in beiden Ausrichtungen (Rechteck darf gedreht sein). Der Fahrweg mit 3,5 m Mindestbreite wird auf dem Meterraster damit mindestens 4 m breit | Kleinste Stufe 1 m laut Konzept, die übrigen Stufen **Schätzung**. |
| A2-12 | Gegenverkehr | Ein Fahrweg ab 7 m Breite wird als "breit genug für Gegenverkehr" angezeigt. Bis Etappe 4a ohne weitere Wirkung | Konzept (Bauteiltabelle). Wirkung auf Staus im Hof kommt mit dem Betrieb. |
| A2-13 | Ladeleistung | Einstellbar von 22 bis 450 kW, Standard 150 kW | **Schätzung, in Etappe 6 prüfen.** 450 kW ist die höchste Ladeleistung im Katalog. |

### Kapazitäten

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A2-14 | Halle | Plätze nebeneinander an der Seite mit Zufahrt, Platzbreite = Busbreite + 0,9 m, Hallentiefe mindestens Buslänge + 1,5 m. Gezählt wird die beste Seite, Zufahrten von zwei Seiten zählen nicht doppelt. Anzeige je Bauart mit dem größten Bus dieser Bauart | Vorgabe Koko (keine Blockabstellung). |
| A2-15 | Werkstatt, Tankstelle | Arbeitsplätze = volle Felder 5 × 15 m, Zapfsäulen = volle Felder 4 × 8 m (beide Ausrichtungen geprüft) | Werkstatt: Vorgabe Koko. Tankstelle: gleiche Regel mit dem Mindestmaß, weil die Tabelle "ein Bus pro Zapfsäule" nennt. |
| A2-16 | Abstellplätze und Fuhrpark | Abstellplätze = erreichbare Stellplätze plus Hallenplätze (für den kleinsten Bus). Für einen bestimmten Bus zählen nur Stellplätze, auf die er passt, und Hallenplätze für seine Größe. Ladeplätze zählen nicht als Abstellplätze | Konzept: "Er parkt auf einem freien Stellplatz oder in der Halle." Die Halle besteht aus überdachten Stellplätzen, deshalb erfüllt ein Hallenplatz auch die Bedingung "Stellplatz" für den Betrieb. |
| A2-17 | Betankung und Waschanlage | Betankung 8 Minuten, Waschanlage 10 Busse je Stunde | Waschanlage: Konzept (Herstellerangaben 8 bis 24). Betankung: **Schätzung, in Etappe 6 prüfen.** Beide wirken erst ab Etappe 4a. |
| A2-18 | Sozialräume | Pausenraum: 6 m² Grundfläche plus 1 m² je Person. Toiletten: 1 Toilette je 4 m², Beschäftigte nach ASR A4.1 Tabelle 2 bei niedriger Gleichzeitigkeit (bis 10: 1, bis 25: 2, bis 50: 3, bis 75: 5, bis 100: 6, bis 130: 7, bis 160: 8, bis 190: 9, bis 220: 10, bis 250: 11, darüber 1 je weitere 30). Küche 1,5 m² je Platz | Pausenraum: ASR A4.2. Toiletten: ASR A4.1, Abschnitt 5.2. Fläche je Toilette (aus dem Mindestmaß 2 × 2 m) und Küche: **Schätzung, in Etappe 6 prüfen.** Die Wirkung auf die Schichten kommt mit Etappe 3c. |
| A2-19 | Lager | 1 Lagereinheit je m² | **Schätzung, in Etappe 6 prüfen.** Teile mit ihrem Platzbedarf kommen in Etappe 5. |

### Layout-Gültigkeit und Wege

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A2-20 | Verbindung | Tor muss mit einer Seite am Grundstücksrand liegen (dort ist die Straße). Tor und Fahrwege sind verbunden, wenn sie mindestens 3,5 m gemeinsame Kante haben. Stell- und Ladeplatz: eine Stirnseite (kurze Seite) liegt ganz an Tor oder Fahrweg. Werkstatt, Waschanlage, Tankstelle: mindestens 3,5 m zusammenhängende Kante an Tor oder Fahrweg. Halle: mindestens ein Platz erreichbar. Büro, Lager und Sozialräume: mindestens 1 m Kante an Tor, Fahrweg oder einem verbundenen Gebäude (Halle, Werkstatt, Waschanlage, Büro, Lager, Sozialräume) | Konzept: "Ein Layout ist nur gültig, wenn Tor, Fahrwege und alle Bauteile verbunden sind und ein Bus jeden Stellplatz erreichen kann." 3,5 m ist die Mindestbreite des Fahrwegs. Dass Räume an Gebäude grenzen dürfen (Büro an der Werkstatt), entspricht üblichen Höfen. |
| A2-21 | Meldungen | Fehler (Layout ungültig): kein Tor, Tor nicht am Rand, Bauteil nicht verbunden ("fehlende Zufahrt"), Stellplatz nicht erreichbar, Halle ohne erreichbaren Platz. Warnung: Sackgasse = Fahrweg mit höchstens einem Anschluss an andere Fahrflächen, an dem kein Bauteil liegt. Ergänzt am 25.11.2026: getrennte Netze (Fehler, A2-32) und keine Wendemöglichkeit (Warnung, A2-31) | Konzept: "Das Spiel warnt bei Sackgassen und fehlenden Zufahrten". |
| A2-22 | Wege im Hof | Kürzester Weg auf dem 1-m-Raster über Tor und Fahrwege, in 8 Richtungen, diagonal nur ohne Ecken zu schneiden. Von einer Fahrfläche in die nächste nur dort, wo sie mindestens 3,5 m breit verbunden sind (gleiche Regel wie bei der Gültigkeit). Start an der Torseite am Grundstücksrand, Ende in der Mitte des Bauteils (Stellplätze über die Stirnseite). Fahrzeit = Weglänge / 10 km/h | Hofgeschwindigkeit: **Schätzung, in Etappe 6 prüfen** (Anhalt nur die Schrittgeschwindigkeit am ZOB Hamburg). |
| A2-23 | Pauschalwerte | Für hohen Zeitraffer die mittlere Fahrzeit vom Tor je Zielart (Abstellplatz, Werkstatt, Waschanlage, Tankstelle, Ladeplatz) | Konzept: "Bei hohem Zeitraffer rechnet das Spiel pauschal mit Wegzeit und Auslastung des Hofs". Die Auslastung kommt mit dem Betrieb in Etappe 4a. |

### Fahrzeugkatalog

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A2-24 | Pflichtfelder | Fehlt Identität, Länge oder Breite: Fehler mit Zeilennummer, Modell wird nicht genutzt. Fehlen andere Pflichtfelder: Hinweis, Modell wird genutzt. Fehler erscheinen beim Start in einem Fenster, Hinweise nur in der Testansicht (F3) | Kriterium 2 und Vorgabe Koko. Ohne diese Trennung wären 100 Modelle unbrauchbar: 98 Zeilen haben keine spitzenleistung_kw, die das Spiel bis jetzt nicht braucht. Ergebnis v19: 206 von 208 Zeilen nutzbar, 2 Fehler (Altas Novus Cityline und Ecoline ohne Länge), 144 Hinweise zu Pflichtfeldern, 184 Hinweise zu Elektro-Pflichtfeldern (vorher 235; der leere Batterieschritt wird nach Kokos Antwort vom 25.11.2026 nur noch bei einem Bereich gemeldet, nicht bei fester Batterie). |
| A2-25 | Batterie | Fehlt das Minimum, gilt Minimum = Maximum (und umgekehrt); sind beide gleich, ist es eine feste Größe. Mit Schritt endet der Bereich beim letzten vollen Schritt (Iveco Crossway LE City 12 Elec: 346, 415, 484 kWh). Bereich ohne Schritt: siehe A2-30 | Vorgabe Koko. |
| A2-26 | Leere Felder | "Standardwert der Klasse" aus dem Blatt Standardwerte; fahrzeugart leer = Bus; fiktiv leer = real. Felder, die das Spiel schätzen soll (Wendekreis, Leergewicht, Türbreite, Einstiegshöhe, Stehplätze, Farbe), bleiben leer, bis eine Etappe sie braucht | Kein Vorgriff auf spätere Etappen. Fehlt in der Klassenzeile ein Wert (zum Beispiel Batterielebensdauer bei Diesel), bleibt das Feld leer. |
| A2-27 | Laden im Spiel | Die Datei wird beim Bauen unverändert neben das Spiel gelegt und beim Start gelesen, in App und Web gleich. Der Leser (ExcelJS) wird erst dann nachgeladen | Konzept: das Spiel liest die Datei direkt. Das Nachladen hält den Start der Web-Version klein. |
| A2-29 | Zukauf an der Torseite | Erlaubt, aber das Fenster warnt vorher: Das Tor liegt danach nicht mehr am Rand, das Layout wird ungültig, bis das Tor versetzt ist | Der Zukauf verlängert laut Festlegung eine frei gewählte Seite. Verhindern wäre eine neue Regel. |
| A2-28 | Bereich Betriebshof in der Oberfläche | Ein Knopf "Betriebshof" in der Kopfleiste öffnet die Standortliste (vor dem Kauf) oder den Editor | Die Menüleiste am Rand mit allen Bereichen entsteht, sobald es weitere Bereiche gibt. Seit Etappe 3a steht "Betriebshof" in der Menüleiste am linken Rand. |

### Nachträge nach der Freigabe von Etappe 2 (25.11.2026)

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A2-30 | Batterie: Bereich ohne Schritt | Standardschritt 50 kWh (`catalog.batterieStandardSchrittKwh`) ab dem Minimum. Das Maximum aus dem Datenblatt ist immer wählbar, auch wenn es kein volles Vielfaches ist (Ebusco 2.2: 350, 400, 450, 500 kWh; Yutong U12 LF: 465, 515, 528 kWh). Betrifft 25 Modelle | Vorgabe Koko: Standardschritt statt nur Maximum. 50 kWh: **Schätzung, in Etappe 6 prüfen** (übliche Packgrößen liegen zwischen etwa 35 und 100 kWh). Das Maximum bleibt erhalten, weil es ein echter Datenblattwert ist; die Regel "endet beim letzten vollen Schritt" gilt weiter für Modelle mit eigenem Schritt. |
| A2-31 | Wendemöglichkeit | Netz aus Tor und Fahrwegen (breit verbunden). Ein Fahrweg hat eine Wendemöglichkeit, wenn er auf einem Rundweg liegt, der eine Fläche umschließt (geprüft auf dem 1-m-Raster: der Fahrweg grenzt an ein Loch der befahrbaren Fläche), oder auf einer Durchfahrt zwischen zwei Toren, deren Torseiten mindestens 27 m auseinander liegen (Koko, 25.11.2026), oder wenn hinter ihm, vom nächsten Tor aus gesehen, eine Wendefläche, ein solcher Rundweg oder eine solche Durchfahrt liegt. Wendefläche: Tor oder Fahrweg mit beiden Seiten mindestens 27 m (`betriebshof.wendeflaecheMinM`). Gewarnt wird bei Fahrwegen ohne Wendemöglichkeit, an denen erreichbare Stellplätze, Ladeplätze oder Hallen liegen. Das Layout bleibt gültig | Vorgabe Koko: warnen, Definition als Annahme. 27 m: größter Wendekreis im Katalog (26,59 m, VDL Citea LE 149, 15-m-Bus), auf ganze Meter aufgerundet, damit jeder Bus wenden kann. **Schätzung, in Etappe 6 prüfen.** Ladeplätze und Hallen zählen mit, weil sie wie Stellplätze über die Stirnseite angefahren werden. Folge: Ein Layout mit einem Tor und einem schmalen Fahrweg (wie das bisherige Beispiel) zeigt jetzt diese Warnung. Das Beispiel-Layout (A2-9) hat deshalb ein zweites Tor am Ostrand statt der letzten 4 m Fahrweg; die Kosten bleiben gleich, weil Tor und Fahrweg je m² gleich viel kosten. |
| A2-32 | Ein zusammenhängendes Netz | Alle Tore und Fahrwege müssen ein Netz bilden. Ein Tor, das mit seinem Fahrweg ein eigenes Netz bildet, macht das Layout ungültig (Meldung "getrennte Netze"). Mehrere Tore im selben Netz sind erlaubt | Vorgabe Koko. |
| A2-33 | Seitenverhältnis | Lange Seite höchstens 10 mal die kurze (`grundstueck.maxSeitenverhaeltnis` = 10), beim Startgrundstück und bei jedem Zukauf. Die Zukauf-Anzeige nennt den kleineren der beiden Höchstwerte aus Fläche und Seitenverhältnis. Ein Zukauf, der das Verhältnis verbessert, ist immer möglich | Vorgabe Koko und Konzept. |
| A2-34 | Baujahr im Gebrauchtmarkt | Fehlt baujahr_von, erzeugt der Gebrauchtmarkt das Baujahr zwischen (aktuelles Jahr minus lebensdauer_jahre) und (baujahr_bis, sonst aktuelles Jahr). Betrifft 105 nutzbare Modelle (107 Zeilen, davon 2 ohne Länge) | Vorgabe Koko. Wird mit dem Gebrauchtmarkt in Etappe 3a gebaut. Die 16 fehlenden Standardwerte für fiktive Busse bleiben bis Etappe 7a offen. |

## Etappe 3a

Von Koko am 25.11.2026 bestätigt: A3-1 bis A3-32 (A3-20 bis A3-32 nach dem Bau). A3-33 ist eine Vorgabe von Koko nach der Freigabe. "Schätzung, in Etappe 6 prüfen" heißt: Es gibt keine belastbare Quelle, der Wert wird beim Balancing geprüft. Alle Werte stehen in `src/config/config.json` (Abschnitte `fahrzeugmarkt`, `personal`, `optionen`) oder in der Optionsdatei `optionen.xlsx`.

### Personal

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A3-1 | Marktlohn | TV-N Schleswig-Holstein, Entgelttabelle gültig ab 01.09.2025, 38 Wochenstunden, Stundenlohn = Monatsentgelt / (4,348 × 38). Fahrer, Mechaniker, Büro: EG 5, Stufe 1 bis 6: 20,85 / 21,17 / 21,48 / 21,80 / 22,12 / 22,44 €. Kontrolle und Kundenservice: EG 4, 20,10 bis 21,52 €. Reinigung: EG 1, 17,96 € (keine Stufen) | Quelle: KAV Schleswig-Holstein, TV-N SH Lesefassung idF des 14. ÄTV vom 01.03.2026 (Anlage 2, § 6, § 7). **Die Tarifrunde 2026 ist offen** (Anlage 2 zum 30.06.2026 gekündigt, ver.di fordert 6,5 %), die Werte sind deshalb eine Untergrenze. Hochbahn Hamburg zum Vergleich: rund 20,62 € beim Einstieg. |
| A3-2 | Arbeitgeberanteil | 22 % auf den Bruttolohn | Summe 2026 aus Renten-, Kranken- (mit halbem durchschnittlichem Zusatzbeitrag), Pflege-, Arbeitslosenversicherung, Insolvenzgeldumlage und Unfallversicherung (BG Verkehr, Gefahrklasse Omnibus): rund 22,2 %, mit U1 und U2 eher 23 bis 24 %. **Schätzung, in Etappe 6 prüfen.** |
| A3-3 | Probezeit und Kündigung | Probezeit 6 Monate. Fristen nach TV-N SH § 20: in der Probezeit 2 Wochen zum Monatsende, bis ein Jahr 1 Monat zum Monatsende, danach 6 Wochen zum Quartalsende, ab 5 / 8 / 10 / 12 Jahren 3 / 4 / 5 / 6 Monate zum Quartalsende. Der Lohn läuft bis zum Austritt | TV-N SH § 3 und § 20. Die Unkündbarkeit nach mehr als 15 Jahren ist nicht abgebildet, weil sie erst nach langer Spielzeit wirkt. |
| A3-4 | Bewerber | Eine Ausschreibung läuft 28 Tage. Jeder Bewerber erscheint nach 3 bis 14 Tagen. Zahl je Ausschreibung zufällig (Poisson) mit Mittel 2 bei Marktlohn (Fahrer 1 wegen des Fahrermangels) mal (Lohn / Marktlohn) hoch 4, höchstens 8. Erfahrungsstufe zufällig mit Gewichten 30 / 25 / 20 / 12 / 8 / 5 für Stufe 1 bis 6, je 10 % über dem Marktlohn im Mittel eine Stufe mehr (darunter weniger) | **Schätzung, in Etappe 6 prüfen.** Regionale Zahlen zur Besetzungsdauer von Fahrerstellen waren nicht zu finden (bundesweit fehlen laut VDV und Presse rund 20.000 Busfahrer). |
| A3-5 | Startwerte | Zufriedenheit 60 bis 90, Gesundheit 70 bis 100, ganzzahlig. Beide wirken erst in späteren Etappen | **Schätzung, in Etappe 6 prüfen.** |
| A3-6 | Namen | 80 Vornamen (40 weiblich, 40 männlich) und 80 Nachnamen aus allgemein bekannten Häufigkeitslisten in Deutschland (`src/personal/namen.json`) | Keine echten Personen, nur häufige Namen. |
| A3-18 | Monatslohn | Stundenlohn × Wochenstunden × 4,348 plus Jahressonderzahlung 1.800 € / 12 (bei Teilzeit anteilig nach Wochenstunden / 38), alles mal (1 + Arbeitgeberanteil). Anteilig nach Kalendertagen bei Eintritt oder Austritt im Monat. Abbuchung am Monatsende, das Konto darf dadurch ins Minus | TV-N SH § 7 (Teiler 4,348) und § 17 (Jahressonderzahlung 1.800 € ab 2026). Zuschläge (Nacht, Sonntag, Feiertag, Überstunden) kommen mit den Diensten in 3c und 4a. |
| A3-25 | Lohnstufen EG 4 | Stufen 2 bis 5 linear zwischen Stufe 1 (20,10 €) und Stufe 6 (21,52 €) | Die Recherche hat für EG 4 nur Stufe 1 und 6 geliefert. **Schätzung, in Etappe 6 prüfen.** |
| A3-26 | Erfahrung und Stufe | Erfahrung in Jahren = Erfahrung beim Eintritt + Dienstjahre nach Kalender (am Jahrestag ganzzahlig). Stufe 2 ab 3 Jahren, 3 ab 6, 4 ab 9, 5 ab 13, 6 ab 17 (TV-N SH § 6). In der Lohnabrechnung zählt die Stufe am letzten Tag des Monats bzw. vor dem Austritt. Bewerber haben ganzzahlige Erfahrung innerhalb ihrer Stufe (Stufe 6: 17 bis 22 Jahre); Reinigungskräfte haben nur eine Stufe und deshalb 0 bis 2 Jahre | Vorgabe Koko (Aufstieg wie im TV-N SH). Detailregeln festgelegt, weil der Tarif in Monaten innerhalb der Stufe rechnet. |
| A3-27 | Wochenstunden | Ganze Stunden von 10 bis 38 je Stelle | Vorgabe Koko. |

### Fahrzeugmarkt

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A3-7 | Gebrauchtangebote | 12 Angebote gleichzeitig. Jeden Montag 0 Uhr verschwinden Angebote, deren Laufzeit (2 bis 4 Wochen) abgelaufen ist, neue füllen auf 12 auf | **Schätzung, in Etappe 6 prüfen.** Konzept: wöchentlich erneuern. |
| A3-8 | Alter und Laufleistung | Mindestalter 2 Jahre, Alter = aktuelles Jahr minus Baujahr. Laufleistung 50.000 km je Jahr ±30 %, auf 100 km gerundet | **Schätzung, in Etappe 6 prüfen.** |
| A3-9 | Zustand gebraucht | 100 minus 50 × Alter / Lebensdauer, minus 0,2 Punkte je Punkt Zuverlässigkeit unter 100, ±10 zufällig, mindestens 20. Vor dem Kauf als Spanne von 15 Punkten, in der der wahre Wert an zufälliger Stelle liegt | **Schätzung, in Etappe 6 prüfen.** Beispiel im Konzept: 55 bis 70 %. |
| A3-10 | Batteriezustand | Linear von 100 % auf 80 % am Ende von batterie_lebensdauer_jahre (sonst lebensdauer_jahre), mindestens 60 %. Spanne vor der Inspektion: 10 Punkte. Batteriegröße zufällig aus den wählbaren Größen | 80 % ist das übliche Ende der Lebensdauer einer Fahrzeugbatterie. **Schätzung, in Etappe 6 prüfen.** |
| A3-11 | Preis und Wert | Wert = Neupreis der Konfiguration × Restwert × (0,7 + 0,3 × Zustand / 100). Restwert linear von 100 % auf 10 % über die Lebensdauer, danach 10 %. Gebrauchtpreis = Wert ±10 % zufällig. Neupreis heute, ohne Inflation | **Schätzung, in Etappe 6 prüfen.** |
| A3-12 | Gebühren | Inspektion 500 €, Umlackieren 12.000 €, Händlerabschlag beim Verkauf 25 % | **Schätzung, in Etappe 6 prüfen.** |
| A3-13 | Region | Für Gemeinden in Deutschland passen die Katalogregionen "Europa" und "weltweit". Das Land kommt aus dem ISO-Code der Region (DE-SH ergibt DE). Unbekanntes Land: alle Regionen | Katalogspalte region (Europa, Nordamerika, Asien, weltweit). |
| A3-14 | Batterieaufpreis | 700 € je kWh über der kleinsten wählbaren Batterie | Vorgabe Koko. **Schätzung, in Etappe 6 prüfen.** |
| A3-15 | Optionspreise | In `optionen.xlsx`: Kunststoffschalen 0 €, mit Stoffpolster 3.000 €, Stoffsitze 6.000 €, Premium-Sitze 12.000 €; konventionelle Spiegel 0 €, Kamerasystem 8.000 €; Klimaanlage 25.000 €; Wärmepumpe 20.000 € (nur Elektro); Fahrgastinformation Fallblatt 15.000 €, Punktmatrix 20.000 €, LCD 25.000 €, LED 28.000 €; automatische Ansagen 5.000 €; Fahrgastzählsystem 8.000 €; Videoüberwachung 6.000 €; WLAN 3.000 €; USB-Steckdosen 2.000 €; Rampe manuell 1.500 €, elektrisch 6.000 €; Fahrscheindrucker 4.000 €; Entwerter 1.500 €; Abbiege- und Notbremsassistent beim Neukauf serienmäßig | **Schätzung, in Etappe 6 prüfen.** WLAN und USB sind getrennt, weil der Technologiebaum sie getrennt freischaltet. Premium-Sitze und automatische Ansagen ergänzt, weil der Technologiebaum sie nennt. |
| A3-16 | Lackierung des Vorbesitzers | farbe_standard_hex des Modells, sonst eine Farbe aus einer Palette in der Konfiguration | Katalogspalte farbe_standard_hex: "Spiel wählt eine Farbe". |
| A3-17 | HU | Gebraucht: Restzeit zufällig 1 bis intervall_hu_monate Monate. Neu: gültig für intervall_hu_monate ab Kauf | Wirkung der HU kommt mit Etappe 5. |
| A3-19 | Zeit und Zufall | Wochenwechsel Montag 0 Uhr, Monatsende 24 Uhr am letzten Tag (= 1. des Folgemonats 0 Uhr). Fallen beide zusammen, kommt zuerst der Lohn. Jeder Spielstand hat einen festen Startwert für den Zufall | Wiederholbare Ergebnisse (Konzept: Simulationstests mit fester Zufallszahl). |
| A3-20 | Kleinster passender Platz | Gemessen an der Fläche: Stellplatz Breite × Tiefe, Hallenplatz Platzbreite des Busses (Breite + 0,9 m) × Hallentiefe. Bei gleicher Fläche der Platz mit der kleineren Nummer | Vorgabe Koko (kleinster passender freier Platz); das Maß der Größe musste festgelegt werden. Folge: Ein Hallenplatz ist oft kleiner als ein Stellplatz und wird zuerst belegt. |
| A3-21 | Halle mit verschiedenen Bussen | Ein Bus passt in eine Halle, wenn die Plätze nach A2-14 für alle Busse darin reichen, gerechnet mit den größten Maßen der Busse in der Halle | Einfache sichere Regel ohne Lage einzelner Plätze. |
| A3-22 | Abriss belegter Plätze | Ein Bauteil, ohne das ein Bus keinen gültigen Platz mehr hätte (zum Beispiel der Stellplatz eines Busses oder der Fahrweg davor), lässt sich nicht abreißen; das Fenster sagt, dass der Bus vorher umgesetzt oder verkauft werden muss | Sonst stünden Busse auf Plätzen, die es nicht gibt. |
| A3-23 | Kennzeichen | Unterscheidungszeichen aus dem Kreisschlüssel der Startgemeinde (Tabelle für Schleswig-Holstein und Hamburg in der Konfiguration, Norderstedt: 01060 = SE), sonst "XX". Rest: 1 bis 2 Buchstaben und eine Zahl von 1 bis 9999, eindeutig im Fuhrpark. Schema in der Konfiguration | Vorgabe Koko (vorläufig einfach). Weitere Kreise und die Details sind zurückgestellt. |
| A3-24 | Flottennummer | Fortlaufend ab 1, Schema "{nr}" in der Konfiguration (auch "{jahr}{nr}" möglich) | Konzept: fortlaufend, Schema einstellbar. Details zurückgestellt. |
| A3-28 | Gebrauchte Ausstattung | Je Gruppe eine Option nach gebraucht_anteil als Gewicht, einzelne Optionen mit gebraucht_anteil als Wahrscheinlichkeit, auch Optionen, die im Neukauf noch gesperrt sind. Abbiege- und Notbremsassistent ab Baujahr 2024 immer, davor mit 50 % | Vorgabe Koko. Gebrauchtanteile und Wirkungswerte (wirkung_*) in `optionen.xlsx`: **Schätzung, in Etappe 6 prüfen**; die Wirkungen gelten erst ab Etappe 4a bzw. 5. |
| A3-29 | Neue Busse | Baujahr = aktuelles Jahr, Zustand 100, Batteriezustand 100 %. Wert eigener Busse: Alter = Alter beim Kauf + Zeit seit dem Kauf, Neupreis der Konfiguration (ohne Serienausstattung) | Phase 1 kennt keinen Verschleiß; der Wert sinkt nur mit dem Alter. |
| A3-31 | Farbe der Busse im Editor | Bis Etappe 3b in ihrer Lackierung, weil es noch keine Linien gibt | Konzept (Optik): Busse in der Linienfarbe; die Linienfarbe gibt es erst mit den Linien. |
| A3-32 | Testzugang | Nur mit "?test" in der Adresse gibt es einen Zugang zum Vorspulen der Spielzeit für den Oberflächentest (Bewerber erscheinen erst nach Tagen). Seit Etappe 3b kann er außerdem sofort speichern (für den Test "Neuladen und Weiterspielen") und, seit den Nachträgen zu 3b, den sichtbaren Anteil einer Linie neben den Fenstern messen (nur lesend). Im normalen Spiel fehlt er | Sonst müsste der Test viele Minuten warten. |
| A3-33 | Batteriebereich kleiner als der Standardschritt | Hat ein Modell keinen eigenen Schritt und ist die Spanne (Maximum minus Minimum) kleiner als der Standardschritt (50 kWh), ist nur das Maximum wählbar. Beispiel: Yutong U12 LE (465 bis 466 kWh) nur 466 kWh. Modelle mit eigenem Schritt sind nicht betroffen | Vorgabe Koko (25.11.2026): Rundungsfehler im Katalog ("Batterie bis 465,99 kWh"), richtig ist fest 466 kWh. Koko korrigiert die Zelle in der nächsten Katalogversion. |
| A3-30 | Optionsdatei | Spalten fest wie beim Katalog, standard und serie_neukauf sind Pflicht (ja/nein). Fehlerhafte Zeilen und Gruppen ohne genau eine Standardoption werden nicht genutzt und beim Start gemeldet | Vorgabe Koko: Spaltennamen prüfen wie beim Katalog. |

## Etappe 3b

Von Koko am 25.11.2026 bestätigt: A3b-1 bis A3b-14 (A3b-1, A3b-3 und A3b-12 mit Kokos Änderungen). Mit der Freigabe von Etappe 3b am 26.11.2026 bestätigt: A3b-15 bis A3b-31, A3b-23 mit Kokos Änderung (Rückfrage vor dem Überschreiben). A3b-32 bis A3b-34 sind mit den Nachträgen zur Freigabe entstanden und warten auf Kokos Bestätigung. Ein Stern (*) heißt: Schätzung ohne belastbare Quelle, Prüfung in Etappe 6. Alle Werte stehen in `src/config/config.json`, Abschnitt `linien` (Autosave: Abschnitt `storage`).

### Bestätigt

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A3b-1* | Verkehrsdichte | Faktor auf die reine Fahrzeit bei erlaubter Geschwindigkeit, nie unter 1,00. Werktag: 0 bis 6 Uhr 1,05; 6 bis 9 Uhr 1,35; 9 bis 15 Uhr 1,20; 15 bis 19 Uhr 1,35; 19 bis 24 Uhr 1,10. Samstag: 10 bis 18 Uhr 1,20, sonst 1,10. Sonn- und Feiertag: 1,10. Schulferien: Spitzen 1,25 statt 1,35. Maßgeblich ist die Abfahrtszeit am Beginn des Abschnitts; nach Mitternacht (Betriebstag bis 4 Uhr) gilt wieder die Zeile ab 0 Uhr | Vorgabe Koko: Faktoren unter 1 würden Busse schneller machen als erlaubt. Die Konfiguration wird beim Start geprüft (lückenlos 0 bis 24 Uhr, kein Faktor unter 1). |
| A3b-2 | Ampeln und Kreuzungen | 15 s je Ampel, 2 s je Kreuzung ohne Ampel (wie A1-1, A1-2). Die Zuschläge werden nach dem Verkehrsfaktor addiert und nicht mit ihm multipliziert | Vorgabe Koko. |
| A3b-3* | Höchstgeschwindigkeit | Busse fahren im Spiel höchstens 80 km/h, auch wo mehr erlaubt ist | Spielwert (Annahme), keine Aussage über eine gesetzliche Grenze. |
| A3b-4* | Bremsen und Anfahren | 10 s Zuschlag je Halt (Umsetzung siehe A3b-15) | Vorgabe Koko (F7). |
| A3b-5* | Standzeit | Standard 20 s je Haltestelle, einstellbar von 0 bis 1.800 s in Schritten von 10 s | F5. |
| A3b-6* | Wendezeit | Standard 5 min, einstellbar von 0 bis 3.600 s in Schritten von 10 s | Konzept: Wendezeit am Endpunkt jeder Variante. |
| A3b-7 | Takt | Ganze Minuten von 2 bis 240 | F8. |
| A3b-8* | Vorlagen für den Takt | Werktag: 5 bis 6 Uhr alle 30 min, 6 bis 9 Uhr alle 10, 9 bis 15 Uhr alle 15, 15 bis 19 Uhr alle 10, 19 bis 23 Uhr alle 30. Samstag: 6 bis 23 Uhr alle 20. Sonn- und Feiertag: 8 bis 23 Uhr alle 30 | Nur Knopf "Vorlage einsetzen", nichts wird automatisch gesetzt. |
| A3b-9 | Betriebstag | 4 Uhr bis 4 Uhr. Fahrten bis 3:59 Uhr gehören zur Tagesart des Vortags | F9. |
| A3b-10 | Neue Haltestellen | Fangradius 60 m wie A1-8, neben der Straße die rechte Fahrbahnseite (gleiche Regel wie bei den OSM-Haltestellen), in Phase 1 kostenlos | F1. |
| A3b-11 | Gegenhaltestelle | Haltestelle mit gleichem Namen im Umkreis von 100 m, die nächste zuerst; sonst dieselbe Haltestelle. Im Varianteneditor mit ⇄ änderbar | F2. |
| A3b-12* | Enge Strecke | Warnung für Busse über 15 m auf Spielstraßen (living_street) oder Erschließungswegen (service) und für Busse mit Wendekreis über 25 m, wenn die Route in einer Sackgasse wendet. Der Wendekreis im Katalog ist der **Durchmesser** (Blatt "Spalten": "Wendekreisdurchmesser", mm); die 25 m gelten deshalb als Durchmesser. Betroffen (203 nutzbare Busmodelle): 57 sind länger als 15 m, 5 haben einen Wendekreis über 25 m (alle Solobusse um 14,9 m), 6 haben keinen Wendekreis | F13. Fehlt der Wendekreis, meldet das Spiel das und prüft nur die Länge (Kriterium 11). Nachtrag 26.11.2026: Die 25 m Durchmesser passen nach Kokos Wissen zur EU-Vorgabe, nach der ein Bus in einem Kreis mit 12,5 m Außenradius wenden können muss. **Nicht recherchiert.** Fehlende Werte: weiter nur Länge prüfen; in Etappe 6 und 7a erneut ansehen. |
| A3b-13 | Linienfarben | Vorschlagspalette mit 10 Farben in der Konfiguration, die nächste noch freie wird vorgeschlagen, frei wählbar | |
| A3b-14 | Ausrückzeit | Route von der Anbindung des Tors (Mitte der Torseite, nächste Busstraße, beide Fahrtrichtungen) zur ersten Haltestelle des Umlaufs, Fahrzeit nach A3b-1 bis A3b-4 | Umsetzung siehe A3b-21. |

### Neu beim Bau (mit der Freigabe am 26.11.2026 bestätigt)

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A3b-15 | Halt-Zuschlag | Der Zuschlag aus A3b-4 kommt einmal je Haltestellenabschnitt dazu (Anfahren am Beginn und Bremsen am Ende zusammen). Rundung: (reine Fahrzeit × Faktor + Ampeln + Kreuzungen + 10 s) auf 10 s, halbe Schritte aufwärts, mindestens 10 s | "Je Halt" ließ offen, ob Start und Ziel mitzählen. So zählt jeder Halt, an dem der Bus ankommt. |
| A3b-16 | Routenwahl | Schnellste Route nach der reinen Fahrzeit mit Ampel- und Kreuzungszuschlägen (wie Etappe 1), ohne Verkehrsfaktor, damit die Route über den Tag gleich bleibt. Die nächste Teilroute beginnt auf dem Abschnitt, auf dem die vorige angekommen ist (kein Richtungswechsel an einer Perle). Zuschläge eines Abschnitts zählen, wenn der Bus sein Ende erreicht | Konzept und Vorgabe Koko: kürzeste Fahrzeit. |
| A3b-17 | Standzeit an Endpunkten | Standzeiten gelten an Zwischenhalten. Die Abfahrt einer Fahrt ist die Abfahrt an der ersten Haltestelle; an der letzten gilt die Wendezeit | Sonst zählte die Pause am Endpunkt doppelt. |
| A3b-18 | Fahrten bei Lücken | Eine Variante ohne vollständige Route erzeugt keine Fahrten, die übrigen Varianten der Linie fahren weiter. Eine deaktivierte Linie erzeugt keine Fahrten | Vorgabe Koko ("Linie ohne vollständige Route erzeugt keine Fahrten"), je Variante umgesetzt, damit ein neuer Kurzläufer mit Lücke nicht die ganze Linie stilllegt. Bitte bestätigen. |
| A3b-19 | Ferientakt | Ohne eigenen Ferientakt gelten Takt **und** Fahrtänderungen des Tages ohne Ferien. Beim Einschalten übernimmt der Ferientag beides als Ausgangspunkt, beim Ausschalten wird der eigene Ferientakt gelöscht | F8: Ferientakt nur auf Wunsch eigen. |
| A3b-20 | Umläufe | Je Linie und Tagesart. Gleicher Ort = gleiche Haltestelle oder gleicher Name im Umkreis von 100 m (A3b-11). Fahrten nach Abfahrt; von mehreren freien Bussen am Ort fährt der, der am längsten wartet. Gestrichene Fahrten zählen nicht. Busse wechseln nicht zwischen Linien (Stammlinie). Gesamtbedarf = Summe der aktiven Linien je Tagesart, gewarnt wird beim größten Wert | F11, F12. Die Handrechnung ⌈Umlaufzeit / Takt⌉ ergibt sich, wenn die Rückfahrten zur Ankunft passen; liegen sie ungünstig, braucht es einen Bus mehr (Test vorhanden). |
| A3b-21 | Ausrückzeit je Umlauf | Abfahrt am Betriebshof = erste Abfahrt des Umlaufs minus Fahrzeit. Die Fahrzeit rechnet wie ein Haltestellenabschnitt: reine Fahrzeit mal Verkehrsfaktor zur ersten Abfahrt, plus Ampeln, Kreuzungen und 10 s Halt-Zuschlag (Ankunft an der ersten Haltestelle), auf 10 s gerundet | A3b-14. Ob der Bus rechtzeitig ankommt, prüft erst Etappe 3c (F12). |
| A3b-22 | Bus zur Linie | Ein Bus gehört zu höchstens einer Linie (Stammlinie); eine neue Zuweisung beendet die alte. Ein verkaufter Bus verlässt seine Linie | Kriterium 11; die Zahl der zugewiesenen Busse ist Grundlage der Warnung "zu wenige Busse". |
| A3b-23 | Autosave | Ohne eigene Oberfläche: alle 10 s Echtzeit, wenn sich etwas geändert hat, und beim Verlassen der Seite in einen festen Platz "autosave" (Browser: IndexedDB, Desktop: SQLite). Beim nächsten Start bietet der Einrichtungsdialog "Weiterspielen" an. Ein neues Spiel ersetzt den Stand erst nach der Rückfrage "Gespeicherten Stand wirklich überschreiben?"; Vorgabe ist Abbrechen, Esc bricht ebenfalls ab (Änderung Koko 26.11.2026, bis 4b gibt es nur einen Speicherplatz). Stände mit eigener Datei brauchen die Datei erneut, weil Karten nicht gespeichert werden. Strg+S bleibt bis 4b ohne Wirkung | Vorgabe Koko (Punkt 2: minimaler Autosave). Vorher ging der Stand beim Neuladen verloren. |
| A3b-24 | Uhrzeiten | Eingaben "HH:MM" oder "HH:MM:SS". Zeiten vor 4 Uhr gehören zum Ende des Betriebstags (00:30 ist 24:30). "bis 04:00" im Takt heißt Ende des Betriebstags (28:00). Verschobene und zusätzliche Fahrten liegen auf 10 s | Folgt aus A3b-9 und der 10-s-Regel. |
| A3b-25 | Liniennummer | Eindeutig ohne Unterschied von Groß- und Kleinschreibung ("n1" gleich "N1") | F4. |
| A3b-26 | Neue Haltestellen | Name vorgeschlagen aus dem Straßennamen, Löschen nur, solange keine Linie sie nutzt. Wegpunkte dürfen in nicht freigeschalteten Gebieten liegen, Haltestellen nicht | Konzept: Durchfahrt ohne Halt. |
| A3b-27 | Suche nach Haltestellen | Treffer zeigen Straße und Fahrtrichtung (zum Beispiel "Segeberger Chaussee, Fahrtrichtung Osten"), weil viele Haltestellen je Straßenseite gleich heißen | Bedienbarkeit, keine neue Funktion. |
| A3b-28 | Fenster | Der Linieneditor ersetzt die Linienliste (links), Varianteneditor und Fahrplan öffnen rechts; ein angeklicktes Fenster kommt nach vorn | Damit die Karte zum Anklicken frei bleibt. |
| A3b-29 | Bedienhilfen und kleine Regeln | Linie löschen und Variante löschen (mit Rückfrage bei der Linie), Variante umbenennen, Takt "vom Werktag übernehmen" für Samstag und Sonntag, Fahrzeitprobe je Uhrzeit im Varianteneditor, gestrichene oder verschobene Fahrt wiederherstellen. Dieselbe Haltestelle darf nicht zweimal direkt hintereinander stehen (auch nicht beim Ersetzen). Ein Kurzläufer übernimmt die Wendezeit seiner Grundvariante. Namen von Linien, Varianten und Haltestellen höchstens 60 Zeichen. Die Gegenhaltestelle muss wie jede Haltestelle in einem freigeschalteten Gebiet liegen | Bedienhilfen ohne neue Spielinhalte; bitte bestätigen oder streichen. |
| A3b-30 | Vorgaben im Editor | Neue Taktzeile ohne Vorgänger: ab 6 Uhr für 60 min alle 20 min; Fahrzeitprobe voreingestellt 7 Uhr (`linien.neueTaktzeile`, `linien.probeStunde`) | Nur Vorbelegung von Eingabefeldern. |
| A3b-31 | Anschlüsse nach dem Laden | Gespeicherte Netzanschlüsse von Wegpunkten und neuen Haltestellen werden beim Laden gegen die Karte geprüft; passen sie nicht mehr (anderer Auszug), fallen sie weg und die Perle gilt als "nicht am Busnetz" | Karten werden nur referenziert (Konzept: Speicherstände). |

### Nachträge zur Freigabe (26.11.2026, zur Bestätigung)

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A3b-32 | Erschließungswege im Routing | Keine Änderung nötig: Das Busnetz aus Etappe 1 (A1-4, `isBusWay`) nimmt highway=service nur auf, wenn bus oder psv auf yes, designated oder permissive steht. Im Norderstedt-Auszug sind das 60 Abschnitte auf 48 Wegen, alle mit Busfreigabe (Busschleusen, Busspuren, ZOB). Die Route Hans-Salb-Straße zum Kirchenweg nutzt vier Wege mit psv=yes und vehicle=no. Alle 259 Haltestellen bleiben in beide Richtungen erreichbar, Haltestellen und Hofanschluss unverändert, die Beispiellinie bleibt gleich (Regressionstest) | Kokos Vorgabe ist schon erfüllt. Ausnahmen für nicht freigegebene Erschließungswege (Anbindung, Wenden) würden das Netz aus Etappe 1 erweitern und sind derzeit nicht nötig. |
| A3b-33 | Zoom auf die Linie | Beim Öffnen des Linieneditors zoomt die Karte auf alle Routen der Linie (sonst auf ihre Perlen), mit 40 px Rand neben Fenstern und Menüleiste, höchstens Zoomstufe 16. Bleiben zwischen linken und rechten Fenstern weniger als 240 px frei, bleibt nur die linke Seite (Editor) frei (`linien.zoom`) | Vorgabe Koko: Linie sichtbar, Karte frei. Werte sind Bedienwerte, keine Spielwerte. |
| A3b-34 | Hinweis bei Lücken | Linienliste und Kopf des Linieneditors nennen die Varianten, die wegen einer Lücke keine Fahrten erzeugen | Vorgabe Koko zu A3b-18. |

## Etappe 3c-1

Von Koko am 26.11.2026 bestätigt: A3c-1 bis A3c-14 (Sterne bleiben). Vor dem Bau gegen die Originaltexte geprüft: VO (EG) Nr. 561/2006 in der konsolidierten Fassung vom 22.05.2024 (amtlicher Text über das Amt für Veröffentlichungen der EU, weil EUR-Lex automatisierte Abrufe sperrt), FPersV § 1 und ArbZG auf gesetze-im-internet.de, TV-N SH Lesefassung des 14. ÄTV vom 01.03.2026 (kavsh.de). Abweichungen von der Vorbereitung sind bei der jeweiligen Annahme vermerkt. Die Regeln selbst (Grenzen, hart oder Warnung, Quelle je Regel) stehen in `regelwerk/de.json`, die Spielwerte in `src/config/config.json`, Abschnitt `dienste`.

### Bestätigt (mit Ergebnis der Normprüfung)

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A3c-1 | Lenkzeit | Lenkzeit sind die Fahrten einschließlich der Standzeit an Zwischenhalten sowie Ausrücken und Einrücken (Leerfahrten). Dass Standzeit an Zwischenhalten als Lenkzeit zählt, ist **vereinfachend und strenger als die Norm**: VO Art. 4 Buchst. j ("Dauer der Lenktätigkeit") klärt den Halt mit Fahrer am Steuer nicht; eine Fahrtunterbrechung ist er nach Buchst. d sicher nicht. Mehr Lenkzeit heißt strengere Prüfung | VO Art. 4 Buchst. a (leeres oder beladenes Fahrzeug) und j. |
| A3c-2 | Wendezeit | Arbeitszeit, keine Lenkzeit (TV-N SH Anlage 3 § 4 Abs. 2 und 3). **Nach der Normprüfung geändert:** Als Unterbrechung zählt die Wendezeit nur bei durchschnittlichem Haltestellenabstand bis 3 km (FPersV § 1 Abs. 3 Nr. 2, "auch Arbeitsunterbrechungen ... z. B. Wendezeiten"), dort ab 10 min. Bei Nr. 1 und bei VO Art. 7 zählen nur echte Fahrtunterbrechungen (Art. 4 Buchst. d: keine anderen Arbeiten), also Pausen zwischen Dienststücken | In der Vorbereitung stand "ab 15 min als Teil (Nr. 1, Art. 7)"; das deckt der Wortlaut nicht. |
| A3c-3* | Vorbereitung und Abschluss | 10 min Vorbereitung vor jedem Ausrücken, 5 min Abschluss am Dienstende, beides Arbeitszeit | TV-N SH Anlage 3 § 4 Abs. 1 rechnet die notwendige Zeit ein; Minutenwerte sind betriebliche Pauschalen ohne Quelle. |
| A3c-4* | Weg zur Ablösestelle | 15 min je Richtung zwischen Betriebshof und Ablösestelle, Arbeitszeit | TV-N SH Anlage 3 § 4 Abs. 1 ("Weg zwischen der Ablösungs- und Abrechnungsstelle"). |
| A3c-5 | Pause | Zeit zwischen zwei Dienststücken (Fahrer ohne Bus) ist keine Arbeitszeit; sie ist Fahrtunterbrechung und, in Teilen ab 15 min, Ruhepause nach ArbZG § 4 | ArbZG § 2 Abs. 1 (Arbeitszeit ohne Ruhepausen). |
| A3c-6* | Geteilter Dienst | Ab 2 h Unterbrechung zwischen zwei Dienststücken; die Unterbrechung ist keine Arbeitszeit | Der TV-N SH regelt nicht ausdrücklich, ob die Teilung Arbeitszeit ist (§ 3, § 4 Abs. 4); keine Arbeitszeit folgt aus ArbZG § 2 Abs. 1. |
| A3c-7* | Dienstarten | Nachtdienst: Arbeit von mehr als 2 h in der Nachtzeit 23 bis 6 Uhr (ArbZG § 2 Abs. 3 und 4, belegt, Werte im Regelwerk); sonst geteilter Dienst; sonst Frühdienst bei Beginn vor 10 Uhr*, sonst Spätdienst | Vom Spiel abgeleitet, nicht gewählt. |
| A3c-8 | Betriebstag | Ein Dienst gehört zum Betriebstag seiner ersten Fahrt; er darf vor 4 Uhr beginnen und nach 28 Uhr enden | Folgt aus A3b-9. |
| A3c-9 | Einrücken | Route von der letzten Haltestelle zum Tor, Fahrzeit wie ein Haltestellenabschnitt mit Faktor zur Ankunft, Zuschlägen und 10 s Halt-Zuschlag, auf 10 s gerundet | Gleich wie das Ausrücken (A3b-21). |
| A3c-10 | Welche Unterbrechungsregel | Linienlänge = längste Variante; durchschnittlicher Haltestellenabstand = Länge geteilt durch Zahl der Abschnitte, der größte Wert der Linie zählt. Über 50 km: VO Art. 7; über 3 km: FPersV § 1 Abs. 3 Nr. 1; sonst Nr. 2. Hat ein Dienst eine Linie mit der strengeren Regel, gilt sie für den ganzen Dienst | FPersV § 1 Abs. 3 nennt ausdrücklich den "durchschnittlichen Haltestellenabstand". Ob die Linienlänge je Variante oder als Summe zählt, ist nicht belegt; der EuGH (C-477/22) stellt auf die Strecke von Start zu Ziel ab. |
| A3c-11 | Überlagerung | Gilt dieselbe Sache nach Gesetz und Tarif, ist die gesetzliche Grenze hart und die tarifliche eine Warnung | Konzept (Lenk- und Ruhezeiten), F12. Ruhezeit folgt mit 3c-2. |
| A3c-12* | Leistung | 1.000 Dienste einer Tagesart in unter 200 ms; gemessen als Rechenzeit des Prozesses (CPU-Zeit). Allein gemessen etwa 45 ms | Test in `tests/dienste.test.ts`. Gemessen als CPU-Zeit, weil parallel laufende Testdateien die Uhrzeit stark verfälschen. |
| A3c-13 | Zeitraster | Alle Dienstzeiten liegen auf 10 s, weil Fahrten und alle Werte der Konfiguration es tun | Konzept: 10 Sekunden. |
| A3c-14 | Mehrere Tage | Ruhezeit und Wochenregeln prüft 3c-2 für alle Tagesarten, die aufeinander folgen können | Nicht Teil von 3c-1. |

### Neu beim Bau (zur Bestätigung)

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A3c-15 | "Ununterbrochene Lenkzeit" (Nr. 2) | Eine Arbeitsunterbrechung ab 10 min unterbricht die Lenkzeit. Die 45 min sind nur nötig nach 4,5 h Lenkzeit ohne eine solche Unterbrechung; genau 4:30:00 h ist erlaubt, jede Sekunde darüber nicht, und wird danach noch gelenkt, muss die nächste Unterbrechung mindestens 45 min dauern. Die Sechstelregel gilt je Dienst (Arbeitsschicht) | FPersV § 1 Abs. 3 Nr. 2 Satz 3 ist mehrdeutig. Diese Lesart liegt am nächsten am Wortlaut: Nr. 2 erklärt Arbeitsunterbrechungen ausdrücklich zu Fahrtunterbrechungen, Nr. 1 sagt "nach einer Lenkzeit" ohne "ununterbrochen", VO Art. 4 Buchst. q kennt "ununterbrochene oder unterbrochene" Lenkdauer. Die strengere Lesart (kurze Wenden setzen nicht zurück) würde Linien wie die Beispiellinie nach 4,5 h zu einer 45-min-Pause zwingen. Bitte bestätigen (Frage 1). |
| A3c-16 | Nr. 1 und VO Art. 7 | Lenkzeit zählt seit der letzten ausreichenden Fahrtunterbrechung zusammen. Nr. 1: 30 min am Stück oder 2 × 20 oder 3 × 15 min, in beliebiger Folge, auch alle vor dem Ende der 4,5 h. Art. 7: 45 min oder 15 min, danach 30 min. Über 4:30:00 h ohne ausreichende Unterbrechung ist nicht speicherbar | FPersV § 1 Abs. 3 Nr. 1 Satz 3 ("innerhalb der Lenkzeit ... oder teils unmittelbar danach"); VO Art. 7 UAbs. 2 ("gefolgt von"). |
| A3c-17 | Pausen nach ArbZG und TV-N SH | Gilt als abgegolten, wenn Wendezeiten und Pausen von jeweils mindestens 10 min zusammen mindestens ein Sechstel der Lenkzeit des Dienstes sind. Sonst prüft das Spiel ArbZG § 4 voll: Ruhepausen sind nur Pausen zwischen Dienststücken, in Teilen ab 15 min, 30 min ab mehr als 6 h und 45 min ab mehr als 9 h Arbeitszeit, höchstens 6 h Arbeit ohne Ruhepause | TV-N SH Anlage 3 § 4 Abs. 3 nennt "die durchschnittlich im Dienst- und Fahrplan vorgesehene reine Fahrzeit"; das Spiel nimmt die Lenkzeit des Dienstes. Ob die Tarifregel durch ArbZG § 7 Abs. 1 Nr. 2 ganz gedeckt ist, sagt keiner der Texte. |
| A3c-18 | Dienstschicht (Warnung) | Warnung über 10 h, stärkere Warnung über 13 h | **Nach der Normprüfung geändert:** TV-N SH Anlage 3 § 2 Abs. 1 mit Fußnoten seit 01.01.2025 nennt 10 h, in dringenden Fällen 13 h (vorher 12 und 14 h); die Protokollerklärung erlaubt "bis zu 13 Stunden". In der Vorbereitung stand 12 h. |
| A3c-19 | Ablösung und Wege | Ablösung zur Abfahrt der ersten Fahrt des Stücks. Wege laufen über den Betriebshof: Endet ein Stück an einer Ablösestelle und beginnt das nächste an einer anderen, sind es zwei Wege; ein Dienst, der mit einer Ablösung beginnt oder endet, hat einen Weg vom oder zum Hof | F6 (Weg je Richtung). Wege zwischen zwei Ablösestellen ohne Hof stehen nicht im Konzept. |
| A3c-20 | Ausrücken und "Bus rechtzeitig" | Ein Stück, das mit der ersten Fahrt eines Umlaufs beginnt, rückt aus; eines, das mit der letzten endet, rückt ein. Der Dienst beginnt dann genau zur Ausrückzeit minus Vorbereitung, Kriterium 9 ist damit durch den Aufbau erfüllt. Fehlt die Route vom oder zum Hof (kein Hof, kein Tor), ist der Dienst nicht speicherbar | F12, Kriterium 9. |
| A3c-21 | Doppelte Fahrten und ungültige Dienste | Eine Fahrt gehört zu höchstens einem Dienst, sonst nicht speicherbar. Ein gespeicherter Dienst, der nach einer Fahrplanänderung nicht mehr passt, bleibt erhalten, wird mit Grund gemeldet und besetzt keine Fahrten | Kriterium 2 und 10. |
| A3c-22 | Dienstnummer | Frei wählbar, höchstens 8 Zeichen, je Tagesart eindeutig ohne Unterschied der Schreibweise; vorgeschlagen wird die nächste freie Zahl | Wie die Liniennummer (A3b-25). |
| A3c-23 | Umlauf ohne Bus | Umlauf k fährt der k-te zugewiesene Bus (F5). Gibt es mehr Umläufe als Busse, ist das bei einem Dienst eine Warnung, kein Verbot | Der Busbedarf meldet es schon (3b). |
| A3c-24 | Bedienhilfen | Fahrten von bis hinzufügen; aneinandergrenzende Stücke im selben Umlauf werden ein Stück; "Rest des Umlaufs in neuen Dienst" erst nach dem Speichern; Klick auf eine Fahrt in der Zeitleiste wählt sie im offenen Dienst (nur zusätzlich zur Tastatur); Löschen mit Rückfrage; Schließen mit ungespeicherten Änderungen zeigt erst einen Hinweis, ein zweites Schließen verwirft (F10) | Bedienung, keine neue Spielfunktion. Ziehen mit der Maus ist noch nicht gebaut, weil alles über Auswahl und Knöpfe geht. |
| A3c-25 | Freie Fahrten in Liste und Fahrplan | Die Linienliste zeigt die freien Fahrten der Tagesart von heute, der Fahrplan je Fahrt den Dienst oder "frei", die Umläufe auch das Einrücken | Kriterium 8. |
| A3c-26 | Fahrtrichtung in der Suche | "Straße, weiter Richtung <nächste Haltestelle>": vorwärts auf dem Netz gesucht (Abbiegeregeln, keine Umkehr durch Kreisverkehre), zuerst auf derselben Straße, sonst auf allen Straßen, höchstens 2.000 m* (`linien.richtungSucheM`); Haltestellen mit gleichem Namen zählen nicht. Ohne Treffer nur der Straßenname. Auch im Haltestellenfenster | Kokos Vorgabe zum Nachtrag 3b. |
| A3c-27 | Bereitschaft, Tarifoption 8 min | Wendezeiten über 2 h je Dienstschicht (Bereitschaftsdienst nach TV-N SH Anlage 3 § 4 Abs. 2) werden in 3c-1 nicht gesondert bewertet, das betrifft den Lohn (4b). Die tarifliche Möglichkeit, schon 8 min anzurechnen (FPersV § 1 Abs. 3 Nr. 2 Satz 5), nutzt der TV-N SH nicht; es bleibt bei 10 min | Wortlaut TV-N SH Anlage 3 § 4 Abs. 3 ("jeweils mindestens zehn Minuten"). |
