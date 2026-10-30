import type { Noise, Sfx, Tone } from '@shared/audio/sfx';

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** Major pentatonic (C D E G A) across two octaves, in Hz. */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

/**
 * ASMR-style bead sounds, all procedural (no audio files): tiny plastic grains
 * ticking as they land, pouring out with a soft rustle, settling into a block
 * with a round "plop", and gentle kalimba-like chimes in a small room.
 * Every grain tick is randomised in pitch, length and timing, so streams sound
 * organic instead of machine-gunned.
 */
export class BeadSounds {
  constructor(private readonly sfx: Sfx) {}

  /** A bead lands in a tube; a streak of landings brightens slightly. */
  land(streak: number): void {
    const lift = Math.min(streak, 30) * 45;
    const ticks = 2 + (Math.random() < 0.5 ? 1 : 0);
    const v: Noise[] = [{ freq: rnd(900, 1300), q: 2.5, dur: 0.04, gain: 0.035 }];
    for (let i = 0; i < ticks; i++) {
      v.push({ freq: rnd(3200, 5200) + lift, q: rnd(6, 11), dur: rnd(0.016, 0.03), gain: rnd(0.06, 0.11), delay: i * rnd(0.005, 0.016) });
    }
    this.sfx.noise(v, 'land', 22);
  }

  /** Tap: a soft press, then `count` beads pour out of the tube as a rustling spill. */
  pour(count: number): void {
    const n = Math.min(30, 8 + Math.round(count * 0.8));
    const dur = Math.min(0.55, 0.18 + count * 0.012);
    const v: Noise[] = [{ freq: 2200, to: 900, q: 0.7, dur, gain: 0.045, attack: 0.05 }];
    for (let i = 0; i < n; i++) {
      const at = (i / n) ** 0.8 * dur;
      v.push({ freq: rnd(2600, 6500), q: rnd(5, 12), dur: rnd(0.012, 0.025), gain: rnd(0.04, 0.085) * (1 - (0.4 * i) / n), delay: at + rnd(0, 0.01) });
    }
    this.sfx.noise(v, 'pour', 60);
    this.sfx.play([{ freq: 520, to: 360, dur: 0.07, gain: 0.07, attack: 0.003 }], 'press', 60);
  }

  /** Nine beads fill a cell and melt into a block: a soft, round plop. */
  melt(): void {
    this.sfx.play([
      { freq: 250, to: 150, dur: 0.18, gain: 0.15, attack: 0.004 },
      { freq: 760, to: 470, dur: 0.07, gain: 0.03, attack: 0.003 },
    ], 'melt', 50);
    this.sfx.noise([{ freq: 650, q: 2, dur: 0.05, gain: 0.04 }], 'melt-n', 50);
  }

  /** Tap refused: a muffled wooden knock rather than a buzzer. */
  deny(): void {
    this.sfx.play([{ freq: 150, to: 105, dur: 0.1, gain: 0.16, attack: 0.003 }], 'deny', 90);
    this.sfx.noise([{ freq: 420, q: 1.5, dur: 0.05, gain: 0.05 }], 'deny-n', 90);
  }

  /** A hint switches on: two soft rising tines. */
  hint(): void {
    this.sfx.play([...kalimba(PENTA[3], 0, 0.07), ...kalimba(PENTA[5], 0.09, 0.07)]);
  }

  /** A tube is finished: a kalimba-like arpeggio that climbs with each finished tube. */
  complete(done: number): void {
    const root = Math.min(done, 5);
    const notes = [0, 2, 4].map((k) => PENTA[Math.min(root + k, PENTA.length - 1)]);
    this.sfx.play(notes.flatMap((f, k) => kalimba(f, k * 0.075, 0.09)));
  }

  /** Level cleared: a rising pentatonic run that settles on a soft chord. */
  win(): void {
    const run = [0, 1, 2, 3, 4, 5].flatMap((k) => kalimba(PENTA[k], k * 0.08, 0.075));
    const chord = [523.25, 659.25, 783.99, 1046.5].map((f) => ({ freq: f, dur: 1.6, gain: 0.05, delay: 0.55, attack: 0.02, reverb: 0.6 }));
    this.sfx.play([...run, ...chord]);
  }
}

/** One plucked tine: warm fundamental plus a short bright overtone, sent to the room. */
function kalimba(freq: number, delay: number, gain: number): Tone[] {
  return [
    { freq, dur: 0.9, gain, delay, attack: 0.003, reverb: 0.5 },
    { freq: freq * 3.01, dur: 0.12, gain: gain * 0.22, delay, attack: 0.002, reverb: 0.3 },
  ];
}
