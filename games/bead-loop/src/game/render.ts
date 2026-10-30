import { Ease } from '@shared/engine/ease';
import { clamp, lerp } from '@shared/engine/math';
import { rgba, shade } from '@shared/ui/color';
import { roundRect, text } from '@shared/ui/draw';
import { drawGlyph, type GlyphKind } from '@shared/ui/glyphs';
import { beadSprite } from '@shared/ui/sprites';
import { FALL_TIME, JAM_TIME, K, MAX_BEADS, S, EMPTY, beadAt, isOpen, queueAt, type SimState } from '../sim/types';
import { PALETTE, THEME } from './constants';
import type { Advice } from './advisor';
import type { BoardFx } from './fx';
import { beadPos, cellTop, type Layout, type TubeBox } from './layout';

/*
 * Performance: every gradient-heavy, static piece (glass, caps, jelly blocks,
 * glows, the belt) is painted once into an offscreen layer and blitted with
 * drawImage, like the bead sprites. Per frame we only move, scale and fade
 * those layers. Call clearLayerCache() when the layout changes.
 */

// ---------------------------------------------------------------- cached layers

interface Layer { c: HTMLCanvasElement; w: number; h: number; pad: number }
const layers = new Map<string, Layer>();

/** Returns a cached offscreen layer of CSS size w×h (+pad on each side), painted at (0,0) = top-left of w×h. */
function layer(key: string, w: number, h: number, pad: number, dpr: number, paint: (g: CanvasRenderingContext2D) => void): Layer {
  const k = `${key}|${w.toFixed(1)}|${h.toFixed(1)}|${dpr}`;
  let l = layers.get(k);
  if (l) return l;
  if (layers.size > 300) layers.clear();
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil((w + pad * 2) * dpr));
  c.height = Math.max(1, Math.ceil((h + pad * 2) * dpr));
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.translate(pad, pad);
  paint(g);
  l = { c, w, h, pad };
  layers.set(k, l);
  return l;
}

function blit(ctx: CanvasRenderingContext2D, l: Layer, x: number, y: number): void {
  ctx.drawImage(l.c, x - l.pad, y - l.pad, l.w + l.pad * 2, l.h + l.pad * 2);
}

export function clearLayerCache(): void {
  layers.clear();
  contentCache.length = 0;
  clumps.clear();
}

// ---------------------------------------------------------------- bead clumps

/**
 * Every bead the simulation tracks is drawn as a clump of tiny grains, so the
 * belt and tubes read as a pour of many small beads. Each clump is baked once
 * per (colour, size, variant) into a sprite, so it costs one drawImage like a
 * single bead did. Grains are too small for glyphs; blocks and caps keep them.
 */
const GRAIN_ANGLES = [0.3, 1.6, 2.9, 4.4];
const clumps = new Map<string, HTMLCanvasElement>();

function clumpSprite(hex: string, r: number, dpr: number, variant: number): HTMLCanvasElement {
  const key = `${hex}|${Math.round(r * dpr * 4)}|${dpr}|${variant}`;
  let c = clumps.get(key);
  if (c) return c;
  if (clumps.size > 600) clumps.clear();
  const size = Math.ceil(r * 2.9 * dpr) + 4;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const gr = r * 0.46;
  const spr = beadSprite(hex, gr, dpr);
  const rot = variant * 0.71;
  const grains: { x: number; y: number }[] = [{ x: 0.06 * r, y: -0.04 * r }];
  for (const a of GRAIN_ANGLES) {
    const d = r * (0.5 + 0.08 * Math.sin(a * 3 + variant));
    grains.push({ x: Math.cos(a + rot) * d, y: Math.sin(a + rot) * d });
  }
  grains.sort((a, b) => a.y - b.y); // lower grains drawn last sit in front
  const m = size / 2;
  for (const p of grains) g.drawImage(spr, Math.round(m + p.x * dpr - spr.width / 2), Math.round(m + p.y * dpr - spr.height / 2));
  clumps.set(key, c);
  return c;
}

