import { Playables } from '../sdk/playables';

export interface Tone {
  freq: number;
  /** Glide to this frequency over the tone's duration. */
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

/**
 * Procedural sound effects with WebAudio (no audio files to download).
 *
 * Playables rules handled here:
 *  - Output is silenced whenever YouTube audio is disabled (isAudioEnabled /
 *    onAudioEnabledChange). `volume` is a granular SFX volume, not a master mute.
 *  - pause()/resume() suspend the AudioContext (call them from onPause/onResume).
 *  - Browsers only start audio after a user gesture: call unlock() on the first tap.
 */
export class Sfx {
  volume = 0.55;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = Playables.isAudioEnabled();
  private paused = false;
  private lastPlay = new Map<string, number>();

  constructor() {
    Playables.onAudioEnabledChange((on) => {
      this.enabled = on;
      this.apply();
    });
  }

  unlock(): void {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.apply();
    }
    if (this.ctx.state === 'suspended' && !this.paused) void this.ctx.resume();
  }

  pause(): void {
    this.paused = true;
    void this.ctx?.suspend();
  }

  resume(): void {
    this.paused = false;
    if (this.ctx && this.enabled) void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.apply();
  }

  private apply(): void {
    if (this.master) this.master.gain.value = this.enabled ? this.volume : 0;
  }

  /**
   * Plays a list of tones. `key` + `minGapMs` throttle rapid repeats
   * (e.g. dozens of beads landing in one frame).
   */
  play(tones: Tone[], key?: string, minGapMs = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled || this.paused) return;
    if (key) {
      const now = performance.now();
      if (now - (this.lastPlay.get(key) ?? -1e9) < minGapMs) return;
      this.lastPlay.set(key, now);
    }
    const t0 = ctx.currentTime;
    for (const t of tones) {
      const start = t0 + (t.delay ?? 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = t.type ?? 'sine';
      osc.frequency.setValueAtTime(t.freq, start);
      if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(t.gain ?? 0.3, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
      osc.connect(g).connect(this.master);
      osc.start(start);
      osc.stop(start + t.dur + 0.02);
    }
  }

  // ---- Common presets shared by all games ----
  click(): void {
    this.play([{ freq: 640, to: 900, dur: 0.07, type: 'triangle', gain: 0.22 }], 'click', 40);
  }

  pop(): void {
    this.play([
      { freq: 260, to: 720, dur: 0.1, type: 'sine', gain: 0.35 },
      { freq: 1200, to: 1800, dur: 0.05, type: 'triangle', gain: 0.08 },
    ], 'pop', 30);
  }

  tick(semitone = 0): void {
    const f = 880 * 2 ** (semitone / 12);
    this.play([{ freq: f, to: f * 1.05, dur: 0.05, type: 'triangle', gain: 0.12 }], 'tick', 35);
  }

  deny(): void {
    this.play([{ freq: 190, to: 120, dur: 0.14, type: 'square', gain: 0.08 }], 'deny', 80);
  }

  chime(): void {
    this.play([523.25, 659.25, 783.99].map((f, i) => ({ freq: f, dur: 0.3, type: 'sine' as const, gain: 0.22, delay: i * 0.06 })));
  }

  win(): void {
    this.play([523.25, 659.25, 783.99, 1046.5].map((f, i) => ({ freq: f, dur: 0.45, type: 'triangle' as const, gain: 0.22, delay: i * 0.11 })));
  }
}
