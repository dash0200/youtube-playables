import { Ease } from '@shared/engine/ease';
import { clamp, lerp } from '@shared/engine/math';
import { rgba, shade } from '@shared/ui/color';
import { roundRect, text } from '@shared/ui/draw';
import { drawGlyph } from '@shared/ui/glyphs';
import { drawBead } from '@shared/ui/sprites';
import { Kind, type Sim } from '../sim/sim';
import type { Advice } from '../sim/bot';
import { PALETTE, THEME } from './constants';
import type { BoardFx } from './fx';
import { railAt, type Layout, type Rail } from './layout';

// ---------------------------------------------------------------- background

const BLOBS = [
  { c: 0, x: 0.2, y: 0.22, r: 0.7, fx: 0.06, fy: 0.05, p: 0 },
  { c: 1, x: 0.82, y: 0.4, r: 0.55, fx: 0.05, fy: 0.07, p: 2 },
  { c: 2, x: 0.3, y: 0.82, r: 0.65, fx: 0.07, fy: 0.04, p: 4 },
  { c: 3, x: 0.78, y: 0.86, r: 0.5, fx: 0.08, fy: 0.06, p: 1 },
];
let bg: { w: number; h: number; c: HTMLCanvasElement; g: CanvasRenderingContext2D; lin: CanvasGradient; vig: CanvasGradient; blobs: HTMLCanvasElement[] } | null = null;

