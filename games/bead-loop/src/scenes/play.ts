import type { Scene } from '@shared/engine/scene';
import { Particles } from '@shared/engine/particles';
import { Ease } from '@shared/engine/ease';
import { clamp, pointInRect } from '@shared/engine/math';
import { Button, ButtonSet } from '@shared/ui/button';
import { drawStars, roundRect, text } from '@shared/ui/draw';
import { clearSpriteCache } from '@shared/ui/sprites';
import type { App } from '../app';
import { MAX_LEVEL, PALETTE, THEME } from '../game/constants';
import { BoardFx } from '../game/fx';
import { computeLayout, type Layout } from '../game/layout';
import { getLevel, starsFor } from '../game/levels';
import { beltFill, clearLayerCache, drawBackground, drawBoard, drawLoopInfo } from '../game/render';
import { EV, S, hasWrong, intake, type LevelData } from '../sim';

type Result = 'none' | 'win' | 'lose';

/** Major pentatonic steps: landing streaks climb a scale that always sounds pleasant. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class PlayScene implements Scene {
  private readonly level: LevelData;
  private L!: Layout;
  private hud = new ButtonSet();
  private winPanel = new ButtonSet();
  private losePanel = new ButtonSet();
  private fx = new Particles();
  private board = new BoardFx();
  private result: Result = 'none';
  private resultT = 0;
  private stars = 0;
  private best = false;
  private W = 1;
  private H = 1;

  constructor(private readonly app: App, private readonly levelNum: number) {
    this.level = getLevel(levelNum);
    app.sim.init(this.level);
    this.board.reset(app.sim.s);
    const { icons } = app;
    this.hud.add(new Button({ icon: icons.back, style: 'ghost', onTap: () => this.click(() => app.goLevels()) }));
    this.hud.add(new Button({ icon: icons.restart, style: 'ghost', onTap: () => this.click(() => app.play(levelNum)) }));
    const last = levelNum >= MAX_LEVEL;
    this.winPanel.add(new Button({
      label: last ? 'Menu' : 'Next', icon: last ? icons.menu : icons.next, color: THEME.good,
      onTap: () => this.click(() => (last ? app.goMenu() : app.play(levelNum + 1))),
    }));
    this.winPanel.add(new Button({ icon: icons.restart, color: '#5b4a8f', onTap: () => this.click(() => app.play(levelNum)) }));
    this.winPanel.add(new Button({ icon: icons.grid, color: '#5b4a8f', onTap: () => this.click(() => app.goLevels()) }));
    this.losePanel.add(new Button({ label: 'Retry', icon: icons.restart, color: THEME.accent, onTap: () => this.click(() => app.play(levelNum)) }));
    this.losePanel.add(new Button({ label: 'Levels', icon: icons.grid, color: '#5b4a8f', onTap: () => this.click(() => app.goLevels()) }));
  }

  private click(fn: () => void): void {
    this.app.sfx.click();
    fn();
  }

  resize(w: number, h: number): void {
    this.W = w;
    this.H = h;
    const lv = this.level;
    const L = (this.L = computeLayout(w, h, lv.colors, lv.cap, lv.slots));
    const sim = this.app.sim;
    L.portFrac.forEach((f, t) => sim.setPort(t, f));
    sim.setPath(L.path.x, L.path.y, L.path.w, L.path.h, L.path.r, L.trackW * 0.24);
    sim.computePositions();
    clearSpriteCache();
    clearLayerCache();
    const { colX, colW, btn, hudY } = L;
    const m = colW * 0.05;
    this.hud.list[0].set(colX + m, hudY, btn, btn);
    this.hud.list[1].set(colX + colW - m - btn, hudY, btn, btn);
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

  update(dt: number): void {
    const sim = this.app.sim;
    const s = sim.s;
    sim.update(dt);
    sim.computePositions();
    const n = sim.eventCount();
    const sfx = this.app.sfx;
    for (let i = 0; i < n; i++) {
      const type = s.events[i * 2];
      const t = s.events[i * 2 + 1];
      if (type === EV.ABSORB) this.board.onAbsorb(t);
      else if (type === EV.LAND) {
        const streak = this.board.onLand(t, s, this.L);
        sfx.plink(SCALE[Math.min(streak - 1, SCALE.length - 1)]);
      } else if (type === EV.EJECT) sfx.bloop();
      else if (type === EV.DENY) {
        sfx.deny();
        this.board.onDeny(t);
      } else if (type === EV.COMPLETE) {
        sfx.shimmer();
        this.board.onComplete(t, s, this.L);
      } else if (type === EV.WIN) this.onWin();
      else if (type === EV.LOSE) this.onLose();
    }
    sim.clearEvents();
    if (this.result !== 'none') this.resultT += dt;
    this.hud.update(dt);
    this.winPanel.update(dt);
    this.losePanel.update(dt);
    this.fx.update(dt);
    this.board.update(dt, s, beltFill(s));
    this.board.ambient(dt, s, this.L);
  }

  private onWin(): void {
    const s = this.app.sim.s;
    const secs = s.scal[S.ELAPSED];
    this.result = 'win';
    this.resultT = 0;
    this.stars = starsFor(secs, this.level.par);
    const prev = this.app.save.data.times[this.levelNum - 1] ?? 0;
    this.best = prev === 0 || secs < prev;
    this.app.recordWin(this.levelNum, secs, this.stars);
    this.app.sfx.win();
    this.board.onWin(s, this.L);
    this.fx.confetti(this.W / 2, this.H * 0.55, PALETTE.map((p) => p.hex), 90, this.H * 0.9);
  }

  private onLose(): void {
    this.result = 'lose';
    this.resultT = 0;
    this.app.sfx.deny();
  }

  /** Tutorial on the first two levels until the player has tapped a few times. */
  private hint(): { tube: number; lines: string[] } | null {
    const s = this.app.sim.s;
    if (this.levelNum > 2 || s.scal[S.TAPS] >= 3 || this.result !== 'none') return null;
    let tube = -1;
    for (let t = 0; t < s.nTubes && tube < 0; t++) if (intake(s, t) !== s.tubeShell[t] && hasWrong(s, t)) tube = t;
    const lines = this.levelNum === 1 && s.scal[S.TAPS] < 1
      ? ['Each tube pulls in beads of its TOP colour', 'Tap the glowing tube to send its top out']
      : ['Fill every tube with its own colour', "Don't let the loop fill up!"];
    return { tube, lines };
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { W, H, L } = this;
    const s = this.app.sim.s;
    drawBackground(ctx, W, H, this.app.stage.dpr);
    const hint = this.hint();
    drawBoard(ctx, s, L, this.board, this.app.stage.dpr, hint?.tube ?? -1);
    drawLoopInfo(ctx, s, this.levelNum, this.level.par, L, this.board, hint?.lines ?? null);
    this.hud.draw(ctx);
    if (this.result === 'win' && this.resultT > 0.5) this.drawWinPanel(ctx, Math.min(1, (this.resultT - 0.5) / 0.35));
    if (this.result === 'lose' && this.resultT > 0.4) this.drawLosePanel(ctx, Math.min(1, (this.resultT - 0.4) / 0.35));
    this.fx.render(ctx);
  }

  private panelFrame(ctx: CanvasRenderingContext2D, k: number, ph: number, py: number): { pw: number; px: number } {
    const { W, H, L } = this;
    ctx.fillStyle = `rgba(8,6,18,${0.62 * k})`;
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(L.colW * 0.84, 380);
    const px = W / 2 - pw / 2;
    const sc = Ease.outBack(k);
    ctx.translate(W / 2, H / 2);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2, -H / 2);
    roundRect(ctx, px, py, pw, ph, pw * 0.08);
    ctx.fillStyle = '#231a40';
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
    text(ctx, 'Sorted!', W / 2, py + pw * 0.14, pw * 0.12, THEME.text, { weight: 900, shadow: 'rgba(0,0,0,0.4)' });
    text(ctx, `Level ${this.levelNum}`, W / 2, py + pw * 0.25, pw * 0.055, THEME.textDim, { weight: 700 });
    const shown = Math.min(this.stars, Math.floor((this.resultT - 0.7) / 0.18) + 1);
    drawStars(ctx, W / 2, py + pw * 0.42, pw * 0.075, Math.max(0, shown), 3, THEME.star);
    const secs = this.app.sim.s.scal[S.ELAPSED];
    text(ctx, `${secs.toFixed(1)}s${this.best ? '  ·  best!' : ''}`, W / 2, py + pw * 0.58, pw * 0.07, THEME.text, { weight: 800 });
    text(ctx, `3★ under ${this.level.par}s`, W / 2, py + pw * 0.67, pw * 0.045, THEME.textDim, { weight: 600 });
    ctx.restore();
    if (k >= 1) this.winPanel.draw(ctx);
  }

  private drawLosePanel(ctx: CanvasRenderingContext2D, k: number): void {
    const { W, H } = this;
    const pw0 = Math.min(this.L.colW * 0.84, 380);
    const py = H / 2 - pw0 * 0.55;
    ctx.save();
    const { pw } = this.panelFrame(ctx, k, pw0 * 1.02, py);
    text(ctx, 'Loop jammed!', W / 2, py + pw * 0.15, pw * 0.1, THEME.danger, { weight: 900, shadow: 'rgba(0,0,0,0.4)' });
    text(ctx, 'The loop stayed full too long.', W / 2, py + pw * 0.28, pw * 0.048, THEME.textDim, { weight: 600 });
    text(ctx, 'Eject only what another tube can take.', W / 2, py + pw * 0.36, pw * 0.048, THEME.textDim, { weight: 600 });
    ctx.restore();
    if (k >= 1) this.losePanel.draw(ctx);
  }

  pointerDown(x: number, y: number): void {
    if (this.result !== 'none') {
      if (this.resultT > 0.85) (this.result === 'win' ? this.winPanel : this.losePanel).down(x, y);
      return;
    }
    if (this.hud.down(x, y)) return;
    const { L } = this;
    const gap = L.tubes.length > 1 ? (L.tubes[1].x - L.tubes[0].x - L.tubes[0].w) / 2 : 10;
    L.tubes.forEach((tb, i) => {
      if (pointInRect(x, y, tb.x - gap, L.loopBottom, tb.w + gap * 2, tb.y + tb.h + tb.capH + tb.w * 0.3 - L.loopBottom)) {
        const s = this.app.sim.s;
        const before = { len: s.tubeLen[i], fall: s.fallLen[i], q: s.qLen[i] };
        if (this.app.sim.tap(i)) this.board.onEject(i, before, s, L);
      }
    });
  }
}
