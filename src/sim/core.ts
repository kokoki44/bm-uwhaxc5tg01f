/**
 * Simulationskern in festem Takt, unabhängig von der Bildrate.
 * Reine Logik ohne Worker- oder Browser-Abhängigkeit, damit sie in Tests und im Worker gleich läuft.
 * Etappe 0: nur Takt, Pause und Geschwindigkeit. Spiellogik folgt in späteren Etappen.
 */
export interface SimOptions {
  tickRealMs: number;
  maxCatchUpTicks: number;
  speeds: number[];
  startSpeed: number;
}

export interface SimStatus {
  ticks: number;
  gameSeconds: number;
  speed: number;
}

export class SimCore {
  private ticks = 0;
  private gameSeconds = 0;
  private speed: number;
  private rest = 0;

  constructor(private readonly opt: SimOptions) {
    this.speed = opt.startSpeed;
  }

  setSpeed(speed: number): void {
    if (!this.opt.speeds.includes(speed)) throw new Error(`Unzulässige Geschwindigkeit: ${speed}`);
    this.speed = speed;
  }

  /** Füttert vergangene Echtzeit. Rechnet in ganzen, festen Schritten, Rest bleibt für später. */
  advance(realMs: number): number {
    this.rest += realMs;
    let n = Math.floor(this.rest / this.opt.tickRealMs);
    this.rest -= n * this.opt.tickRealMs;
    if (n > this.opt.maxCatchUpTicks) n = this.opt.maxCatchUpTicks; // Nachholen begrenzen
    for (let i = 0; i < n; i++) this.step();
    return n;
  }

  private step(): void {
    if (this.speed === 0) return; // Pause: Zeit steht still
    this.ticks++;
    this.gameSeconds += (this.speed * this.opt.tickRealMs) / 1000;
  }

  status(): SimStatus {
    return { ticks: this.ticks, gameSeconds: this.gameSeconds, speed: this.speed };
  }
}
