import { hash01, mod } from '@shared/engine/math';
import { RoundedRectPath } from '@shared/engine/path';
import {
  EMPTY, EV, FALL_TIME, JAM_TIME, K, MAX_BEADS, MAX_CAP, MAX_EVENTS, MAX_SLOTS, MAX_TUBES, QCAP,
  QUEUE_TAP_LIMIT, S, emptyState, intake, type LevelData, type Sim, type SimState,
} from './types';

/**
 * TypeScript fallback of rust/crates/bead-loop/src/sim.rs, used only when the
 * WebAssembly build is missing or fails to load.
 *
 * Keep it STEP-FOR-STEP identical to the Rust version (same order of
 * operations, same float maths). `npm run parity -- bead-loop` diffs both.
 */
export class TsSim implements Sim {
  readonly backend = 'ts' as const;
  readonly s: SimState = emptyState();
  private speed = 0;
  private port = new Float64Array(MAX_TUBES);
  private lastIdx = new Int32Array(MAX_TUBES);
  private evLen = 0;
  private path: RoundedRectPath | null = null;
  private jitter = 0;

  init(l: LevelData): void {
    const fresh = emptyState();
    Object.assign(this.s, fresh);
    const s = this.s;
    s.nSlots = Math.max(1, Math.min(l.slots, MAX_SLOTS));
    s.nTubes = Math.min(l.colors, MAX_TUBES);
    s.cap = Math.min(l.cap, MAX_CAP);
    this.speed = l.speed;
    this.port.fill(0);
    this.lastIdx.fill(0);
    this.evLen = 0;
    for (let t = 0; t < s.nTubes; t++) {
      s.tubeShell[t] = t;
      const blocks = l.tubes[t] ?? '';
      for (let b = 0; b < Math.min(blocks.length, s.cap); b++) {
        for (let k = 0; k < K; k++) this.pushBead(t, blocks.charCodeAt(b) - 48);
      }
    }
    for (let i = 0; i < s.nSlots; i++) {
      const ch = l.belt[i];
      s.slotColor[i] = ch === undefined || ch === '.' ? EMPTY : ch.charCodeAt(0) - 48;
    }
    s.scal[S.FREE] = this.freeSlots();
  }

  // ---------- queries ----------
  private space(t: number): number {
    return Math.max(0, this.s.cap * K - this.s.tubeLen[t] - this.s.fallLen[t]);
  }

  private topRun(t: number): number {
    const s = this.s;
    const len = s.tubeLen[t];
    if (len === 0) return 0;
    const c = s.tubeBeads[t * MAX_BEADS + len - 1];
    let n = 0;
    while (n < len && s.tubeBeads[t * MAX_BEADS + len - 1 - n] === c) n++;
    return n;
  }

  private isFullShell(t: number): boolean {
    const s = this.s;
    const len = s.tubeLen[t];
    if (len !== s.cap * K) return false;
    for (let j = 0; j < len; j++) if (s.tubeBeads[t * MAX_BEADS + j] !== s.tubeShell[t]) return false;
    return true;
  }

  private freeSlots(): number {
    let n = 0;
    for (let i = 0; i < this.s.nSlots; i++) if (this.s.slotColor[i] === EMPTY) n++;
    return n;
  }

  private slotAt(p: number): number {
    return mod(Math.floor(p - this.s.scal[S.OFFSET]), this.s.nSlots);
  }

  private won(): boolean {
    return this.s.scal[S.WON] !== 0;
  }

  private lost(): boolean {
    return this.s.scal[S.LOST] !== 0;
  }

  // ---------- mutation helpers ----------
  private pushBead(t: number, c: number): void {
    const len = this.s.tubeLen[t];
    if (len < MAX_BEADS) {
      this.s.tubeBeads[t * MAX_BEADS + len] = c;
      this.s.tubeLen[t]++;
    }
  }

  private qPush(t: number, c: number): void {
    const s = this.s;
    const len = s.qLen[t];
    if (len >= QCAP) return;
    s.queue[t * QCAP + ((s.qHead[t] + len) % QCAP)] = c;
    s.qLen[t]++;
  }

  private qPop(t: number): number {
    const s = this.s;
    const h = s.qHead[t];
    const c = s.queue[t * QCAP + h];
    s.qHead[t] = (h + 1) % QCAP;
    s.qLen[t]--;
    return c;
  }

  private event(kind: number, tube: number): void {
    if (this.evLen < MAX_EVENTS) {
      this.s.events[this.evLen * 2] = kind;
      this.s.events[this.evLen * 2 + 1] = tube;
      this.evLen++;
    }
  }

  eventCount(): number {
    return this.evLen;
  }

  clearEvents(): void {
    this.evLen = 0;
  }

  // ---------- API ----------
  setPort(t: number, frac: number): void {
    if (t >= this.s.nTubes) return;
    this.port[t] = frac * this.s.nSlots;
    this.lastIdx[t] = this.slotAt(this.port[t]);
  }

