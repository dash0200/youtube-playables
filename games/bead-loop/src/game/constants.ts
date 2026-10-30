import type { GlyphKind } from '@shared/ui/glyphs';
import { LEVEL_COUNT } from './levels';

/** Number of playable levels (from levels.json). */
export const MAX_LEVEL = LEVEL_COUNT;

export interface BeadColor {
  name: string;
  hex: string;
  glyph: GlyphKind;
}

/** Index in this array = colour id used everywhere in game logic. */
export const PALETTE: readonly BeadColor[] = [
  { name: 'Red', hex: '#ff4f62', glyph: 'circle' },
  { name: 'Blue', hex: '#3d8bff', glyph: 'square' },
  { name: 'Yellow', hex: '#ffc93a', glyph: 'triangle' },
  { name: 'Green', hex: '#2fd27e', glyph: 'diamond' },
  { name: 'Purple', hex: '#a46bff', glyph: 'star' },
  { name: 'Orange', hex: '#ff8a3d', glyph: 'plus' },
];

export const THEME = {
  bgTop: '#2a1f4a',
  bgBottom: '#0f0b1f',
  panel: 'rgba(255,255,255,0.035)',
  track: '#120e1f',
  trackInner: '#2a2244',
  stud: 'rgba(255,255,255,0.10)',
  tubeInner: '#120d20',
  text: '#ffffff',
  textDim: 'rgba(255,255,255,0.6)',
  accent: '#7c5cff',
  good: '#2fd27e',
  danger: '#ff4f62',
  star: '#ffd34d',
};
