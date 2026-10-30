/** System font stack — Playables must not fetch fonts from the network. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const font = (size: number, weight: number | string = 700): string => `${weight} ${Math.round(size)}px ${FONT}`;

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

export function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size: number,
  color: string,
  opts: { align?: CanvasTextAlign; weight?: number | string; shadow?: string; baseline?: CanvasTextBaseline } = {},
): void {
  ctx.font = font(size, opts.weight ?? 700);
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = opts.baseline ?? 'middle';
  if (opts.shadow) {
    ctx.fillStyle = opts.shadow;
    ctx.fillText(str, x, y + Math.max(1, size * 0.07));
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner = 0.48, points = 5): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Rating stars row (filled count out of total). */
export function drawStars(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, filled: number, total = 3,
  on = '#ffd34d', off = 'rgba(255,255,255,0.18)',
): void {
  const gap = size * 2.3;
  const x0 = cx - ((total - 1) * gap) / 2;
  for (let i = 0; i < total; i++) {
    starPath(ctx, x0 + i * gap, cy, size);
    ctx.fillStyle = i < filled ? on : off;
    ctx.fill();
  }
}
