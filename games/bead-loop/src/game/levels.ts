import { Rng } from '@shared/engine/rng';
import { BEADS_PER_BLOCK, PALETTE } from './constants';

export interface LevelDef {
  /** 1-based level number. */
  number: number;
  /** Number of colours = number of tubes. */
  colors: number;
  /** Blocks each tube holds when full. */
  cap: number;
  /** Slots on the belt. */
  slots: number;
  /** Belt speed in slots per second. */
  speed: number;
  /** Target clear time for 3 stars. */
  par: number;
  /** Starting tube contents, bottom → top, as colour ids. tubes[i] belongs to colour i. */
  tubes: number[][];
  /** Starting belt contents (colour id or null), length === slots. */
  belt: (number | null)[];
}

/**
 * Difficulty curve. Levels are generated from a seed so they are identical for
 * every player and need no level files. Tweak numbers here to rebalance.
 */
function params(n: number) {
  const colors = n <= 4 ? 3 : n <= 10 ? 4 : n <= 20 ? 5 : 6;
  const cap = Math.min(4 + Math.floor((n + 1) / 3), 8);
  // free space per tube at start (in blocks): more space = easier
  const free = n <= 6 ? 2 : n <= 25 ? Math.min(2, cap - 3) : 1;
  const slots = 72 + colors * 14;
  const speed = Math.min(15 + n * 0.25, 24);
  return { colors, cap, free, slots, speed };
}

export function makeLevel(n: number): LevelDef {
  const { colors, cap, free, slots, speed } = params(n);
  const fill = cap - free;
  const rng = new Rng(0xbead + n * 7919);

  // Deal `fill` blocks per tube from a shuffled pool containing `fill` blocks of every colour.
  let tubes: number[][] = [];
  for (let attempt = 0; attempt < 50; attempt++) {
    const pool: number[] = [];
    for (let c = 0; c < colors; c++) for (let k = 0; k < fill; k++) pool.push(c);
    rng.shuffle(pool);
    tubes = Array.from({ length: colors }, (_, i) => pool.slice(i * fill, (i + 1) * fill));
    // every tube must have at least one wrong block, and no tube may be already sorted
    const ok = tubes.every((t, i) => t.some((c) => c !== i)) && tubes.some((t, i) => t[t.length - 1] !== i);
    if (ok) break;
  }

  // Remaining beads of every colour start on the belt in small clumps.
  const runs: number[][] = [];
  for (let c = 0; c < colors; c++) {
    let left = free * BEADS_PER_BLOCK;
    while (left > 0) {
      const len = Math.min(left, rng.int(2, 4));
      runs.push(new Array(len).fill(c));
      left -= len;
    }
  }
  rng.shuffle(runs);
  const beadCount = colors * free * BEADS_PER_BLOCK;
  // Random gaps that sum to exactly the free space, so no bead is ever dropped.
  const totalGap = slots - beadCount;
  const weights = runs.map(() => 0.4 + rng.float() * 1.2);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const belt: (number | null)[] = [];
  runs.forEach((run, i) => {
    const gap = Math.floor((weights[i] / wSum) * totalGap);
    for (let g = 0; g < gap; g++) belt.push(null);
    belt.push(...run);
  });
  while (belt.length < slots) belt.push(null);

  // Invariant: every colour has exactly cap*K beads in total.
  for (let c = 0; c < colors; c++) {
    const count = tubes.flat().filter((x) => x === c).length * BEADS_PER_BLOCK + belt.filter((x) => x === c).length;
    if (count !== cap * BEADS_PER_BLOCK || belt.length !== slots) throw new Error(`Level ${n}: bad bead count for colour ${c}`);
  }

  const wrongBlocks = tubes.reduce((sum, t, i) => sum + t.filter((c) => c !== i).length, 0);
  const par = Math.round(6 + wrongBlocks * 1.9 + colors * 1.5);

  return { number: n, colors, cap, slots, speed, par, tubes, belt };
}

/** 3 stars at or under par, 2 stars within 1.6x par, else 1. */
export function starsFor(seconds: number, par: number): number {
  return seconds <= par ? 3 : seconds <= par * 1.6 ? 2 : 1;
}

export const paletteFor = (level: LevelDef) => PALETTE.slice(0, level.colors);
