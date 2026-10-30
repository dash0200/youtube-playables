import { hexToRgb, shade } from './color';
import { drawGlyph, type GlyphKind } from './glyphs';

/**
 * Pre-rendered glossy "candy glass" bead sprites. Gradients are expensive to
 * build per frame, so each (colour, radius, glyph) combination is drawn once to
 * an offscreen canvas and reused with drawImage. Animate size with drawBead's
 * sx/sy scale (squash & stretch) rather than radius, so the cache stays small.
 */
const cache = new Map<string, HTMLCanvasElement>();

export function beadSprite(hex: string, r: number, dpr: number, glyph?: GlyphKind): HTMLCanvasElement {
  const px = Math.max(1, Math.round(r * dpr * 2) / 2);
  const key = `${hex}|${px}|${glyph ?? ''}`;
  let c = cache.get(key);
  if (c) return c;
  if (cache.size > 400) cache.clear();
  const size = Math.ceil(px * 2.6 + 4);
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const m = size / 2;
  const [cr, cg, cb] = hexToRgb(hex);

  // soft contact shadow
  const sh = g.createRadialGradient(m, m + px * 0.32, px * 0.2, m, m + px * 0.32, px * 1.2);
  sh.addColorStop(0, 'rgba(0,0,0,0.38)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.beginPath();
  g.ellipse(m, m + px * 0.32, px * 1.2, px * 0.95, 0, 0, Math.PI * 2);
  g.fill();

  // body: lit from the top-left
  const body = g.createRadialGradient(m - px * 0.38, m - px * 0.42, px * 0.05, m, m, px * 1.02);
  body.addColorStop(0, shade(hex, 0.62));
  body.addColorStop(0.28, shade(hex, 0.18));
  body.addColorStop(0.68, hex);
  body.addColorStop(1, shade(hex, -0.42));
  g.fillStyle = body;
  g.beginPath();
  g.arc(m, m, px, 0, Math.PI * 2);
  g.fill();

  // light passing through the bead, glowing on the far side (candy/jelly look)
  g.save();
  g.globalCompositeOperation = 'source-atop';
  const glow = g.createRadialGradient(m + px * 0.3, m + px * 0.55, 0, m + px * 0.3, m + px * 0.55, px * 0.85);
  glow.addColorStop(0, `rgba(${Math.min(255, cr + 90)},${Math.min(255, cg + 90)},${Math.min(255, cb + 90)},0.55)`);
  glow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);
  g.restore();

  // crisp dark edge so beads separate on dark backgrounds
  g.strokeStyle = `rgba(${cr >> 2},${cg >> 2},${cb >> 2},0.55)`;
  g.lineWidth = Math.max(0.6, px * 0.06);
  g.beginPath();
  g.arc(m, m, px - g.lineWidth / 2, 0, Math.PI * 2);
  g.stroke();

  // glyph (only when big enough to read)
  if (glyph && px >= 7) drawGlyph(g, glyph, m, m + px * 0.06, px * 0.9, 'rgba(255,255,255,0.42)');

  // specular: soft streak plus a tiny hot spot
  const spec = g.createLinearGradient(m - px * 0.6, m - px * 0.75, m - px * 0.1, m - px * 0.2);
  spec.addColorStop(0, 'rgba(255,255,255,0.95)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = spec;
  g.beginPath();
  g.ellipse(m - px * 0.32, m - px * 0.42, px * 0.36, px * 0.2, -0.65, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.arc(m - px * 0.42, m - px * 0.5, Math.max(0.6, px * 0.09), 0, Math.PI * 2);
  g.fill();

  cache.set(key, c);
  return c;
}

/**
 * Draws a bead sprite centred at (x, y) with radius r (CSS px).
 * `sx`/`sy` stretch it for squash-and-stretch or pop-in animations.
 */
export function drawBead(
  ctx: CanvasRenderingContext2D, hex: string, x: number, y: number, r: number, dpr: number, glyph?: GlyphKind,
  sx = 1, sy = 1,
): void {
  if (r <= 0.2 || sx <= 0.01 || sy <= 0.01) return;
  const s = beadSprite(hex, r, dpr, glyph);
  const d = s.width / dpr;
  ctx.drawImage(s, x - (d * sx) / 2, y - (d * sy) / 2, d * sx, d * sy);
}

export function clearSpriteCache(): void {
  cache.clear();
}
