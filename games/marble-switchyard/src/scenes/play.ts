import type { Scene } from '@shared/engine/scene';
import { Particles } from '@shared/engine/particles';
import { Ease } from '@shared/engine/ease';
import { clamp } from '@shared/engine/math';
import { Button, ButtonSet } from '@shared/ui/button';
import { drawStars, roundRect, text } from '@shared/ui/draw';
import { clearSpriteCache } from '@shared/ui/sprites';
import type { App } from '../app';
import { MAX_LEVEL, PALETTE, THEME, getLevel, starsFor } from '../game/constants';
import { BoardFx } from '../game/fx';
import { computeLayout, type Layout } from '../game/layout';
import { drawBackground, drawBoard, drawSpills } from '../game/render';
import { MarbleSounds } from '../game/sounds';
import { Planner, type Advice } from '../sim/bot';
import { EV, Sim } from '../sim/sim';

type Result = 'none' | 'win' | 'lose';
const hex = (c: number): string => PALETTE[c].hex;

/** Game speed while the player has fast-forward on (the whole sim runs faster). */
const FAST_SPEED = 2;

/** Levels that coach the player (the planner's advice is shown) until they've flipped a few gates. */
const TUTORIAL_LEVELS = 2;

export class PlayScene implements Scene {
  private readonly sim: Sim;
  private readonly plan: Planner;
  private L!: Layout;
  private fx = new BoardFx();
  private confetti = new Particles();
  private sounds: MarbleSounds;
  private hud = new ButtonSet();
  private winPanel = new ButtonSet();
  private losePanel = new ButtonSet();
  private result: Result = 'none';
  private resultT = 0;
  private stars = 0;
  private best = false;
  private W = 1;
  private H = 1;
  /** fx time of the last marble drop (hopper queue slides). */
  private spawnT = -9;
  private taps = 0;
  private speedBtn: Button;
  /** Real seconds since the level started: stars and best times use this, so fast-forward can earn them. */
  private elapsed = 0;
  private advice: Advice | null = null;
  private adviceT = 0;
  /** DEV ONLY: the Solve button lets the planning bot play. */
  private auto = false;
  private autoT = 0;

  constructor(private readonly app: App, private readonly levelNum: number) {
    this.sim = new Sim(getLevel(levelNum));
    this.plan = new Planner(this.sim);
    this.fx.reset(this.sim);
    this.sounds = new MarbleSounds(app.sfx);
    const { icons } = app;
    this.hud.add(new Button({ icon: icons.back, style: 'ghost', onTap: () => this.click(() => app.goLevels()) }));
    this.hud.add(new Button({ icon: icons.restart, style: 'ghost', onTap: () => this.click(() => app.play(levelNum)) }));
    this.speedBtn = this.hud.add(new Button({
      label: '2\u00d7', icon: icons.fast, style: 'ghost', color: THEME.accent,
      onTap: () => this.click(() => {
        app.save.data.fast = !app.save.data.fast;
        app.save.save();
        this.syncSpeedBtn();
      }),
    }));
    this.syncSpeedBtn();
    if (import.meta.env.DEV) {
      // Dev-only "Solve": the planning bot plays (stripped from production builds).
      const solve = this.hud.add(new Button({
        label: 'Solve', icon: icons.play, style: 'ghost',
        onTap: () => this.click(() => {
          this.auto = !this.auto;
          solve.opts.label = this.auto ? 'Stop' : 'Solve';
        }),
      }));
    }
    const last = levelNum >= MAX_LEVEL;
    this.winPanel.add(new Button({
      label: last ? 'Menu' : 'Next', icon: last ? icons.menu : icons.next, color: THEME.good,
      onTap: () => this.click(() => (last ? app.goMenu() : app.play(levelNum + 1))),
    }));
    this.winPanel.add(new Button({ icon: icons.restart, color: '#2b5a63', onTap: () => this.click(() => app.play(levelNum)) }));
    this.winPanel.add(new Button({ icon: icons.grid, color: '#2b5a63', onTap: () => this.click(() => app.goLevels()) }));
    this.losePanel.add(new Button({ label: 'Retry', icon: icons.restart, color: THEME.accent, onTap: () => this.click(() => app.play(levelNum)) }));
    this.losePanel.add(new Button({ label: 'Levels', icon: icons.grid, color: '#2b5a63', onTap: () => this.click(() => app.goLevels()) }));
  }

  private get speed(): number {
    return this.app.save.data.fast ? FAST_SPEED : 1;
  }

  /** Filled when fast-forward is on. */
  private syncSpeedBtn(): void {
    this.speedBtn.opts.style = this.app.save.data.fast ? 'pill' : 'ghost';
  }

