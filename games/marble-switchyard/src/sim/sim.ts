/**
 * Marble Switchyard rules. Pure, deterministic, no drawing, no screen sizes:
 * distances are in "rows" of the track, so the same code runs in the game and
 * in the offline level generator (src/tools/generate.ts).
 *
 * Rules
 * - The track is a binary tree. Marbles drop from the hopper onto the root and
 *   roll down; at each GATE they take the branch the gate points to. Leaves
 *   are CUPS with a colour and a capacity.
 * - Tapping a gate flips it (and every gate linked to it). A marble decides at
 *   the moment it reaches a gate, so flips must be timed between marbles.
 * - AUTO gates also flip by themselves after every marble that passes.
 * - A marble that lands in a cup of its colour (with room) fills it. Any other
 *   landing is a SPILL: the marble goes back to the end of the hopper queue.
 *   Too many spills loses the level. Filling every cup wins it.
 */

export const Kind = { GATE: 0, CUP: 1 } as const;

export interface TreeNode {
  kind: (typeof Kind)[keyof typeof Kind];
  parent: number;
  depth: number;
  /** Gates: child node indices. */
  left: number;
  right: number;
  /** Gates: index into gates[]; cups: index into cups[]. */
  ref: number;
  /** Vertical row the node sits on (cups all share the bottom row). */
  row: number;
}

export interface GateDef {
  /** 0 = left, 1 = right. */
  start: number;
  auto?: boolean;
  /** Gates with the same non-zero link id flip together. */
  link?: number;
}

export interface CupDef {
  color: number;
  cap: number;
}

/** One level as stored in levels.json (generated offline). */
export interface LevelData {
  n: number;
  /** Tree in pre-order: 'G' = gate (left subtree, then right), 'C' = cup. */
  tree: string;
  gates: GateDef[];
  /** Cups left to right (pre-order leaf order). */
  cups: CupDef[];
  /** Hopper order as colour digits. */
  seq: string;
  /** Seconds between marbles leaving the hopper. */
  interval: number;
  /** Track rows per second. */
  speed: number;
  /** Spills allowed before the level is lost (the last one loses). */
  spills: number;
  /** 3-star time in seconds. */
  par: number;
}

export interface Marble {
  id: number;
  color: number;
  /** Node the marble is rolling towards (-1 never happens while rolling). */
  to: number;
  /** Node it came from (-1 = hopper). */
  from: number;
  /** Distance travelled on the current edge, and the edge's length (rows). */
  d: number;
  len: number;
}

export const EV = { SPAWN: 1, PASS: 2, FLIP: 3, CUP: 4, FULL: 5, SPILL: 6, WIN: 7, LOSE: 8 } as const;
export interface SimEvent {
  type: number;
  /** Gate index (PASS/FLIP), cup index (CUP/FULL/SPILL), marble id (SPAWN). */
  a: number;
  /** Marble id for PASS/CUP/SPILL. */
  b: number;
}

/** Rows between the hopper's drop point and the root gate. */
export const HOPPER_DROP = 1;
/** Seconds before the first marble leaves the hopper. */
export const FIRST_DROP = 1.2;

export function parseTree(tree: string): TreeNode[] {
  const nodes: TreeNode[] = [];
  let i = 0;
  let gates = 0;
  let cups = 0;
  const build = (parent: number, depth: number): number => {
    const ch = tree[i++];
    const idx = nodes.length;
    if (ch === 'G') {
      nodes.push({ kind: Kind.GATE, parent, depth, left: -1, right: -1, ref: gates++, row: depth });
      nodes[idx].left = build(idx, depth + 1);
      nodes[idx].right = build(idx, depth + 1);
    } else if (ch === 'C') {
      nodes.push({ kind: Kind.CUP, parent, depth, left: -1, right: -1, ref: cups++, row: depth });
    } else {
      throw new Error(`bad tree "${tree}" at ${i - 1}`);
    }
    return idx;
  };
  build(-1, 0);
  if (i !== tree.length) throw new Error(`bad tree "${tree}": trailing data`);
  const bottom = Math.max(...nodes.map((n) => n.depth));
  for (const n of nodes) if (n.kind === Kind.CUP) n.row = bottom;
  return nodes;
}

