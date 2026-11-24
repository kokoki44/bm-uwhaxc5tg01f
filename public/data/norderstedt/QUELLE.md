# Testdatensatz Norderstedt

Daten: © OpenStreetMap-Mitwirkende, lizenziert unter der Open Database License (ODbL) 1.0.
https://www.openstreetmap.org/copyright und https://opendatacommons.org/licenses/odbl/1-0/

Abruf: Overpass API (https://overpass-api.de), einmalig am 24.11.2026 mit `npm run daten:norderstedt` (Skript `scripts/prepare-norderstedt.mjs`).
Stand der OSM-Daten 2026-11-24T21:56:35Z
Gebiet: Verwaltungsgrenze Norderstedt (admin_level 8).
Datei: `norderstedt.osm.json.gz`, gzip-komprimiertes Overpass-JSON mit Geometrie und Knotenlisten. Prüfsumme: `norderstedt.sha256`.

Inhalt: Straßen (highway) mit Knotenlisten, Haltestellen (highway=bus_stop, Bussteige mit bus=yes), Ampeln (highway=traffic_signals), Abbiegeverbote (type=restriction), Gebäude, Landnutzung, Wasser, Grünflächen, Gewässer, Orte von Interesse (amenity, shop), Verwaltungsgrenze der Gemeinde und Verwaltungsgrenzen darunter (admin_level 9 und 10). Für Norderstedt sind in OSM keine Grenzen der Ortsteile als Verwaltungsgrenzen erfasst, die Abfrage liefert dafür kein Ergebnis.

Bearbeitung: Tags auf die vom Spiel genutzten Schlüssel gekürzt, Koordinaten auf 6 Nachkommastellen gerundet (etwa 10 cm). Sonst unverändert. Die Datei ist damit eine abgeleitete Datenbank und steht ebenfalls unter der ODbL.

Overpass-Abfrage:

    [out:json][timeout:240];
    area["name"="Norderstedt"]["boundary"="administrative"]["admin_level"="8"]->.a;
    (
      way(area.a)["highway"]->.h;
      .h;
      node(area.a)["highway"~"^(bus_stop|traffic_signals)$"];
      node(area.a)["public_transport"="platform"]["bus"="yes"];
      rel(bw.h)["type"="restriction"];
      way(area.a)["building"];
      way(area.a)["landuse"];
      way(area.a)["natural"~"^(water|wood|scrub|grassland|heath|wetland)$"];
      way(area.a)["leisure"~"^(park|garden|pitch|playground|golf_course|nature_reserve|common|sports_centre|stadium|swimming_pool)$"];
      way(area.a)["waterway"~"^(river|stream|canal)$"];
      node(area.a)["amenity"];
      node(area.a)["shop"];
      way(area.a)["shop"];
      way(area.a)["amenity"~"^(school|kindergarten|college|university|hospital|clinic|marketplace|cinema|theatre|library|townhall|restaurant|cafe)$"];
      relation["boundary"="administrative"]["name"="Norderstedt"]["admin_level"="8"];
      relation(area.a)["boundary"="administrative"]["admin_level"~"^(9|10)$"];
    );
    out geom;
