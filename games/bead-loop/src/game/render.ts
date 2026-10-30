import { Ease } from '@shared/engine/ease';
import { clamp, lerp } from '@shared/engine/math';
import { rgba, shade } from '@shared/ui/color';
import { roundRect, text } from '@shared/ui/draw';
import { drawGlyph } from '@shared/ui/glyphs';
import { drawBead } from '@shared/ui/sprites';
import { EMPTY, FALL_TIME, JAM_TIME, K, MAX_BEADS, S, beadAt, intake, queueAt, type SimState } from '../sim/types';
import { PALETTE, THEME } from './constants';
import { beadPos, cellTop, type Layout, type TubeBox } from './layout';

let bgCache: { w: number; h: number; dpr: number; c: HTMLCanvasElement } | null = null;

/** Cached gradient background with soft vignette and dot pattern. */
export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number): void {
  if (!bgCache || bgCache.w !== w || bgCache.h !== h || bgCache.dpr !== dpr) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const lin = g.createLinearGradient(0, 0, 0, h);
    lin.addColorStop(0, THEME.bgTop);
    lin.addColorStop(1, THEME.bgBottom);
    g.fillStyle = lin;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.035)';
    const step = 22;
    for (let y = step / 2; y < h; y += step) {
      for (let x = (y / step) % 2 ? step : step / 2; x < w; x += step) {
        g.beginPath();
        g.arc(x, y, 1.2, 0, Math.PI * 2);
        g.fill();
      }
    }
    const rad = g.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.2, w / 2, h * 0.5, Math.max(w, h) * 0.8);
    rad.addColorStop(0, 'rgba(124,92,255,0.16)');
    rad.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = rad;
    g.fillRect(0, 0, w, h);
    bgCache = { w, h, dpr, c };
  }
  ctx.drawImage(bgCache.c, 0, 0, w, h);
}

/** 0..1 how full the belt is. */
export const beltFill = (s: SimState): number => 1 - s.scal[S.FREE] / Math.max(1, s.nSlots);

function drawPipe(ctx: CanvasRenderingContext2D, L: Layout, tb: TubeBox, intakeHex: string, active: boolean): void {
  const pw = L.pipeW;
  const y0 = L.loopBottom;
  const y1 = tb.y + tb.w * 0.1;
  roundRect(ctx, tb.cx - pw / 2, y0, pw, y1 - y0, pw * 0.3);
  ctx.fillStyle = THEME.tubeInner;
  ctx.fill();
  ctx.strokeStyle = rgba(intakeHex, active ? 0.95 : 0.6);
  ctx.lineWidth = Math.max(1.5, pw * (active ? 0.16 : 0.1));
  ctx.stroke();
}

function drawTrack(ctx: CanvasRenderingContext2D, s: SimState, L: Layout, dpr: number, now: number): void {
  const { path, trackW } = L;
  roundRect(ctx, L.inner.x, L.inner.y, L.inner.w, L.inner.h, L.inner.r);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();

  // danger glow as the belt fills / jam timer runs
  const fill = beltFill(s);
  const jam = s.scal[S.JAM] / JAM_TIME;
  const danger = Math.max(clamp((fill - 0.8) / 0.2, 0, 1) * 0.6, jam > 0 ? 0.6 + 0.4 * Math.abs(Math.sin(now * 10)) : 0);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path.trace(ctx);
  ctx.lineWidth = trackW + 6;
  ctx.strokeStyle = danger > 0 ? rgba(THEME.danger, 0.15 + danger * 0.6) : 'rgba(255,255,255,0.07)';
  ctx.stroke();
  ctx.lineWidth = trackW;
  ctx.strokeStyle = THEME.track;
  ctx.stroke();
  ctx.lineWidth = trackW * 0.72;
  ctx.strokeStyle = THEME.trackInner;
  ctx.stroke();

  // port rings show what each tube is currently pulling in
  for (let t = 0; t < s.nTubes; t++) {
    const tb = L.tubes[t];
    const hex = PALETTE[intake(s, t)].hex;
    ctx.beginPath();
    ctx.ellipse(tb.cx, L.loopBottom, L.pipeW * 0.66, trackW * 0.55, 0, 0, Math.PI * 2);
    ctx.strokeStyle = s.complete[t] ? 'rgba(255,255,255,0.15)' : rgba(hex, 0.9);
    ctx.lineWidth = s.combo[t] > 0 ? 3 : 2;
    ctx.stroke();
  }

  // belt beads (positions computed by the simulation, in wasm when available)
  const pos = s.pos;
  for (let i = 0; i < s.nSlots; i++) {
    const c = s.slotColor[i];
    const x = pos[i * 2];
    const y = pos[i * 2 + 1];
    if (c === EMPTY) {
      ctx.fillStyle = THEME.stud;
      ctx.fillRect(x - L.beadR * 0.2, y - L.beadR * 0.2, L.beadR * 0.4, L.beadR * 0.4);
      continue;
    }
    const born = s.slotBorn[i];
    const age = born < 0 ? 1 : clamp((s.scal[S.TIME] - born) / 0.18, 0, 1);
    const pc = PALETTE[c];
    drawBead(ctx, pc.hex, x, y, L.beadR * (age < 1 ? Ease.outBack(age) : 1), dpr, pc.glyph);
  }
}