function blob(hex: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rad.addColorStop(0, rgba(hex, 1));
  rad.addColorStop(0.45, rgba(hex, 0.4));
  rad.addColorStop(1, rgba(hex, 0));
  g.fillStyle = rad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** Calm gradient with slowly drifting light, composed at ¼ resolution and scaled up in one blit. */
export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const sw = Math.max(8, Math.ceil(w / 4));
  const sh = Math.max(8, Math.ceil(h / 4));
  if (!bg || bg.w !== sw || bg.h !== sh) {
    const c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    const g = c.getContext('2d')!;
    const lin = g.createLinearGradient(0, 0, 0, sh);
    lin.addColorStop(0, THEME.bgTop);
    lin.addColorStop(1, THEME.bgBottom);
    const vig = g.createRadialGradient(sw / 2, sh * 0.45, Math.min(sw, sh) * 0.25, sw / 2, sh * 0.5, Math.max(sw, sh) * 0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    bg = { w: sw, h: sh, c, g, lin, vig, blobs: bg?.blobs ?? THEME.bokeh.map(blob) };
  }
  const { g } = bg;
  g.globalAlpha = 1;
  g.fillStyle = bg.lin;
  g.fillRect(0, 0, sw, sh);
  const t = performance.now() / 1000;
  const big = Math.max(sw, sh);
  g.globalAlpha = 0.12;
  for (const b of BLOBS) {
    const x = sw * (b.x + 0.1 * Math.sin(t * b.fx + b.p));
    const y = sh * (b.y + 0.06 * Math.cos(t * b.fy + b.p));
    const r = big * b.r;
    g.drawImage(bg.blobs[b.c], x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  g.fillStyle = bg.vig;
  g.fillRect(0, 0, sw, sh);
  ctx.drawImage(bg.c, 0, 0, w, h);
}

// ---------------------------------------------------------------- helpers

const hexOf = (c: number): string => PALETTE[c].hex;

const bump = (now: number, t0: number, dur: number): number => {
  const u = (now - t0) / dur;
  return u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI);
};

function traceRail(ctx: CanvasRenderingContext2D, r: Rail): void {
  ctx.moveTo(r.p0.x, r.p0.y);
  ctx.bezierCurveTo(r.c1.x, r.c1.y, r.c2.x, r.c2.y, r.p3.x, r.p3.y);
}

function marble(ctx: CanvasRenderingContext2D, color: number, x: number, y: number, r: number, dpr: number, sx = 1, sy = 1): void {
  drawBead(ctx, hexOf(color), x, y, r, dpr, PALETTE[color].glyph, sx, sy);
}

// ---------------------------------------------------------------- pieces

function drawRails(ctx: CanvasRenderingContext2D, sim: Sim, L: Layout, fx: BoardFx): void {
  const active = sim.nodes.map((n, i) => {
    if (n.parent < 0) return true;
    const p = sim.nodes[n.parent];
    return (sim.gate[p.ref].state === 0 ? p.left : p.right) === i;
  });
  ctx.lineCap = 'round';
  for (const pass of [false, true]) {
    ctx.beginPath();
    sim.nodes.forEach((_, i) => {
      if (active[i] === pass) traceRail(ctx, L.rail[i]);
    });
    ctx.strokeStyle = THEME.railDark;
    ctx.lineWidth = L.railW;
    ctx.stroke();
    ctx.strokeStyle = pass ? THEME.rail : THEME.railOff;
    ctx.lineWidth = L.railW * 0.5;
    ctx.stroke();
    if (pass) {
      ctx.strokeStyle = rgba(THEME.railLit, 0.35 + 0.1 * Math.sin(fx.time * 2));
      ctx.lineWidth = L.railW * 0.14;
      ctx.stroke();
    }
  }
}

function drawHopper(ctx: CanvasRenderingContext2D, sim: Sim, L: Layout, fx: BoardFx, dpr: number, spawnT: number, hintMarble: number): void {
  const { hopper: h, drop, r } = L;
  roundRect(ctx, h.x, h.y, h.w, h.h, h.h * 0.5);
  ctx.fillStyle = THEME.glass;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // drop hole
  ctx.beginPath();
  ctx.ellipse(drop.x, drop.y - r * 0.3, r * 1.25, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#02090d';
  ctx.fill();
  // queue: next marble sits over the hole, the rest line up to the right and slide in
  const step = r * 2.3;
  const fit = Math.floor((h.x + h.w - drop.x - r) / step) + 1;
  // when the queue is longer than the tray, a "+N" label sits at the right end
  const overflow = sim.queue.length > fit;
  const labelX = h.x + h.w - r * 1.4;
  const max = overflow ? fit - 1 : fit;
  const slide = Math.max(0, 1 - (fx.time - spawnT) / 0.28);
  const cy = h.y + h.h * 0.5;
  const shown = Math.min(sim.queue.length, max);
  for (let k = shown - 1; k >= 0; k--) {
    let x = drop.x + (k + Ease.outCubic(slide)) * step;
    if (overflow && x > labelX - r * 2.2) continue; // sliding in from under the label
    if (k === 0 && sim.nextDrop < 0.35 && sim.queue.length) x += Math.sin(fx.time * 40) * r * 0.08;
    if (hintMarble === -(k + 1)) {
      // the hint is about a marble still in the hopper: set its route before it drops
      ctx.beginPath();
      ctx.arc(x, cy, r * (1.5 + 0.2 * Math.sin(fx.time * 8)), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = Math.max(1.5, r * 0.2);
      ctx.stroke();
    }
    marble(ctx, sim.queue[k], x, cy, r, dpr);
  }
  if (overflow) text(ctx, `+${sim.queue.length - max}`, labelX, cy, r * 0.9, THEME.textDim, { weight: 700 });
}

function drawCup(ctx: CanvasRenderingContext2D, sim: Sim, c: number, L: Layout, fx: BoardFx, dpr: number, hinted: boolean): void {
  const box = L.cup[c];
  const cup = sim.cups[c];
  const hex = hexOf(cup.color);
  const now = fx.time;
  const full = cup.count >= cup.cap;
  const spill = bump(now, fx.spillT[c], 0.5);
  const shake = Math.sin(now * 50) * spill * box.w * 0.08;
  const rad = box.w * 0.32;
  ctx.save();
  ctx.translate(shake, 0);
  if (full || hinted) {
    const glow = full ? 0.5 + 0.5 * bump(now, fx.fullT[c], 0.8) : 0.5 + 0.5 * Math.sin(now * 6);
    for (let i = 3; i >= 1; i--) {
      roundRect(ctx, box.x, box.y, box.w, box.h, rad);
      ctx.strokeStyle = rgba(full ? hex : '#ffffff', (glow * 0.22) / i);
      ctx.lineWidth = box.w * 0.12 * i;
      ctx.stroke();
    }
  }
  roundRect(ctx, box.x, box.y, box.w, box.h, rad);
  ctx.fillStyle = THEME.glass;
  ctx.fill();
  ctx.fillStyle = rgba(hex, full ? 0.22 : 0.1);
  ctx.fill();
  // marbles stacked from the bottom; the newest one bounces as it lands
  const r = L.r;
  for (let i = 0; i < cup.count; i++) {
    const y = box.y + box.h - r * 0.55 - (i + 0.5) * r * 1.9;
    const isTop = i === cup.count - 1;
    const age = now - fx.landT[c];
    const sq = isTop && age < 0.35 ? 0.25 * Math.exp(-age * 12) * Math.cos(age * 30) : 0;
    const pop = full ? 1 + 0.15 * bump(now, fx.fullT[c] + i * 0.03, 0.3) : 1;
    marble(ctx, cup.color, box.cx, y + r * sq, r, dpr, (1 + sq * 0.6) * pop, (1 - sq) * pop);
  }
  roundRect(ctx, box.x, box.y, box.w, box.h, rad);
  ctx.strokeStyle = full ? shade(hex, 0.35) : rgba(hex, 0.8);
  ctx.lineWidth = Math.max(2, box.w * 0.06);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, box.x + box.w * 0.14, box.y + rad * 0.6, box.w * 0.1, box.h - rad * 1.2, box.w * 0.05);
  ctx.fill();
  if (spill > 0) {
    roundRect(ctx, box.x, box.y, box.w, box.h, rad);
    ctx.fillStyle = rgba(THEME.danger, spill * 0.35);
    ctx.fill();
  }
  // colour tab with glyph (✓ when full)
  const ty = box.y + box.h + r * 0.35;
  roundRect(ctx, box.x - box.w * 0.05, ty, box.w * 1.1, box.tabH, box.tabH * 0.45);
  ctx.fillStyle = hex;
  ctx.fill();
  if (full) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2, box.tabH * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(box.cx - box.tabH * 0.3, ty + box.tabH * 0.52);
    ctx.lineTo(box.cx - box.tabH * 0.05, ty + box.tabH * 0.76);
    ctx.lineTo(box.cx + box.tabH * 0.36, ty + box.tabH * 0.26);
    ctx.stroke();
  } else {
    drawGlyph(ctx, PALETTE[cup.color].glyph, box.cx, ty + box.tabH / 2, box.tabH * 0.55, 'rgba(255,255,255,0.92)');
    // marbles still needed, faint inside the top of the glass
    if (cup.count < cup.cap - 1) text(ctx, `${cup.cap - cup.count}`, box.cx, box.y + r * 1.15, r * 0.9, 'rgba(255,255,255,0.35)', { weight: 800 });
  }
  ctx.restore();
}

function drawGate(ctx: CanvasRenderingContext2D, sim: Sim, g: number, L: Layout, fx: BoardFx, hinted: boolean): void {
  const ni = sim.gateNode[g];
  const n = sim.nodes[ni];
  const p = L.node[ni];
  const R = L.gateR;
  const now = fx.time;
  const gate = sim.gate[g];
  if (hinted) {
    for (let k = 0; k < 2; k++) {
      const ph = (now * 1.1 + k * 0.5) % 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, lerp(R * 1.05, R * 2.2, Ease.outCubic(ph)), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${(1 - ph) * 0.8})`;
      ctx.lineWidth = Math.max(1.5, R * 0.12 * (1 - ph * 0.5));
      ctx.stroke();
    }
  }
  const pass = bump(now, fx.passT[g], 0.25);
  ctx.beginPath();
  ctx.arc(p.x, p.y, R * (1 + pass * 0.08), 0, Math.PI * 2);
  ctx.fillStyle = THEME.gate;
  ctx.fill();
  ctx.strokeStyle = gate.link ? THEME.link : THEME.rail;
  ctx.lineWidth = Math.max(2, R * 0.16);
  ctx.stroke();
  // flipper: swings between the two branches
  const a = (i: number) => Math.atan2(L.node[i].y - p.y, L.node[i].x - p.x);
  const ang = lerp(a(n.left), a(n.right), clamp(fx.flip[g], 0, 1));
  const len = R * 0.82;
  ctx.lineCap = 'round';
  ctx.strokeStyle = THEME.railLit;
  ctx.lineWidth = R * 0.34;
  ctx.beginPath();
  ctx.moveTo(p.x - Math.cos(ang) * R * 0.2, p.y - Math.sin(ang) * R * 0.2);
  ctx.lineTo(p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, R * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = THEME.rail;
  ctx.fill();
  if (gate.auto) {
    // self-flipping gate: a small circular arrow above it
    const ar = R * 0.45;
    const cx = p.x;
    const cy = p.y - R * 1.45;
    ctx.strokeStyle = THEME.auto;
    ctx.lineWidth = Math.max(1.5, R * 0.12);
    ctx.beginPath();
    ctx.arc(cx, cy, ar, Math.PI * 0.15 + now * 2, Math.PI * 1.65 + now * 2);
    ctx.stroke();
  }
  if (gate.link) {
    ctx.beginPath();
    ctx.arc(p.x + R * 0.95, p.y - R * 0.95, R * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = THEME.link;
    ctx.fill();
  }
}

function drawMarbles(ctx: CanvasRenderingContext2D, sim: Sim, L: Layout, dpr: number, hintMarble: number, now: number): void {
  for (const m of sim.marbles) {
    const pt = railAt(L.rail[m.to], m.d / m.len);
    if (m.id === hintMarble) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, L.r * (1.5 + 0.2 * Math.sin(now * 8)), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = Math.max(1.5, L.r * 0.2);
      ctx.stroke();
    }
    marble(ctx, m.color, pt.x, pt.y, L.r, dpr);
  }
}

function drawFlyers(ctx: CanvasRenderingContext2D, L: Layout, fx: BoardFx, dpr: number): void {
  const end = { x: L.hopper.x + L.hopper.w - L.r * 1.5, y: L.hopper.y + L.hopper.h * 0.5 };
  for (const f of fx.flyers) {
    const u = Ease.inOutQuad(clamp(f.t / f.dur, 0, 1));
    const cx = (f.from.x + end.x) / 2 + L.colW * 0.25;
    const cy = Math.min(f.from.y, end.y) - L.r * 4;
    const x = (1 - u) * (1 - u) * f.from.x + 2 * (1 - u) * u * cx + u * u * end.x;
    const y = (1 - u) * (1 - u) * f.from.y + 2 * (1 - u) * u * cy + u * u * end.y;
    marble(ctx, f.color, x, y, L.r, dpr);
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, fx: BoardFx): void {
  for (const r of fx.rings) {
    const u = r.t / r.max;
    ctx.globalAlpha = (1 - u) * (1 - u);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = Math.max(0.5, r.w * (1 - u * 0.7));
    ctx.beginPath();
    ctx.arc(r.x, r.y, lerp(r.r0, r.r1, Ease.outCubic(u)), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const p of fx.sparks) {
    const u = p.t / p.max;
    ctx.globalAlpha = Math.sin(u * Math.PI) * 0.9;
    ctx.fillStyle = p.color;
    const r = p.size * (0.6 + 0.4 * Math.sin(u * Math.PI));
    const nn = r * 0.22;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r);
    ctx.quadraticCurveTo(p.x + nn, p.y - nn, p.x + r, p.y);
    ctx.quadraticCurveTo(p.x + nn, p.y + nn, p.x, p.y + r);
    ctx.quadraticCurveTo(p.x - nn, p.y + nn, p.x - r, p.y);
    ctx.quadraticCurveTo(p.x - nn, p.y - nn, p.x, p.y - r);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** The whole board. `hint` highlights a gate to tap, the marble it's for and that marble's cup. */
export function drawBoard(ctx: CanvasRenderingContext2D, sim: Sim, L: Layout, fx: BoardFx, dpr: number, spawnT: number, hint: Advice | null): void {
  const P = L.panel;
  roundRect(ctx, P.x, P.y, P.w, P.h, L.colW * 0.06);
  ctx.fillStyle = THEME.panel;
  ctx.fill();
  ctx.strokeStyle = THEME.panelEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
  drawRails(ctx, sim, L, fx);
  for (let c = 0; c < sim.cups.length; c++) drawCup(ctx, sim, c, L, fx, dpr, !!hint && hint.cup === c);
  drawHopper(ctx, sim, L, fx, dpr, spawnT, hint ? hint.marble : 0);
  sim.nodes.forEach((n) => n.kind === Kind.GATE && drawGate(ctx, sim, n.ref, L, fx, !!hint && hint.gate === n.ref));
  drawMarbles(ctx, sim, L, dpr, hint ? hint.marble : 0, fx.time);
  drawFlyers(ctx, L, fx, dpr);
  drawEffects(ctx, fx);
}

/** Spills used / allowed, as small sockets (filled red when used). */
export function drawSpills(ctx: CanvasRenderingContext2D, sim: Sim, x: number, y: number, r: number): void {
  const gap = r * 2.7;
  const x0 = x - ((sim.maxSpills - 1) * gap) / 2;
  for (let i = 0; i < sim.maxSpills; i++) {
    ctx.beginPath();
    ctx.arc(x0 + i * gap, y, r, 0, Math.PI * 2);
    if (i < sim.spills) {
      ctx.fillStyle = THEME.danger;
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1.5, r * 0.25);
      ctx.stroke();
    }
  }
}
