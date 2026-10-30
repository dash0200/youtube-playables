import type { Scene } from '@shared/engine/scene';
import { Particles } from '@shared/engine/particles';
import { Ease } from '@shared/engine/ease';
import { clamp, pointInRect } from '@shared/engine/math';
import { Button, ButtonSet } from '@shared/ui/button';
import { drawStars, roundRect, text } from '@shared/ui/draw';
import { Playables } from '@shared/sdk/playables';
import { clearSpriteCache } from '@shared/ui/sprites';
import type { App } from '../app';
import { MAX_LEVEL, PALETTE, THEME } from '../game/constants';
import { AutoPlayer } from '../dev/autoplay';
import { HINT_SECONDS, HintGuide } from '../game/advisor';
import { BoardFx } from '../game/fx';
import { BeadSounds } from '../game/sounds';
import { computeLayout, type Layout } from '../game/layout';
import { getLevel, starsFor } from '../game/levels';
import { beltFill, clearLayerCache, drawBackground, drawBoard, drawLoopInfo } from '../game/render';
import { EV, K, S, beadAt, isOpen, type LevelData } from '../sim';

type Result = 'none' | 'win' | 'lose';

export class PlayScene implements Scene {
  private readonly level: LevelData;
  private L!: Layout;
  private hud = new ButtonSet();
  private winPanel = new ButtonSet();
  private losePanel = new ButtonSet();
  private fx = new Particles();
  private board = new BoardFx();
  private sounds: BeadSounds;
  private result: Result = 'none';
  private resultT = 0;
  private stars = 0;
  private best = false;
  /** This attempt uses the easier layout (after repeated losses). */
  private readonly easy: boolean;
  /** Set on a loss when the next attempt will switch to the easier layout. */
  private easierNext = false;
  /** DEV ONLY: the Solve button hands control to the generator's bot. */
  private auto: AutoPlayer | null = null;
  /** Guided hint (earned with an opt-in rewarded ad, or free when no ad is available). */
  private guide = new HintGuide();
  private hintBtn: Button;
  /** A rewarded ad is showing: the game waits. */
  private adPending = false;
  private toast = { text: '', t: 0 };
  private W = 1;
  private H = 1;
  private started = false;

  constructor(private readonly app: App, private readonly levelNum: number, private readonly startWithHint = false) {
    this.easy = app.needsEasy(levelNum);
    this.level = getLevel(levelNum, this.easy);
    this.sounds = new BeadSounds(app.sfx);
    const { icons } = app;
    this.hud.add(new Button({ icon: icons.back, style: 'ghost', onTap: () => this.click(() => app.goLevels()) }));
    this.hud.add(new Button({ icon: icons.restart, style: 'ghost', onTap: () => this.click(() => app.play(levelNum)) }));
    this.hintBtn = this.hud.add(new Button({
      label: 'Hint', icon: icons.hint, style: 'ghost',
      onTap: () => this.click(() => {
        if (!this.guide.active && this.result === 'none') this.rewardHint(() => this.startHint());
      }),
    }));
    if (import.meta.env.DEV) {
      // Dev-only "Solve": the level plays itself (stripped from production builds).
      const solve = this.hud.add(new Button({
        label: 'Solve', icon: icons.play, style: 'ghost',
        onTap: () => this.click(() => {
          this.auto = this.auto ? null : new AutoPlayer();
          solve.opts.label = this.auto ? 'Stop' : 'Solve';
        }),
      }));
    }
    const last = levelNum >= MAX_LEVEL;
    this.winPanel.add(new Button({
      label: last ? 'Menu' : 'Next', icon: last ? icons.menu : icons.next, color: THEME.good,
      onTap: () => this.click(() => (last ? app.goMenu() : app.play(levelNum + 1))),
    }));
    this.winPanel.add(new Button({ icon: icons.restart, color: '#5b4a8f', onTap: () => this.click(() => app.play(levelNum)) }));
    this.winPanel.add(new Button({ icon: icons.grid, color: '#5b4a8f', onTap: () => this.click(() => app.goLevels()) }));
    this.losePanel.add(new Button({
      label: 'Retry with a hint', icon: icons.hint, color: THEME.good,
      onTap: () => this.click(() => this.rewardHint(() => app.play(levelNum, { hint: true }))),
    }));
    this.losePanel.add(new Button({ label: 'Retry', icon: icons.restart, color: THEME.accent, onTap: () => this.click(() => app.play(levelNum)) }));
    this.losePanel.add(new Button({ icon: icons.grid, color: '#5b4a8f', onTap: () => this.click(() => app.goLevels()) }));
  }

  private click(fn: () => void): void {
    this.app.sfx.click();
    fn();
  }

