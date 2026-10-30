import { EV, type MarbleSim, type SimEvent } from '../sim/sim';
import type { Layout, Pt } from './layout';

/**
 * Visual-only animation state (nothing here feeds back into the rules):
 * flipper swings, gate pulses, cup bounces and flashes, spilled marbles flying
 * back to the hopper, rings and sparkles.
 */
export interface Ring { x: number; y: number; r0: number; r1: number; t: number; max: number; color: string; w: number }
export interface Spark { x: number; y: number; vx: number; vy: number; t: number; max: number; size: number; color: string }
export interface Flyer { color: number; from: Pt; t: number; dur: number }

export class BoardFx {
  time = 0;
  /** Displayed flipper position per gate, easing 0 (left) ↔ 1 (right). */
  flip: number[] = [];
  /** Last time a marble passed each gate / a cup got a marble / a cup spilled. */
  passT: number[] = [];
  landT: number[] = [];
  spillT: number[] = [];
  fullT: number[] = [];
  rings: Ring[] = [];
  sparks: Spark[] = [];
  flyers: Flyer[] = [];
  winT = -9;

  reset(sim: MarbleSim): void {
    this.time = 0;
    this.flip = sim.gate.map((g) => g.state);
    this.passT = sim.gate.map(() => -9);
    this.landT = sim.cups.map(() => -9);
    this.spillT = sim.cups.map(() => -9);
    this.fullT = sim.cups.map(() => -9);
    this.rings = [];
    this.sparks = [];
    this.flyers = [];
    this.winT = -9;
  }

  update(dt: number, sim: MarbleSim): void {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 22);
    sim.gate.forEach((g, i) => (this.flip[i] += (g.state - this.flip[i]) * k));
    for (let i = this.rings.length - 1; i >= 0; i--) if ((this.rings[i].t += dt) >= this.rings[i].max) this.rings.splice(i, 1);
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.t += dt;
      if (p.t >= p.max) {
        this.sparks.splice(i, 1);
        continue;
      }
      p.vx *= Math.exp(-dt * 2.5);
      p.vy = p.vy * Math.exp(-dt * 2.5) - 20 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) if ((this.flyers[i].t += dt) >= this.flyers[i].dur) this.flyers.splice(i, 1);
  }

  /** Turns a sim event into effects. */
  onEvent(e: SimEvent, sim: MarbleSim, L: Layout, hex: (color: number) => string): void {
    const now = this.time;
    if (e.type === EV.PASS) {
      this.passT[e.a] = now;
    } else if (e.type === EV.FLIP) {
      const p = L.node[sim.gateNode[e.a]];
      this.ring(p.x, p.y, L.gateR * 0.9, L.gateR * 1.6, e.b === -1 ? '#7ee8de' : '#ffffff', 2, 0.3);
    } else if (e.type === EV.CUP) {
      this.landT[e.a] = now;
      const c = L.cup[e.a];
      this.ring(c.cx, c.y + L.r * 0.4, L.r * 0.6, L.r * 2.2, hex(sim.cups[e.a].color), Math.max(1, L.r * 0.18), 0.35);
    } else if (e.type === EV.FULL) {
      this.fullT[e.a] = now;
      const c = L.cup[e.a];
      const col = hex(sim.cups[e.a].color);
      this.ring(c.cx, c.y + c.h * 0.5, c.w * 0.4, c.w * 1.6, col, c.w * 0.08, 0.6);
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = c.w * (1 + Math.random() * 1.8);
        this.spark(c.cx + (Math.random() - 0.5) * c.w * 0.6, c.y + Math.random() * c.h, i % 3 ? col : '#ffffff', c.w * (0.08 + Math.random() * 0.08), Math.cos(a) * v, Math.sin(a) * v - c.w, 0.6 + Math.random() * 0.5);
      }
    } else if (e.type === EV.SPILL) {
      this.spillT[e.a] = now;
      const c = L.cup[e.a];
      this.flyers.push({ color: sim.queue[sim.queue.length - 1], from: { x: c.cx, y: c.y }, t: 0, dur: 0.7 });
    }
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, w: number, max: number): void {
    if (this.rings.length > 40) this.rings.shift();
    this.rings.push({ x, y, r0, r1, t: 0, max, color, w });
  }

  spark(x: number, y: number, color: string, size: number, vx: number, vy: number, max: number): void {
    if (this.sparks.length > 120) this.sparks.shift();
    this.sparks.push({ x, y, vx, vy, t: 0, max, size, color });
  }
}
