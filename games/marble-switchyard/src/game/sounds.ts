import type { Sfx, Tone } from '@shared/audio/sfx';

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** Major pentatonic (C D E G A) over two octaves, in Hz. */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

/**
 * ASMR-style marble sounds, all procedural: a soft drop from the hopper, glassy
 * clacks over gates, a wooden flipper click, glass "plinks" that climb as a cup
 * fills, a dull thunk for a spill, and gentle kalimba chimes.
 */
export class MarbleSounds {
  constructor(private readonly sfx: Sfx) {}

  /** A marble leaves the hopper. */
  drop(): void {
    this.sfx.noise([{ freq: 700, q: 2, dur: 0.06, gain: 0.05 }], 'drop', 60);
    this.sfx.play([{ freq: 330, to: 250, dur: 0.08, gain: 0.06, attack: 0.003 }], 'drop-t', 60);
  }

  /** A marble rolls over a gate: a small glassy clack. */
  pass(): void {
    this.sfx.noise([
      { freq: rnd(2600, 3600), q: rnd(5, 9), dur: 0.025, gain: 0.08 },
      { freq: rnd(5000, 6500), q: 8, dur: 0.015, gain: 0.04, delay: rnd(0.008, 0.018) },
    ], 'pass', 30);
  }

  /** The player flips a gate: a wooden click. */
  flip(): void {
    this.sfx.noise([{ freq: 1500, q: 3, dur: 0.035, gain: 0.12 }], 'flip', 25);
    this.sfx.play([{ freq: 420, to: 300, dur: 0.05, gain: 0.08, attack: 0.002 }], 'flip-t', 25);
  }

  /** A marble lands in its cup: a glass plink that climbs as the cup fills. */
  cup(count: number, cap: number): void {
    const f = PENTA[Math.min(PENTA.length - 1, Math.round((count / cap) * 6) + 1)];
    this.sfx.play([
      { freq: f, dur: 0.22, gain: 0.11, attack: 0.002, reverb: 0.25 },
      { freq: f * 2.76, dur: 0.05, gain: 0.03, attack: 0.002 },
    ], 'cup', 25);
    this.sfx.noise([{ freq: rnd(3000, 4500), q: 6, dur: 0.02, gain: 0.06 }], 'cup-n', 25);
  }

  /** A cup is full: a kalimba chord. */
  full(): void {
    this.sfx.play([0, 2, 4].flatMap((k) => kalimba(PENTA[k + 2], k * 0.06, 0.08)));
  }

  /** Wrong cup: a dull thunk and a little roll back. */
  spill(): void {
    this.sfx.play([{ freq: 150, to: 95, dur: 0.16, gain: 0.18, attack: 0.003 }], 'spill', 80);
    this.sfx.noise([{ freq: 500, to: 1200, q: 1.5, dur: 0.35, gain: 0.04, attack: 0.05 }], 'spill-n', 80);
  }

  lose(): void {
    this.sfx.play([392, 329.63, 261.63].map((f, i) => ({ freq: f, dur: 0.4, gain: 0.08, delay: i * 0.12, attack: 0.01, reverb: 0.4 })));
  }

  win(): void {
    const run = [0, 1, 2, 3, 4, 5].flatMap((k) => kalimba(PENTA[k], k * 0.08, 0.075));
    const chord = [523.25, 659.25, 783.99, 1046.5].map((f) => ({ freq: f, dur: 1.6, gain: 0.05, delay: 0.55, attack: 0.02, reverb: 0.6 }));
    this.sfx.play([...run, ...chord]);
  }
}

function kalimba(freq: number, delay: number, gain: number): Tone[] {
  return [
    { freq, dur: 0.9, gain, delay, attack: 0.003, reverb: 0.5 },
    { freq: freq * 3.01, dur: 0.12, gain: gain * 0.22, delay, attack: 0.002, reverb: 0.3 },
  ];
}
