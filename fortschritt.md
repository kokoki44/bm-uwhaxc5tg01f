# Fortschritt

## Etappe 0: Projektgerüst und Testinfrastruktur (wartet auf Freigabe)

Fertig:
- Projektgerüst: Vite, TypeScript, MapLibre GL (leerer Kartenrahmen), Tauri 2 für die Desktop-App.
- Simulation als Web Worker mit festem Takt (`src/sim`), Pause und Zeitraffer-Stufen.
- Speicherschnittstelle mit SQLite (Desktop) und IndexedDB (Browser), Versionsprüfung (`src/storage`).
- Zentrale Konfiguration (`src/config/config.json`) und Sprachdatei Deutsch (`src/i18n/de.json`).
- Testdatensatz Norderstedt mit Quellenangabe nach ODbL (`public/data/norderstedt`).
- Fahrzeugkatalog wird gelesen, 63 Spaltennamen werden geprüft, Hash-Test (Datei nur gelesen).
- Tests mit `npm test`: Einzeltests, Rauchtest-Grundgerüst, Oberflächentest der Web-Version.
- GitHub-Workflow (`.github/workflows/ci.yml`): Bau und Test auf Windows und macOS, Web-Version auf GitHub Pages, Test der Pages-Adresse.

Offen:
- Freigabe durch Koko. Workflow ist auf Windows, macOS und für die Pages-Adresse grün (https://kokoki44.github.io/bm-uwhaxc5tg01f/).

Geändert gegenüber Konzept: nichts.