/** Draws a clump centred at (x, y) with footprint radius r; `seed` picks its arrangement. */
function drawClump(
  ctx: CanvasRenderingContext2D, hex: string, x: number, y: number, r: number, dpr: number, seed: number,
  sx = 1, sy = 1, rot = 0,
): void {
  if (r <= 0.2 || sx <= 0.01 || sy <= 0.01) return;
  const c = clumpSprite(hex, r, dpr, ((seed % 4) + 4) % 4);
  const d = c.width / dpr;
  if (rot === 0) {
    ctx.drawImage(c, x - (d * sx) / 2, y - (d * sy) / 2, d * sx, d * sy);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(c, (-d * sx) / 2, (-d * sy) / 2, d * sx, d * sy);
  ctx.restore();
}

// ---------------------------------------------------------------- background

/** Big soft light blobs that drift very slowly (calm, out-of-focus feel). */
const BLOBS = [
  { c: 0, x: 0.18, y: 0.2, r: 0.75, fx: 0.07, fy: 0.05, p: 0 },
  { c: 1, x: 0.85, y: 0.35, r: 0.6, fx: 0.05, fy: 0.08, p: 2 },
  { c: 2, x: 0.25, y: 0.8, r: 0.7, fx: 0.06, fy: 0.04, p: 4 },
  { c: 3, x: 0.8, y: 0.85, r: 0.55, fx: 0.08, fy: 0.06, p: 1 },
];
const BG_SCALE = 0.25;
let bg: { w: number; h: number; c: HTMLCanvasElement; g: CanvasRenderingContext2D; lin: CanvasGradient; vig: CanvasGradient; blobs: HTMLCanvasElement[] } | null = null;

function blobSprite(hex: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rad.addColorStop(0, rgba(hex, 1));
  rad.addColorStop(0.45, rgba(hex, 0.45));
  rad.addColorStop(1, rgba(hex, 0));
  g.fillStyle = rad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/**
 * Gradient background with slowly drifting bokeh and a soft vignette. It is
 * composed at quarter resolution (it's all soft gradients) and scaled up in a
 * single drawImage, so the animation costs about one full-screen blit.
 */
export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, _dpr: number): void {
  const sw = Math.max(8, Math.ceil(w * BG_SCALE));
  const sh = Math.max(8, Math.ceil(h * BG_SCALE));
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
    bg = { w: sw, h: sh, c, g, lin, vig, blobs: bg?.blobs ?? THEME.bokeh.map(blobSprite) };
  }
  const { g, c } = bg;
  g.globalAlpha = 1;
  g.fillStyle = bg.lin;
  g.fillRect(0, 0, sw, sh);
  const t = performance.now() / 1000;
  const big = Math.max(sw, sh);
  g.globalAlpha = 0.14;
  for (const b of BLOBS) {
    const x = sw * (b.x + 0.1 * Math.sin(t * b.fx + b.p));
    const y = sh * (b.y + 0.06 * Math.cos(t * b.fy + b.p));
    const r = big * b.r * (1 + 0.06 * Math.sin(t * 0.21 + b.p));
    g.drawImage(bg.blobs[b.c], x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  g.fillStyle = bg.vig;
  g.fillRect(0, 0, sw, sh);
  ctx.drawImage(c, 0, 0, w, h);
}

// ---------------------------------------------------------------- helpers

/** 0..1 how full the belt is. */
export const beltFill = (s: SimState): number => 1 - s.scal[S.FREE] / Math.max(1, s.nSlots);

/** Soft bell curve 0 → 1 → 0 over `dur` seconds after `t0`. */
const bump = (now: number, t0: number, dur: number): number => {
  const u = (now - t0) / dur;
  return u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI);
};

/** Damped squash after a bead lands: returns k (+ = squashed flat). */
const landSquash = (age: number): number => (age < 0 || age > 0.45 ? 0 : 0.34 * Math.exp(-age * 10) * Math.cos(age * 24));

/** Four-point twinkle. */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const n = r * 0.22;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + n, y - n, x + r, y);
  ctx.quadraticCurveTo(x + n, y + n, x, y + r);
  ctx.quadraticCurveTo(x - n, y + n, x - r, y);
  ctx.quadraticCurveTo(x - n, y - n, x, y - r);
  ctx.fill();
}

// ---------------------------------------------------------------- layer painters

const tubeRadius = (tb: TubeBox): number => tb.w * 0.3;

function glowLayer(tb: TubeBox, hex: string, dpr: number): Layer {
  const size = tb.w * 0.12;
  return layer(`glow|${hex}`, tb.w, tb.h, size * 3, dpr, (g) => {
    for (let i = 3; i >= 1; i--) {
      roundRect(g, 0, 0, tb.w, tb.h, tubeRadius(tb));
      g.strokeStyle = rgba(hex, 0.22 / i);
      g.lineWidth = size * i;
      g.stroke();
    }
  });
}

function glassBack(tb: TubeBox, hex: string, complete: boolean, dpr: number): Layer {
  return layer(`back|${hex}|${complete}`, tb.w, tb.h, 0, dpr, (g) => {
    roundRect(g, 0, 0, tb.w, tb.h, tubeRadius(tb));
    g.fillStyle = THEME.tubeInner;
    g.fill();
    const glass = g.createLinearGradient(0, 0, tb.w, 0);
    glass.addColorStop(0, rgba(hex, 0.26));
    glass.addColorStop(0.35, rgba(hex, 0.05));
    glass.addColorStop(0.7, rgba(hex, 0.03));
    glass.addColorStop(1, rgba(hex, 0.2));
    g.fillStyle = glass;
    g.fill();
    if (complete) {
      g.fillStyle = rgba(hex, 0.14);
      g.fill();
    }
  });
}

