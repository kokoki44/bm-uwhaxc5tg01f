import type { LinienPlan, PlanAnfrage } from "../linien/plan";
import type { LonLat } from "../world/geo";
import type { RoadNetwork } from "../world/roads";
import type { Snap } from "../world/router";
import type { SimOptions, SimStatus } from "./core";

export type ToWorker =
  | { type: "init"; options: SimOptions }
  | { type: "setSpeed"; speed: number }
  /** Straßennetz einmal beim Spielstart; danach rechnet der Worker ohne weiteren Datenaustausch. */
  | { type: "netz"; network: RoadNetwork; mitte: LonLat }
  | { type: "plan"; id: number; anfrage: PlanAnfrage }
  | { type: "fangen"; id: number; punkt: LonLat; art: "halt" | "weg" };

export type FromWorker =
  | { type: "status"; status: SimStatus }
  | { type: "plan"; id: number; plan: LinienPlan }
  | { type: "fangen"; id: number; snaps: Snap[] }
  | { type: "error"; message: string; id?: number };
