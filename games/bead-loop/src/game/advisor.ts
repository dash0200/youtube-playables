import { K, MAX_BEADS, QCAP, QUEUE_TAP_LIMIT, S, isOpen, type SimState } from '../sim/types';

/**
 * Move advice from the planning bot the level generator uses to prove every
 * level is solvable: a TypeScript port of `choose` in
 * rust/crates/bead-loop/src/bot.rs. Drives the guided Hint (and the dev-only
 * Solve button). Keep it in step with bot.rs if that heuristic changes; it
 * only suggests taps, so there's no parity test.
 */

const hasWrong = (s: SimState, t: number): boolean => {
  for (let j = 0; j < s.tubeLen[t]; j++) if (s.tubeBeads[t * MAX_BEADS + j] !== s.tubeShell[t]) return true;
  return false;
};

const topRun = (s: SimState, t: number): number => {
  const len = s.tubeLen[t];
  if (len === 0) return 0;
  const c = s.tubeBeads[t * MAX_BEADS + len - 1];
  let n = 0;
  while (n < len && s.tubeBeads[t * MAX_BEADS + len - 1 - n] === c) n++;
  return n;
};

/** Beads of colour c riding the belt or waiting in any pipe. */
const waiting = (s: SimState, c: number): number => {
  let n = 0;
  for (let i = 0; i < s.nSlots; i++) if (s.slotColor[i] === c) n++;
  for (let t = 0; t < s.nTubes; t++) {
    for (let k = 0; k < s.qLen[t]; k++) if (s.queue[t * QCAP + ((s.qHead[t] + k) % QCAP)] === c) n++;
  }
  return n;
};

const tappable = (s: SimState, t: number): boolean =>
  !s.complete[t] && s.qLen[t] < QUEUE_TAP_LIMIT && s.tubeLen[t] > 0;

/**
 * Tube to tap now, or -1 to wait. Unblock the blocked tube with the most of its
 * colour waiting (short runs first); dig an open tube with buried wrong beads
 * when it's full or nothing waits for it and the belt has some room.
 */
export function chooseTap(s: SimState): number {
  const free = s.scal[S.FREE];
  let best = -1;
  let bestScore = -Infinity;
  for (let t = 0; t < s.nTubes; t++) {
    if (!tappable(s, t) || s.fallLen[t] > 0 || !hasWrong(s, t)) continue;
    const run = topRun(s, t);
    const want = waiting(s, s.tubeShell[t]);
    let score: number;
    if (!isOpen(s, t)) {
      score = want * 4 - run;
    } else {
      const space = s.cap * K - s.tubeLen[t] - s.fallLen[t];
      if ((want > 0 && space > 0) || free * 2 < run) continue;
      score = -1000 - run;
    }
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/**
 * Taps that would flood a crowded loop: the run that would come out has no
 * open tube to go to (its own tube is blocked, or it's this tube's own colour,
 * which re-blocks it). Only flagged once the loop is getting full. Bitmask by tube.
 */
export function riskyTaps(s: SimState): number {
  if (1 - s.scal[S.FREE] / Math.max(1, s.nSlots) < 0.7) return 0;
  let mask = 0;
  for (let t = 0; t < s.nTubes; t++) {
    if (!tappable(s, t)) continue;
    const c = s.tubeBeads[t * MAX_BEADS + s.tubeLen[t] - 1];
    if (c === t || !isOpen(s, c)) mask |= 1 << t;
  }
  return mask;
}

export interface Advice {
  /** Tube to tap now, or -1 when the best move is to wait. */
  tube: number;
  /** Colour whose waiting beads explain the advice (the tube's own colour), or -1. */
  colour: number;
  /** Bitmask of tubes not to tap right now. */
  avoid: number;
}

/** Seconds a hint lasts. */
export const HINT_SECONDS = 20;

/**
 * Guided hint: for a while, keeps fresh advice from the bot (re-checked a few
 * times a second, and right after every tap) so the board can show what to
 * tap, when to wait, why, and what not to tap.
 */
export class HintGuide {
  remaining = 0;
  advice: Advice = { tube: -1, colour: -1, avoid: 0 };
  private recheck = 0;

  get active(): boolean {
    return this.remaining > 0;
  }

  start(seconds = HINT_SECONDS): void {
    this.remaining = seconds;
    this.recheck = 0;
  }

  stop(): void {
    this.remaining = 0;
  }

  /** Call after any tap so the next suggestion appears straight away. */
  onTap(): void {
    this.recheck = 0;
  }

  update(dt: number, s: SimState): void {
    if (!this.active) return;
    this.remaining = Math.max(0, this.remaining - dt);
    this.recheck -= dt;
    if (this.recheck > 0) return;
    this.recheck = 0.25;
    const tube = chooseTap(s);
    this.advice = {
      tube,
      colour: tube >= 0 ? s.tubeShell[tube] : -1,
      avoid: riskyTaps(s) & ~(tube >= 0 ? 1 << tube : 0),
    };
  }
}
