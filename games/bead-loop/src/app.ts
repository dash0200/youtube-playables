import type { Core } from '@shared/boot';
import type { SaveStore } from '@shared/save/save-store';
import type { Icons } from '@shared/ui/icons';
import type { Sim } from './sim';

export interface SaveData {
  /** Highest level the player may start (1-based). */
  unlocked: number;
  /** Best stars per level, index = level - 1. */
  stars: number[];
  /** Best times per level in seconds (0 = none). */
  times: number[];
  /** Last score sent to YouTube (= levels cleared). */
  scoreSent: number;
  /** Losses in a row per level, index = level - 1 (reset on a win). */
  losses: number[];
  /** Player prefers the slowed-down loop (remembered across levels). */
  slow: boolean;
}

export const defaultSave = (): SaveData => ({ unlocked: 1, stars: [], times: [], scoreSent: 0, losses: [], slow: false });

/** Services shared by all scenes. Implemented in main.ts. */
export interface App extends Core {
  save: SaveStore<SaveData>;
  icons: Icons;
  /** Game simulation: Rust/WebAssembly, or the TypeScript fallback. */
  sim: Sim;
  goMenu(): void;
  goLevels(): void;
  /** Starts a level; `hint` switches the guided hint on from the start (already earned). */
  play(level: number, opts?: { hint?: boolean }): void;
  /** True if the player may start this level (also true for all levels in dev unlock mode). */
  isUnlocked(level: number): boolean;
  /** True once the player has lost this level often enough to get the easier layout. */
  needsEasy(level: number): boolean;
  /** Records a lost level (counts towards the easier layout) and saves. */
  recordLoss(level: number): void;
  /** Records a cleared level, saves, and syncs the YouTube score. */
  recordWin(level: number, seconds: number, stars: number): void;
}
