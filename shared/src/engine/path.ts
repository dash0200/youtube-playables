import { mod } from './math';

export interface PathPoint {
  x: number;
  y: number;
  /** Outward unit normal. */
  nx: number;
  ny: number;
}

/**
 * Closed rounded-rectangle path, parametrised by arc length and travelled
 * CLOCKWISE on screen (y down): top edge left→right, right edge down,
 * bottom edge right→left, left edge up. s = 0 is the left end of the top edge.
 * Useful for conveyor belts, race tracks, orbiting UI, etc.
 */
export class RoundedRectPath {
  readonly length: number;
  readonly r: number;
  private readonly cum: number[];

  constructor(
    readonly x: number,
    readonly y: number,
    readonly w: number,
    readonly h: number,
    r: number,
  ) {
    this.r = Math.max(0, Math.min(r, w / 2, h / 2));
    const sw = w - 2 * this.r;
    const sh = h - 2 * this.r;
    const q = (Math.PI * this.r) / 2;
    const lens = [sw, q, sh, q, sw, q, sh, q];
    this.cum = [0];
    for (const l of lens) this.cum.push(this.cum[this.cum.length - 1] + l);
    this.length = this.cum[8];
  }

  at(sIn: number): PathPoint {
    const s = mod(sIn, this.length);
    let k = 0;
    while (k < 7 && s >= this.cum[k + 1]) k++;
    const d = s - this.cum[k];
    const { x, y, w, h, r } = this;
    const arc = (cx: number, cy: number, a0: number): PathPoint => {
      const a = a0 + (r > 0 ? d / r : 0);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      return { x: cx + r * c, y: cy + r * sn, nx: c, ny: sn };
    };
    switch (k) {
      case 0: return { x: x + r + d, y, nx: 0, ny: -1 };
      case 1: return arc(x + w - r, y + r, -Math.PI / 2);
      case 2: return { x: x + w, y: y + r + d, nx: 1, ny: 0 };
      case 3: return arc(x + w - r, y + h - r, 0);
      case 4: return { x: x + w - r - d, y: y + h, nx: 0, ny: 1 };
      case 5: return arc(x + r, y + h - r, Math.PI / 2);
      case 6: return { x, y: y + h - r - d, nx: -1, ny: 0 };
      default: return arc(x + r, y + r, Math.PI);
    }
  }

  /** Arc-length parameter of the point on the bottom straight edge at screen x. */
  paramAtBottomX(px: number): number {
    const cx = Math.max(this.x + this.r, Math.min(this.x + this.w - this.r, px));
    return this.cum[4] + (this.x + this.w - this.r - cx);
  }

  /** Adds the path to the current canvas path (call ctx.beginPath() first). */
  trace(ctx: CanvasRenderingContext2D): void {
    ctx.roundRect(this.x, this.y, this.w, this.h, this.r);
  }
}
