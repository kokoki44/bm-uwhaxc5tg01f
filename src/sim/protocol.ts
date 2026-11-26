import type { DienstAnfrage, TagesAuswertung } from "../dienste/pruefung";
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
  | { type: "fangen"; id: number; punkt: LonLat; art: "halt" | "weg" }
  /** Dienste einer Tagesart nach dem Regelwerk prüfen (Etappe 3c-1). */
  | { type: "dienste"; id: number; anfrage: DienstAnfrage };

export type FromWorker =
  | { type: "status"; status: SimStatus }
  | { type: "plan"; id: number; plan: LinienPlan }
  | { type: "dienste"; id: number; auswertung: TagesAuswertung }
  | { type: "fangen"; id: number; snaps: Snap[] }
  | { type: "error"; message: string; id?: number };
