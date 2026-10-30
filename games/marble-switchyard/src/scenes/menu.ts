import type { Scene } from '@shared/engine/scene';
import { clamp } from '@shared/engine/math';
import { Button, ButtonSet } from '@shared/ui/button';
import { text } from '@shared/ui/draw';
import { clearSpriteCache } from '@shared/ui/sprites';
import type { App } from '../app';
import { LEVELS, MAX_LEVEL, PALETTE, THEME } from '../game/constants';
import { BoardFx } from '../game/fx';
import { computeLayout, type Layout } from '../game/layout';
import { drawBackground, drawBoard } from '../game/render';
import { Planner } from '../sim/bot';
import { EV, type MarbleSim } from '../sim/sim';

/** Title screen over a quiet demo board that the planning bot plays on a loop. */
export class MenuScene implements Scene {
  private buttons = new ButtonSet();
  private W = 1;
  private H = 1;
  private t = 0;
  private sim!: MarbleSim;
  private plan!: Planner;
  private L!: Layout;
  private fx = new BoardFx();
  private think = 0;
  private spawnT = -9;

  constructor(private readonly app: App) {
    const lvl = () => Math.min(app.save.data.unlocked, MAX_LEVEL);
    this.buttons.add(new Button({
      label: 'Play', icon: app.icons.play, color: THEME.good,
      onTap: () => { app.sfx.click(); app.play(lvl()); },
    }));
    this.buttons.add(new Button({
      label: 'Levels', icon: app.icons.grid, color: '#2b5a63',
      onTap: () => { app.sfx.click(); app.goLevels(); },
    }));
    this.newDemo();
  }

  private newDemo(): void {
    this.sim = this.app.newSim(LEVELS[Math.min(LEVELS.length - 1, 14)]);
    this.plan = new Planner(this.sim);
    this.fx.reset(this.sim);
    if (this.W > 1) this.L = computeLayout(this.W, this.H, this.sim);
  }

  resize(w: number, h: number): void {
    this.W = w;
    this.H = h;
    clearSpriteCache();
    this.L = computeLayout(w, h, this.sim);
    const colW = Math.min(w, h * 0.62);
    const bw = Math.min(colW * 0.7, 320);
    const bh = clamp(bw * 0.2, 50, 66);
    this.buttons.list[0].set(w / 2 - bw / 2, h * 0.6, bw, bh);
    this.buttons.list[1].set(w / 2 - bw / 2, h * 0.6 + bh * 1.35, bw, bh);
  }

  update(dt: number): void {
    this.t += dt;
    this.buttons.update(dt);
    const sim = this.sim;
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.35;
      const a = this.plan.advise();
      if (a.gate >= 0) sim.tap(a.gate);
    }
    sim.update(dt);
    for (const e of sim.events) {
      this.fx.onEvent(e, sim, this.L, (c) => PALETTE[c].hex);
      if (e.type === EV.SPAWN) this.spawnT = this.fx.time;
    }
    sim.events.length = 0;
    this.fx.update(dt, sim);
    if (sim.over && this.fx.time - this.fx.fullT.reduce((a, b) => Math.max(a, b), 0) > 2) this.newDemo();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { W, H } = this;
    drawBackground(ctx, W, H);
    drawBoard(ctx, this.sim, this.L, this.fx, this.app.stage.dpr, this.spawnT, null);
    ctx.fillStyle = 'rgba(4,14,20,0.62)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    const size = Math.min(W, H * 0.62) * 0.13;
    const bob = Math.sin(this.t * 2) * size * 0.04;
    text(ctx, 'MARBLE', cx, H * 0.3 + bob, size, '#fff', { weight: 900, shadow: '#0b4a52' });
    text(ctx, 'SWITCHYARD', cx, H * 0.3 + size * 1.05 + bob, size * 0.72, '#ffcf7a', { weight: 900, shadow: '#5a3b10' });
    text(ctx, 'Flip gates · send every marble home', cx, H * 0.3 + size * 2.1, size * 0.26, THEME.textDim, { weight: 600 });
    const s = this.app.save.data;
    const total = s.stars.reduce((a, b) => a + (b || 0), 0);
    const b0 = this.buttons.list[0];
    b0.opts.label = `Play · Level ${Math.min(s.unlocked, MAX_LEVEL)}`;
    this.buttons.draw(ctx);
    text(ctx, `★ ${total} / ${MAX_LEVEL * 3}`, cx, b0.y + b0.h * 2.9, b0.h * 0.34, THEME.star, { weight: 800 });
  }

  pointerDown(x: number, y: number): void {
    this.buttons.down(x, y);
  }
}
