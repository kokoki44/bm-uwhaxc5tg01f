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
| A2-28 | Bereich Betriebshof in der Oberfläche | Ein Knopf "Betriebshof" in der Kopfleiste öffnet die Standortliste (vor dem Kauf) oder den Editor | Die Menüleiste am Rand mit allen Bereichen entsteht, sobald es weitere Bereiche gibt. |

### Nachträge nach der Freigabe von Etappe 2 (25.11.2026)

| Nr. | Thema | Festlegung | Begründung |
| --- | --- | --- | --- |
| A2-30 | Batterie: Bereich ohne Schritt | Standardschritt 50 kWh (`catalog.batterieStandardSchrittKwh`) ab dem Minimum. Das Maximum aus dem Datenblatt ist immer wählbar, auch wenn es kein volles Vielfaches ist (Ebusco 2.2: 350, 400, 450, 500 kWh; Yutong U12 LF: 465, 515, 528 kWh). Betrifft 25 Modelle | Vorgabe Koko: Standardschritt statt nur Maximum. 50 kWh: **Schätzung, in Etappe 6 prüfen** (übliche Packgrößen liegen zwischen etwa 35 und 100 kWh). Das Maximum bleibt erhalten, weil es ein echter Datenblattwert ist; die Regel "endet beim letzten vollen Schritt" gilt weiter für Modelle mit eigenem Schritt. |
| A2-31 | Wendemöglichkeit | Netz aus Tor und Fahrwegen (breit verbunden), jedes Tor am Rand hängt zusätzlich an der Straße. Ein Fahrweg hat eine Wendemöglichkeit, wenn er auf einem Rundweg liegt (auch Durchfahrt: zwei Tore im selben Netz) oder wenn hinter ihm, von der Straße aus gesehen, eine Wendefläche oder ein Rundweg liegt. Wendefläche: Tor oder Fahrweg mit beiden Seiten mindestens 27 m (`betriebshof.wendeflaecheMinM`). Gewarnt wird bei Fahrwegen ohne Wendemöglichkeit, an denen erreichbare Stellplätze, Ladeplätze oder Hallen liegen. Das Layout bleibt gültig | Vorgabe Koko: warnen, Definition als Annahme. 27 m: größter Wendekreis im Katalog (26,59 m, VDL Citea LE 149, 15-m-Bus), auf ganze Meter aufgerundet, damit jeder Bus wenden kann. **Schätzung, in Etappe 6 prüfen.** Ladeplätze und Hallen zählen mit, weil sie wie Stellplätze über die Stirnseite angefahren werden. Folge: Ein Layout mit einem Tor und einem schmalen Fahrweg (wie das bisherige Beispiel) zeigt jetzt diese Warnung. Das Beispiel-Layout (A2-9) hat deshalb ein zweites Tor am Ostrand statt der letzten 4 m Fahrweg; die Kosten bleiben gleich, weil Tor und Fahrweg je m² gleich viel kosten. |
| A2-32 | Ein zusammenhängendes Netz | Alle Tore und Fahrwege müssen ein Netz bilden. Ein Tor, das mit seinem Fahrweg ein eigenes Netz bildet, macht das Layout ungültig (Meldung "getrennte Netze"). Mehrere Tore im selben Netz sind erlaubt | Vorgabe Koko. |
| A2-33 | Seitenverhältnis | Lange Seite höchstens 10 mal die kurze (`grundstueck.maxSeitenverhaeltnis` = 10), beim Startgrundstück und bei jedem Zukauf. Die Zukauf-Anzeige nennt den kleineren der beiden Höchstwerte aus Fläche und Seitenverhältnis. Ein Zukauf an der langen Seite, der das Verhältnis verbessert, ist immer möglich | Vorgabe Koko und Konzept. |
| A2-34 | Baujahr im Gebrauchtmarkt | Fehlt baujahr_von, erzeugt der Gebrauchtmarkt das Baujahr zwischen (aktuelles Jahr minus lebensdauer_jahre) und (baujahr_bis, sonst aktuelles Jahr). Betrifft 105 nutzbare Modelle (107 Zeilen, davon 2 ohne Länge) | Vorgabe Koko. Wird mit dem Gebrauchtmarkt in Etappe 3a gebaut. Die 16 fehlenden Standardwerte für fiktive Busse bleiben bis Etappe 7a offen. |
