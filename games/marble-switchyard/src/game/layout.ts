import { clamp } from '@shared/engine/math';
import { HOPPER_DROP, Kind, type MarbleSim } from '../sim/sim';

export interface Pt {
  x: number;
  y: number;
}

/** Cubic Bézier for the rail into a node (from its parent, or from the hopper). */
export interface Rail {
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p3: Pt;
}

export interface CupBox {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  /** Height of the colour tab under the glass. */
  tabH: number;
}

export interface Layout {
  W: number;
  H: number;
  colX: number;
  colW: number;
  btn: number;
  hudY: number;
  /** Marble radius. */
  r: number;
  /** Hopper tray (queue shown inside it) and the drop point under it. */
  hopper: { x: number; y: number; w: number; h: number };
  drop: Pt;
  node: Pt[];
  rail: Rail[];
  cup: CupBox[];
  gateR: number;
  /** Rail stroke width. */
  railW: number;
  /** Board panel. */
  panel: { x: number; y: number; w: number; h: number };
}

const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Point on a rail at t (0..1). */
export function railAt(r: Rail, t: number): Pt {
  const u = clamp(t, 0, 1);
  const a = lerpPt(r.p0, r.c1, u);
  const b = lerpPt(r.c1, r.c2, u);
  const c = lerpPt(r.c2, r.p3, u);
  return lerpPt(lerpPt(a, b, u), lerpPt(b, c, u), u);
}

/**
 * Responsive layout in a centred portrait column (max aspect 0.62): HUD, the
 * hopper tray, the track (one row per tree level) and the cups along the
 * bottom. Marble size comes from the cup spacing, then rows share what's left.
 */
export function computeLayout(W: number, H: number, sim: MarbleSim): Layout {
  const colW = Math.min(W, H * 0.62);
  const colX = (W - colW) / 2;
  const btn = clamp(colW * 0.11, 38, 54);
  const hudY = clamp(H * 0.02, 10, 24);
  const top = hudY + btn * 1.9;
  const bottom = H - clamp(H * 0.035, 12, 32);
  const k = sim.cups.length;
  const cap = Math.max(...sim.cups.map((c) => c.cap));
  const bottomRow = Math.max(...sim.nodes.map((n) => n.row));
  const span = colW * 0.88;
  const sx = span / k;
  let r = clamp(sx * 0.2, 7, 15);
  const cupH = (rr: number) => cap * rr * 1.9 + rr * 1.1;
  const tabH = (rr: number) => rr * 1.3;
  const hopH = (rr: number) => rr * 3.1;
  // rows share the height left after the hopper and cups; shrink marbles until rows are roomy enough
  let rowH = 0;
  for (let i = 0; i < 12; i++) {
    rowH = (bottom - top - hopH(r) - cupH(r) - tabH(r) - r) / (bottomRow + HOPPER_DROP);
    if (rowH >= r * 4.2 || r <= 6) break;
    r *= 0.9;
  }
  rowH = Math.min(rowH, r * 9);
  const used = hopH(r) + (bottomRow + HOPPER_DROP) * rowH + cupH(r) + tabH(r) + r;
  const y0 = top + Math.max(0, (bottom - top - used) * 0.45);

  const hopper = { x: colX + colW * 0.12, y: y0, w: colW * 0.76, h: hopH(r) };
  const drop = { x: colX + colW / 2, y: y0 + hopper.h };
  const rowY = (row: number) => drop.y + (HOPPER_DROP + row) * rowH;

  const node: Pt[] = sim.nodes.map(() => ({ x: 0, y: 0 }));
  const leftX = colX + colW / 2 - span / 2 + sx / 2;
  const place = (i: number): number => {
    const n = sim.nodes[i];
    const x = n.kind === Kind.CUP ? leftX + n.ref * sx : (place(n.left) + place(n.right)) / 2;
    node[i] = { x, y: rowY(n.row) };
    return x;
  };
  place(0);
  const rail: Rail[] = sim.nodes.map((n, i) => {
    const p0 = n.parent < 0 ? drop : node[n.parent];
    const p3 = node[i];
    const dy = p3.y - p0.y;
    // leave the gate already leaning towards the branch, so forks read clearly
    return { p0, c1: { x: p0.x + (p3.x - p0.x) * 0.3, y: p0.y + dy * 0.45 }, c2: { x: p3.x, y: p3.y - dy * 0.5 }, p3 };
  });
  const cw = Math.min(sx * 0.62, r * 3.2);
  const cup: CupBox[] = sim.cupNode.map((ni) => {
    const p = node[ni];
    return { x: p.x - cw / 2, y: p.y, w: cw, h: cupH(r), cx: p.x, tabH: tabH(r) };
  });
  const gateR = clamp(Math.min(rowH * 0.3, sx * 0.32), r * 1.15, r * 2.1);
  const panelTop = hopper.y - r * 0.8;
  return {
    W, H, colX, colW, btn, hudY, r, hopper, drop, node, rail, cup, gateR,
    railW: r * 2.5,
    panel: { x: colX + colW * 0.03, y: panelTop, w: colW * 0.94, h: cup[0].y + cupH(r) + tabH(r) + r * 1.4 - panelTop },
  };
}
