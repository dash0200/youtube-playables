import { shade } from './color';
import { drawGlyph, type GlyphKind } from './glyphs';

/**
 * Pre-rendered glossy bead/ball sprites. Gradients are expensive to build per
 * frame, so each (colour, radius, glyph) combination is drawn once to an
 * offscreen canvas and reused with drawImage.
 */
const cache = new Map<string, HTMLCanvasElement>();

export function beadSprite(hex: string, r: number, dpr: number, glyph?: GlyphKind): HTMLCanvasElement {
  const px = Math.max(1, Math.round(r * dpr * 2) / 2);
  const key = `${hex}|${px}|${glyph ?? ''}`;
  let c = cache.get(key);
  if (c) return c;
  if (cache.size > 400) cache.clear();
  const size = Math.ceil(px * 2 + 4);
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const m = size / 2;
  // soft drop shadow
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.arc(m, m + px * 0.14, px, 0, Math.PI * 2);
  g.fill();
  // body
  const grad = g.createRadialGradient(m - px * 0.35, m - px * 0.4, px * 0.1, m, m, px);
  grad.addColorStop(0, shade(hex, 0.55));
  grad.addColorStop(0.45, hex);
  grad.addColorStop(1, shade(hex, -0.35));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(m, m, px, 0, Math.PI * 2);
  g.fill();
  // glyph (only when big enough to read)
  if (glyph && px >= 7) drawGlyph(g, glyph, m, m + px * 0.04, px * 0.95, 'rgba(255,255,255,0.55)');
  // specular highlight
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.ellipse(m - px * 0.35, m - px * 0.45, px * 0.28, px * 0.17, -0.6, 0, Math.PI * 2);
  g.fill();
  cache.set(key, c);
  return c;
}

/** Draws a bead sprite centred at (x, y) with radius r (CSS px). */
export function drawBead(
  ctx: CanvasRenderingContext2D, hex: string, x: number, y: number, r: number, dpr: number, glyph?: GlyphKind,
): void {
  if (r <= 0.2) return;
  const s = beadSprite(hex, r, dpr, glyph);
  const d = s.width / dpr;
  ctx.drawImage(s, x - d / 2, y - d / 2, d, d);
}

export function clearSpriteCache(): void {
  cache.clear();
}
