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
| A0-10 | Bekannte `npm audit`-Warnungen | 2 Warnungen mittlerer Stufe: `uuid` in `exceljs` | Koko hat entschieden, sie nicht zu beheben. Sie betreffen nur das Lesen der lokalen Katalogdatei, keine Eingaben von außen. |
| A0-11 | Veröffentlichung auf Pages in zwei Jobs | Bau und Upload in einem Job, `deploy-pages` in einem eigenen | Ein Job fand das Artefakt manchmal nicht, weil die Artefaktliste Bruchteile einer Sekunde nach dem Upload noch leer war. |
| A0-12 | Overpass-Nutzung | Tests laden nie live von Overpass, nur den festen Datensatz im Projekt | Entscheidung von Koko. Live-Abfragen für weitere Regionen nur auf ausdrücklichen Wunsch des Spielers und mit Rücksicht auf die Nutzungsgrenzen. |

## Oberfläche (vorläufig, wartet auf Kokos Bestätigung)

Diese Einträge ersetzen den Punkt "Noch offen" im Kapitel Oberfläche des Konzepts noch nicht. Gebaut wird nur, was Etappe 1 davon braucht.

| Nr. | Thema | Vorschlag | Etappe 1 baut davon |
| --- | --- | --- | --- |
| O-1 | Tastenkürzel (fest, nicht änderbar) | Leertaste: Pause und Weiter. Tasten 1 bis 4: Zeitraffer-Stufen. Strg+S (Mac: Cmd+S): Speichern. Esc: schließt Fenster. Karte verschieben mit gedrückter Maustaste, zoomen mit dem Mausrad. | Leertaste, Tasten 1 bis 4, Esc, Karte verschieben und zoomen. Strg+S erst mit dem Speichern in Etappe 4b. |
| O-2 | Einstellungen | Nur Ton an oder aus, Intervall des Autosave, Textgröße. | Nichts (kein Einstellungsfenster in Etappe 1). |
| O-3 | Kartenstil | Ruhiger, heller OSM-Stil mit gut lesbaren Straßen (nach Bedeutung gestaffelt), Wasser, Grün und Gebäuden. Zoomstufen vom ganzen Stadtgebiet bis zur einzelnen Haltestelle. | Stil mit Straßen nach Bedeutung, Gebäuden, Grün, Wasser, Haltestellen. Zoomstufen als Konfigurationswerte. |
| O-4 | Fahrzeugsymbole | Farbige Punkte in der Linienfarbe, ab starkem Zoom eine kleine Busform mit Fahrtrichtung. | Nichts (es gibt noch keine Fahrzeuge). |
| O-5 | Ton | In Phase 1 kein Ton. Der Schalter in den Einstellungen bleibt ohne Wirkung. | Nichts. |
| O-6 | Barrierefreiheit | Ausreichender Farbkontrast, Informationen nicht nur über Farbe (zusätzlich Symbol oder Muster), alle Menüs mit der Tastatur bedienbar. | Gilt für alles, was Etappe 1 baut (Kontrast, Symbol zusätzlich zur Farbe, Tastaturbedienung). |
