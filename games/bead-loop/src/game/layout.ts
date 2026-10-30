import { RoundedRectPath } from '@shared/engine/path';
import { clamp } from '@shared/engine/math';

export interface TubeBox {
  x: number;
  y: number;
  w: number;
  /** Height of the glass body (cells + padding). */
  h: number;
  cx: number;
  pad: number;
  cell: number;
  /** Radius of beads drawn inside the tube. */
  br: number;
  /** Colour cap below the body. */
  capH: number;
}

export interface Layout {
  W: number;
  H: number;
  colX: number;
  colW: number;
  btn: number;
  hudY: number;
  path: RoundedRectPath;
  trackW: number;
  beadR: number;
  spacing: number;
  loopBottom: number;
  inner: { x: number; y: number; w: number; h: number; r: number };
  tubes: TubeBox[];
  portFrac: number[];
  pipeW: number;
}

/**
 * Responsive layout. Everything lives in a centred portrait column
 * (max aspect 0.62), so landscape/desktop shows the same board with
 * background on the sides. Loop on top, tubes underneath connected by pipes.
 */
export function computeLayout(W: number, H: number, colors: number, cap: number, slots: number): Layout {
  const colW = Math.min(W, H * 0.62);
  const colX = (W - colW) / 2;
  const btn = clamp(colW * 0.11, 38, 54);
  const hudY = clamp(H * 0.02, 10, 24);
  const top = hudY + btn + colW * 0.04;
  const bottom = H - clamp(H * 0.035, 12, 32);

  const padX = colW * 0.06;
  const loopW = colW - padX * 2;
  const loopX = colX + padX;
  const radius = loopW * 0.13;

  const gapR = 0.4;
  const span = loopW - radius * 2 - loopW * 0.05;
  let tw = Math.min(span / (colors + (colors - 1) * gapR), colW * 0.16);
  const bodyH = (w: number) => cap * (w * 0.76) + w * 0.24;
  const capH = (w: number) => w * 0.34;
  const tubeTotal = (w: number) => bodyH(w) + capH(w) + w * 0.12;
  let pipeGap = tw * 0.85;
  let loopH = loopW * 0.62;

  const avail = bottom - top;
  if (loopH + pipeGap + tubeTotal(tw) > avail) loopH = Math.max(loopW * 0.44, avail - pipeGap - tubeTotal(tw));
  if (loopH + pipeGap + tubeTotal(tw) > avail) {
    const s = (avail - loopH) / (pipeGap + tubeTotal(tw));
    tw *= s;
    pipeGap *= s;
  }
  const used = loopH + pipeGap + tubeTotal(tw);
  const y0 = top + Math.max(0, avail - used) * 0.5;

  const path = new RoundedRectPath(loopX, y0, loopW, loopH, Math.min(radius, loopH * 0.3));
  const spacing = path.length / slots;
  const beadR = spacing * 0.62;
  const trackW = beadR * 3.1;
  const loopBottom = y0 + loopH;

  const pad = tw * 0.12;
  const cell = tw - pad * 2;
  const totalW = colors * tw + (colors - 1) * tw * gapR;
  const startX = colX + colW / 2 - totalW / 2;
  const tubeTop = loopBottom + pipeGap;
  const tubes: TubeBox[] = [];
  const portFrac: number[] = [];
  for (let i = 0; i < colors; i++) {
    const x = startX + i * tw * (1 + gapR);
    const cx = x + tw / 2;
    tubes.push({ x, y: tubeTop, w: tw, h: bodyH(tw), cx, pad, cell, br: cell * 0.145, capH: capH(tw) });
    portFrac.push(path.paramAtBottomX(cx) / path.length);
  }

  const it = trackW * 0.75;
  return {
    W, H, colX, colW, btn, hudY, path, trackW, beadR, spacing, loopBottom,
    inner: { x: loopX + it, y: y0 + it, w: loopW - it * 2, h: loopH - it * 2, r: Math.max(4, path.r - it) },
    tubes, portFrac, pipeW: tw * 0.46,
  };
}

/** Centre of bead `sub` (0..8, 3x3, bottom row first) in cell `k` (from the bottom). */
export function beadPos(tb: TubeBox, k: number, sub: number): { x: number; y: number } {
  const bottom = tb.y + tb.h - tb.pad;
  const cy = bottom - (k + 0.5) * tb.cell;
  const off = tb.cell * 0.31;
  const col = sub % 3;
  const row = Math.floor(sub / 3);
  return { x: tb.cx + (col - 1) * off, y: cy + (1 - row) * off };
}

export function cellTop(tb: TubeBox, k: number): number {
  return tb.y + tb.h - tb.pad - (k + 1) * tb.cell;
}
