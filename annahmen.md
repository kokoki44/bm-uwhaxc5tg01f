# Annahmen

Einträge, die Koko prüft. Jeder Wert steht in der zentralen Konfiguration (`src/config/config.json`).

## Etappe 0

| Nr. | Wert | Gewählt | Begründung |
| --- | --- | --- | --- |
| A0-1 | Simulationstakt `sim.tickRealMs` | 100 ms (10 Takte pro Sekunde) | Fein genug für flüssige Bewegung, grob genug für 60-fachen Zeitraffer mit vielen Bussen. Spielzeit pro Takt = Tempo mal Takt. |
| A0-2 | Nachholgrenze `sim.maxCatchUpTicks` | 20 Takte | Nach einer Pause des Browser-Tabs rechnet die Simulation nicht Minuten nach, sondern höchstens 2 Sekunden. |
| A0-3 | Zeitraffer-Stufen `sim.speeds` | 0, 1, 5, 20, 60 | Aus dem Konzept (Vorschlag 5, 20, 60), dazu Pause und 1-fach. |
| A0-4 | Kartenmitte und Zoom | Norderstedt, Zoom 12 | Nur Startansicht des leeren Kartenrahmens. |
| A0-5 | Testdatensatz als gzip-JSON im Overpass-Format | `norderstedt.osm.json.gz` (2,3 MB) | Eine Datei, Web und Desktop lesen sie gleich. Die Geofabrik-Datei für Schleswig-Holstein wäre viel größer und müsste erst zugeschnitten werden. Overpass liefert genau die Gemeindegrenze. |
| A0-6 | Speicher-Tabelle und Format | Ein Datensatz je Spielstand: Version, Zeitpunkt, Inhalt als JSON | Einfach und für beide Speicher gleich. Das Format der Spielstände füllt sich ab Etappe 4b. |
| A0-7 | Startversion der Speicherstände | 1 | Erste Version. Ältere Stände bleiben ladbar, neuere als die App kennt werden abgelehnt. |
| A0-8 | Platzhalter-Symbol der App | Einfarbige blaue Fläche | Nur damit der Bau funktioniert. Ein richtiges Symbol ist keine Funktion des Konzepts. |
| A0-9 | Hash-Test des Fahrzeugkatalogs | SHA-256 in `fahrzeugkatalog.sha256`, Neusetzen mit `npm run katalog:hash` | Nach deiner Vorgabe: Der Test meldet jede Veränderung der Datei. Nur bei bewusstem Austausch setzt man den Hash neu. |
