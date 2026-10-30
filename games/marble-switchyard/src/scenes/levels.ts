import type { Scene } from '@shared/engine/scene';
import { clamp, pointInRect } from '@shared/engine/math';
import { Button, ButtonSet } from '@shared/ui/button';
import { drawStars, roundRect, text } from '@shared/ui/draw';
import type { App } from '../app';
import { MAX_LEVEL, THEME } from '../game/constants';
import { drawBackground } from '../game/render';

const COLS = 4;
const ROWS = 5;
const PER_PAGE = COLS * ROWS;
const PAGES = Math.ceil(MAX_LEVEL / PER_PAGE);

/** Level select: pages of 20 with stars; locked levels show a padlock. */
export class LevelSelectScene implements Scene {
  private buttons = new ButtonSet();
  private page: number;
  private W = 1;
  private H = 1;
  private grid = { x: 0, y: 0, cell: 0, gap: 0 };

  constructor(private readonly app: App) {
    this.page = clamp(Math.floor((app.save.data.unlocked - 1) / PER_PAGE), 0, PAGES - 1);
    const { icons } = app;
    this.buttons.add(new Button({ icon: icons.back, style: 'ghost', onTap: () => { app.sfx.click(); app.goMenu(); } }));
    this.buttons.add(new Button({ icon: icons.back, style: 'ghost', onTap: () => this.flip(-1) }));
    this.buttons.add(new Button({ icon: icons.next, style: 'ghost', onTap: () => this.flip(1) }));
  }

  private flip(d: number): void {
    const p = clamp(this.page + d, 0, PAGES - 1);
    if (p !== this.page) {
      this.page = p;
      this.app.sfx.click();
    }
  }

  resize(w: number, h: number): void {
    this.W = w;
    this.H = h;
    const colW = Math.min(w, h * 0.62);
    const colX = (w - colW) / 2;
    const btn = clamp(colW * 0.11, 38, 54);
    const top = clamp(h * 0.02, 10, 24);
    this.buttons.list[0].set(colX + colW * 0.05, top, btn, btn);
    const gap = colW * 0.035;
    const cellW = (colW * 0.88 - gap * (COLS - 1)) / COLS;
    const gridH = h - (top + btn * 2.4) - btn * 2.2;
    const cell = Math.min(cellW, (gridH - gap * (ROWS - 1)) / ROWS / 1.1);
    const gw = cell * COLS + gap * (COLS - 1);
    this.grid = { x: w / 2 - gw / 2, y: top + btn * 2.4, cell, gap };
    const by = this.grid.y + ROWS * (cell * 1.1 + gap) + btn * 0.3;
    this.buttons.list[1].set(w / 2 - btn * 2.2, by, btn, btn);
    this.buttons.list[2].set(w / 2 + btn * 1.2, by, btn, btn);
  }

  update(dt: number): void {
    this.buttons.update(dt);
    this.buttons.list[1].opts.disabled = this.page === 0;
    this.buttons.list[2].opts.disabled = this.page === PAGES - 1;
  }

  private cellRect(i: number) {
    const { x, y, cell, gap } = this.grid;
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    return { x: x + c * (cell + gap), y: y + r * (cell * 1.1 + gap), w: cell, h: cell * 1.1 };
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { W, app } = this;
    drawBackground(ctx, W, this.H);
    const b0 = this.buttons.list[0];
    text(ctx, 'Levels', W / 2, b0.y + b0.h / 2, b0.h * 0.55, THEME.text, { weight: 900 });
    const save = app.save.data;
    for (let i = 0; i < PER_PAGE; i++) {
      const n = this.page * PER_PAGE + i + 1;
      if (n > MAX_LEVEL) break;
      const r = this.cellRect(i);
      const locked = !app.isUnlocked(n);
      const current = n === save.unlocked;
      roundRect(ctx, r.x, r.y, r.w, r.h, r.w * 0.2);
      ctx.fillStyle = locked ? 'rgba(255,255,255,0.05)' : current ? THEME.accent : 'rgba(255,255,255,0.12)';
      ctx.fill();
      if (current) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (locked) {
        const s = r.w * 0.34;
        ctx.globalAlpha = 0.35;
        ctx.drawImage(app.icons.lock, r.x + r.w / 2 - s / 2, r.y + r.h * 0.42 - s / 2, s, s);
        ctx.globalAlpha = 1;
      } else {
        text(ctx, String(n), r.x + r.w / 2, r.y + r.h * 0.4, r.w * 0.34, THEME.text, { weight: 900 });
        drawStars(ctx, r.x + r.w / 2, r.y + r.h * 0.78, r.w * 0.075, save.stars[n - 1] ?? 0, 3, THEME.star);
      }
    }
    const b1 = this.buttons.list[1];
    text(ctx, `${this.page + 1} / ${PAGES}`, W / 2, b1.y + b1.h / 2, b1.h * 0.38, THEME.textDim, { weight: 700 });
    this.buttons.draw(ctx);
  }

  pointerDown(x: number, y: number): void {
    if (this.buttons.down(x, y)) return;
    for (let i = 0; i < PER_PAGE; i++) {
      const n = this.page * PER_PAGE + i + 1;
      if (n > MAX_LEVEL) break;
      const r = this.cellRect(i);
      if (pointInRect(x, y, r.x, r.y, r.w, r.h)) {
        if (this.app.isUnlocked(n)) {
          this.app.sfx.click();
          this.app.play(n);
        } else this.app.sfx.deny();
        return;
      }
    }
  }
}
