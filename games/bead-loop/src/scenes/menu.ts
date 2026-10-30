import type { Scene } from '@shared/engine/scene';
import { RoundedRectPath } from '@shared/engine/path';
import { clamp } from '@shared/engine/math';
import { Button, ButtonSet } from '@shared/ui/button';
import { text } from '@shared/ui/draw';
import { clearSpriteCache, drawBead } from '@shared/ui/sprites';
import type { App } from '../app';
import { MAX_LEVEL, PALETTE, THEME } from '../game/constants';
import { drawBackground } from '../game/render';

/** Title screen with an animated decorative bead loop. */
export class MenuScene implements Scene {
  private buttons = new ButtonSet();
  private W = 1;
  private H = 1;
  private t = 0;
  private ring!: RoundedRectPath;
  private beadR = 6;

  constructor(private readonly app: App) {
    const lvl = () => Math.min(app.save.data.unlocked, MAX_LEVEL);
    this.buttons.add(new Button({
      label: `Play`, icon: app.icons.play, color: THEME.good,
      onTap: () => { app.sfx.click(); app.play(lvl()); },
    }));
    this.buttons.add(new Button({
      label: 'Levels', icon: app.icons.grid, color: '#5b4a8f',
      onTap: () => { app.sfx.click(); app.goLevels(); },
    }));
  }

  resize(w: number, h: number): void {
    this.W = w;
    this.H = h;
    clearSpriteCache();
    const colW = Math.min(w, h * 0.62);
    const rw = colW * 0.82;
    const rh = rw * 0.62;
    this.ring = new RoundedRectPath(w / 2 - rw / 2, h * 0.3 - rh / 2, rw, rh, rw * 0.14);
    this.beadR = rw * 0.022;
    const bw = Math.min(colW * 0.7, 320);
    const bh = clamp(bw * 0.2, 50, 66);
    this.buttons.list[0].set(w / 2 - bw / 2, h * 0.62, bw, bh);
    this.buttons.list[1].set(w / 2 - bw / 2, h * 0.62 + bh * 1.35, bw, bh);
  }

  update(dt: number): void {
    this.t += dt;
    this.buttons.update(dt);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { W, H, ring } = this;
    const dpr = this.app.stage.dpr;
    drawBackground(ctx, W, H, dpr);

    ctx.beginPath();
    ring.trace(ctx);
    ctx.lineWidth = this.beadR * 3.2;
    ctx.strokeStyle = THEME.track;
    ctx.stroke();
    const n = Math.floor(ring.length / (this.beadR * 2.1));
    for (let i = 0; i < n; i++) {
      const band = Math.floor(i / 6) % PALETTE.length;
      const p = ring.at(((i + this.t * 9) / n) * ring.length);
      const c = PALETTE[band];
      drawBead(ctx, c.hex, p.x, p.y, this.beadR, dpr, c.glyph);
    }

    const cx = W / 2;
    const cy = ring.y + ring.h / 2;
    const size = ring.w * 0.17;
    const bob = Math.sin(this.t * 2) * size * 0.04;
    text(ctx, 'BEAD', cx, cy - size * 0.55 + bob, size, '#fff', { weight: 900, shadow: '#5b3fd6' });
    text(ctx, 'LOOP', cx, cy + size * 0.5 + bob, size, '#ffc93a', { weight: 900, shadow: '#b8561f' });
    text(ctx, 'Tap tubes · sort the loop', cx, ring.y + ring.h + size * 0.75, size * 0.3, THEME.textDim, { weight: 600 });

    const s = this.app.save.data;
    const total = s.stars.reduce((a, b) => a + (b || 0), 0);
    const lvl = Math.min(s.unlocked, MAX_LEVEL);
    const b0 = this.buttons.list[0];
    this.buttons.list[0].opts.label = `Play · Level ${lvl}`;
    this.buttons.draw(ctx);
    text(ctx, `★ ${total} / ${MAX_LEVEL * 3}`, cx, b0.y + b0.h * 2.9, b0.h * 0.34, THEME.star, { weight: 800 });
  }

  pointerDown(x: number, y: number): void {
    this.buttons.down(x, y);
  }
}
