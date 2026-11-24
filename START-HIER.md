# Startpaket Bus-Manager (für Koko)

Inhalt:
- `docs/konzept.md`: das komplette Spielkonzept (Stand 24.11.2026)
- `fahrzeugkatalog.xlsx`: Fahrzeugkatalog (Stand v18, siehe Hinweis unten)
- `CLAUDE.md`: Arbeitsregeln, die Claude Code automatisch liest
- `STARTPROMPT.md`: Text, den du Claude Code als erste Aufgabe gibst

## Einrichtung

1. Auf GitHub ein neues, öffentliches Repository anlegen. Der Name soll eine zufällige, lange Zeichenfolge sein, zum Beispiel `bm-` plus 12 zufällige Buchstaben und Zahlen. Kein README anlegen lassen.
2. Das Repository auf den PC klonen (oder einen Ordner anlegen und `git init` ausführen, später mit dem Repository verbinden).
3. Den Inhalt dieses Pakets in den Ordner kopieren.
4. In den Repo-Einstellungen unter "Pages" als Quelle "GitHub Actions" wählen. Die Seite liegt später unter `https://<dein-name>.github.io/<repo-name>/`.
5. Im Ordner Claude Code starten und den Inhalt von `STARTPROMPT.md` als erste Nachricht einfügen.
6. Nach jeder Etappe: Spiel auf Windows, auf dem Mac und in der Web-Version ausprobieren, dann Freigabe oder Änderungswünsche an Claude Code geben.

## Hinweise

- Das Repository ist öffentlich. Lege keine Zugangsdaten oder privaten Daten hinein. Ein zufälliger Name macht die Seite nur schwer auffindbar, nicht geschützt.
- Der Fahrzeugkatalog hier ist v18. Deine neuere Version v19 (mit deinen Änderungen) ersetzt die Datei `fahrzeugkatalog.xlsx`, sobald du sie hineinkopierst.
- Das Konzept lebt weiter im Dokument "Bus-Manager Spielkonzept" bei Claude. Wenn wir dort etwas ändern, exportiere ich die Datei neu und du ersetzt `docs/konzept.md`.
- Offene Punkte stehen im Konzept im Kapitel "Entscheidungen und nächste Module".