  /**
   * Opt-in rewarded ad for a hint. Never blocks progress (the level is always
   * playable without it). If no ad can be shown, the hint is given anyway.
   */
  private rewardHint(onGrant: () => void): void {
    if (this.adPending) return;
    this.adPending = true;
    void Playables.requestRewardedAd('hint').then((r) => {
      this.adPending = false;
      if (r === 'declined') this.showToast('Watch the whole ad to get a hint');
      else onGrant();
    });
  }

  private startHint(): void {
    this.guide.start(HINT_SECONDS);
    this.sounds.hint();
  }

  private showToast(text: string): void {
    this.toast = { text, t: 2.2 };
  }

  resize(w: number, h: number): void {
    // The sim is shared by all play scenes, so load this level only when the
    // scene takes over (its first resize), not when it's constructed: the
    // previous level keeps rendering its own state during the fade.
    if (!this.started) {
      this.started = true;
      this.app.sim.init(this.level);
      this.board.reset(this.app.sim.s);
      if (this.startWithHint) this.startHint();
    }
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
    this.hud.list[2].set(w / 2 - btn * 1.4, hudY, btn * 2.8, btn);
    this.hud.list[3]?.set(w / 2 - btn * 1.4, hudY + btn * 1.15, btn * 2.8, btn * 0.8); // dev Solve
    const pw = Math.min(colW * 0.84, 380);
    const bh = clamp(pw * 0.17, 46, 62);
    const px = w / 2 - pw / 2;
    const by = h / 2 + pw * 0.15;
    this.winPanel.list[0].set(px + pw * 0.08, by, pw * 0.84, bh);
    this.winPanel.list[1].set(px + pw * 0.08, by + bh * 1.3, pw * 0.4, bh);
    this.winPanel.list[2].set(px + pw * 0.52, by + bh * 1.3, pw * 0.4, bh);
    this.losePanel.list[0].set(px + pw * 0.08, by - bh * 0.4, pw * 0.84, bh);
    this.losePanel.list[1].set(px + pw * 0.08, by + bh * 0.9, pw * 0.56, bh);
    this.losePanel.list[2].set(px + pw * 0.68, by + bh * 0.9, pw * 0.24, bh);
  }

  update(dt: number): void {
    this.toast.t = Math.max(0, this.toast.t - dt);
    if (this.adPending) {
      this.hud.update(dt);
      this.losePanel.update(dt);
      return;
    }
    const sim = this.app.sim;
    const s = sim.s;
    if (this.auto && this.result === 'none') this.auto.update(dt, s, (t) => this.tapTube(t));
    sim.update(dt);
    sim.computePositions();
    const n = sim.eventCount();
    const snd = this.sounds;
    for (let i = 0; i < n; i++) {
      const type = s.events[i * 2];
      const t = s.events[i * 2 + 1];
      if (type === EV.ABSORB) this.board.onAbsorb(t);
      else if (type === EV.LAND) {
        snd.land(this.board.onLand(t, s, this.L));
        if (this.cellJustFilled(t)) snd.melt();
      } else if (type === EV.DENY) {
        snd.deny();
        this.board.onDeny(t);
      } else if (type === EV.COMPLETE) {
        let done = 0;
        for (let k = 0; k < s.nTubes; k++) done += s.complete[k];
        snd.complete(done - 1);
        this.board.onComplete(t, s, this.L);
      } else if (type === EV.WIN) this.onWin();
      else if (type === EV.LOSE) this.onLose();
    }
    sim.clearEvents();
    if (this.result === 'none') this.guide.update(dt, s);
    else this.guide.stop();
    this.hintBtn.opts.disabled = this.guide.active;
    if (this.result !== 'none') this.resultT += dt;
    this.hud.update(dt);
    this.winPanel.update(dt);
    this.losePanel.update(dt);
    this.fx.update(dt);
    this.board.update(dt, s, beltFill(s));
    this.board.ambient(dt, s, this.L);
  }

  /** True when the top cell of tube t just became 9 beads of one colour (it melts into a block). */
  private cellJustFilled(t: number): boolean {
    const s = this.app.sim.s;
    const len = s.tubeLen[t];
    if (len === 0 || len % K !== 0) return false;
    const c = beadAt(s, t, len - 1);
    for (let j = len - K; j < len - 1; j++) if (beadAt(s, t, j) !== c) return false;
    return true;
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
    this.sounds.win();
    this.board.onWin(s, this.L);
    this.fx.confetti(this.W / 2, this.H * 0.55, PALETTE.map((p) => p.hex), 90, this.H * 0.9);
  }

  private onLose(): void {
    this.result = 'lose';
    this.resultT = 0;
    this.app.recordLoss(this.levelNum);
    this.easierNext = !this.easy && this.app.needsEasy(this.levelNum);
    this.sounds.deny();
  }

