/// Web Worker der Simulation. Dünne Hülle um SimCore.
import { SimCore } from "./core";
import type { FromWorker, ToWorker } from "./protocol";

interface WorkerScope {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage(msg: FromWorker): void;
}
const scope = self as unknown as WorkerScope;

let core: SimCore | null = null;
let last = 0;

scope.onmessage = (e) => {
  try {
    const msg = e.data;
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
    }
  } catch (err) {
    scope.postMessage({ type: "error", message: String(err) });
  }
};
