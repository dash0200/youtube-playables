import { Rng } from '@shared/engine/rng';
import { HOPPER_DROP, Kind, Sim, type LevelData } from './sim';

/**
 * Simulated players. The planning bot proves levels are solvable (generator)
 * and drives the hint and the dev Solve button. The naive player knows the
 * rule but only ever looks at the most urgent marble; its win rate is the
 * difficulty measure the generator tunes against.
 */

interface Step {
  /** Gate index and the node it sits on. */
  gate: number;
  node: number;
  /** 0 = left, 1 = right. */
  dir: number;
}

/** Gate decisions from the root down to each cup. */
export function cupPaths(sim: Sim): Step[][] {
  return sim.cupNode.map((leaf) => {
    const steps: Step[] = [];
    let child = leaf;
    let p = sim.nodes[leaf].parent;
    while (p >= 0) {
      const n = sim.nodes[p];
      steps.unshift({ gate: n.ref, node: p, dir: n.left === child ? 0 : 1 });
      child = p;
      p = n.parent;
    }
    return steps;
  });
}

interface Arrival {
  eta: number;
  /** Needed direction, or -1 when this marble can't be helped (it'll spill anyway). */
  dir: number;
}

/** Tap advice for a moment of play. */
export interface Advice {
  /** Gate to tap now, or -1 to wait. */
  gate: number;
  /** Marble the advice is for (to highlight it): its id, -1/-2 for the next marbles in the hopper, 0 = none. */
  marble: number;
  /** Cup that marble is headed for, or -1. */
  cup: number;
}

/** A marble rolling, or one still waiting in the hopper (negative id, d < 0 = time before it drops). */
interface Flying {
  id: number;
  color: number;
  to: number;
  d: number;
  len: number;
}

/** How many queued marbles the planner looks ahead at (a player can see them in the hopper). */
const LOOKAHEAD = 2;

export class Planner {
  private readonly paths: Step[][];
  private fl: Flying[] = [];

  constructor(private readonly sim: Sim) {
    this.paths = cupPaths(sim);
  }

  /** Remaining steps for a marble now rolling towards `to`, if cup c lies below it. */
  private remaining(c: number, to: number): Step[] | null {
    if (this.sim.cupNode[c] === to) return [];
    const path = this.paths[c];
    const k = path.findIndex((s) => s.node === to);
    return k < 0 ? null : path.slice(k);
  }

  /** Seconds until a marble reaches each node on its remaining path. */
  private etas(m: { d: number; len: number }, steps: Step[]): number[] {
    const sim = this.sim;
    let t = (m.len - m.d) / sim.speed;
    const out: number[] = [];
    for (let i = 0; i < steps.length; i++) {
      if (i > 0) t += sim.edgeLen(steps[i].node) / sim.speed;
      out.push(t);
    }
    return out;
  }

  /**
   * Picks a cup for every marble in flight (earliest first): one of its colour,
   * with room, reachable from where it is, preferring the path that already
   * needs the fewest flips. Returns cup per marble index (-1 = none).
   */
  assign(): number[] {
    const sim = this.sim;
    this.fl = [...sim.marbles];
    for (let k = 0; k < Math.min(LOOKAHEAD, sim.queue.length); k++) {
      const wait = sim.nextDrop + k * sim.interval;
      this.fl.push({ id: -(k + 1), color: sim.queue[k], to: 0, d: -wait * sim.speed, len: HOPPER_DROP });
    }
    const room = sim.cups.map((c) => c.cap - c.count);
    return this.fl.map((m) => {
      let best = -1;
      let bestFlips = Infinity;
      for (let c = 0; c < sim.cups.length; c++) {
        if (sim.cups[c].color !== m.color || room[c] <= 0) continue;
        const rest = this.remaining(c, m.to);
        if (!rest) continue;
        let flips = 0;
        for (const st of rest) if (sim.gate[st.gate].state !== st.dir) flips++;
        if (flips < bestFlips) {
          bestFlips = flips;
          best = c;
        }
      }
      if (best >= 0) room[best]--;
      return best;
    });
  }

  /** Every marble's upcoming arrivals per gate, in time order. */
  private arrivals(targets: number[]): Arrival[][] {
    const sim = this.sim;
    const per: Arrival[][] = sim.gate.map(() => []);
    this.fl.forEach((m, i) => {
      const c = targets[i];
      let steps: Step[];
      let dirs: number[];
      if (c >= 0) {
        steps = this.remaining(c, m.to)!;
        dirs = steps.map((s) => s.dir);
      } else {
        // can't be saved: it still passes gates (and flips auto gates) on whatever path it takes
        steps = [];
        let node = m.to;
        while (sim.nodes[node].kind === Kind.GATE) {
          const n = sim.nodes[node];
          steps.push({ gate: n.ref, node, dir: -1 });
          node = sim.gate[n.ref].state === 0 ? n.left : n.right;
        }
        dirs = steps.map(() => -1);
      }
      const eta = this.etas(m, steps);
      steps.forEach((s, k) => per[s.gate].push({ eta: eta[k], dir: dirs[k] }));
    });
    for (const a of per) a.sort((x, y) => x.eta - y.eta);
    return per;
  }

