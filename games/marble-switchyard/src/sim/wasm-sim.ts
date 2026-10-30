import { instantiateWasm } from '@shared/wasm/load';
import { Kind, parseTree, type LevelData, type Marble, type MarbleSim, type SimEvent, type TreeNode } from './sim';

/** Layout constants; MUST match rust/crates/marble-switchyard/src/sim.rs (checked at load). */
const MAX_NODES = 16;
const MAX_GATES = 8;
const MAX_CUPS = 8;
const MAX_MARBLES = 32;
const QCAP = 128;
const MAX_EVENTS = 128;
const MAX_TREE = 32;
const NSCAL = 10;
const INPUT_LEN = 1 + MAX_TREE + 1 + 3 * MAX_GATES + 1 + 2 * MAX_CUPS + 2 + QCAP;
const SLOTS = 4;
const S = { TIME: 0, SPAWN_T: 1, SPILLS: 2, WON: 3, LOST: 4 } as const;

interface Exports {
  memory: WebAssembly.Memory;
  ms_input_ptr(): number;
  ms_const(k: number): number;
  ms_init(slot: number, interval: number, speed: number, spills: number): number;
  ms_tap(slot: number, g: number): number;
  ms_update(slot: number, dt: number): void;
  ms_clear_events(slot: number): void;
  ms_ev_len(slot: number): number;
  ms_marbles(slot: number): number;
  ms_q_head(slot: number): number;
  ms_q_len(slot: number): number;
  ms_checksum(slot: number): number;
  ms_scal(slot: number): number;
  ms_gate_state(slot: number): number;
  ms_cup_count(slot: number): number;
  ms_m_id(slot: number): number;
  ms_m_color(slot: number): number;
  ms_m_to(slot: number): number;
  ms_m_from(slot: number): number;
  ms_m_d(slot: number): number;
  ms_m_len(slot: number): number;
  ms_queue(slot: number): number;
  ms_ev_type(slot: number): number;
  ms_ev_a(slot: number): number;
  ms_ev_b(slot: number): number;
}

/** The loaded module; hands out simulations in its static slots. */
export class WasmModule {
  private next = 0;
  private constructor(private readonly x: Exports) {}

  static async load(url: string): Promise<WasmModule> {
    const inst = await instantiateWasm(url);
    const x = inst.exports as unknown as Exports;
    const expect = [MAX_NODES, MAX_GATES, MAX_CUPS, MAX_MARBLES, QCAP, MAX_EVENTS, MAX_TREE, NSCAL, INPUT_LEN, SLOTS];
    expect.forEach((v, i) => {
      if (x.ms_const(i) !== v) throw new Error(`wasm layout mismatch at const ${i}: ${x.ms_const(i)} != ${v}`);
    });
    return new WasmModule(x);
  }

  /**
   * Round-robin over the static slots. At most two sims are alive at once (the
   * scene fading out and the one fading in) and they're always the two most
   * recent, so four slots never hand out one that's still in use.
   */
  create(level: LevelData): WasmSim {
    return new WasmSim(this.x, this.next++ % SLOTS, level);
  }
}

/**
 * The Rust simulation (rust/crates/marble-switchyard-wasm) in WebAssembly.
 * The tree layout is parsed here too (it never changes); dynamic state is read
 * from typed-array views straight into wasm memory after every update/tap and
 * mirrored into the same plain fields the TypeScript Sim exposes. The Rust side
 * never allocates, so memory never grows and the views stay valid.
 */
export class WasmSim implements MarbleSim {
  readonly backend = 'wasm' as const;
  readonly nodes: TreeNode[];
  readonly gateNode: number[] = [];
  readonly cupNode: number[] = [];
  readonly gate: { state: number; auto: boolean; link: number }[];
  readonly cups: { color: number; cap: number; count: number }[];
  marbles: Marble[] = [];
  queue: number[] = [];
  events: SimEvent[] = [];
  spills = 0;
  readonly maxSpills: number;
  time = 0;
  won = false;
  lost = false;
  readonly interval: number;
  readonly speed: number;
  private spawnT = 0;
  private readonly pool: Marble[] = [];
  private readonly v: {
    scal: Float64Array; gate: Uint8Array; cup: Uint8Array;
    id: Int32Array; color: Uint8Array; to: Int32Array; from: Int32Array; d: Float64Array; len: Float64Array;
    queue: Uint8Array; evType: Uint8Array; evA: Int32Array; evB: Int32Array;
  };

