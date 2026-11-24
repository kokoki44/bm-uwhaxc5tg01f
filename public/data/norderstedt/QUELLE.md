# Testdatensatz Norderstedt

Daten: © OpenStreetMap-Mitwirkende, lizenziert unter der Open Database License (ODbL) 1.0.
https://www.openstreetmap.org/copyright und https://opendatacommons.org/licenses/odbl/1-0/

Abruf: Overpass API (https://overpass-api.de), Stand der OSM-Daten 2026-11-24T20:27:04Z.
Gebiet: Verwaltungsgrenze Norderstedt (admin_level 8).
Inhalt: Straßen (highway), Haltestellen und öffentlicher Verkehr (public_transport, Busrelationen), Gebäude (building), Landnutzung (landuse), Orte (amenity), Verwaltungsgrenze.
Datei: norderstedt.osm.json.gz (gzip-komprimiertes Overpass-JSON mit Geometrie).

Overpass-Abfrage:

    [out:json][timeout:180];
    area["name"="Norderstedt"]["boundary"="administrative"]["admin_level"="8"]->.a;
    (way(area.a)["highway"];node(area.a)["highway"="bus_stop"];node(area.a)["public_transport"];
     relation(area.a)["route"="bus"];way(area.a)["building"];way(area.a)["landuse"];
     node(area.a)["amenity"];
     relation["boundary"="administrative"]["name"="Norderstedt"]["admin_level"="8"];);
    out geom tags;

Die Daten sind unverändert aus der Abfrage übernommen (nur gzip-komprimiert). Abgeleitete Datenbanken (Straßennetz, Nachfragegitter) ab Etappe 1 stehen ebenfalls unter ODbL.
