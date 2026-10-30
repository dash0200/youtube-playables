import { clamp } from '@shared/engine/math';
import { K, MAX_BEADS, MAX_TUBES, QCAP, queueAt, type SimState } from '../sim/types';
import { PALETTE } from './constants';
import { beadPos, type Layout } from './layout';

/**
 * Purely visual animation state layered on top of the simulation: squash and
 * stretch, jelly tube wobble, beads flying into the pipe, rings and sparkles.
 * Nothing here feeds back into game rules, so the Rust/TS sims stay untouched.
 * PlayScene forwards sim events (and taps) here; render.ts reads it.
 */
export interface Ring { x: number; y: number; r0: number; r1: number; t: number; max: number; color: string; w: number }
export interface Spark { x: number; y: number; vx: number; vy: number; t: number; max: number; size: number; color: string }
export interface Flyer { tube: number; color: number; x: number; y: number; t: number; dur: number }

/** State of a tube right before a tap, so ejected beads can fly from where they were. */
export interface TubeSnapshot { len: number; fall: number; q: number }

const SPRING_K = 300;
const SPRING_D = 13;
const MAX_RINGS = 48;
const MAX_SPARKS = 140;

export class BoardFx {
  time = 0;
  /** Time each tube bead last landed (index t * MAX_BEADS + j). */
  readonly landT = new Float64Array(MAX_TUBES * MAX_BEADS).fill(-9);
  /** Jelly wobble per tube: + squashes down, − stretches up. */
  readonly wob = new Float64Array(MAX_TUBES);
  private readonly wobV = new Float64Array(MAX_TUBES);
  /** 0..1 glow on the port ring when it swallows a bead. */
  readonly port = new Float64Array(MAX_TUBES);
  readonly completeT = new Float64Array(MAX_TUBES).fill(-9);
  /** Pipe beads glide up after the bottom one leaves (in bead steps, decays to 0). */
  readonly qOff = new Float64Array(MAX_TUBES);
  /** Queue entries still flying up from the tube (hidden at the tail of the pipe). */
  readonly pending = new Uint16Array(MAX_TUBES);
  private readonly lastHead = new Uint16Array(MAX_TUBES);
  /** Consecutive landings per tube, for rising-pitch sound. */
  readonly streak = new Uint16Array(MAX_TUBES);
  private readonly lastLand = new Float64Array(MAX_TUBES).fill(-9);
  readonly rings: Ring[] = [];
  readonly sparks: Spark[] = [];
  readonly flyers: Flyer[] = [];
  /** Smoothed belt fill for the meter. */
  meter = 0;
  winT = -9;

  reset(s: SimState): void {
    this.time = 0;
    this.landT.fill(-9);
    this.wob.fill(0);
    this.wobV.fill(0);
    this.port.fill(0);
    this.completeT.fill(-9);
    this.qOff.fill(0);
    this.pending.fill(0);
    this.lastHead.set(s.qHead);
    this.streak.fill(0);
    this.lastLand.fill(-9);
    this.rings.length = 0;
    this.sparks.length = 0;
    this.flyers.length = 0;
    this.meter = 0;
    this.winT = -9;
  }

