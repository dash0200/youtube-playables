import type { Scene } from '@shared/engine/scene';
import { Particles } from '@shared/engine/particles';
import { Ease } from '@shared/engine/ease';
import { clamp, pointInRect } from '@shared/engine/math';
import { Button, ButtonSet } from '@shared/ui/button';
import { drawStars, roundRect, text } from '@shared/ui/draw';
import { clearSpriteCache } from '@shared/ui/sprites';
import type { App } from '../app';
import { Board } from '../game/board';
import { MAX_LEVEL, PALETTE, THEME } from '../game/constants';
import { computeLayout, type Layout } from '../game/layout';
import { makeLevel, starsFor } from '../game/levels';
import { drawBackground, drawBoard, drawLoopInfo } from '../game/render';

export class PlayScene implements Scene {
  private board: Board;
  private L!: Layout;
  private hud = new ButtonSet();
  private panel = new ButtonSet();
  private fx = new Particles();
  private winT = -1;
  private stars = 0;
  private best = false;
  private W = 1;
  private H = 1;

  constructor(private readonly app: App, private readonly levelNum: number) {
    this.board = new Board(makeLevel(levelNum));
    const { icons } = app;
    this.hud.add(new Button({ icon: icons.back, style: 'ghost', onTap: () => this.click(() => app.goLevels()) }));
    this.hud.add(new Button({ icon: icons.restart, style: 'ghost', onTap: () => this.click(() => app.play(levelNum)) }));
    const last = levelNum >= MAX_LEVEL;
    this.panel.add(new Button({
      label: last ? 'Menu' : 'Next', icon: last ? icons.menu : icons.next, color: THEME.good,
      onTap: () => this.click(() => (last ? app.goMenu() : app.play(levelNum + 1))),
    }));
    this.panel.add(new Button({ icon: icons.restart, color: '#5b4a8f', onTap: () => this.click(() => app.play(levelNum)) }));
    this.panel.add(new Button({ icon: icons.grid, color: '#5b4a8f', onTap: () => this.click(() => app.goLevels()) }));
  }

  private click(fn: () => void): void {
    this.app.sfx.click();
    fn();
  }

  resize(w: number, h: number): void {
    this.W = w;
    this.H = h;
    const lv = this.board.level;
    this.L = computeLayout(w, h, lv.colors, lv.cap, lv.slots);
    this.board.setPorts(this.L.portFrac);
    clearSpriteCache();
    const { colX, colW, btn, hudY } = this.L;
    const m = colW * 0.05;
    this.hud.list[0].set(colX + m, hudY, btn, btn);
    this.hud.list[1].set(colX + colW - m - btn, hudY, btn, btn);
    const pw = Math.min(colW * 0.84, 380);
    const bh = clamp(pw * 0.17, 46, 62);
    const px = w / 2 - pw / 2;
    const by = h / 2 + pw * 0.15;
    this.panel.list[0].set(px + pw * 0.08, by, pw * 0.84, bh);
    this.panel.list[1].set(px + pw * 0.08, by + bh * 1.3, pw * 0.4, bh);
    this.panel.list[2].set(px + pw * 0.52, by + bh * 1.3, pw * 0.4, bh);
  }

  update(dt: number): void {
    const b = this.board;
    b.update(dt);
    for (const e of b.events) {
      const sfx = this.app.sfx;
      if (e.type === 'absorb') sfx.tick(Math.min(b.tubes[e.tube].combo, 12));
      else if (e.type === 'eject') sfx.pop();
      else if (e.type === 'deny') sfx.deny();
      else if (e.type === 'complete') {
        sfx.chime();
        const tb = this.L.tubes[e.tube];
        this.fx.burst(tb.cx, tb.y + tb.h * 0.3, PALETTE[b.tubes[e.tube].color].hex, 18, tb.w * 5, tb.w * 0.07);
      } else if (e.type === 'win') this.onWin();
    }
    b.events.length = 0;
    if (this.winT >= 0) this.winT += dt;
    this.hud.update(dt);
    this.panel.update(dt);
    this.fx.update(dt);
  }

  private onWin(): void {
    const b = this.board;
    this.winT = 0;
    this.stars = starsFor(b.elapsed, b.level.par);
    const prev = this.app.save.data.times[this.levelNum - 1] ?? 0;
    this.best = prev === 0 || b.elapsed < prev;
    this.app.recordWin(this.levelNum, b.elapsed, this.stars);
    this.app.sfx.win();
    this.fx.confetti(this.W / 2, this.H * 0.55, PALETTE.map((p) => p.hex), 90, this.H * 0.9);
  }

  private hintTube(): number {
    if (this.levelNum !== 1 || this.board.taps > 0) return -1;
    return this.board.tubes.findIndex((t) => t.wrongIndex() >= 0);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { W, H, L, board } = this;
    drawBackground(ctx, W, H, this.app.stage.dpr);
    const hint = this.hintTube();
    drawBoard(ctx, board, L, this.app.stage.dpr, hint);
    drawLoopInfo(ctx, board, L, hint >= 0 ? 'Tap the glowing tube!' : null);
    this.hud.draw(ctx);
    if (this.winT > 0.5) this.drawWinPanel(ctx, Math.min(1, (this.winT - 0.5) / 0.35));
    this.fx.render(ctx);
  }

  private drawWinPanel(ctx: CanvasRenderingContext2D, k: number): void {
    const { W, H, L } = this;
    ctx.fillStyle = `rgba(8,6,18,${0.6 * k})`;
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(L.colW * 0.84, 380);
    const ph = pw * 1.25;
    const px = W / 2 - pw / 2;
    const py = H / 2 - pw * 0.62;
    const s = Ease.outBack(k);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(s, s);
    ctx.translate(-W / 2, -H / 2);
    roundRect(ctx, px, py, pw, ph, pw * 0.08);
    ctx.fillStyle = '#231a40';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, 'Sorted!', W / 2, py + pw * 0.14, pw * 0.12, THEME.text, { weight: 900, shadow: 'rgba(0,0,0,0.4)' });
    text(ctx, `Level ${this.levelNum}`, W / 2, py + pw * 0.25, pw * 0.055, THEME.textDim, { weight: 700 });
    const shown = Math.min(this.stars, Math.floor((this.winT - 0.7) / 0.18) + 1);
    drawStars(ctx, W / 2, py + pw * 0.42, pw * 0.075, Math.max(0, shown), 3, THEME.star);
    const t = this.board.elapsed;
    text(ctx, `${t.toFixed(1)}s${this.best ? '  ·  best!' : ''}`, W / 2, py + pw * 0.58, pw * 0.07, THEME.text, { weight: 800 });
    text(ctx, `3★ under ${this.board.level.par}s`, W / 2, py + pw * 0.67, pw * 0.045, THEME.textDim, { weight: 600 });
    ctx.restore();
    if (k >= 1) this.panel.draw(ctx);
  }

  pointerDown(x: number, y: number): void {
    if (this.winT >= 0) {
      if (this.winT > 0.85) this.panel.down(x, y);
      return;
    }
    if (this.hud.down(x, y)) return;
    const { L } = this;
    const gap = L.tubes.length > 1 ? (L.tubes[1].x - L.tubes[0].x - L.tubes[0].w) / 2 : 10;
    L.tubes.forEach((tb, i) => {
      if (pointInRect(x, y, tb.x - gap, L.loopBottom, tb.w + gap * 2, tb.y + tb.h + tb.capH + tb.w * 0.3 - L.loopBottom)) {
        this.board.tap(i);
      }
    });
  }
}
