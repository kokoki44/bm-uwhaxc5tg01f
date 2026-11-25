/// Web Worker der Simulation. Dünne Hülle um SimCore und die Linienberechnung.
import { config } from "../config";
import { fange, fangIndex, type FangIndex } from "../linien/fangen";
import { berechneLinie } from "../linien/plan";
import { RoutenCache } from "../linien/strecke";
import type { RoadNetwork } from "../world/roads";
import { SimCore } from "./core";
import type { FromWorker, ToWorker } from "./protocol";

interface WorkerScope {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage(msg: FromWorker): void;
}
const scope = self as unknown as WorkerScope;

let core: SimCore | null = null;
let last = 0;
let netz: { net: RoadNetwork; fang: FangIndex; cache: RoutenCache } | null = null;

scope.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      core = new SimCore(msg.options);
      last = performance.now();
      setInterval(() => {
        const now = performance.now();
        core!.advance(now - last);
        last = now;
        scope.postMessage({ type: "status", status: core!.status() });
      }, msg.options.tickRealMs);
    } else if (msg.type === "setSpeed") {
      core?.setSpeed(msg.speed);
    } else if (msg.type === "netz") {
      netz = { net: msg.network, fang: fangIndex(msg.network, msg.mitte), cache: new RoutenCache(config.linien.routenCacheGroesse) };
    } else if (msg.type === "plan") {
      if (!netz) throw new Error("Straßennetz fehlt im Worker");
      scope.postMessage({ type: "plan", id: msg.id, plan: berechneLinie(netz.net, msg.anfrage, config.linien, config.roads, netz.cache) });
    } else if (msg.type === "fangen") {
      if (!netz) throw new Error("Straßennetz fehlt im Worker");
      scope.postMessage({ type: "fangen", id: msg.id, snaps: fange(netz.net, netz.fang, msg.punkt, msg.art, config.stops) });
    }
  } catch (err) {
    scope.postMessage({ type: "error", message: String(err), id: "id" in msg ? msg.id : undefined });
  }
};