  update(dt: number, s: SimState, fill: number): void {
    this.time += dt;
    const e = Math.exp(-dt * 15);
    for (let t = 0; t < s.nTubes; t++) {
      const a = -SPRING_K * this.wob[t] - SPRING_D * this.wobV[t];
      this.wobV[t] += a * dt;
      this.wob[t] = clamp(this.wob[t] + this.wobV[t] * dt, -1.6, 1.6);
      this.port[t] = Math.max(0, this.port[t] - dt * 4);
      const pops = (s.qHead[t] - this.lastHead[t] + QCAP) % QCAP;
      if (pops > 0 && pops < QCAP / 2) this.qOff[t] = Math.min(this.qOff[t] + pops, 2.5);
      this.lastHead[t] = s.qHead[t];
      this.qOff[t] *= e;
      if (this.time - this.lastLand[t] > 0.3) this.streak[t] = 0;
    }
    this.meter += (fill - this.meter) * Math.min(1, dt * 6);

    for (let i = this.rings.length - 1; i >= 0; i--) if ((this.rings[i].t += dt) >= this.rings[i].max) this.rings.splice(i, 1);
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.t += dt;
      if (p.t >= p.max) {
        this.sparks.splice(i, 1);
        continue;
      }
      p.vx *= Math.exp(-dt * 2.5);
      p.vy = p.vy * Math.exp(-dt * 2.5) - 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt;
      if (f.t >= f.dur) {
        this.pending[f.tube] = Math.max(0, this.pending[f.tube] - 1);
        this.flyers.splice(i, 1);
      }
    }
  }

  /** Occasional twinkles on finished tubes, so a solved board keeps breathing. */
  ambient(dt: number, s: SimState, L: Layout): void {
    for (let t = 0; t < s.nTubes; t++) {
      if (!s.complete[t] || Math.random() > dt * 1.4) continue;
      const tb = L.tubes[t];
      this.spark(tb.x + tb.w * (0.2 + Math.random() * 0.6), tb.y + tb.pad + Math.random() * (tb.h - tb.pad * 2),
        '#ffffff', tb.w * 0.09, 0, -tb.w * 0.25, 0.9);
    }
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, w: number, max = 0.5): void {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x, y, r0, r1, t: 0, max, color, w });
  }

  spark(x: number, y: number, color: string, size: number, vx: number, vy: number, max = 0.8): void {
    if (this.sparks.length >= MAX_SPARKS) this.sparks.shift();
    this.sparks.push({ x, y, vx, vy, t: 0, max, size, color });
  }

  onAbsorb(t: number): void {
    this.port[t] = 1;
  }

  /** Returns the landing streak (for sound pitch). */
  onLand(t: number, s: SimState, L: Layout): number {
    const idx = s.tubeLen[t] - 1;
    if (idx < 0) return 0;
    this.landT[t * MAX_BEADS + idx] = this.time;
    this.wobV[t] += 0.9;
    this.lastLand[t] = this.time;
    this.streak[t]++;
    if (idx % 3 === 1) {
      const tb = L.tubes[t];
      const p = beadPos(tb, Math.floor(idx / K), idx % K);
      this.ring(p.x, p.y, tb.br * 0.6, tb.br * 1.7, PALETTE[s.tubeBeads[t * MAX_BEADS + idx]].hex, Math.max(1, tb.br * 0.18), 0.28);
    }
    return this.streak[t];
  }

  onEject(t: number, before: TubeSnapshot, s: SimState, L: Layout): void {
    const tb = L.tubes[t];
    const count = s.qLen[t] - before.q;
    for (let k = 0; k < count; k++) {
      const idx = k < before.fall ? before.len + k : before.len - 1 - (k - before.fall);
      const p = beadPos(tb, Math.floor(idx / K), idx % K);
      this.flyers.push({ tube: t, color: queueAt(s, t, before.q + k), x: p.x, y: p.y, t: -k * 0.016, dur: 0.24 });
    }
    this.pending[t] += Math.max(0, count);
    this.wobV[t] -= 5.5;
    this.port[t] = 1;
    if (count > 0) {
      const top = beadPos(tb, Math.floor(Math.max(0, before.len - 1) / K), 4);
      this.ring(tb.cx, top.y, tb.w * 0.15, tb.w * 0.5, PALETTE[queueAt(s, t, before.q)].hex, Math.max(1, tb.w * 0.04), 0.3);
    }
  }

  onDeny(t: number): void {
    this.wobV[t] += 2.5;
  }

  onComplete(t: number, s: SimState, L: Layout): void {
    this.completeT[t] = this.time;
    this.wobV[t] -= 6;
    const tb = L.tubes[t];
    const hex = PALETTE[s.tubeShell[t]].hex;
    const cy = tb.y + tb.h * 0.5;
    this.ring(tb.cx, cy, tb.w * 0.4, tb.w * 1.7, hex, tb.w * 0.07, 0.7);
    this.ring(tb.cx, cy, tb.w * 0.2, tb.w * 1.2, '#ffffff', tb.w * 0.035, 0.55);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = tb.w * (0.8 + Math.random() * 1.6);
      this.spark(tb.cx + (Math.random() - 0.5) * tb.w * 0.7, tb.y + Math.random() * tb.h,
        i % 3 ? hex : '#ffffff', tb.w * (0.08 + Math.random() * 0.08), Math.cos(a) * v, Math.sin(a) * v - tb.w, 0.7 + Math.random() * 0.5);
    }
  }

  onWin(s: SimState, L: Layout): void {
    this.winT = this.time;
    for (let t = 0; t < s.nTubes; t++) {
      const tb = L.tubes[t];
      this.wobV[t] -= 4;
      for (let i = 0; i < 8; i++) {
        this.spark(tb.x + Math.random() * tb.w, tb.y + Math.random() * tb.h, '#ffffff', tb.w * 0.12,
          (Math.random() - 0.5) * tb.w, -tb.w * (1 + Math.random() * 2), 1.1);
      }
    }
  }
}
