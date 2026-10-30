import type { Stage } from './stage';
import type { PointerSink } from './input';

export interface Scene extends PointerSink {
  enter?(): void;
  exit?(): void;
  resize(w: number, h: number): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}

/** Holds the active scene and cross-fades between scenes. */
export class SceneManager implements PointerSink {
  current: Scene | null = null;
  private next: Scene | null = null;
  private fade = 0;
  private dir: -1 | 0 | 1 = 0;

  constructor(private readonly stage: Stage, private readonly fadeTime = 0.18, private readonly fadeColor = '12,10,24') {
    stage.onResize((w, h) => this.current?.resize(w, h));
  }

  go(scene: Scene, animate = true): void {
    if (!animate || !this.current) {
      this.switchTo(scene);
      return;
    }
    this.next = scene;
    this.dir = 1;
  }

  private switchTo(scene: Scene): void {
    this.current?.exit?.();
    this.current = scene;
    scene.resize(this.stage.width, this.stage.height);
    scene.enter?.();
  }

  update(dt: number): void {
    if (this.dir === 1) {
      this.fade += dt / this.fadeTime;
      if (this.fade >= 1) {
        this.fade = 1;
        if (this.next) this.switchTo(this.next);
        this.next = null;
        this.dir = -1;
      }
    } else if (this.dir === -1) {
      this.fade -= dt / this.fadeTime;
      if (this.fade <= 0) {
        this.fade = 0;
        this.dir = 0;
      }
    }
    this.current?.update(dt);
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.current?.render(ctx);
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(${this.fadeColor},${this.fade})`;
      ctx.fillRect(0, 0, this.stage.width, this.stage.height);
    }
  }

  pointerDown(x: number, y: number): void {
    if (this.dir === 0) this.current?.pointerDown?.(x, y);
  }

  pointerMove(x: number, y: number): void {
    this.current?.pointerMove?.(x, y);
  }

  pointerUp(x: number, y: number): void {
    if (this.dir === 0) this.current?.pointerUp?.(x, y);
  }
}
