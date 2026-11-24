import { config } from "../config";
import type { SimStatus } from "./core";
import type { FromWorker, ToWorker } from "./protocol";

/** Startet den Simulations-Worker und meldet jeden Statuswert an die Oberfläche. */
export function startSimulation(onStatus: (s: SimStatus) => void): { setSpeed(speed: number): void; stop(): void } {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const send = (m: ToWorker) => worker.postMessage(m);
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    if (e.data.type === "status") onStatus(e.data.status);
    else console.error(e.data.message);
  };
  send({ type: "init", options: config.sim });
  return { setSpeed: (speed) => send({ type: "setSpeed", speed }), stop: () => worker.terminate() };
}
