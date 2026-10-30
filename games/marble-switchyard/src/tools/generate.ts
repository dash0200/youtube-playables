/**
 * Offline level generator (never bundled into the game). Run with
 *   npm run levels -- marble-switchyard
 * Every candidate is played by the planning bot in 6 scenarios (reaction
 * 0.25/0.45/0.7 s x 30/60 fps) and must be won; then the naive player's win rate
 * is measured and the first candidate within the band around the level's target
 * is kept (confirmed with fresh seeds). Candidates sweep from relaxed to tight
 * marble spacing, so the curve is measured, not guessed.
 */
import { Rng } from '@shared/engine/rng';
import { playBot, playNaive } from '../sim/bot';
import type { CupDef, GateDef, LevelData } from '../sim/sim';

export interface Params {
  cups: number;
  colors: number;
  cap: number;
  autos: number;
  links: number;
  /** Track rows per second: kept calm all game long. */
  speed: number;
}

/**
 * Seconds between marbles = (BASE + PER_GATE x gates on the longest route) x
 * SPACING. A deeper board means more decisions per marble, so it gets more time
 * between drops: the pace stays calm and difficulty comes from the puzzle, not
 * reflexes. Levels up to ONBOARD_LEVELS get extra room while players learn.
 */
export const BASE_INTERVAL = 0.55;
export const PER_GATE = 0.42;
export const ONBOARD_LEVELS = 5;
export const ONBOARD_SLOWER = 1.5;
/** Never drop marbles closer than this (seconds), whatever the board. */
export const MIN_INTERVAL = 0.95;

/** Marble spacing multipliers, relaxed → as tight as the pace allows (a narrow range keeps the pace consistent). */
export const SPACING = [1.25, 1.15, 1.07, 1.0, 0.94, 0.88];

/**
 * Board size and puzzle features. Later levels get harder through things to
 * think about (auto and linked gates, cups sharing a colour, bigger cups), not
 * through speed.
 */
export function params(n: number): Params {
  const cups = n <= 2 ? 2 : n <= 6 ? 3 : n <= 14 ? 4 : n <= 28 ? 5 : 6;
  // cups sharing a colour give routing choices; more of them later
  const colors = n <= 6 ? cups : n <= 14 ? (n % 3 === 0 ? cups - 1 : cups) : n <= 30 ? cups - 1 + (n % 2) : n % 4 === 0 ? cups - 2 : cups - 1;
  // at most 5 marbles per cup keeps a level around a minute at the calm pace (short sessions)
  const cap = n <= 5 ? 3 : n <= 15 ? 4 : 5;
  const autos = n < 10 ? 0 : n < 25 ? (n % 4 === 2 ? 1 : 0) : n < 45 ? (n % 3 === 2 ? 0 : 1) : n % 2 === 0 ? 2 : 1;
  const links = n >= 50 || (n >= 35 && n % 3 === 0) || (n >= 20 && n % 5 === 3) ? 1 : 0;
  const speed = 2.0 + Math.min(0.3, n * 0.005);
  return { cups, colors, cap, autos, links, speed };
}

/**
 * Naive player's target win rate: gentle start, slow climb, small sawtooth
 * (every 5th level a spike, the next a breather).
 */
export function target(n: number): number {
  const base = n <= 5 ? 0.95 : n <= 20 ? 0.9 - (n - 5) * (0.15 / 15) : n <= 40 ? 0.75 - (n - 20) * (0.2 / 20) : Math.max(0.35, 0.55 - (n - 40) * (0.15 / 20));
  const saw = n > 5 && n % 5 === 0 ? -0.08 : n > 6 && n % 5 === 1 ? 0.05 : 0;
  return Math.min(0.97, Math.max(0.2, base + saw));
}

export const BAND = 0.1;
const RUNS = 40;

/** Most gates on any route from the root to a cup. */
function maxGates(tree: string): number {
  let i = 0;
  const walk = (): number => (tree[i++] === 'C' ? 0 : 1 + Math.max(walk(), walk()));
  return walk();
}

