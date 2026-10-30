import { starPath } from './draw';

/**
 * Shape glyphs paired with colours so colour-blind players can tell pieces
 * apart (accessibility). Every colour in a game palette should get a glyph.
 */
export type GlyphKind = 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'plus' | 'heart' | 'ring';

export function glyphPath(ctx: CanvasRenderingContext2D, kind: GlyphKind, cx: number, cy: number, s: number): void {
  ctx.beginPath();
  switch (kind) {
    case 'circle':
      ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
      break;
    case 'ring':
      ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
      ctx.arc(cx, cy, s * 0.25, 0, Math.PI * 2, true);
      break;
    case 'square':
      ctx.rect(cx - s * 0.42, cy - s * 0.42, s * 0.84, s * 0.84);
      break;
    case 'triangle':
      ctx.moveTo(cx, cy - s * 0.52);
      ctx.lineTo(cx + s * 0.52, cy + s * 0.4);
      ctx.lineTo(cx - s * 0.52, cy + s * 0.4);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(cx, cy - s * 0.55);
      ctx.lineTo(cx + s * 0.45, cy);
      ctx.lineTo(cx, cy + s * 0.55);
      ctx.lineTo(cx - s * 0.45, cy);
      ctx.closePath();
      break;
    case 'star':
      starPath(ctx, cx, cy, s * 0.56, 0.45);
      break;
    case 'plus': {
      const a = s * 0.18;
      const b = s * 0.5;
      ctx.moveTo(cx - a, cy - b);
      ctx.lineTo(cx + a, cy - b);
      ctx.lineTo(cx + a, cy - a);
      ctx.lineTo(cx + b, cy - a);
      ctx.lineTo(cx + b, cy + a);
      ctx.lineTo(cx + a, cy + a);
      ctx.lineTo(cx + a, cy + b);
      ctx.lineTo(cx - a, cy + b);
      ctx.lineTo(cx - a, cy + a);
      ctx.lineTo(cx - b, cy + a);
      ctx.lineTo(cx - b, cy - a);
      ctx.lineTo(cx - a, cy - a);
      ctx.closePath();
      break;
    }
    case 'heart':
      ctx.moveTo(cx, cy + s * 0.45);
      ctx.bezierCurveTo(cx - s * 0.7, cy - s * 0.05, cx - s * 0.3, cy - s * 0.6, cx, cy - s * 0.2);
      ctx.bezierCurveTo(cx + s * 0.3, cy - s * 0.6, cx + s * 0.7, cy - s * 0.05, cx, cy + s * 0.45);
      ctx.closePath();
      break;
  }
}

export function drawGlyph(ctx: CanvasRenderingContext2D, kind: GlyphKind, cx: number, cy: number, s: number, color: string): void {
  glyphPath(ctx, kind, cx, cy, s);
  ctx.fillStyle = color;
  ctx.fill('evenodd');
}
