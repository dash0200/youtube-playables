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
  { name: 'Red', hex: '#ff5c7c', glyph: 'circle' },
  { name: 'Blue', hex: '#4aa8ff', glyph: 'square' },
  { name: 'Yellow', hex: '#ffd84a', glyph: 'triangle' },
  { name: 'Green', hex: '#3ee0a8', glyph: 'diamond' },
  { name: 'Purple', hex: '#b88cff', glyph: 'star' },
  { name: 'Orange', hex: '#ff9b4f', glyph: 'plus' },
];

export const THEME = {
  bgTop: '#34206f',
  bgBottom: '#120b2e',
  /** Slow drifting light blobs behind everything. */
  bokeh: ['#7c5cff', '#ff5fa2', '#3fb4ff', '#9b6bff'],
  panel: 'rgba(255,255,255,0.045)',
  panelEdge: 'rgba(255,255,255,0.07)',
  track: '#0d0a1c',
  trackInner: '#211a3d',
  tread: 'rgba(255,255,255,0.035)',
  stud: 'rgba(255,255,255,0.07)',
  tubeInner: '#170f30',
  text: '#ffffff',
  textDim: 'rgba(255,255,255,0.6)',
  accent: '#7c5cff',
  good: '#2fd27e',
  danger: '#ff4f62',
  star: '#ffd34d',
};
