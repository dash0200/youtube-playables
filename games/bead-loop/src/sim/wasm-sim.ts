import { instantiateWasm } from '@shared/wasm/load';
import {
  EMPTY, K, MAX_BEADS, MAX_CAP, MAX_EVENTS, MAX_SLOTS, MAX_TUBES, NSCAL, QCAP,
  emptyState, type LevelData, type Sim, type SimState,
} from './types';

interface Exports {
  memory: WebAssembly.Memory;
  bl_input_ptr(): number;
  bl_const(k: number): number;
  bl_init(speed: number): number;
  bl_set_port(t: number, frac: number): void;
  bl_tap(t: number): number;
  bl_update(dt: number): void;
  bl_clear_events(): void;
  bl_ev_len(): number;
  bl_set_path(x: number, y: number, w: number, h: number, r: number, jitter: number): void;
  bl_compute_positions(): void;
  bl_checksum(): number;
  bl_scal(): number;
  bl_slot_color(): number;
  bl_slot_born(): number;
  bl_tube_shell(): number;
  bl_tube_beads(): number;
  bl_tube_len(): number;
  bl_fall_t(): number;
  bl_fall_len(): number;
  bl_queue(): number;
  bl_q_head(): number;
  bl_q_len(): number;
  bl_shake(): number;
  bl_flash(): number;
  bl_complete(): number;
  bl_combo(): number;
  bl_events(): number;
  bl_pos(): number;
}

/**
 * Rust simulation (rust/crates/bead-loop-wasm) running in WebAssembly.
 * State arrays are zero-copy typed-array views into wasm linear memory; the
 * Rust side never allocates, so memory never grows and views stay valid.
 */
export class WasmSim implements Sim {
  readonly backend = 'wasm' as const;
  readonly s: SimState = emptyState();
  private constructor(private readonly x: Exports) {}

  static async load(url: string): Promise<WasmSim> {
    const inst = await instantiateWasm(url);
    const x = inst.exports as unknown as Exports;
    const expect = [K, MAX_TUBES, MAX_CAP, MAX_BEADS, QCAP, MAX_SLOTS, NSCAL, MAX_EVENTS];
    expect.forEach((v, i) => {
      if (x.bl_const(i) !== v) throw new Error(`wasm layout mismatch at const ${i}: ${x.bl_const(i)} != ${v}`);
    });
    return new WasmSim(x);
  }

  init(l: LevelData): void {
    const x = this.x;
    const len = x.bl_const(8);
    const inp = new Uint8Array(x.memory.buffer, x.bl_input_ptr(), len);
    inp.fill(0);
    inp[0] = l.colors;
    inp[1] = l.cap;
    inp[2] = l.slots & 255;
    inp[3] = l.slots >> 8;
    let o = 4;
    for (let t = 0; t < MAX_TUBES; t++) inp[o + t] = l.tubes[t]?.length ?? 0;
    o += MAX_TUBES;
    for (let t = 0; t < MAX_TUBES; t++) {
      const str = l.tubes[t] ?? '';
      for (let b = 0; b < str.length; b++) inp[o + t * MAX_CAP + b] = str.charCodeAt(b) - 48;
    }
    o += MAX_TUBES * MAX_CAP;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const ch = l.belt[i];
      inp[o + i] = ch === undefined || ch === '.' ? EMPTY : ch.charCodeAt(0) - 48;
    }
    if (x.bl_init(l.speed) !== 0) throw new Error('bl_init rejected level');
    this.bindViews(l);
  }

  private bindViews(l: LevelData): void {
    const x = this.x;
    const b = x.memory.buffer;
    const s = this.s;
    s.nSlots = l.slots;
    s.nTubes = l.colors;
    s.cap = l.cap;
    s.scal = new Float64Array(b, x.bl_scal(), NSCAL);
    s.slotColor = new Uint8Array(b, x.bl_slot_color(), MAX_SLOTS);
    s.slotBorn = new Float64Array(b, x.bl_slot_born(), MAX_SLOTS);
    s.tubeShell = new Uint8Array(b, x.bl_tube_shell(), MAX_TUBES);
    s.tubeBeads = new Uint8Array(b, x.bl_tube_beads(), MAX_TUBES * MAX_BEADS);
    s.tubeLen = new Uint16Array(b, x.bl_tube_len(), MAX_TUBES);
    s.fallT = new Float64Array(b, x.bl_fall_t(), MAX_TUBES * MAX_BEADS);
    s.fallLen = new Uint16Array(b, x.bl_fall_len(), MAX_TUBES);
    s.queue = new Uint8Array(b, x.bl_queue(), MAX_TUBES * QCAP);
    s.qHead = new Uint16Array(b, x.bl_q_head(), MAX_TUBES);
    s.qLen = new Uint16Array(b, x.bl_q_len(), MAX_TUBES);
    s.shake = new Float64Array(b, x.bl_shake(), MAX_TUBES);
    s.flash = new Float64Array(b, x.bl_flash(), MAX_TUBES);
    s.complete = new Uint8Array(b, x.bl_complete(), MAX_TUBES);
    s.combo = new Uint16Array(b, x.bl_combo(), MAX_TUBES);
    s.events = new Uint8Array(b, x.bl_events(), MAX_EVENTS * 2);
    s.pos = new Float32Array(b, x.bl_pos(), MAX_SLOTS * 2);
  }

  setPort(t: number, frac: number): void {
    this.x.bl_set_port(t, frac);
  }
  tap(t: number): boolean {
    return this.x.bl_tap(t) === 1;
  }
  update(dt: number): void {
    this.x.bl_update(dt);
  }
  eventCount(): number {
    return this.x.bl_ev_len();
  }
  clearEvents(): void {
    this.x.bl_clear_events();
  }
  setPath(x: number, y: number, w: number, h: number, r: number, jitter: number): void {
    this.x.bl_set_path(x, y, w, h, r, jitter);
  }
  computePositions(): void {
    this.x.bl_compute_positions();
  }
  checksum(): number {
    return this.x.bl_checksum() >>> 0;
  }
}
