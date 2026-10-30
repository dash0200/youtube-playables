import { Ease } from '@shared/engine/ease';
import { clamp, hash01, lerp, mod } from '@shared/engine/math';
import { rgba, shade } from '@shared/ui/color';
import { roundRect, text } from '@shared/ui/draw';
import { drawGlyph } from '@shared/ui/glyphs';
import { drawBead } from '@shared/ui/sprites';
import type { Board, Tube } from './board';
import { BEADS_PER_BLOCK as K, EJECT_TIME, FALL_TIME, PALETTE, THEME } from './constants';
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

function drawPipe(ctx: CanvasRenderingContext2D, L: Layout, tb: TubeBox, color: string): void {
  const pw = L.pipeW;
  const y0 = L.loopBottom;
  const y1 = tb.y + tb.w * 0.1;
  roundRect(ctx, tb.cx - pw / 2, y0, pw, y1 - y0, pw * 0.3);
  ctx.fillStyle = THEME.tubeInner;
  ctx.fill();
  ctx.strokeStyle = rgba(color, 0.55);
  ctx.lineWidth = Math.max(1.5, pw * 0.1);
  ctx.stroke();
}

function drawTrack(ctx: CanvasRenderingContext2D, b: Board, L: Layout, dpr: number): void {
  const { path, trackW } = L;
  // inner panel
  roundRect(ctx, L.inner.x, L.inner.y, L.inner.w, L.inner.h, L.inner.r);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();
  // track body
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path.trace(ctx);
  ctx.lineWidth = trackW + 5;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.stroke();
  ctx.lineWidth = trackW;
  ctx.strokeStyle = THEME.track;
  ctx.stroke();
  ctx.lineWidth = trackW * 0.72;
  ctx.strokeStyle = THEME.trackInner;
  ctx.stroke();

  // ports: coloured ring on the track where each tube connects
  b.tubes.forEach((t, i) => {
    const tb = L.tubes[i];
    const hex = PALETTE[t.color].hex;
    ctx.beginPath();
    ctx.ellipse(tb.cx, L.loopBottom, L.pipeW * 0.62, trackW * 0.52, 0, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(hex, 0.65);
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // belt: studs on empty slots (show movement) and beads
  const N = b.N;
  for (let i = 0; i < N; i++) {
    const s = b.slots[i];
    const p = path.at(mod(i + b.offset, N) * L.spacing);
    const j = (hash01(i) - 0.5) * trackW * 0.26;
    const x = p.x + p.nx * j;
    const y = p.y + p.ny * j;
    if (!s) {
      ctx.fillStyle = THEME.stud;
      ctx.beginPath();
      ctx.arc(p.x, p.y, L.beadR * 0.22, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const age = s.born < 0 ? 1 : clamp((b.time - s.born) / 0.18, 0, 1);
    const r = L.beadR * (age < 1 ? Ease.outBack(age) : 1);
    const c = PALETTE[s.color];
    drawBead(ctx, c.hex, x, y, r, dpr, c.glyph);
  }
}

function drawBlock(ctx: CanvasRenderingContext2D, tb: TubeBox, k: number, colorId: number, dpr: number, alpha = 1): void {
  const c = PALETTE[colorId];
  const top = cellTop(tb, k);
  const inset = tb.cell * 0.04;
  ctx.globalAlpha = alpha;
  roundRect(ctx, tb.x + tb.pad + inset, top + inset, tb.cell - inset * 2, tb.cell - inset * 2, tb.cell * 0.2);
  ctx.fillStyle = shade(c.hex, -0.55);
  ctx.fill();
  ctx.strokeStyle = shade(c.hex, -0.1);
  ctx.lineWidth = Math.max(1, tb.cell * 0.05);
  ctx.stroke();
  for (let s = 0; s < K; s++) {
    const p = beadPos(tb, k, s);
    drawBead(ctx, c.hex, p.x, p.y, tb.br, dpr, c.glyph);
  }
  ctx.globalAlpha = 1;
}

function looseBeadPos(t: Tube, tb: TubeBox, m: number) {
  return beadPos(tb, t.looseY + Math.floor(m / K), m % K);
}

function drawTube(ctx: CanvasRenderingContext2D, b: Board, t: Tube, tb: TubeBox, L: Layout, dpr: number, highlight: number): void {
  const c = PALETTE[t.color];
  const shake = Math.sin(b.time * 55) * t.shake * tb.w * 0.09;
  ctx.save();
  ctx.translate(shake, 0);
  const r = tb.w * 0.26;

  // glow when complete / hint highlight
  if (t.complete || highlight > 0) {
    ctx.save();
    ctx.shadowColor = t.complete ? c.hex : '#ffffff';
    ctx.shadowBlur = tb.w * (t.complete ? 0.5 + t.flash * 0.6 : 0.4 * highlight);
    roundRect(ctx, tb.x, tb.y, tb.w, tb.h, r);
    ctx.fillStyle = rgba(c.hex, 0.35);
    ctx.fill();
    ctx.restore();
  }

  // glass body
  roundRect(ctx, tb.x, tb.y, tb.w, tb.h, r);
  ctx.fillStyle = THEME.tubeInner;
  ctx.fill();
  const glass = ctx.createLinearGradient(tb.x, 0, tb.x + tb.w, 0);
  glass.addColorStop(0, rgba(c.hex, 0.22));
  glass.addColorStop(0.5, rgba(c.hex, 0.06));
  glass.addColorStop(1, rgba(c.hex, 0.18));
  ctx.fillStyle = glass;
  ctx.fill();

  // blocks
  t.blocks.forEach((blk) => drawBlock(ctx, tb, blk.y, blk.color, dpr));
  // loose sorted beads
  for (let m = 0; m < t.sorted; m++) {
    const p = looseBeadPos(t, tb, m);
    drawBead(ctx, c.hex, p.x, p.y, tb.br, dpr, c.glyph);
  }
  // ejecting blocks rising out
  for (const e of t.ejects) {
    const u = Ease.inQuad(clamp(e.t / EJECT_TIME, 0, 1));
    const y = lerp(e.fromY, t.cap + 0.3, u);
    drawBlock(ctx, tb, y, e.color, dpr, 1 - u * 0.7);
  }

  // rim + highlight
  roundRect(ctx, tb.x, tb.y, tb.w, tb.h, r);
  ctx.strokeStyle = t.complete ? shade(c.hex, 0.3) : rgba(c.hex, 0.9);
  ctx.lineWidth = Math.max(2, tb.w * 0.055);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, tb.x + tb.w * 0.14, tb.y + tb.w * 0.2, tb.w * 0.09, tb.h - tb.w * 0.4, tb.w * 0.05);
  ctx.fill();
  if (t.flash > 0) {
    roundRect(ctx, tb.x, tb.y, tb.w, tb.h, r);
    ctx.fillStyle = `rgba(255,255,255,${t.flash * 0.45})`;
    ctx.fill();
  }

  // colour cap with glyph (accessibility)
  const capY = tb.y + tb.h + tb.w * 0.12;
  roundRect(ctx, tb.x + tb.w * 0.06, capY, tb.w * 0.88, tb.capH, tb.capH * 0.4);
  ctx.fillStyle = c.hex;
  ctx.fill();
  if (t.complete) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2, tb.capH * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tb.cx - tb.capH * 0.32, capY + tb.capH * 0.52);
    ctx.lineTo(tb.cx - tb.capH * 0.05, capY + tb.capH * 0.76);
    ctx.lineTo(tb.cx + tb.capH * 0.38, capY + tb.capH * 0.26);
    ctx.stroke();
  } else {
    drawGlyph(ctx, c.glyph, tb.cx, capY + tb.capH / 2, tb.capH * 0.55, 'rgba(255,255,255,0.85)');
  }
  ctx.restore();

  // queued beads waiting in the pipe (stacked from the tube mouth upward)
  if (t.queue.length) {
    const qr = L.pipeW * 0.34;
    const room = Math.max(1, Math.floor((tb.y - L.loopBottom) / (qr * 1.7)));
    const n = Math.min(t.queue.length, room);
    for (let q = 0; q < n; q++) {
      const qc = PALETTE[t.queue[q]];
      drawBead(ctx, qc.hex, tb.cx, L.loopBottom + L.trackW * 0.3 + qr + q * qr * 1.7, qr, dpr, qc.glyph);
    }
  }
}

/** Beads falling from the port into a tube (drawn above everything). */
function drawFalling(ctx: CanvasRenderingContext2D, t: Tube, tb: TubeBox, L: Layout, dpr: number): void {
  const c = PALETTE[t.color];
  t.falling.forEach((f, k) => {
    const u = clamp(f.t / FALL_TIME, 0, 1);
    const end = looseBeadPos(t, tb, t.sorted + k);
    const x = lerp(tb.cx, end.x, Ease.outQuad(u));
    const y = lerp(L.loopBottom, end.y, u * u);
    drawBead(ctx, c.hex, x, y, lerp(L.beadR, tb.br, u), dpr, c.glyph);
  });
}

export function drawBoard(ctx: CanvasRenderingContext2D, b: Board, L: Layout, dpr: number, hintTube: number): void {
  // backing panel
  roundRect(ctx, L.colX + L.colW * 0.025, L.path.y - L.trackW * 1.2, L.colW * 0.95,
    L.tubes[0].y + L.tubes[0].h + L.tubes[0].capH + L.tubes[0].w * 0.4 - (L.path.y - L.trackW * 1.2), L.colW * 0.07);
  ctx.fillStyle = THEME.panel;
  ctx.fill();

  b.tubes.forEach((t, i) => drawPipe(ctx, L, L.tubes[i], PALETTE[t.color].hex));
  drawTrack(ctx, b, L, dpr);
  const pulse = 0.5 + 0.5 * Math.sin(b.time * 6);
  b.tubes.forEach((t, i) => drawTube(ctx, b, t, L.tubes[i], L, dpr, i === hintTube ? pulse : 0));
  b.tubes.forEach((t, i) => drawFalling(ctx, t, L.tubes[i], L, dpr));
}

/** Level number, timer and progress inside the loop. */
export function drawLoopInfo(ctx: CanvasRenderingContext2D, b: Board, L: Layout, hint: string | null): void {
  const { x, y, w, h } = L.inner;
  const cx = x + w / 2;
  const s = Math.min(w, h * 1.6);
  text(ctx, `LEVEL ${b.level.number}`, cx, y + h * 0.24, s * 0.075, THEME.textDim, { weight: 800 });
  const secs = b.elapsed;
  const timeStr = `${Math.floor(secs / 60)}:${(secs % 60).toFixed(1).padStart(4, '0')}`;
  text(ctx, timeStr, cx, y + h * 0.48, s * 0.15, THEME.text, { weight: 800, shadow: 'rgba(0,0,0,0.35)' });
  const done = b.tubes.filter((t) => t.complete).length;
  const dot = s * 0.022;
  const gap = dot * 3.4;
  const x0 = cx - ((b.tubes.length - 1) * gap) / 2;
  b.tubes.forEach((t, i) => {
    ctx.beginPath();
    ctx.arc(x0 + i * gap, y + h * 0.7, dot, 0, Math.PI * 2);
    ctx.fillStyle = t.complete ? PALETTE[t.color].hex : 'rgba(255,255,255,0.15)';
    ctx.fill();
  });
  if (hint) text(ctx, hint, cx, y + h * 0.86, s * 0.052, THEME.textDim, { weight: 600 });
  else text(ctx, `${done}/${b.tubes.length} sorted · par ${b.level.par}s`, cx, y + h * 0.86, s * 0.05, 'rgba(255,255,255,0.4)', { weight: 600 });
}