  private click(fn: () => void): void {
    this.app.sfx.click();
    fn();
  }

  resize(w: number, h: number): void {
    this.W = w;
    this.H = h;
    this.L = computeLayout(w, h, this.sim);
    clearSpriteCache();
    const { colX, colW, btn, hudY } = this.L;
    const m = colW * 0.05;
    this.hud.list[0].set(colX + m, hudY, btn, btn);
    this.hud.list[1].set(colX + colW - m - btn, hudY, btn, btn);
    // fast-forward between Back and the level title, or under Back when the column is narrow
    const left = colX + m + btn * 1.12;
    const room = w / 2 - btn * 1.25 - left;
    if (room >= btn * 1.3) this.hud.list[2].set(left, hudY + btn * 0.12, Math.min(btn * 1.7, room), btn * 0.76);
    else this.hud.list[2].set(colX + m, hudY + btn * 1.15, btn * 1.7, btn * 0.7);
    this.hud.list[3]?.set(colX + colW - m - btn * 3.6, hudY + btn * 0.15, btn * 2.4, btn * 0.7); // dev Solve
    const pw = Math.min(colW * 0.84, 380);
    const bh = clamp(pw * 0.17, 46, 62);
    const px = w / 2 - pw / 2;
    const by = h / 2 + pw * 0.15;
    this.winPanel.list[0].set(px + pw * 0.08, by, pw * 0.84, bh);
    this.winPanel.list[1].set(px + pw * 0.08, by + bh * 1.3, pw * 0.4, bh);
    this.winPanel.list[2].set(px + pw * 0.52, by + bh * 1.3, pw * 0.4, bh);
    this.losePanel.list[0].set(px + pw * 0.08, by - bh * 0.4, pw * 0.84, bh);
    this.losePanel.list[1].set(px + pw * 0.08, by + bh * 0.9, pw * 0.84, bh);
  }

  private get coaching(): boolean {
    return this.levelNum <= TUTORIAL_LEVELS && this.taps < 4 && this.result === 'none';
  }

  update(dt: number): void {
    const sim = this.sim;
    if (this.result === 'none') {
      if (this.auto) {
        this.autoT -= dt;
        if (this.autoT <= 0) {
          this.autoT = 0.3;
          const a = this.plan.advise();
          if (a.gate >= 0) this.tapGate(a.gate);
        }
      }
      this.elapsed += dt;
      sim.update(dt * this.speed);
      for (const e of sim.events) {
        this.fx.onEvent(e, sim, this.L, hex);
        if (e.type === EV.SPAWN) {
          this.spawnT = this.fx.time;
          this.sounds.drop();
        } else if (e.type === EV.PASS) this.sounds.pass();
        else if (e.type === EV.CUP) this.sounds.cup(sim.cups[e.a].count, sim.cups[e.a].cap);
        else if (e.type === EV.FULL) this.sounds.full();
        else if (e.type === EV.SPILL) this.sounds.spill();
        else if (e.type === EV.WIN) this.onWin();
        else if (e.type === EV.LOSE) this.onLose();
      }
      sim.events.length = 0;
      this.adviceT -= dt;
      if (this.coaching && this.adviceT <= 0) {
        this.adviceT = 0.25;
        this.advice = this.plan.advise();
      } else if (!this.coaching) this.advice = null;
    } else {
      this.resultT += dt;
    }
    this.fx.update(dt, sim);
    this.confetti.update(dt);
    this.hud.update(dt);
    this.winPanel.update(dt);
    this.losePanel.update(dt);
  }

  private onWin(): void {
    const secs = this.elapsed;
    this.result = 'win';
    this.resultT = 0;
    this.stars = starsFor(secs, this.sim.level.par);
    const prev = this.app.save.data.times[this.levelNum - 1] ?? 0;
    this.best = prev === 0 || secs < prev;
    this.app.recordWin(this.levelNum, secs, this.stars);
    this.sounds.win();
    this.confetti.confetti(this.W / 2, this.H * 0.55, PALETTE.map((p) => p.hex), 90, this.H * 0.9);
  }

  private onLose(): void {
    this.result = 'lose';
    this.resultT = 0;
    this.sounds.lose();
  }