  /**
   * The planning move: the most urgent gate that's wrong for the next marble to
   * reach it (and whose flip won't misroute anything arriving at a linked gate
   * first). Auto gates are predicted marble by marble.
   */
  advise(): Advice {
    const sim = this.sim;
    const targets = this.assign();
    const per = this.arrivals(targets);
    const firstNeed = (g: number): { eta: number; flip: boolean } | null => {
      let s = sim.gate[g].state;
      for (const a of per[g]) {
        if (a.dir >= 0) return { eta: a.eta, flip: s !== a.dir };
        if (sim.gate[g].auto) s ^= 1;
      }
      return null;
    };
    let best = -1;
    let bestEta = Infinity;
    for (let g = 0; g < sim.gate.length; g++) {
      const need = firstNeed(g);
      if (!need || !need.flip || need.eta >= bestEta) continue;
      const link = sim.gate[g].link;
      let ok = true;
      if (link) {
        for (let k = 0; k < sim.gate.length && ok; k++) {
          if (k === g || sim.gate[k].link !== link) continue;
          const other = firstNeed(k);
          if (other && !other.flip && other.eta < need.eta) ok = false;
        }
      }
      if (ok) {
        best = g;
        bestEta = need.eta;
      }
    }
    return this.describe(best, targets);
  }

  /**
   * The naive move: follow one marble at a time (the oldest still above a gate)
   * and set the first wrong gate on its route, ignoring every other marble and
   * auto-gate side effects, like a player tracking a single marble.
   */
  naive(): Advice {
    const sim = this.sim;
    const targets = this.assign();
    for (let i = 0; i < this.fl.length; i++) {
      const m = this.fl[i];
      if (targets[i] < 0 || sim.nodes[m.to].kind !== Kind.GATE) continue;
      const wrong = this.remaining(targets[i], m.to)!.find((st) => sim.gate[st.gate].state !== st.dir);
      return { gate: wrong ? wrong.gate : -1, marble: m.id, cup: targets[i] };
    }
    return { gate: -1, marble: 0, cup: -1 };
  }

  private describe(gate: number, targets: number[]): Advice {
    if (gate < 0) return { gate: -1, marble: 0, cup: -1 };
    // the marble the flip is for: the earliest one that needs this gate
    let marble = 0;
    let cup = -1;
    let bestEta = Infinity;
    this.fl.forEach((m, i) => {
      if (targets[i] < 0) return;
      const rest = this.remaining(targets[i], m.to)!;
      const k = rest.findIndex((s) => s.gate === gate);
      if (k < 0) return;
      const eta = this.etas(m, rest)[k];
      if (eta < bestEta) {
        bestEta = eta;
        marble = m.id;
        cup = targets[i];
      }
    });
    return { gate, marble, cup };
  }
}

export interface PlayResult {
  won: boolean;
  time: number;
  spills: number;
}

/** Plays a level to the end with the planning bot reacting every `think` seconds. */
export function playBot(level: LevelData, think: number, dt: number, maxTime = 300): PlayResult {
  const sim = new Sim(level);
  const plan = new Planner(sim);
  let next = 0.2;
  while (!sim.over && sim.time < maxTime) {
    if (sim.time >= next) {
      next += think;
      const a = plan.advise();
      if (a.gate >= 0) sim.tap(a.gate);
    }
    sim.update(dt);
    sim.events.length = 0;
  }
  return { won: sim.won, time: sim.time, spills: sim.spills };
}

/** Plays with the naive policy at a human-ish 0.4-0.75 s reaction. */
export function playNaive(level: LevelData, seed: number, maxTime = 300): PlayResult {
  const sim = new Sim(level);
  const plan = new Planner(sim);
  const rng = new Rng(seed * 7919 + 17);
  let next = 0.4;
  while (!sim.over && sim.time < maxTime) {
    if (sim.time >= next) {
      next += 0.4 + rng.float() * 0.35;
      const a = plan.naive();
      if (a.gate >= 0) sim.tap(a.gate);
    }
    sim.update(1 / 30);
    sim.events.length = 0;
  }
  return { won: sim.won, time: sim.time, spills: sim.spills };
}
