import '@shared/styles/base.css';
import { bootPlayable } from '@shared/boot';
import type { Scene } from '@shared/engine/scene';
import { SaveStore } from '@shared/save/save-store';
import { text } from '@shared/ui/draw';

interface SaveData {
  taps: number;
}
const save = new SaveStore<SaveData>(() => ({ taps: 0 }), 1);

/** Starter scene: replace with your game. */
class HelloScene implements Scene {
  private w = 1;
  private h = 1;
  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
  }
  update() {}
  render(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#1b1530';
    ctx.fillRect(0, 0, this.w, this.h);
    text(ctx, '__GAME_TITLE__', this.w / 2, this.h * 0.42, 40, '#fff', { weight: 900 });
    text(ctx, `Taps: ${save.data.taps}`, this.w / 2, this.h * 0.52, 22, 'rgba(255,255,255,0.7)');
  }
  pointerDown() {
    save.data.taps++;
    save.save();
  }
}

void bootPlayable({
  drawSplash(ctx, w, h) {
    ctx.fillStyle = '#1b1530';
    ctx.fillRect(0, 0, w, h);
    text(ctx, 'Loading…', w / 2, h / 2, 24, '#fff');
  },
  async load() {
    await save.load();
  },
  firstScene: () => new HelloScene(),
  onPause: () => void save.flush(),
});