  constructor(private readonly x: Exports, private readonly slot: number, readonly level: LevelData) {
    this.nodes = parseTree(level.tree);
    this.nodes.forEach((n, i) => (n.kind === Kind.GATE ? (this.gateNode[n.ref] = i) : (this.cupNode[n.ref] = i)));
    this.gate = this.gateNode.map((_, g) => ({ state: level.gates[g]?.start ?? 0, auto: !!level.gates[g]?.auto, link: level.gates[g]?.link ?? 0 }));
    this.cups = this.cupNode.map((_, c) => ({ color: level.cups[c].color, cap: level.cups[c].cap, count: 0 }));
    this.maxSpills = level.spills;
    this.interval = level.interval;
    this.speed = level.speed;

    const inp = new Uint8Array(x.memory.buffer, x.ms_input_ptr(), INPUT_LEN);
    inp.fill(0);
    let o = 0;
    inp[o++] = level.tree.length;
    for (let i = 0; i < level.tree.length; i++) inp[o + i] = level.tree.charCodeAt(i);
    o += MAX_TREE;
    inp[o++] = this.gate.length;
    for (let g = 0; g < MAX_GATES; g++, o += 3) {
      const d = level.gates[g];
      if (!d) continue;
      inp[o] = d.start;
      inp[o + 1] = d.auto ? 1 : 0;
      inp[o + 2] = d.link ?? 0;
    }
    inp[o++] = level.cups.length;
    for (let c = 0; c < MAX_CUPS; c++, o += 2) {
      const d = level.cups[c];
      if (!d) continue;
      inp[o] = d.color;
      inp[o + 1] = d.cap;
    }
    inp[o++] = level.seq.length & 255;
    inp[o++] = level.seq.length >> 8;
    for (let i = 0; i < level.seq.length; i++) inp[o + i] = level.seq.charCodeAt(i) - 48;
    if (x.ms_init(slot, level.interval, level.speed, level.spills) < 0) throw new Error(`wasm init failed for level ${level.n}`);

    const buf = x.memory.buffer;
    this.v = {
      scal: new Float64Array(buf, x.ms_scal(slot), NSCAL),
      gate: new Uint8Array(buf, x.ms_gate_state(slot), MAX_GATES),
      cup: new Uint8Array(buf, x.ms_cup_count(slot), MAX_CUPS),
      id: new Int32Array(buf, x.ms_m_id(slot), MAX_MARBLES),
      color: new Uint8Array(buf, x.ms_m_color(slot), MAX_MARBLES),
      to: new Int32Array(buf, x.ms_m_to(slot), MAX_MARBLES),
      from: new Int32Array(buf, x.ms_m_from(slot), MAX_MARBLES),
      d: new Float64Array(buf, x.ms_m_d(slot), MAX_MARBLES),
      len: new Float64Array(buf, x.ms_m_len(slot), MAX_MARBLES),
      queue: new Uint8Array(buf, x.ms_queue(slot), QCAP),
      evType: new Uint8Array(buf, x.ms_ev_type(slot), MAX_EVENTS),
      evA: new Int32Array(buf, x.ms_ev_a(slot), MAX_EVENTS),
      evB: new Int32Array(buf, x.ms_ev_b(slot), MAX_EVENTS),
    };
    this.sync();
  }

  get over(): boolean {
    return this.won || this.lost;
  }

  get nextDrop(): number {
    return Math.max(0, this.spawnT);
  }

  edgeLen(node: number): number {
    const n = this.nodes[node];
    return n.parent < 0 ? 1 : n.row - this.nodes[n.parent].row;
  }

  tap(g: number): boolean {
    const ok = this.x.ms_tap(this.slot, g) === 1;
    this.sync();
    return ok;
  }

  update(dt: number): void {
    this.x.ms_update(this.slot, dt);
    this.sync();
  }

  checksum(): number {
    return this.x.ms_checksum(this.slot) >>> 0;
  }

  /** Mirrors the wasm state into the plain fields (and moves new events into `events`). */
  private sync(): void {
    const { x, slot, v } = this;
    this.time = v.scal[S.TIME];
    this.spawnT = v.scal[S.SPAWN_T];
    this.spills = v.scal[S.SPILLS];
    this.won = v.scal[S.WON] !== 0;
    this.lost = v.scal[S.LOST] !== 0;
    for (let g = 0; g < this.gate.length; g++) this.gate[g].state = v.gate[g];
    for (let c = 0; c < this.cups.length; c++) this.cups[c].count = v.cup[c];
    const n = x.ms_marbles(slot);
    this.marbles.length = n;
    for (let i = 0; i < n; i++) {
      const m = (this.pool[i] ??= { id: 0, color: 0, to: 0, from: -1, d: 0, len: 1 });
      m.id = v.id[i];
      m.color = v.color[i];
      m.to = v.to[i];
      m.from = v.from[i];
      m.d = v.d[i];
      m.len = v.len[i];
      this.marbles[i] = m;
    }
    const head = x.ms_q_head(slot);
    const ql = x.ms_q_len(slot);
    this.queue.length = ql;
    for (let k = 0; k < ql; k++) this.queue[k] = v.queue[(head + k) % QCAP];
    const ev = x.ms_ev_len(slot);
    for (let i = 0; i < ev; i++) this.events.push({ type: v.evType[i], a: v.evA[i], b: v.evB[i] });
    if (ev) x.ms_clear_events(slot);
  }
}