function drawCellFrame(ctx: CanvasRenderingContext2D, tb: TubeBox, k: number, hex: string): void {
  const top = cellTop(tb, k);
  const inset = tb.cell * 0.035;
  roundRect(ctx, tb.x + tb.pad + inset, top + inset, tb.cell - inset * 2, tb.cell - inset * 2, tb.cell * 0.18);
  ctx.fillStyle = shade(hex, -0.6);
  ctx.fill();
  ctx.strokeStyle = shade(hex, -0.15);
  ctx.lineWidth = Math.max(1, tb.cell * 0.045);
  ctx.stroke();
}

function drawTube(ctx: CanvasRenderingContext2D, s: SimState, t: number, tb: TubeBox, L: Layout, dpr: number, highlight: number): void {
  const shellC = PALETTE[s.tubeShell[t]];
  const complete = s.complete[t] !== 0;
  const flash = s.flash[t];
  const shakeX = Math.sin(s.scal[S.TIME] * 55) * s.shake[t] * tb.w * 0.09;
  ctx.save();
  ctx.translate(shakeX, 0);
  const r = tb.w * 0.26;

  if (complete || highlight > 0) {
    ctx.save();
    ctx.shadowColor = complete ? shellC.hex : '#ffffff';
    ctx.shadowBlur = tb.w * (complete ? 0.5 + flash * 0.6 : 0.45 * highlight);
    roundRect(ctx, tb.x, tb.y, tb.w, tb.h, r);
    ctx.fillStyle = rgba(shellC.hex, 0.35);
    ctx.fill();
    ctx.restore();
  }

  roundRect(ctx, tb.x, tb.y, tb.w, tb.h, r);
  ctx.fillStyle = THEME.tubeInner;
  ctx.fill();
  const glass = ctx.createLinearGradient(tb.x, 0, tb.x + tb.w, 0);
  glass.addColorStop(0, rgba(shellC.hex, 0.24));
  glass.addColorStop(0.5, rgba(shellC.hex, 0.06));
  glass.addColorStop(1, rgba(shellC.hex, 0.2));
  ctx.fillStyle = glass;
  ctx.fill();

  // contents: full single-colour cells get a block frame, others show loose beads
  const len = s.tubeLen[t];
  for (let k = 0; k * K < len; k++) {
    const n = Math.min(K, len - k * K);
    const c0 = beadAt(s, t, k * K);
    let solid = n === K;
    for (let j = 1; j < n && solid; j++) if (beadAt(s, t, k * K + j) !== c0) solid = false;
    if (solid) drawCellFrame(ctx, tb, k, PALETTE[c0].hex);
    for (let j = 0; j < n; j++) {
      const pc = PALETTE[beadAt(s, t, k * K + j)];
      const p = beadPos(tb, k, j);
      drawBead(ctx, pc.hex, p.x, p.y, tb.br, dpr, pc.glyph);
    }
  }

  roundRect(ctx, tb.x, tb.y, tb.w, tb.h, r);
  ctx.strokeStyle = complete ? shade(shellC.hex, 0.3) : rgba(shellC.hex, 0.9);
  ctx.lineWidth = Math.max(2, tb.w * 0.055);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, tb.x + tb.w * 0.1, tb.y + tb.w * 0.2, tb.w * 0.07, tb.h - tb.w * 0.4, tb.w * 0.04);
  ctx.fill();
  if (flash > 0) {
    roundRect(ctx, tb.x, tb.y, tb.w, tb.h, r);
    ctx.fillStyle = `rgba(255,255,255,${flash * 0.45})`;
    ctx.fill();
  }

  // shell-colour cap with glyph (✓ when complete)
  const capY = tb.y + tb.h + tb.w * 0.12;
  roundRect(ctx, tb.x + tb.w * 0.06, capY, tb.w * 0.88, tb.capH, tb.capH * 0.4);
  ctx.fillStyle = shellC.hex;
  ctx.fill();
  if (complete) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2, tb.capH * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tb.cx - tb.capH * 0.32, capY + tb.capH * 0.52);
    ctx.lineTo(tb.cx - tb.capH * 0.05, capY + tb.capH * 0.76);
    ctx.lineTo(tb.cx + tb.capH * 0.38, capY + tb.capH * 0.26);
    ctx.stroke();
  } else {
    drawGlyph(ctx, shellC.glyph, tb.cx, capY + tb.capH / 2, tb.capH * 0.55, 'rgba(255,255,255,0.85)');
  }
  ctx.restore();

  // queue (ejected beads waiting to get on the belt), stacked up the pipe
  const ql = s.qLen[t];
  if (ql > 0) {
    const qr = L.pipeW * 0.3;
    const room = Math.max(1, Math.floor((tb.y - L.loopBottom - L.trackW * 0.3) / (qr * 1.6)));
    const show = Math.min(ql, room);
    for (let q = 0; q < show; q++) {
      const pc = PALETTE[queueAt(s, t, q)];
      drawBead(ctx, pc.hex, tb.cx, L.loopBottom + L.trackW * 0.35 + qr + q * qr * 1.6, qr, dpr, pc.glyph);
    }
  }
}

