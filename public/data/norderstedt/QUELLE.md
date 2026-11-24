# Testdatensatz Norderstedt

Daten: © OpenStreetMap-Mitwirkende, lizenziert unter der Open Database License (ODbL) 1.0.
https://www.openstreetmap.org/copyright und https://opendatacommons.org/licenses/odbl/1-0/

Abruf: Overpass API (https://overpass-api.de), einmalig am 24.11.2026 mit `npm run daten:norderstedt` (Skripte `scripts/prepare-norderstedt.mjs` und `scripts/norderstedt-filter.mjs`).
Stand der OSM-Daten 2026-11-24T22:43:47Z
Gebiet: Verwaltungsgrenze Norderstedt (admin_level 8) und ein Rand von 2 km um die Gemeinde.
Datei: `norderstedt.osm.json.gz`, gzip-komprimiertes Overpass-JSON mit Geometrie und Knotenlisten. Prüfsumme: `norderstedt.sha256`.

Inhalt in der Gemeinde: Straßen (highway) mit Knotenlisten, Haltestellen (highway=bus_stop, Bussteige mit bus=yes), Ampeln (highway=traffic_signals), Abbiegeverbote (type=restriction), Gebäude, Landnutzung, Wasser, Grünflächen, Gewässer, Orte von Interesse (amenity, shop), Verwaltungsgrenze der Gemeinde und Verwaltungsgrenzen darunter (admin_level 9 und 10). Für Norderstedt sind in OSM keine Grenzen der Ortsteile als Verwaltungsgrenzen erfasst, die Abfrage liefert dafür kein Ergebnis.

Inhalt im Rand von 2 km: nur Straßen, die ein Bus befahren darf, dazu Ampeln und Abbiegeregeln auf diesen Straßen. Keine Gebäude, kein Grün, keine Haltestellen, keine Orte von Interesse.

Bearbeitung: Tags auf die vom Spiel genutzten Schlüssel gekürzt, Koordinaten auf 6 Nachkommastellen gerundet (etwa 10 cm). In der Gemeinde Fuß-, Rad- und Feldwege entfernt (sie werden weder befahren noch gezeichnet). Im Rand alle Straßen entfernt, die ein Bus nicht befahren darf oder die weiter als 2 km von der Grenze liegen. Abbiegeregeln entfernt, deren Wege nicht im Auszug liegen. Sonst unverändert. Die Datei ist damit eine abgeleitete Datenbank und steht ebenfalls unter der ODbL.

Overpass-Abfragen:

1. Grenze der Gemeinde (für den Rahmen mit Rand):

       [out:json][timeout:60];
       relation["boundary"="administrative"]["name"="Norderstedt"]["admin_level"="8"];
       out geom;

2. Daten. Der Rahmen RAHMEN (Süd, West, Nord, Ost) ist die Ausdehnung der Grenze plus 2 km, beim Abruf 53.63003,9.90441,53.77789,10.10329. BUSSTRASSEN ist die Liste `roads.busHighways` aus `src/config/config.json`.

       [out:json][timeout:300];
       area["name"="Norderstedt"]["boundary"="administrative"]["admin_level"="8"]->.a;
       (
         way(area.a)["highway"]->.h;
         way(RAHMEN)["highway"~"^(BUSSTRASSEN)$"]->.r1;
         way(RAHMEN)["highway"]["bus"~"^(yes|designated|permissive)$"]->.r2;
         way(RAHMEN)["highway"]["psv"~"^(yes|designated|permissive)$"]->.r3;
         .h; .r1; .r2; .r3;
         node(RAHMEN)["highway"="traffic_signals"];
         rel(bw.h)["type"="restriction"];
         rel(bw.r1)["type"="restriction"];
         node(area.a)["highway"="bus_stop"];
         node(area.a)["public_transport"="platform"]["bus"="yes"];
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