  /** Tutorial on the first two levels until the player has tapped a few times. */
  private hint(): { tube: number; lines: string[] } | null {
    const s = this.app.sim.s;
    if (this.levelNum > 2 || s.scal[S.TAPS] >= 3 || this.result !== 'none') return null;
    let tube = -1;
    for (let t = 0; t < s.nTubes && tube < 0; t++) if (!s.complete[t] && !isOpen(s, t)) tube = t;
    const lines = this.levelNum === 1 && s.scal[S.TAPS] < 1
      ? ['A tube only takes its own colour', 'Tap the glowing tube to clear its top']
      : ['A wrong colour on top blocks a tube', "Don't let the loop fill up!"];
    return { tube, lines };
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { W, H, L } = this;
    const s = this.app.sim.s;
    drawBackground(ctx, W, H, this.app.stage.dpr);
    const g = this.guide.active ? this.guide.advice : null;
    const hint = g ? null : this.hint();
    drawBoard(ctx, s, L, this.board, this.app.stage.dpr, g ? g.tube : hint?.tube ?? -1, g);
    const lines = g ? [g.tube >= 0 ? 'Tap the glowing tube' : 'Let it flow\u2026'] : hint?.lines ?? null;
    drawLoopInfo(ctx, s, this.levelNum, this.level.par, L, this.board, lines);
    this.hud.draw(ctx);
    if (g) this.drawHintTimer(ctx);
    if (this.toast.t > 0) {
      ctx.globalAlpha = Math.min(1, this.toast.t / 0.4);
      const b = this.hintBtn;
      text(ctx, this.toast.text, W / 2, b.y + b.h * 1.6, b.h * 0.34, '#fff', { weight: 700, shadow: 'rgba(0,0,0,0.5)' });
      ctx.globalAlpha = 1;
    }
    if (this.result === 'win' && this.resultT > 0.5) this.drawWinPanel(ctx, Math.min(1, (this.resultT - 0.5) / 0.35));
    if (this.result === 'lose' && this.resultT > 0.4) this.drawLosePanel(ctx, Math.min(1, (this.resultT - 0.4) / 0.35));
    this.fx.render(ctx);
    if (this.adPending) {
      ctx.fillStyle = 'rgba(8,6,18,0.7)';
      ctx.fillRect(0, 0, W, H);
      text(ctx, Playables.inPlayables ? 'Loading ad\u2026' : 'Simulated ad (dev)\u2026', W / 2, H / 2, Math.min(W, H) * 0.05, '#fff', { weight: 700 });
    }
  }

  /** Remaining hint time as a thin bar under the Hint button. */
  private drawHintTimer(ctx: CanvasRenderingContext2D): void {
    const b = this.hintBtn;
    const k = this.guide.remaining / HINT_SECONDS;
    const y = b.y + b.h + 4;
    roundRect(ctx, b.x + b.w * 0.1, y, b.w * 0.8, 4, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    roundRect(ctx, b.x + b.w * 0.1, y, b.w * 0.8 * k, 4, 2);
    ctx.fillStyle = THEME.good;
    ctx.fill();
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
    text(ctx, 'Unblock the tube whose colour is waiting.', W / 2, py + pw * 0.36, pw * 0.048, THEME.textDim, { weight: 600 });
    if (this.easierNext) text(ctx, 'Next try: a gentler layout', W / 2, py + pw * 0.46, pw * 0.05, THEME.good, { weight: 800 });
    ctx.restore();
    if (k >= 1) this.losePanel.draw(ctx);
  }

  pointerDown(x: number, y: number): void {
    if (this.adPending) return;
    if (this.result !== 'none') {
      if (this.resultT > 0.85) (this.result === 'win' ? this.winPanel : this.losePanel).down(x, y);
      return;
    }
    if (this.hud.down(x, y)) return;
    const { L } = this;
    const gap = L.tubes.length > 1 ? (L.tubes[1].x - L.tubes[0].x - L.tubes[0].w) / 2 : 10;
    L.tubes.forEach((tb, i) => {
      if (pointInRect(x, y, tb.x - gap, L.loopBottom, tb.w + gap * 2, tb.y + tb.h + tb.capH + tb.w * 0.3 - L.loopBottom)) {
        this.tapTube(i);
      }
    });
  }

  /** Taps tube t through the sim, with the matching animation and sound. */
  private tapTube(t: number): void {
    const s = this.app.sim.s;
    const before = { len: s.tubeLen[t], fall: s.fallLen[t], q: s.qLen[t] };
    if (this.app.sim.tap(t)) {
      this.guide.onTap();
      this.board.onEject(t, before, s, this.L);
      this.sounds.pour(s.qLen[t] - before.q);
    }
  }
}