function drawFalling(ctx: CanvasRenderingContext2D, s: SimState, t: number, tb: TubeBox, L: Layout, dpr: number): void {
  const fl = s.fallLen[t];
  if (!fl) return;
  const pc = PALETTE[intake(s, t)];
  const len = s.tubeLen[t];
  for (let k = 0; k < fl; k++) {
    const u = clamp(s.fallT[t * MAX_BEADS + k] / FALL_TIME, 0, 1);
    const idx = len + k;
    const end = beadPos(tb, Math.floor(idx / K), idx % K);
    const x = lerp(tb.cx, end.x, Ease.outQuad(u));
    const y = lerp(L.loopBottom, end.y, u * u);
    drawBead(ctx, pc.hex, x, y, lerp(L.beadR, tb.br, u), dpr, pc.glyph);
  }
}

export function drawBoard(ctx: CanvasRenderingContext2D, s: SimState, L: Layout, dpr: number, hintTube: number): void {
  const t0 = L.tubes[0];
  const top = L.path.y - L.trackW * 1.2;
  roundRect(ctx, L.colX + L.colW * 0.025, top, L.colW * 0.95, t0.y + t0.h + t0.capH + t0.w * 0.4 - top, L.colW * 0.07);
  ctx.fillStyle = THEME.panel;
  ctx.fill();

  const now = s.scal[S.TIME];
  for (let t = 0; t < s.nTubes; t++) {
    drawPipe(ctx, L, L.tubes[t], PALETTE[intake(s, t)].hex, s.combo[t] > 0);
  }
  drawTrack(ctx, s, L, dpr, now);
  const pulse = 0.5 + 0.5 * Math.sin(now * 6);
  for (let t = 0; t < s.nTubes; t++) drawTube(ctx, s, t, L.tubes[t], L, dpr, t === hintTube ? pulse : 0);
  for (let t = 0; t < s.nTubes; t++) drawFalling(ctx, s, t, L.tubes[t], L, dpr);
}

/** Level, timer, belt-fill meter and hints inside the loop. */
export function drawLoopInfo(ctx: CanvasRenderingContext2D, s: SimState, level: number, par: number, L: Layout, hint: string[] | null): void {
  const { x, y, w, h } = L.inner;
  const cx = x + w / 2;
  const sz = Math.min(w, h * 1.6);
  text(ctx, `LEVEL ${level}`, cx, y + h * 0.17, sz * 0.065, THEME.textDim, { weight: 800 });
  const secs = s.scal[S.ELAPSED];
  text(ctx, `${Math.floor(secs / 60)}:${(secs % 60).toFixed(1).padStart(4, '0')}`, cx, y + h * 0.37, sz * 0.13, THEME.text, { weight: 800, shadow: 'rgba(0,0,0,0.35)' });

  // belt capacity meter
  const fill = beltFill(s);
  const jam = s.scal[S.JAM];
  const bw = w * 0.56;
  const bh = Math.max(6, sz * 0.026);
  const bx = cx - bw / 2;
  const by = y + h * 0.56;
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
  roundRect(ctx, bx, by, Math.max(bh, bw * fill), bh, bh / 2);
  ctx.fillStyle = fill > 0.85 ? THEME.danger : fill > 0.65 ? '#ffc93a' : THEME.good;
  ctx.fill();
  const label = jam > 0 ? `JAMMED! ${Math.max(0, JAM_TIME - jam).toFixed(1)}s` : `Loop ${Math.round(fill * 100)}% full`;
  text(ctx, label, cx, by + bh + sz * 0.045, sz * 0.042, jam > 0 ? THEME.danger : THEME.textDim, { weight: 700 });

  if (hint) {
    hint.forEach((line, i) => text(ctx, line, cx, y + h * (0.8 + i * 0.1), sz * 0.042, '#fff', { weight: 600 }));
  } else {
    let done = 0;
    for (let t = 0; t < s.nTubes; t++) done += s.complete[t];
    text(ctx, `${done}/${s.nTubes} sorted · par ${par}s`, cx, y + h * 0.84, sz * 0.042, 'rgba(255,255,255,0.4)', { weight: 600 });
  }
}
