/**
 * requestAnimationFrame loop with clamped delta time and pause/resume.
 * Pause it from Playables.onPause — Playables requires ALL execution
 * (logic, rendering, audio) to stop while paused.
 */
export class GameLoop {
  private raf = 0;
  private last = 0;
  private running = false;
  private paused = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
    private readonly maxDt = 1 / 20,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    if (!this.paused) this.raf = requestAnimationFrame(this.tick);
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    cancelAnimationFrame(this.raf);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.last = performance.now();
    if (this.running) this.raf = requestAnimationFrame(this.tick);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  private tick = (now: number): void => {
    if (!this.running || this.paused) return;
    const dt = Math.min(Math.max(0, (now - this.last) / 1000), this.maxDt);
    this.last = now;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.tick);
  };
}
