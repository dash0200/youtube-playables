import { damp, mod } from '@shared/engine/math';
import { BEADS_PER_BLOCK as K, EJECT_TIME, FALL_TIME, MAX_QUEUE_BLOCKS } from './constants';
import type { LevelDef } from './levels';

/** A block (2x2 bead pack) inside a tube. `y` is its animated cell index. */
export interface Block {
  color: number;
  y: number;
}

export interface Slot {
  color: number;
  /** Board time when the bead appeared on the belt (pop-in animation). */
  born: number;
}

export interface EjectAnim {
  color: number;
  fromY: number;
  t: number;
}

export interface Falling {
  color: number;
  t: number;
}

export type BoardEventType = 'absorb' | 'land' | 'eject' | 'deny' | 'complete' | 'win';
export interface BoardEvent {
  type: BoardEventType;
  tube: number;
}

export class Tube {
  blocks: Block[];
  /** Loose beads of the tube's own colour collected from the belt (drawn above the blocks). */
  sorted = 0;
  /** Beads waiting in the pipe to get onto the belt. */
  queue: number[] = [];
  ejects: EjectAnim[] = [];
  falling: Falling[] = [];
  /** Animated cell index where loose beads start (eases toward blocks.length). */
  looseY: number;
  /** Port position on the belt, in slot units. */
  port = 0;
  lastIdx = 0;
  shake = 0;
  flash = 0;
  complete = false;
  combo = 0;

  constructor(readonly color: number, readonly cap: number, contents: number[]) {
    this.blocks = contents.map((c, i) => ({ color: c, y: i }));
    this.looseY = this.blocks.length;
  }

  /** Free bead capacity, counting beads already falling in. */
  get space(): number {
    return this.cap * K - this.blocks.length * K - this.sorted - this.falling.length;
  }

  /** Index of the top-most block that is not this tube's colour, or -1. */
  wrongIndex(): number {
    for (let i = this.blocks.length - 1; i >= 0; i--) if (this.blocks[i].color !== this.color) return i;
    return -1;
  }

  isFull(): boolean {
    return this.blocks.length * K + this.sorted === this.cap * K && this.blocks.every((b) => b.color === this.color);
  }
}

/**
 * Pure game state + rules for Bead Loop (no rendering).
 *
 * Belt: `slots` positions move clockwise around the loop at `speed` slots/s.
 * Slot i sits at belt parameter (i + offset) mod N. Each tube has a port on the
 * bottom edge of the loop. Whenever a slot passes a port:
 *   1. a bead of the tube's colour drops in if the tube has room;
 *   2. otherwise, if the slot is empty, the tube pushes one queued bead onto the belt.
 * Tapping a tube ejects its top-most wrong-coloured block into its queue.
 * The level is won when every tube is full of its own colour.
 */
export class Board {
  readonly N: number;
  readonly slots: (Slot | null)[];
  readonly tubes: Tube[];
  offset = 0;
  time = 0;
  elapsed = 0;
  started = false;
  won = false;
  taps = 0;
  readonly events: BoardEvent[] = [];

  constructor(readonly level: LevelDef) {
    this.N = level.slots;
    this.slots = level.belt.map((c) => (c === null ? null : { color: c, born: -1 }));
    this.tubes = level.tubes.map((contents, i) => new Tube(i, level.cap, contents));
  }

  /** Port positions as fractions (0..1) of the belt path length. Call after layout changes. */
  setPorts(fractions: number[]): void {
    this.tubes.forEach((t, i) => {
      t.port = fractions[i] * this.N;
      t.lastIdx = this.slotAt(t.port);
    });
  }

  /** Index of the slot currently over belt parameter p (slot units). */
  slotAt(p: number): number {
    return mod(Math.floor(p - this.offset), this.N);
  }

  tap(i: number): boolean {
    const t = this.tubes[i];
    if (!t || this.won) return false;
    const j = t.wrongIndex();
    if (j < 0 || t.queue.length + t.ejects.length * K >= MAX_QUEUE_BLOCKS * K) {
      t.shake = 1;
      this.events.push({ type: 'deny', tube: i });
      return false;
    }
    const [block] = t.blocks.splice(j, 1);
    t.ejects.push({ color: block.color, fromY: block.y, t: 0 });
    this.started = true;
    this.taps++;
    this.events.push({ type: 'eject', tube: i });
    return true;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.started && !this.won) this.elapsed += dt;
    this.offset = mod(this.offset + this.level.speed * dt, this.N);

    this.tubes.forEach((t, ti) => {
      // Slots that crossed this port since last frame (offset grows → index decreases).
      const idx = this.slotAt(t.port);
      let guard = this.N;
      while (t.lastIdx !== idx && guard-- > 0) {
        t.lastIdx = mod(t.lastIdx - 1, this.N);
        this.arrive(t, ti, t.lastIdx);
      }

      // Eject animations → queue
      for (let k = t.ejects.length - 1; k >= 0; k--) {
        const e = t.ejects[k];
        e.t += dt;
        if (e.t >= EJECT_TIME) {
          t.ejects.splice(k, 1);
          for (let b = 0; b < K; b++) t.queue.push(e.color);
        }
      }

      // Falling beads land in FIFO order (same duration)
      for (const f of t.falling) f.t += dt;
      while (t.falling.length && t.falling[0].t >= FALL_TIME) {
        t.falling.shift();
        t.sorted++;
        this.events.push({ type: 'land', tube: ti });
      }

      // Visual easing
      t.blocks.forEach((b, k) => (b.y = damp(b.y, k, 16, dt)));
      t.looseY = damp(t.looseY, t.blocks.length, 16, dt);
      t.shake = Math.max(0, t.shake - dt * 4);
      t.flash = Math.max(0, t.flash - dt * 1.6);
      if (!t.falling.length) t.combo = 0;

      if (!t.complete && t.isFull()) {
        t.complete = true;
        t.flash = 1;
        this.events.push({ type: 'complete', tube: ti });
      }
    });

    if (!this.won && this.tubes.every((t) => t.complete && !t.falling.length)) {
      this.won = true;
      this.events.push({ type: 'win', tube: -1 });
    }
  }

  private arrive(t: Tube, ti: number, i: number): void {
    const s = this.slots[i];
    if (s && s.color === t.color && t.space > 0) {
      this.slots[i] = null;
      t.falling.push({ color: s.color, t: 0 });
      t.combo++;
      this.events.push({ type: 'absorb', tube: ti });
      return;
    }
    if (!s && t.queue.length) {
      this.slots[i] = { color: t.queue.shift()!, born: this.time };
    }
  }

  /** Beads currently on the belt (for HUD/debug). */
  beltCount(): number {
    let n = 0;
    for (const s of this.slots) if (s) n++;
    return n;
  }
}
