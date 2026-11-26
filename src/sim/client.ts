import { config } from "../config";
import type { DienstAnfrage, TagesAuswertung } from "../dienste/pruefung";
import type { LinienPlan, PlanAnfrage } from "../linien/plan";
import type { LonLat } from "../world/geo";
import type { RoadNetwork } from "../world/roads";
import type { Snap } from "../world/router";
import type { SimStatus } from "./core";
import type { FromWorker, ToWorker } from "./protocol";

export interface Simulation {
  setSpeed(speed: number): void;
  stop(): void;
  /** Übergibt das Straßennetz einmal an den Worker. */
  setzeNetz(network: RoadNetwork, mitte: LonLat): void;
  /** Berechnet eine Linie im Worker (Routen, Fahrzeiten, Fahrten, Busbedarf). */
  plane(anfrage: PlanAnfrage): Promise<LinienPlan>;
  /** Rastet einen Punkt auf das Busnetz ein. */
  fange(punkt: LonLat, art: "halt" | "weg"): Promise<Snap[]>;
  /** Prüft die Dienste einer Tagesart im Worker und ermittelt die freien Fahrten. */
  pruefeDienste(anfrage: DienstAnfrage): Promise<TagesAuswertung>;
}

/** Startet den Simulations-Worker und meldet jeden Statuswert an die Oberfläche. */
export function startSimulation(onStatus: (s: SimStatus) => void): Simulation {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const send = (m: ToWorker) => worker.postMessage(m);
  let naechste = 1;
  const offen = new Map<number, { ok: (v: never) => void; fehler: (e: Error) => void }>();
  const frage = <T>(m: (id: number) => ToWorker): Promise<T> =>
    new Promise<T>((ok, fehler) => {
      const id = naechste++;
      offen.set(id, { ok: ok as (v: never) => void, fehler });
      send(m(id));
    });
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const d = e.data;
    if (d.type === "status") onStatus(d.status);
    else if (d.type === "plan" || d.type === "fangen" || d.type === "dienste") {
      const o = offen.get(d.id);
      offen.delete(d.id);
      o?.ok((d.type === "plan" ? d.plan : d.type === "fangen" ? d.snaps : d.auswertung) as never);
    } else {
      console.error(d.message);
      if (d.id !== undefined) {
        offen.get(d.id)?.fehler(new Error(d.message));
        offen.delete(d.id);
      }
    }
  };
  send({ type: "init", options: config.sim });
  return {
    setSpeed: (speed) => send({ type: "setSpeed", speed }),
    stop: () => worker.terminate(),
    setzeNetz: (network, mitte) => send({ type: "netz", network, mitte }),
    plane: (anfrage) => frage<LinienPlan>((id) => ({ type: "plan", id, anfrage })),
    fange: (punkt, art) => frage<Snap[]>((id) => ({ type: "fangen", id, punkt, art })),
    pruefeDienste: (anfrage) => frage<TagesAuswertung>((id) => ({ type: "dienste", id, anfrage })),
  };
}
