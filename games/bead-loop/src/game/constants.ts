import type { GlyphKind } from '@shared/ui/glyphs';

/** Beads in one block (a block is a 2x2 pack inside a tube cell). */
export const BEADS_PER_BLOCK = 4;
/** Max ejected blocks waiting in a tube's pipe before taps are refused. */
export const MAX_QUEUE_BLOCKS = 2;
/** Number of levels shown in level select. Levels are generated, so this can grow freely. */
export const MAX_LEVEL = 60;

/** Seconds for an absorbed bead to fall from the belt into its tube. */
export const FALL_TIME = 0.32;
/** Seconds for an ejected block to rise out of its tube. */
export const EJECT_TIME = 0.2;

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
  star: '#ffd34d',
};
