import { chooseTap } from '../game/advisor';
import type { SimState } from '../sim/types';

/**
 * DEV ONLY: plays the level by itself with the planning bot (see
 * game/advisor.ts). Imported only behind `import.meta.env.DEV`, so it never
 * ships. There is no single "solution": the game is real-time and many tap
 * orders and timings clear a level; the bot finds one of them on the fly.
 */
export class AutoPlayer {
  private clock = 0;
  private next = 0;

  constructor(private readonly think = 0.3) {}

  update(dt: number, s: SimState, tap: (tube: number) => void): void {
    this.clock += dt;
    if (this.clock < this.next) return;
    this.next = this.clock + this.think;
    const t = chooseTap(s);
    if (t >= 0) tap(t);
  }
}