function glassFront(tb: TubeBox, hex: string, complete: boolean, dpr: number): Layer {
  const lw = Math.max(2, tb.w * 0.05);
  return layer(`front|${hex}|${complete}`, tb.w, tb.h, lw, dpr, (g) => {
    const { w, h } = tb;
    roundRect(g, 0, 0, w, h, tubeRadius(tb));
    g.strokeStyle = complete ? shade(hex, 0.35) : rgba(hex, 0.85);
    g.lineWidth = lw;
    g.stroke();
    const hl = g.createLinearGradient(0, 0, 0, h);
    hl.addColorStop(0, 'rgba(255,255,255,0.32)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0.1)');
    hl.addColorStop(1, 'rgba(255,255,255,0.02)');
    g.fillStyle = hl;
    roundRect(g, w * 0.11, w * 0.18, w * 0.07, h - w * 0.36, w * 0.035);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(g, w * 0.8, w * 0.3, w * 0.04, h * 0.4, w * 0.02);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = Math.max(1, w * 0.03);
    g.beginPath();
    g.ellipse(w / 2, w * 0.07, w * 0.3, w * 0.05, 0, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  });
}

/** Diagonal light band, clipped to the tube shape, for the shimmer sweep. */
function shimmerLayer(tb: TubeBox, dpr: number): Layer {
  // tall enough that the slanted band fades out before the layer's edges
  const bh = tb.w * 3;
  return layer('shimmer', tb.w, bh, 0, dpr, (g) => {
    const band = g.createLinearGradient(0, bh * 0.65, tb.w, bh * 0.35);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.3, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(255,255,255,0.38)');
    band.addColorStop(0.7, 'rgba(255,255,255,0)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = band;
    g.fillRect(0, 0, tb.w, bh);
  });
}

function capLayer(tb: TubeBox, hex: string, glyph: GlyphKind | 'check', dpr: number): Layer {
  const cw = tb.w * 0.88;
  const ch = tb.capH;
  return layer(`cap|${hex}|${glyph}`, cw, ch, 2, dpr, (g) => {
    roundRect(g, 0, 0, cw, ch, ch * 0.45);
    const cg = g.createLinearGradient(0, 0, 0, ch);
    cg.addColorStop(0, shade(hex, 0.3));
    cg.addColorStop(1, shade(hex, -0.15));
    g.fillStyle = cg;
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    roundRect(g, cw * 0.12, ch * 0.12, cw * 0.76, ch * 0.22, ch * 0.11);
    g.fill();
    if (glyph === 'check') {
      g.strokeStyle = '#fff';
      g.lineWidth = Math.max(2, ch * 0.16);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(cw / 2 - ch * 0.32, ch * 0.52);
      g.lineTo(cw / 2 - ch * 0.05, ch * 0.76);
      g.lineTo(cw / 2 + ch * 0.38, ch * 0.26);
      g.stroke();
    } else {
      drawGlyph(g, glyph, cw / 2, ch / 2, ch * 0.55, 'rgba(255,255,255,0.9)');
    }
  });
}

/**
 * A run of full single-colour cells drawn as one glossy candy column, with the
 * colour's glyph once per cell (colour-blind friendly, and shows the count).
 * Purely horizontal shading, so overlapping copies line up seamlessly.
 */
function stackLayer(tb: TubeBox, hex: string, glyph: GlyphKind, cells: number, complete: boolean, dpr: number): Layer {
  const inset = tb.cell * 0.04;
  const sw = tb.cell - inset * 2;
  const sh = cells * tb.cell - inset * 2;
  return layer(`stack|${hex}|${cells}|${complete}`, sw, sh, 1, dpr, (g) => {
    const r = sw * 0.3;
    roundRect(g, 0, 0, sw, sh, r);
    const body = g.createLinearGradient(0, 0, sw, 0);
    body.addColorStop(0, shade(hex, complete ? 0.42 : 0.32));
    body.addColorStop(0.2, shade(hex, complete ? 0.22 : 0.12));
    body.addColorStop(0.6, hex);
    body.addColorStop(1, shade(hex, -0.38));
    g.fillStyle = body;
    g.fill();
    for (let i = 0; i < cells; i++) drawGlyph(g, glyph, sw / 2, sh - (i + 0.5) * tb.cell + inset, tb.cell * 0.4, 'rgba(255,255,255,0.3)');
    // specular streaks
    g.fillStyle = 'rgba(255,255,255,0.42)';
    roundRect(g, sw * 0.13, r * 0.55, sw * 0.11, sh - r * 1.1, sw * 0.055);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(g, sw * 0.8, r * 0.8, sw * 0.05, sh - r * 1.6, sw * 0.025);
    g.fill();
    // soft light along the top edge
    g.fillStyle = 'rgba(255,255,255,0.3)';
    roundRect(g, sw * 0.32, sw * 0.08, sw * 0.4, sw * 0.07, sw * 0.035);
    g.fill();
    roundRect(g, 0, 0, sw, sh, r);
    g.strokeStyle = shade(hex, -0.5);
    g.lineWidth = Math.max(1, tb.cell * 0.03);
    g.stroke();
  });
}

/** Pipe in the tube's colour; dimmed while the tube is blocked. */
function pipeLayer(L: Layout, tb: TubeBox, hex: string, open: boolean, dpr: number): Layer {
  const pw = L.pipeW;
  const ph = tb.y + tb.w * 0.1 - L.loopBottom;
  const lw = Math.max(1.5, pw * 0.1);
  const a = open ? 1 : 0.35;
  return layer(`pipe|${hex}|${open}`, pw, ph, lw, dpr, (g) => {
    roundRect(g, 0, 0, pw, ph, pw * 0.35);
    g.fillStyle = THEME.tubeInner;
    g.fill();
    const lg = g.createLinearGradient(0, 0, pw, 0);
    lg.addColorStop(0, rgba(hex, 0.3 * a));
    lg.addColorStop(0.5, rgba(hex, 0.06 * a));
    lg.addColorStop(1, rgba(hex, 0.22 * a));
    g.fillStyle = lg;
    g.fill();
    g.strokeStyle = open ? rgba(hex, 0.6) : 'rgba(255,255,255,0.16)';
    g.lineWidth = lw;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(pw * 0.2, pw * 0.3, Math.max(1, pw * 0.1), Math.max(0, ph - pw * 0.6));
  });
}

/** Board panel, loop interior and the belt channel: everything static under the beads. */
function baseLayer(L: Layout, dpr: number): { l: Layer; x: number; y: number } {
  const t0 = L.tubes[0];
  const top = L.path.y - L.trackW * 1.2;
  const x = L.colX + L.colW * 0.025;
  const w = L.colW * 0.95;
  const h = t0.y + t0.h + t0.capH + t0.w * 0.45 - top;
  const l = layer(`base|${x.toFixed(1)}|${top.toFixed(1)}`, w, h, 0, dpr, (g) => {
    g.translate(-x, -top);
    roundRect(g, x, top, w, h, L.colW * 0.07);
    const pg = g.createLinearGradient(0, top, 0, top + h);
    pg.addColorStop(0, 'rgba(255,255,255,0.06)');
    pg.addColorStop(1, 'rgba(255,255,255,0.02)');
    g.fillStyle = pg;
    g.fill();
    g.strokeStyle = THEME.panelEdge;
    g.lineWidth = 1;
    g.stroke();
    roundRect(g, L.inner.x, L.inner.y, L.inner.w, L.inner.h, L.inner.r);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fill();
    g.lineJoin = 'round';
    g.beginPath();
    L.path.trace(g);
    g.lineWidth = L.trackW + 10;
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.stroke();
    g.lineWidth = L.trackW;
    g.strokeStyle = THEME.track;
    g.stroke();
    g.lineWidth = L.trackW * 0.78;
    g.strokeStyle = THEME.trackInner;
    g.stroke();
  });
  return { l, x, y: top };
}

// ---------------------------------------------------------------- pieces

function drawTrack(ctx: CanvasRenderingContext2D, s: SimState, L: Layout, fx: BoardFx, dpr: number, glintColour: number): void {
  const { path, trackW, spacing } = L;
  const now = fx.time;

  const fill = beltFill(s);
  const jam = s.scal[S.JAM] / JAM_TIME;
  const danger = Math.max(clamp((fill - 0.8) / 0.2, 0, 1) * 0.5, jam > 0 ? 0.6 + 0.4 * Math.abs(Math.sin(now * 9)) : 0);
  if (danger > 0) {
    ctx.lineJoin = 'round';
    ctx.beginPath();
    path.trace(ctx);
    ctx.lineWidth = trackW + 8;
    ctx.strokeStyle = rgba(THEME.danger, 0.12 + danger * 0.55);
    ctx.stroke();
    ctx.lineWidth = trackW * 0.78;
    ctx.strokeStyle = THEME.trackInner;
    ctx.stroke();
  }

  // conveyor treads between slots, moving in lock-step with the beads
  // (one dashed stroke is ~2x cheaper than a segment per slot)
  const dash = Math.max(1, spacing * 0.14);
  ctx.beginPath();
  path.trace(ctx);
  ctx.setLineDash([dash, spacing - dash]);
  ctx.lineDashOffset = -(s.scal[S.OFFSET] + 0.5) * spacing + dash / 2;
  ctx.lineWidth = trackW * 0.72;
  ctx.strokeStyle = THEME.tread;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  // ports: a glowing ring in the tube's colour while it's open (pulsing as it
  // swallows a bead); a dim dashed ring while a wrong colour on top blocks it
  for (let t = 0; t < s.nTubes; t++) {
    const tb = L.tubes[t];
    const hex = PALETTE[s.tubeShell[t]].hex;
    const open = isOpen(s, t);
    const p = fx.port[t];
    const sc = 1 + Ease.outCubic(p) * 0.25;
    ctx.beginPath();
    ctx.ellipse(tb.cx, L.loopBottom, L.pipeW * 0.66 * sc, trackW * 0.55 * sc, 0, 0, Math.PI * 2);
    if (p > 0 && !s.complete[t]) {
      ctx.fillStyle = rgba(hex, 0.25 * p);
      ctx.fill();
    }
    if (s.complete[t]) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
    } else if (open) {
      ctx.strokeStyle = rgba(hex, 0.8 + p * 0.2);
      ctx.lineWidth = 2.5 + p * 1.5;
    } else {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.5 + p * 1.5;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // belt beads (positions from the simulation); new ones pop in with a bounce
  const pos = s.pos;
  for (let i = 0; i < s.nSlots; i++) {
    const c = s.slotColor[i];
    if (c === EMPTY) continue;
    const born = s.slotBorn[i];
    const age = born < 0 ? 1 : clamp((s.scal[S.TIME] - born) / 0.22, 0, 1);
    const k = age < 1 ? Ease.outBack(age) : 1;
    const pc = PALETTE[c];
    drawClump(ctx, pc.hex, pos[i * 2], pos[i * 2 + 1], L.beadR, dpr, i, k, k);
  }

  // hint "why": the beads waiting for the suggested tube shimmer
  if (glintColour >= 0) {
    const r = L.beadR * 1.25;
    ctx.beginPath();
    for (let i = 0; i < s.nSlots; i++) {
      if (s.slotColor[i] !== glintColour) continue;
      ctx.moveTo(pos[i * 2] + r, pos[i * 2 + 1]);
      ctx.arc(pos[i * 2], pos[i * 2 + 1], r, 0, Math.PI * 2);
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.3 * Math.sin(now * 6)})`;
    ctx.lineWidth = Math.max(1, L.beadR * 0.22);
    ctx.stroke();
  }
}

/** Hint overlays: a "tap here" ripple on the suggested tube, red ✕ on risky ones. */
function drawGuide(ctx: CanvasRenderingContext2D, s: SimState, L: Layout, fx: BoardFx, g: Advice): void {
  if (g.tube >= 0) {
    const tb = L.tubes[g.tube];
    const cy = tb.y + tb.h * 0.55;
    for (let k = 0; k < 2; k++) {
      const ph = (fx.time * 1.1 + k * 0.5) % 1;
      ctx.beginPath();
      ctx.arc(tb.cx, cy, lerp(tb.w * 0.25, tb.w * 0.95, Ease.outCubic(ph)), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${(1 - ph) * 0.75})`;
      ctx.lineWidth = Math.max(1.5, tb.w * 0.06 * (1 - ph * 0.5));
      ctx.stroke();
    }
  }
  for (let t = 0; t < s.nTubes; t++) {
    if (!(g.avoid & (1 << t))) continue;
    const tb = L.tubes[t];
    const r = tb.w * 0.22;
    const x = tb.cx;
    const y = tb.y + tb.w * 0.45;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(THEME.danger, 0.9);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, r * 0.22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.4, y - r * 0.4);
    ctx.lineTo(x + r * 0.4, y + r * 0.4);
    ctx.moveTo(x + r * 0.4, y - r * 0.4);
    ctx.lineTo(x - r * 0.4, y + r * 0.4);
    ctx.stroke();
  }
}

