# CLAUDE.md: Arbeitsanleitung für Claude Code

Projekt: Bus-Manager, ein Busunternehmen-Managementspiel auf OpenStreetMap-Basis.

## Quelle der Wahrheit

- `docs/konzept.md` ist die einzige Quelle der Wahrheit für Funktionen, Regeln und Reihenfolge. Lies es vollständig, bevor du anfängst, und lies das jeweilige Kapitel erneut, bevor du eine Etappe beginnst.
- `fahrzeugkatalog.xlsx` (Blatt "Busse") ist die maßgebliche Quelle für Fahrzeugdaten. Die Datei wird nur gelesen, nie verändert. Die Spaltennamen in der ersten Zeile sind fest.
- Was nicht im Konzept steht, wird nicht gebaut. Erfinde keine Funktionen, Spielmodi, Ereignisse (Wetter, Unfälle, Streiks, Baustellen) oder Inhalte.
- Stellen, die im Konzept als später verschoben markiert sind, werden erst gebaut, wenn sie ausgearbeitet sind.

## Ablauf

1. Arbeite eine Etappe nach der anderen in der Reihenfolge der Tabelle im Kapitel "Phasenplan und Abnahme". Beginne eine Etappe erst nach Kokos Freigabe der vorherigen.
2. Vor Beginn jeder Etappe: Schreibe die Abnahmekriterien dieser Etappe auf (ausgehend von der Beispieltabelle im Konzept) und lass sie von Koko bestätigen.
3. Schreibe zu jeder Funktion automatische Tests. Alles läuft mit einem einzigen Befehl (`npm test`). Dazu kommt der Rauchtest durch den Kernzyklus, den du mit jeder Etappe erweiterst.
4. Gib nichts ab, solange ein Test rot ist, auf Windows, auf macOS oder in der Web-Version. Tests werden nicht gelöscht oder abgeschwächt, damit sie grün werden. Ein behobener Fehler bekommt einen eigenen Regressionstest.
5. Schließe jede Etappe mit einem kurzen Bericht ab: was gebaut ist, welche Tests laufen, welche Einträge neu in `annahmen.md` stehen, welche Fragen offen sind. Danach wartest du auf Kokos Freigabe.
6. Führe `fortschritt.md`: was ist fertig, was ist offen, was wurde geändert.

## Fehlende Werte und Unklarheiten

- Fehlt für eine beschriebene Funktion ein Zahlenwert oder eine Detailregel: Wähle einen realistischen Wert, lege ihn in die zentrale Konfiguration und trage ihn mit Begründung in `annahmen.md` ein. Dadurch werden keine Funktionen erweitert.
- Alle Zahlenwerte stehen in der Konfiguration, nicht im Code.
- Bei Unklarheiten über Funktionen und Regeln frage Koko, statt zu raten.
- Alle mit (Vorschlag) markierten Stellen im Konzept hat Koko am 28.10.2026 geprüft und beschlossen. Sie gelten als verbindlich.

## Technik (Empfehlung, Abweichung nur mit Begründung und Meldung)

- Oberfläche: TypeScript, MapLibre GL, Tauri für die Desktop-App.
- Simulation: TypeScript in einem Web Worker mit festem Takt, unabhängig von der Bildrate. Kein Rust-Kern, damit derselbe Code in App und Browser läuft.
- Speicher: gemeinsame Schnittstelle, dahinter SQLite in der Desktop-App und IndexedDB im Browser. Speicherstände tragen eine Version, damit alte Stände ladbar bleiben.
- Zielplattformen von Anfang an: Windows, macOS und Web-Version (GitHub Pages). Alles aus demselben Code.

### Regeln für Plattformunabhängigkeit

- Keine plattformspezifischen Schnittstellen, keine festen Pfade mit Laufwerksbuchstaben, keine Annahmen über Zeilenenden. Pfade und Dateinamen plattformneutral behandeln.
- Speicherstände und Einstellungen im jeweils üblichen Anwenderverzeichnis (Desktop) oder im Browserspeicher (Web).
- Die Web-Version lädt vorbereitete OSM-Auszüge von der Seite (zuerst Norderstedt), weitere Regionen per Overpass oder als gewählte Datei.
- Wenn etwas auf einem System nicht geht, melde es mit Begründung, statt es stillschweigend wegzulassen.

## Oberfläche

- Die Oberfläche ist auf Deutsch. Alle Texte stehen in einer Sprachdatei, damit weitere Sprachen später möglich sind.

## Dateien

- Alle Textdateien sind UTF-8 ohne BOM.
- Textdateien werden nicht mit PowerShell-Befehlen wie Set-Content oder Out-File bearbeitet, weil diese Umlaute zerstören oder ein BOM schreiben können. Bearbeite sie mit den Datei-Werkzeugen (Lesen, Bearbeiten, Schreiben).
- Der Test für die Kodierung (`tests/encoding.test.ts`) bleibt bestehen.

## Subagenten

- Nutze Subagenten, wo es sinnvoll ist, aber nicht für Kleinigkeiten, weil jeder Subagent Kontingent verbraucht.
- Sinnvoll sind: (a) unabhängige Teilaufgaben parallel, zum Beispiel Quellenrecherche für Korridore oder Daten, Schreiben von Tests, Prüfen des Fahrzeugkatalogs; (b) eine unabhängige Prüfung am Ende jeder Etappe: Ein Subagent, der den Code nicht geschrieben hat, vergleicht das Ergebnis mit dem Konzept und den bestätigten Abnahmekriterien und meldet Abweichungen, ohne selbst etwas zu ändern.
- Für Subagenten gelten dieselben Regeln: `docs/konzept.md` ist die Quelle der Wahrheit, nichts erfinden, fehlende Werte als Annahme in `annahmen.md`.
- Nur der Hauptagent committet und pusht. Zwei Agenten ändern nie gleichzeitig dieselbe Datei.
- Der Bericht jeder Etappe nennt, wofür Subagenten genutzt wurden und was die unabhängige Prüfung ergeben hat.

## GitHub

- Das Repository ist öffentlich und hat einen zufälligen Namen. Es dürfen keine Zugangsdaten, Schlüssel oder privaten Daten ins Repository.
- Der Workflow (GitHub Actions) baut und testet bei jeder Abgabe auf Windows und macOS und veröffentlicht die Web-Version auf GitHub Pages. Er wird in Etappe 0 eingerichtet.
- In den Repo-Einstellungen muss unter "Pages" die Quelle "GitHub Actions" gewählt sein. Sage Koko, wenn dieser Schritt noch fehlt.

## Voraussetzungen auf dem Rechner

Prüfe zu Beginn von Etappe 0, was fehlt, und melde es:

- Windows: Git, Node.js, Rust mit den Microsoft C++ Build Tools, WebView2.
- macOS: Git, Node.js, Rust, Xcode Command Line Tools.

## Schreibregel

In allen Texten, die du für Koko schreibst (Berichte, Fragen, Oberflächentexte), kommen keine Gedankenstriche (weder der kurze noch der lange) vor, auch nicht mit Leerzeichen davor und danach. Nutze stattdessen Komma, Doppelpunkt oder Punkt.
