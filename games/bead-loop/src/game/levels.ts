import type { LevelData } from '../sim/types';
import levelsJson from './levels.json';

/**
 * Levels are generated and solver-verified OFFLINE by the Rust tool
 * (rust/crates/bead-loop-tools, difficulty curve in `params()`):
 *   npm run levels -- bead-loop
 * Never hand-edit levels.json. Regenerating changes levels players may have
 * already beaten, so prefer appending new levels at the end.
 */
export const LEVELS = levelsJson as LevelData[];
export const LEVEL_COUNT = LEVELS.length;

export function getLevel(n: number): LevelData {
  return LEVELS[Math.max(1, Math.min(LEVEL_COUNT, n)) - 1];
}

/** 3 stars at or under par, 2 within 1.6x par, else 1. */
export function starsFor(seconds: number, par: number): number {
  return seconds <= par ? 3 : seconds <= par * 1.6 ? 2 : 1;
}