export class Sim {
  readonly nodes: TreeNode[];
  readonly gateNode: number[] = [];
  readonly cupNode: number[] = [];
  readonly gate: { state: number; auto: boolean; link: number }[];
  readonly cups: { color: number; cap: number; count: number }[];
  marbles: Marble[] = [];
  queue: number[];
  events: SimEvent[] = [];
  spills = 0;
  readonly maxSpills: number;
  time = 0;
  won = false;
  lost = false;
  private spawnT = FIRST_DROP;
  private nextId = 1;
  readonly interval: number;
  readonly speed: number;

  constructor(readonly level: LevelData) {
    this.nodes = parseTree(level.tree);
    this.nodes.forEach((n, i) => (n.kind === Kind.GATE ? (this.gateNode[n.ref] = i) : (this.cupNode[n.ref] = i)));
    this.gate = this.gateNode.map((_, g) => ({ state: level.gates[g]?.start ?? 0, auto: !!level.gates[g]?.auto, link: level.gates[g]?.link ?? 0 }));
    this.cups = this.cupNode.map((_, c) => ({ color: level.cups[c].color, cap: level.cups[c].cap, count: 0 }));
    this.queue = [...level.seq].map((ch) => ch.charCodeAt(0) - 48);
    this.maxSpills = level.spills;
    this.interval = level.interval;
    this.speed = level.speed;
  }

  /** Length in rows of the edge into `node` (from its parent, or from the hopper for the root). */
  edgeLen(node: number): number {
    const n = this.nodes[node];
    return n.parent < 0 ? HOPPER_DROP : n.row - this.nodes[n.parent].row;
  }

  get over(): boolean {
    return this.won || this.lost;
  }

  /** Seconds until the next marble leaves the hopper (0 if it's waiting to). */
  get nextDrop(): number {
    return Math.max(0, this.spawnT);
  }

  tap(g: number): boolean {
    if (this.over || g < 0 || g >= this.gate.length) return false;
    const link = this.gate[g].link;
    for (let k = 0; k < this.gate.length; k++) {
      if (k === g || (link !== 0 && this.gate[k].link === link)) {
        this.gate[k].state ^= 1;
        this.events.push({ type: EV.FLIP, a: k, b: 0 });
      }
    }
    return true;
  }

  update(dt: number): void {
    if (dt <= 0 || this.over) return;
    this.time += dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.queue.length > 0) {
      const color = this.queue.shift()!;
      const m: Marble = { id: this.nextId++, color, to: 0, from: -1, d: 0, len: this.edgeLen(0) };
      this.marbles.push(m);
      this.events.push({ type: EV.SPAWN, a: m.id, b: color });
      this.spawnT += this.interval;
    } else if (this.spawnT < 0) {
      this.spawnT = 0;
    }
    const step = this.speed * dt;
    for (let i = this.marbles.length - 1; i >= 0; i--) {
      const m = this.marbles[i];
      m.d += step;
      while (m.d >= m.len) {
        m.d -= m.len;
        const n = this.nodes[m.to];
        if (n.kind === Kind.GATE) {
          const g = this.gate[n.ref];
          const next = g.state === 0 ? n.left : n.right;
          this.events.push({ type: EV.PASS, a: n.ref, b: m.id });
          if (g.auto) {
            g.state ^= 1;
            this.events.push({ type: EV.FLIP, a: n.ref, b: -1 });
          }
          m.from = m.to;
          m.to = next;
          m.len = this.edgeLen(next);
        } else {
          this.land(m, n.ref);
          this.marbles.splice(i, 1);
          break;
        }
      }
      if (this.over) return;
    }
  }

  private land(m: Marble, c: number): void {
    const cup = this.cups[c];
    if (cup.color === m.color && cup.count < cup.cap) {
      cup.count++;
      this.events.push({ type: EV.CUP, a: c, b: m.id });
      if (cup.count === cup.cap) this.events.push({ type: EV.FULL, a: c, b: m.id });
      if (this.cups.every((k) => k.count === k.cap)) {
        this.won = true;
        this.events.push({ type: EV.WIN, a: -1, b: -1 });
      }
      return;
    }
    this.spills++;
    this.events.push({ type: EV.SPILL, a: c, b: m.id });
    this.queue.push(m.color);
    if (this.spills >= this.maxSpills) {
      this.lost = true;
      this.events.push({ type: EV.LOSE, a: c, b: m.id });
    } else if (this.queue.length === 1 && this.spawnT <= 0) {
      // the hopper had run dry: give the returned marble a moment before it drops
      this.spawnT = this.interval;
    }
  }
}
