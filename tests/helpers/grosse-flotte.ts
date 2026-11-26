import type { DienstAnfrage, LinieDaten } from "../../src/dienste/pruefung";
import type { Dienst } from "../../src/dienste/typen";

/**
 * Große Flotte für Leistung und Determinismus (Kriterium 13): 100 Linien mit je 10 Umläufen zu 30 Fahrten (20 min Fahrt,
 * 10 min Wende) und 1.000 Dienste zu je 15 Fahrten, zusammen 15.000 besetzte Fahrten.
 */
export function grosseFlotte(): DienstAnfrage {
  const linien: LinieDaten[] = [];
  const dienste: Dienst[] = [];
  for (let i = 0; i < 100; i++) {
    const l: LinieDaten = {
      linie: i + 1, nummer: String(i + 1), busse: 10,
      varianten: [
        { id: 1, lengthM: 2400, abschnitte: 2, start: { ort: "A", name: "Halt A" }, ziel: { ort: "B", name: "Halt B" } },
        { id: 2, lengthM: 2400, abschnitte: 2, start: { ort: "B", name: "Halt B" }, ziel: { ort: "A", name: "Halt A" } },
      ],
      fahrten: [], umlaeufe: [],
    };
    for (let k = 0; k < 10; k++) {
      const refs = Array.from({ length: 30 }, (_, j) => {
        const ab = 5 * 3600 + k * 60 + j * 1800;
        const v = j % 2 ? 2 : 1;
        l.fahrten.push({ variante: v, schluessel: `t${ab}`, abfahrtS: ab, ankunftS: ab + 1200 });
        return { variante: v, schluessel: `t${ab}` };
      });
      l.umlaeufe.push({ fahrten: refs, ausrueck: { abHofS: 5 * 3600 + k * 60 - 600, fahrzeitS: 600 }, einrueck: { anHofS: 5 * 3600 + k * 60 + 29 * 1800 + 1800, fahrzeitS: 600 } });
      dienste.push({ id: dienste.length + 1, nummer: `D${dienste.length + 1}`, tag: "werktag", stuecke: [{ linie: l.linie, fahrten: refs.slice(0, 15) }] });
    }
    linien.push(l);
  }
  return { tag: "werktag", linien, dienste, entwurf: null };
}
