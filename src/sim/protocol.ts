import type { SimOptions, SimStatus } from "./core";

export type ToWorker = { type: "init"; options: SimOptions } | { type: "setSpeed"; speed: number };
export type FromWorker = { type: "status"; status: SimStatus } | { type: "error"; message: string };
