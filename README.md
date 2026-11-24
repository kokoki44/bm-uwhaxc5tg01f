# Bus-Manager

Busunternehmen-Managementspiel auf OpenStreetMap-Basis. Desktop-App (Windows, macOS) und Web-Version aus demselben Code. Die Spielregeln stehen in `docs/konzept.md`, die Arbeitsregeln in `CLAUDE.md`.

## Einrichtung

### Windows

1. Git, Node.js (24 oder neuer) installieren.
2. Rust über https://rustup.rs installieren, dazu die "Microsoft C++ Build Tools" (Workload "Desktop-Entwicklung mit C++"). WebView2 ist bei Windows 11 vorhanden.
3. Im Projektordner:

```
npm ci
npx playwright install chromium
npm test
```

### macOS

1. Xcode Command Line Tools (`xcode-select --install`), Git und Node.js (24 oder neuer) installieren.
2. Rust über https://rustup.rs installieren. Danach in der Konsole einmal `source "$HOME/.cargo/env"` ausführen (oder ein neues Terminalfenster öffnen), sonst wird `cargo` nicht gefunden.
3. Im Projektordner:

```
npm ci
npx playwright install chromium
npm test
```

Der Schritt `npx playwright install chromium` ist einmalig nötig, bevor `npm test` den Browsertest ausführen kann. Fehlt der Browser, bricht `npm test` mit einer kurzen Meldung ab.

## Befehle

| Befehl | Wirkung |
| --- | --- |
| `npm test` | Alle Tests: Einzeltests, Rauchtest, Oberflächentest der Web-Version |
| `npm run dev` | Web-Version lokal starten (http://localhost:5173) |
| `npm run build` | Web-Version bauen (Ordner `dist`) |
| `npx tauri dev` | Desktop-App im Entwicklungsmodus |
| `npx tauri build --no-bundle` | Desktop-App bauen |
| `npm run katalog:hash` | Hash von `fahrzeugkatalog.xlsx` neu setzen, nur nach bewusstem Austausch der Datei |

## Daten

Kartendaten © OpenStreetMap-Mitwirkende, ODbL 1.0, siehe `public/data/norderstedt/QUELLE.md`.