/** Random tree with `cups` leaves, at most 3 gates deep, in pre-order 'G'/'C' form. */
function randomTree(cups: number, rng: Rng): string {
  type T = { leaf: true } | { leaf: false; l: T; r: T };
  const root: { t: T } = { t: { leaf: true } };
  const leaves = (): { set: (t: T) => void; depth: number }[] => {
    const out: { set: (t: T) => void; depth: number }[] = [];
    const walk = (t: T, depth: number, set: (t: T) => void): void => {
      if (t.leaf) out.push({ set, depth });
      else {
        walk(t.l, depth + 1, (x) => (t.l = x));
        walk(t.r, depth + 1, (x) => (t.r = x));
      }
    };
    walk(root.t, 0, (x) => (root.t = x));
    return out;
  };
  for (let k = 1; k < cups; k++) {
    const ls = leaves().filter((x) => x.depth < 3);
    const min = Math.min(...ls.map((x) => x.depth));
    const choice = rng.pick(ls.filter((x) => x.depth <= min + 1));
    choice.set({ leaf: false, l: { leaf: true }, r: { leaf: true } });
  }
  const ser = (t: T): string => (t.leaf ? 'C' : 'G' + ser(t.l) + ser(t.r));
  return ser(root.t);
}

export function build(n: number, attempt: number): LevelData {
  const p = params(n);
  const rng = new Rng(0x5eed + n * 7919 + attempt * 104729);
  const tree = randomTree(p.cups, rng);
  const gateCount = [...tree].filter((c) => c === 'G').length;
  // cup colours: every colour once, extra cups repeat colours
  const cols: number[] = [];
  for (let c = 0; c < p.colors; c++) cols.push(c);
  while (cols.length < p.cups) cols.push(rng.int(0, p.colors - 1));
  rng.shuffle(cols);
  const cups: CupDef[] = cols.map((color) => ({ color, cap: p.cap }));
  const gates: GateDef[] = Array.from({ length: gateCount }, () => ({ start: rng.int(0, 1) }));
  const order = rng.shuffle([...gates.keys()]);
  for (let k = 0; k < Math.min(p.autos, gateCount - 1); k++) gates[order[k]].auto = true;
  if (p.links && gateCount >= 3) {
    const free = order.slice(Math.min(p.autos, gateCount - 1));
    if (free.length >= 2) {
      gates[free[0]].link = 1;
      gates[free[1]].link = 1;
    }
  }
  const pool: number[] = cups.flatMap((c) => Array<number>(c.cap).fill(c.color));
  rng.shuffle(pool);
  const depth = maxGates(tree);
  const onboard = n <= ONBOARD_LEVELS ? ONBOARD_SLOWER : 1;
  const interval = Math.max(MIN_INTERVAL, (BASE_INTERVAL + PER_GATE * depth) * SPACING[attempt % SPACING.length] * onboard);
  return {
    n, tree, gates, cups,
    seq: pool.join(''),
    interval: +interval.toFixed(3),
    speed: +p.speed.toFixed(3),
    spills: 3,
    par: 0,
  };
}

/** Bot must win in every scenario; returns the worst clear time. */
export function robust(l: LevelData): number | null {
  let worst = 0;
  for (const think of [0.25, 0.45, 0.7]) {
    for (const dt of [1 / 60, 1 / 30]) {
      const r = playBot(l, think, dt);
      if (!r.won) return null;
      worst = Math.max(worst, r.time);
    }
  }
  return worst;
}

/** Naive win rate over `runs` seeded games; stops early once it clearly misses `goal`. */
export function naiveRate(l: LevelData, runs: number, seed: number, goal = -1): number {
  let wins = 0;
  for (let r = 0; r < runs; r++) {
    if (playNaive(l, seed + r).won) wins++;
    const done = r + 1;
    if (goal >= 0 && done >= 12) {
      // even winning/losing every remaining game can't reach the band
      const lo = wins / runs;
      const hi = (wins + runs - done) / runs;
      if (hi < goal - BAND - 0.05 || lo > goal + BAND + 0.05) return wins / done;
    }
  }
  return wins / runs;
}

export interface Generated {
  level: LevelData;
  naive: number;
  attempt: number;
}

export function generate(n: number): Generated {
  const goal = target(n);
  let best: { miss: number; g: Generated } | null = null;
  for (let attempt = 0; attempt < 480; attempt++) {
    const l = build(n, attempt);
    const worst = robust(l);
    if (worst === null) continue;
    let naive = naiveRate(l, RUNS, 1000, goal);
    if (Math.abs(naive - goal) <= BAND) naive = (naive + naiveRate(l, RUNS, 50_000)) / 2;
    l.par = Math.round(worst * 1.1 + 3);
    const miss = Math.abs(naive - goal);
    if (!best || miss < best.miss) best = { miss, g: { level: l, naive, attempt } };
    if (miss <= BAND) break;
  }
  if (!best) throw new Error(`level ${n}: no solvable layout`);
  return best.g;
}
