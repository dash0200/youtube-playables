import type { Core } from '@shared/boot';
import type { SaveStore } from '@shared/save/save-store';
import type { Icons } from '@shared/ui/icons';

export interface SaveData {
  /** Highest level the player may start (1-based). */
  unlocked: number;
  /** Best stars per level, index = level - 1. */
  stars: number[];
  /** Best times per level in seconds (0 = none). */
  times: number[];
  /** Last score sent to YouTube (= levels cleared). */
  scoreSent: number;
  /** Player prefers fast-forward (remembered across levels). */
  fast: boolean;
}

export const defaultSave = (): SaveData => ({ unlocked: 1, stars: [], times: [], scoreSent: 0, fast: false });

/** Services shared by all scenes. Implemented in main.ts. */
export interface App extends Core {
  save: SaveStore<SaveData>;
  icons: Icons;
  goMenu(): void;
  goLevels(): void;
  play(level: number): void;
  /** True if the player may start this level (also true for all levels in dev unlock mode). */
  isUnlocked(level: number): boolean;
  /** Records a cleared level, saves, and syncs the YouTube score. */
  recordWin(level: number, seconds: number, stars: number): void;
}