  tap(t: number): boolean {
    const s = this.s;
    if (t >= s.nTubes || this.won() || this.lost()) return false;
    const len = s.tubeLen[t];
    const fl = s.fallLen[t];
    if (s.complete[t] !== 0 || s.qLen[t] >= QUEUE_TAP_LIMIT || (len === 0 && fl === 0)) {
      s.shake[t] = 1;
      this.event(EV.DENY, t);
      return false;
    }
    const color = intake(s, t);
    for (let k = 0; k < fl; k++) this.qPush(t, color);
    s.fallLen[t] = 0;
    const run = this.topRun(t);
    for (let k = 0; k < run; k++) {
      const l = s.tubeLen[t];
      const c = s.tubeBeads[t * MAX_BEADS + l - 1];
      s.tubeBeads[t * MAX_BEADS + l - 1] = EMPTY;
      s.tubeLen[t]--;
      this.qPush(t, c);
    }
    s.combo[t] = 0;
    s.scal[S.TAPS] += 1;
    s.scal[S.STARTED] = 1;
    this.event(EV.EJECT, t);
    return true;
  }

  private arrive(t: number, i: number): boolean {
    const s = this.s;
    const c = s.slotColor[i];
    if (s.complete[t] === 0 && c !== EMPTY && c === intake(s, t) && this.space(t) > 0) {
      s.slotColor[i] = EMPTY;
      s.fallT[t * MAX_BEADS + s.fallLen[t]] = 0;
      s.fallLen[t]++;
      s.combo[t]++;
      this.event(EV.ABSORB, t);
      return true;
    }
    if (c === EMPTY && s.qLen[t] > 0) {
      s.slotColor[i] = this.qPop(t);
      s.slotBorn[i] = s.scal[S.TIME];
    }
    return false;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const s = this.s;
    s.scal[S.TIME] += dt;
    const active = s.scal[S.STARTED] !== 0 && !this.won() && !this.lost();
    if (active) s.scal[S.ELAPSED] += dt;
    const n = s.nSlots;
    let absorbed = false;
    if (!this.lost()) {
      s.scal[S.OFFSET] = mod(s.scal[S.OFFSET] + this.speed * dt, n);
      for (let t = 0; t < s.nTubes; t++) {
        const idx = this.slotAt(this.port[t]);
        let guard = n;
        while (this.lastIdx[t] !== idx && guard > 0) {
          this.lastIdx[t] = mod(this.lastIdx[t] - 1, n);
          if (this.arrive(t, this.lastIdx[t])) absorbed = true;
          guard--;
        }
      }
    }
    for (let t = 0; t < s.nTubes; t++) {
      const base = t * MAX_BEADS;
      for (let k = 0; k < s.fallLen[t]; k++) s.fallT[base + k] += dt;
      while (s.fallLen[t] > 0 && s.fallT[base] >= FALL_TIME) {
        const fl = s.fallLen[t];
        for (let k = 1; k < fl; k++) s.fallT[base + k - 1] = s.fallT[base + k];
        s.fallLen[t]--;
        this.pushBead(t, intake(s, t));
        this.event(EV.LAND, t);
      }
      s.shake[t] = Math.max(s.shake[t] - dt * 4, 0);
      s.flash[t] = Math.max(s.flash[t] - dt * 1.6, 0);
      if (s.fallLen[t] === 0) s.combo[t] = 0;
      if (s.complete[t] === 0 && this.isFullShell(t)) {
        s.complete[t] = 1;
        s.flash[t] = 1;
        this.event(EV.COMPLETE, t);
      }
    }
    const free = this.freeSlots();
    s.scal[S.FREE] = free;
    if (active) {
      if (free === 0 && !absorbed) s.scal[S.JAM] += dt;
      else s.scal[S.JAM] = 0;
      if (s.scal[S.JAM] >= JAM_TIME) {
        s.scal[S.LOST] = 1;
        this.event(EV.LOSE, 255);
      }
    }
    if (!this.won() && !this.lost()) {
      let all = true;
      for (let t = 0; t < s.nTubes; t++) if (s.complete[t] === 0 || s.fallLen[t] !== 0) all = false;
      if (all) {
        s.scal[S.WON] = 1;
        this.event(EV.WIN, 255);
      }
    }
  }

  setPath(x: number, y: number, w: number, h: number, r: number, jitter: number): void {
    this.path = new RoundedRectPath(x, y, w, h, r);
    this.jitter = jitter;
  }

  computePositions(): void {
    const s = this.s;
    const p = this.path;
    if (!p) return;
    const n = s.nSlots;
    const spacing = p.length / n;
    const off = s.scal[S.OFFSET];
    for (let i = 0; i < n; i++) {
      const pt = p.at(mod(i + off, n) * spacing);
      const j = (hash01(i) - 0.5) * this.jitter;
      s.pos[i * 2] = pt.x + pt.nx * j;
      s.pos[i * 2 + 1] = pt.y + pt.ny * j;
    }
  }

  checksum(): number {
    const s = this.s;
    let h = 0x811c9dc5;
    const mix = (b: number) => {
      h = Math.imul(h ^ b, 0x01000193) >>> 0;
    };
    for (let i = 0; i < s.nSlots; i++) mix(s.slotColor[i]);
    for (let t = 0; t < s.nTubes; t++) {
      mix(s.tubeLen[t]);
      for (let j = 0; j < s.tubeLen[t]; j++) mix(s.tubeBeads[t * MAX_BEADS + j]);
      mix(s.fallLen[t]);
      mix(s.qLen[t]);
      for (let k = 0; k < s.qLen[t]; k++) mix(s.queue[t * QCAP + ((s.qHead[t] + k) % QCAP)]);
      mix(s.complete[t]);
    }
    mix(s.scal[S.WON]);
    mix(s.scal[S.LOST]);
    mix(s.scal[S.TAPS]);
    return h >>> 0;
  }
}
