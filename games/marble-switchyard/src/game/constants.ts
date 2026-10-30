import type { GlyphKind } from '@shared/ui/glyphs';
import type { LevelData } from '../sim/sim';
import levelsJson from './levels.json';

/**
 * Levels are generated and bot-verified OFFLINE (src/tools/generate.ts):
 *   npm run levels -- marble-switchyard
 * Never hand-edit levels.json.
 */
export const LEVELS = levelsJson as LevelData[];
export const MAX_LEVEL = LEVELS.length;

export function getLevel(n: number): LevelData {
  return LEVELS[Math.max(1, Math.min(MAX_LEVEL, n)) - 1];
}

/** 3 stars at or under par, 2 within 1.5x par, else 1. */
export function starsFor(seconds: number, par: number): number {
  return seconds <= par ? 3 : seconds <= par * 1.5 ? 2 : 1;
}

export interface MarbleColor {
  name: string;
  hex: string;
  glyph: GlyphKind;
}

/** Index = colour id. Each colour has a glyph so colour-blind players can tell them apart. */
export const PALETTE: readonly MarbleColor[] = [
  { name: 'Coral', hex: '#ff6b6b', glyph: 'circle' },
  { name: 'Sky', hex: '#4cc3ff', glyph: 'square' },
  { name: 'Lemon', hex: '#ffd447', glyph: 'triangle' },
  { name: 'Mint', hex: '#3fe0a5', glyph: 'diamond' },
  { name: 'Violet', hex: '#b48cff', glyph: 'star' },
  { name: 'Peach', hex: '#ff9d5c', glyph: 'plus' },
];

export const THEME = {
  bgTop: '#0f3340',
  bgBottom: '#06141c',
  bokeh: ['#2fd0c0', '#ffcf7a', '#4c9bff', '#3fe0a5'],
  panel: 'rgba(255,255,255,0.04)',
  panelEdge: 'rgba(255,255,255,0.07)',
  railDark: '#0a1a22',
  rail: '#c9a35a',
  railLit: '#ffe2a0',
  railOff: '#4b5a5e',
  gate: '#173039',
  auto: '#7ee8de',
  link: '#ff8fc8',
  glass: '#0d2129',
  text: '#ffffff',
  textDim: 'rgba(255,255,255,0.62)',
  accent: '#2fd0c0',
  good: '#36d69a',
  danger: '#ff5a6a',
  star: '#ffd34d',
};