  private tapGate(g: number): void {
    if (this.sim.tap(g)) {
      this.taps++;
      this.sounds.flip();
      for (const e of this.sim.events) this.fx.onEvent(e, this.sim, this.L, hex);
      this.sim.events.length = 0;
      this.adviceT = 0;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { W, H, L } = this;
    const sim = this.sim;
    drawBackground(ctx, W, H);
    drawBoard(ctx, sim, L, this.fx, this.app.stage.dpr, this.spawnT, this.advice);
    const cx = W / 2;
    text(ctx, `LEVEL ${this.levelNum}`, cx, L.hudY + L.btn * 0.3, L.btn * 0.36, THEME.textDim, { weight: 800 });
    drawSpills(ctx, sim, cx, L.hudY + L.btn * 0.8, L.btn * 0.11);
    if (this.coaching) {
      const line = this.taps === 0 ? 'Tap a gate to flip it' : 'Send each marble to its colour';
      text(ctx, line, cx, L.hudY + L.btn * 1.45, L.btn * 0.34, '#fff', { weight: 700, shadow: 'rgba(0,0,0,0.4)' });
    }
    this.hud.draw(ctx);
    if (this.result === 'win' && this.resultT > 0.5) this.drawWinPanel(ctx, Math.min(1, (this.resultT - 0.5) / 0.35));
    if (this.result === 'lose' && this.resultT > 0.5) this.drawLosePanel(ctx, Math.min(1, (this.resultT - 0.5) / 0.35));
    this.confetti.render(ctx);
  }

  private panelFrame(ctx: CanvasRenderingContext2D, k: number, ph: number, py: number): { pw: number; px: number } {
    const { W, H, L } = this;
    ctx.fillStyle = `rgba(3,12,16,${0.62 * k})`;
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(L.colW * 0.84, 380);
    const px = W / 2 - pw / 2;
    const sc = Ease.outBack(k);
    ctx.translate(W / 2, H / 2);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2, -H / 2);
    roundRect(ctx, px, py, pw, ph, pw * 0.08);
    ctx.fillStyle = '#12313a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    return { pw, px };
  }

  private drawWinPanel(ctx: CanvasRenderingContext2D, k: number): void {
    const { W, H } = this;
    const pw0 = Math.min(this.L.colW * 0.84, 380);
    const py = H / 2 - pw0 * 0.62;
    ctx.save();
    const { pw } = this.panelFrame(ctx, k, pw0 * 1.25, py);
    text(ctx, 'All sorted!', W / 2, py + pw * 0.14, pw * 0.11, THEME.text, { weight: 900, shadow: 'rgba(0,0,0,0.4)' });
    text(ctx, `Level ${this.levelNum}`, W / 2, py + pw * 0.25, pw * 0.055, THEME.textDim, { weight: 700 });
    const shown = Math.min(this.stars, Math.floor((this.resultT - 0.7) / 0.18) + 1);
    drawStars(ctx, W / 2, py + pw * 0.42, pw * 0.075, Math.max(0, shown), 3, THEME.star);
    const secs = this.elapsed;
    text(ctx, `${secs.toFixed(1)}s${this.best ? '  ·  best!' : ''}`, W / 2, py + pw * 0.58, pw * 0.07, THEME.text, { weight: 800 });
    text(ctx, `3★ under ${this.sim.level.par}s`, W / 2, py + pw * 0.67, pw * 0.045, THEME.textDim, { weight: 600 });
    ctx.restore();
    if (k >= 1) this.winPanel.draw(ctx);
  }

  private drawLosePanel(ctx: CanvasRenderingContext2D, k: number): void {
    const { W, H } = this;
    const pw0 = Math.min(this.L.colW * 0.84, 380);
    const py = H / 2 - pw0 * 0.55;
    ctx.save();
    const { pw } = this.panelFrame(ctx, k, pw0 * 1.02, py);
    text(ctx, 'Too many spills!', W / 2, py + pw * 0.15, pw * 0.09, THEME.danger, { weight: 900, shadow: 'rgba(0,0,0,0.4)' });
    text(ctx, 'Set a marble’s gates before it gets there.', W / 2, py + pw * 0.28, pw * 0.046, THEME.textDim, { weight: 600 });
    text(ctx, 'Watch the hopper to see what’s coming.', W / 2, py + pw * 0.36, pw * 0.046, THEME.textDim, { weight: 600 });
    ctx.restore();
    if (k >= 1) this.losePanel.draw(ctx);
  }

  pointerDown(x: number, y: number): void {
    if (this.result !== 'none') {
      if (this.resultT > 0.85) (this.result === 'win' ? this.winPanel : this.losePanel).down(x, y);
      return;
    }
    if (this.hud.down(x, y)) return;
    // nearest gate within a generous touch radius
    const L = this.L;
    const reach = Math.max(L.gateR * 2, 30);
    let best = -1;
    let bestD = reach * reach;
    this.sim.gateNode.forEach((ni, g) => {
      const p = L.node[ni];
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    });
    if (best >= 0) this.tapGate(best);
  }
}