function drawPipe(ctx: CanvasRenderingContext2D, L: Layout, tb: TubeBox, hex: string, open: boolean, glow: number, dpr: number): void {
  blit(ctx, pipeLayer(L, tb, hex, open, dpr), tb.cx - L.pipeW / 2, L.loopBottom);
  if (glow > 0) {
    roundRect(ctx, tb.cx - L.pipeW / 2, L.loopBottom, L.pipeW, tb.y + tb.w * 0.1 - L.loopBottom, L.pipeW * 0.35);
    ctx.fillStyle = rgba(hex, glow * 0.25);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- tube contents

/**
 * Settled beads of each tube, painted once into a per-tube canvas and redrawn
 * only when the stack changes. Beads still animating (just landed, completion
 * or win pop) are drawn live on top, so a tube costs one blit most frames.
 */
interface ContentCache { c: HTMLCanvasElement; g: CanvasRenderingContext2D; key: number }
const contentCache: (ContentCache | undefined)[] = [];
const LAND_ANIM = 0.45;

/** True if cell k is full and all one colour. */
function solidCell(s: SimState, t: number, k: number, len: number): boolean {
  if ((k + 1) * K > len) return false;
  const c0 = beadAt(s, t, k * K);
  for (let j = 1; j < K; j++) if (beadAt(s, t, k * K + j) !== c0) return false;
  return true;
}

/** Draws the merged stack for cells k0..k1 (bottom → top), optionally scaled about its centre. */
function drawStack(ctx: CanvasRenderingContext2D, s: SimState, t: number, tb: TubeBox, k0: number, k1: number, complete: boolean, dpr: number, scale = 1): void {
  const pc = PALETTE[beadAt(s, t, k0 * K)];
  const l = stackLayer(tb, pc.hex, pc.glyph, k1 - k0 + 1, complete, dpr);
  const inset = tb.cell * 0.04;
  const x = tb.x + tb.pad + inset;
  const y = cellTop(tb, k1) + inset;
  if (scale === 1) {
    blit(ctx, l, x, y);
    return;
  }
  const cx = x + l.w / 2;
  const cy = y + l.h / 2;
  const w = (l.w + l.pad * 2) * scale;
  const h = (l.h + l.pad * 2) * scale;
  ctx.drawImage(l.c, cx - w / 2, cy - h / 2, w, h);
}

/** Last cell index of the same-colour solid run starting at k0. */
function runEnd(s: SimState, t: number, k0: number, len: number): number {
  const c = beadAt(s, t, k0 * K);
  let k1 = k0;
  while (solidCell(s, t, k1 + 1, len) && beadAt(s, t, (k1 + 1) * K) === c) k1++;
  return k1;
}

const MERGE_TIME = 0.24;

/**
 * Tube contents: runs of full single-colour cells become one candy stack;
 * mixed or partly filled cells show loose beads. Settled cells are cached per
 * tube and repainted only when the stack changes; animating ones (landing
 * squash, beads melting into a stack, completion/win pop) are drawn live.
 */
function drawContents(ctx: CanvasRenderingContext2D, s: SimState, t: number, tb: TubeBox, fx: BoardFx, dpr: number, complete: boolean): void {
  const now = fx.time;
  const len = s.tubeLen[t];
  const base = t * MAX_BEADS;
  const cT = fx.completeT[t];
  const winB = fx.winT > 0 ? fx.winT + t * 0.08 : -9;
  const popScale = 1 + 0.07 * bump(now, cT, 0.4) + 0.06 * bump(now, winB, 0.35);

  // cells below `cells` are at rest and come from the cache
  let stable = popScale !== 1 ? 0 : len;
  for (let j = len - 1; j >= 0 && j >= len - 2 * K && stable > 0; j--) if (now - fx.landT[base + j] < LAND_ANIM) stable = j;
  const cells = Math.floor(stable / K);

  if (cells > 0) {
    let key = cells * 131 + (complete ? 7 : 0);
    for (let j = 0; j < cells * K; j++) key = (Math.imul(key, 33) + s.tubeBeads[base + j]) | 0;
    let cc = contentCache[t];
    const cw = Math.ceil(tb.w * dpr);
    const ch = Math.ceil(tb.h * dpr);
    if (!cc || cc.c.width !== cw || cc.c.height !== ch) {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      cc = contentCache[t] = { c, g: c.getContext('2d')!, key: NaN };
    }
    if (cc.key !== key) {
      const g = cc.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cw, ch);
      g.setTransform(dpr, 0, 0, dpr, -tb.x * dpr, -tb.y * dpr);
      for (let k = 0; k < cells; k++) {
        if (solidCell(s, t, k, len)) {
          const k1 = Math.min(runEnd(s, t, k, len), cells - 1);
          drawStack(g, s, t, tb, k, k1, complete, dpr);
          k = k1;
          continue;
        }
        for (let j = k * K; j < (k + 1) * K; j++) {
          const pc = PALETTE[beadAt(s, t, j)];
          const p = beadPos(tb, k, j % K);
          drawClump(g, pc.hex, p.x, p.y, tb.br, dpr, j);
        }
      }
      cc.key = key;
    }
    ctx.drawImage(cc.c, tb.x, tb.y, cw / dpr, ch / dpr);
  }

  // live cells: stacks (fading in as their beads melt), then loose beads
  const lastCell = Math.ceil(len / K) - 1;
  for (let k = cells; k <= lastCell; k++) {
    if (!solidCell(s, t, k, len)) {
      for (let j = k * K; j < Math.min(len, (k + 1) * K); j++) {
        const pc = PALETTE[beadAt(s, t, j)];
        const p = beadPos(tb, k, j % K);
        const sq = landSquash(now - fx.landT[base + j]);
        const sx = 1 + sq * 0.7;
        const sy = 1 - sq;
        drawClump(ctx, pc.hex, p.x, p.y + tb.br * (1 - sy) * 0.85, tb.br, dpr, j, sx, sy);
      }
      continue;
    }
    // extend the run down into the cached part so the stack reads as one piece
    let k0 = k;
    while (k0 > 0 && solidCell(s, t, k0 - 1, len) && beadAt(s, t, (k0 - 1) * K) === beadAt(s, t, k * K)) k0--;
    const k1 = runEnd(s, t, k, len);
    let melt = 1;
    for (let kk = k; kk <= k1; kk++) melt = Math.min(melt, clamp((now - fx.landT[base + kk * K + K - 1]) / MERGE_TIME, 0, 1));
    const sc = popScale * (1 + 0.04 * Math.sin(melt * Math.PI));
    if (k0 < k && melt < 1) {
      // the settled part stays solid; only the new cells fade in on top of it
      drawStack(ctx, s, t, tb, k0, k - 1, complete, dpr, sc);
    }
    ctx.globalAlpha = Ease.outQuad(melt);
    drawStack(ctx, s, t, tb, k0, k1, complete, dpr, sc);
    ctx.globalAlpha = 1;
    if (melt < 1) {
      // beads of the newest cells shrink and fade as they melt into the stack
      const bs = 1 - 0.45 * melt;
      ctx.globalAlpha = 1 - melt;
      for (let kk = k; kk <= k1; kk++) {
        for (let j = kk * K; j < (kk + 1) * K; j++) {
          const pc = PALETTE[beadAt(s, t, j)];
          const p = beadPos(tb, kk, j % K);
          drawClump(ctx, pc.hex, p.x, p.y, tb.br, dpr, j, bs, bs);
        }
      }
      ctx.globalAlpha = 1;
    }
    k = k1;
  }
}

function drawTube(ctx: CanvasRenderingContext2D, s: SimState, t: number, tb: TubeBox, fx: BoardFx, dpr: number, highlight: number): void {
  const now = fx.time;
  const shellC = PALETTE[s.tubeShell[t]];
  const hex = shellC.hex;
  const complete = s.complete[t] !== 0;
  const cT = fx.completeT[t];
  const capY = tb.y + tb.h + tb.w * 0.12;
  const anchorY = capY + tb.capH;

  ctx.save();
  // jelly wobble anchored at the cap, plus the sim's "denied" shake
  const w = fx.wob[t];
  const shakeX = Math.sin(s.scal[S.TIME] * 42) * s.shake[t] * tb.w * 0.07;
  ctx.translate(tb.cx + shakeX, anchorY);
  ctx.scale(1 + w * 0.035, 1 - w * 0.05);
  ctx.translate(-tb.cx, -anchorY);

  if (complete) {
    ctx.globalAlpha = clamp(0.7 + bump(now, cT, 0.8) * 0.8 + 0.15 * Math.sin(now * 2 + t), 0, 1);
    blit(ctx, glowLayer(tb, hex, dpr), tb.x, tb.y);
  }
  if (highlight > 0) {
    ctx.globalAlpha = highlight;
    blit(ctx, glowLayer(tb, '#ffffff', dpr), tb.x, tb.y);
  }
  ctx.globalAlpha = 1;
  blit(ctx, glassBack(tb, hex, complete, dpr), tb.x, tb.y);

  drawContents(ctx, s, t, tb, fx, dpr, complete);

  blit(ctx, glassFront(tb, hex, complete, dpr), tb.x, tb.y);

  // diagonal shimmer: once when completed, then a slow idle glint
  let su = -1;
  if (complete) su = now - cT < 0.9 ? (now - cT) / 0.9 : ((now + t * 0.7) % 5) / 1.1;
  if (su >= 0 && su <= 1) {
    ctx.save();
    roundRect(ctx, tb.x, tb.y, tb.w, tb.h, tubeRadius(tb));
    ctx.clip();
    const sl = shimmerLayer(tb, dpr);
    blit(ctx, sl, tb.x, tb.y + tb.h * (1.15 - su * 1.5) - sl.h / 2);
    ctx.restore();
  }
  if (s.flash[t] > 0) {
    roundRect(ctx, tb.x, tb.y, tb.w, tb.h, tubeRadius(tb));
    ctx.fillStyle = `rgba(255,255,255,${s.flash[t] * 0.3})`;
    ctx.fill();
  }

  // shell-colour cap with glyph (✓ when complete, popping in)
  const capPop = 1 + 0.3 * bump(now, cT, 0.35);
  const cap = capLayer(tb, hex, complete ? 'check' : shellC.glyph, dpr);
  const cw = cap.w * capPop;
  const ch = cap.h * capPop;
  const pad = cap.pad * capPop;
  ctx.drawImage(cap.c, tb.cx - cw / 2 - pad, capY + tb.capH / 2 - ch / 2 - pad, cw + pad * 2, ch + pad * 2);
  ctx.restore();
}

/** Ejected beads waiting in the pipe; they glide up as the bottom one leaves. */
function drawQueue(ctx: CanvasRenderingContext2D, s: SimState, t: number, tb: TubeBox, L: Layout, fx: BoardFx, dpr: number): void {
  const vis = s.qLen[t] - fx.pending[t];
  if (vis <= 0) return;
  const qr = L.pipeW * 0.3;
  const step = qr * 1.6;
  const y0 = L.loopBottom + L.trackW * 0.35 + qr;
  const room = Math.max(1, Math.floor((tb.y - L.loopBottom - L.trackW * 0.3) / step));
  const show = Math.min(vis, room);
  const off = fx.qOff[t];
  for (let q = 0; q < show; q++) {
    const pc = PALETTE[queueAt(s, t, q)];
    drawClump(ctx, pc.hex, tb.cx, y0 + (q + off) * step, qr, dpr, s.qHead[t] + q);
  }
}

/** Beads dropping from the port into the tube: fall straight, then tuck into place. */
function drawFalling(ctx: CanvasRenderingContext2D, s: SimState, t: number, tb: TubeBox, L: Layout, dpr: number): void {
  const fl = s.fallLen[t];
  if (!fl) return;
  const pc = PALETTE[s.tubeShell[t]];
  const len = s.tubeLen[t];
  const start = L.beadR / tb.br;
  for (let k = 0; k < fl; k++) {
    const u = clamp(s.fallT[t * MAX_BEADS + k] / FALL_TIME, 0, 1);
    const idx = len + k;
    const end = beadPos(tb, Math.floor(idx / K), idx % K);
    const xu = Ease.outCubic(clamp((u - 0.45) / 0.55, 0, 1));
    const x = lerp(tb.cx, end.x, xu);
    const y = lerp(L.loopBottom, end.y, u * u);
    const sc = lerp(start, 1, Ease.outQuad(u));
    const stretch = 0.12 * u * (1 - xu);
    drawClump(ctx, pc.hex, x, y, tb.br, dpr, idx, sc * (1 - stretch * 0.5), sc * (1 + stretch));
  }
}

/** Beads flying from the tube top up into the tail of the pipe after a tap. */
function drawFlyers(ctx: CanvasRenderingContext2D, s: SimState, L: Layout, fx: BoardFx, dpr: number): void {
  const rank = [0, 0, 0, 0, 0, 0];
  const qr = L.pipeW * 0.3;
  const step = qr * 1.6;
  const y0 = L.loopBottom + L.trackW * 0.35 + qr;
  for (const f of fx.flyers) {
    const t = f.tube;
    const tb = L.tubes[t];
    const room = Math.max(1, Math.floor((tb.y - L.loopBottom - L.trackW * 0.3) / step));
    const slot = Math.min(s.qLen[t] - fx.pending[t] + rank[t]++, room - 1);
    const seed = Math.floor(f.x * 3 + f.y);
    if (f.t < 0) {
      drawClump(ctx, PALETTE[f.color].hex, f.x, f.y, tb.br, dpr, seed);
      continue;
    }
    const u = Ease.inOutQuad(clamp(f.t / f.dur, 0, 1));
    const tx = tb.cx;
    const ty = y0 + Math.max(0, slot) * step;
    const x = lerp(f.x, tx, Ease.outCubic(clamp(f.t / f.dur, 0, 1)));
    const y = lerp(f.y, ty, u);
    const sc = lerp(1, qr / tb.br, u);
    const st = Math.sin(u * Math.PI) * 0.2;
    // clumps tumble as they're tossed up into the pipe
    const spin = u * 2.4 * (seed % 2 ? 1 : -1);
    drawClump(ctx, PALETTE[f.color].hex, x, y, tb.br, dpr, seed, sc * (1 - st * 0.5), sc * (1 + st), spin);
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
    sparkle(ctx, p.x, p.y, p.size * (0.6 + 0.4 * Math.sin(u * Math.PI)));
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export function drawBoard(
  ctx: CanvasRenderingContext2D, s: SimState, L: Layout, fx: BoardFx, dpr: number, hintTube: number, guide: Advice | null = null,
): void {
  const base = baseLayer(L, dpr);
  blit(ctx, base.l, base.x, base.y);
  for (let t = 0; t < s.nTubes; t++) drawPipe(ctx, L, L.tubes[t], PALETTE[s.tubeShell[t]].hex, isOpen(s, t), fx.port[t], dpr);
  for (let t = 0; t < s.nTubes; t++) drawQueue(ctx, s, t, L.tubes[t], L, fx, dpr);
  drawTrack(ctx, s, L, fx, dpr, guide ? guide.colour : -1);
  const pulse = 0.5 + 0.5 * Math.sin(fx.time * 5);
  for (let t = 0; t < s.nTubes; t++) drawTube(ctx, s, t, L.tubes[t], fx, dpr, t === hintTube ? pulse : 0);
  for (let t = 0; t < s.nTubes; t++) drawFalling(ctx, s, t, L.tubes[t], L, dpr);
  drawFlyers(ctx, s, L, fx, dpr);
  if (guide) drawGuide(ctx, s, L, fx, guide);
  drawEffects(ctx, fx);
}

/** Level, timer, belt-fill meter and hints inside the loop. */
export function drawLoopInfo(
  ctx: CanvasRenderingContext2D, s: SimState, level: number, par: number, secs: number, L: Layout, fx: BoardFx, hint: string[] | null,
): void {
  const { x, y, w, h } = L.inner;
  const cx = x + w / 2;
  const sz = Math.min(w, h * 1.6);
  text(ctx, `LEVEL ${level}`, cx, y + h * 0.17, sz * 0.062, THEME.textDim, { weight: 800 });
  text(ctx, `${Math.floor(secs / 60)}:${(secs % 60).toFixed(1).padStart(4, '0')}`, cx, y + h * 0.37, sz * 0.13, THEME.text, { weight: 800, shadow: 'rgba(0,0,0,0.35)' });

  // belt capacity meter (eased, colour blends green → yellow → red)
  const fill = clamp(fx.meter, 0, 1);
  const jam = s.scal[S.JAM];
  const bw = w * 0.56;
  const bh = Math.max(7, sz * 0.03);
  const bx = cx - bw / 2;
  const by = y + h * 0.56;
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  const col = fill > 0.85 ? THEME.danger : fill > 0.65 ? '#ffc93a' : THEME.good;
  const fw = Math.max(bh, bw * fill);
  roundRect(ctx, bx, by, fw, bh, bh / 2);
  const mg = ctx.createLinearGradient(0, by, 0, by + bh);
  mg.addColorStop(0, shade(col, 0.35));
  mg.addColorStop(1, col);
  ctx.fillStyle = mg;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  roundRect(ctx, bx + bh * 0.4, by + bh * 0.18, Math.max(0, fw - bh * 0.8), bh * 0.25, bh * 0.12);
  ctx.fill();
  const label = jam > 0 ? `JAMMED! ${Math.max(0, JAM_TIME - jam).toFixed(1)}s` : `Loop ${Math.round(beltFill(s) * 100)}% full`;
  text(ctx, label, cx, by + bh + sz * 0.045, sz * 0.042, jam > 0 ? THEME.danger : THEME.textDim, { weight: 700 });

  if (hint) {
    hint.forEach((line, i) => text(ctx, line, cx, y + h * (0.8 + i * 0.1), sz * 0.042, '#fff', { weight: 600 }));
  } else {
    let done = 0;
    for (let t = 0; t < s.nTubes; t++) done += s.complete[t];
    text(ctx, `${done}/${s.nTubes} sorted · par ${par}s`, cx, y + h * 0.84, sz * 0.042, 'rgba(255,255,255,0.4)', { weight: 600 });
  }
}
