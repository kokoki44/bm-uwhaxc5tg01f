/// Web Worker zum Laden der Welt, damit die Oberfläche dabei nicht einfriert.
import { config } from "../config";
import { loadOsmExtract, OsmFormatError, parseOsmGz } from "../data/osm";
import type { TextKey } from "../i18n";
import { buildRenderLayers, type RenderLayers } from "./render";
import { buildWorld, WorldError, type World } from "./world";

export type WeltAuftrag = { type: "laden"; quelle: { art: "url"; url: string } | { art: "bytes"; bytes: ArrayBuffer } };
export type WeltAntwort =
  | { type: "fortschritt"; schritt: TextKey; anteil: number }
  | { type: "fertig"; world: World; render: RenderLayers; elemente: number }
  | { type: "fehler"; key: TextKey; grund: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<WeltAuftrag>) => void) | null;
  postMessage(msg: WeltAntwort): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = async (e) => {
  const send = (m: WeltAntwort) => scope.postMessage(m);
  try {
    send({ type: "fortschritt", schritt: "laden.datei", anteil: 0 });
    const q = e.data.quelle;
    const extract = q.art === "url" ? await loadOsmExtract(q.url) : await parseOsmGz(q.bytes);
    const world = buildWorld(extract, config, (schritt, anteil) => send({ type: "fortschritt", schritt, anteil: anteil * 0.9 }));
    send({ type: "fortschritt", schritt: "laden.karte", anteil: 0.95 });
    const render = buildRenderLayers(extract, world);
    send({ type: "fertig", world, render, elemente: extract.elements.length });
  } catch (err) {
    if (err instanceof WorldError) send({ type: "fehler", key: err.key, grund: "" });
    else if (err instanceof OsmFormatError) send({ type: "fehler", key: "fehler.format", grund: err.message });
    else send({ type: "fehler", key: "fehler.laden", grund: String(err) });
  }
};
