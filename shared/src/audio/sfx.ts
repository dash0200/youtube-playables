import { Playables } from '../sdk/playables';

export interface Tone {
  freq: number;
  /** Glide to this frequency over the tone's duration. */
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  /** Fade-in time in seconds (default 8 ms). Longer = softer onset. */
  attack?: number;
  /** 0..1 amount sent to the shared room reverb. */
  reverb?: number;
}

/** Band-filtered white noise: clicks, rattles, rustles, whooshes. */
export interface Noise {
  /** Filter centre frequency (Hz). */
  freq: number;
  /** Glide the filter to this frequency over the duration. */
  to?: number;
  dur: number;
  /** Filter resonance; higher = more pitched/tonal. */
  q?: number;
  type?: BiquadFilterType;
  gain?: number;
  delay?: number;
  attack?: number;
  reverb?: number;
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
  private reverbIn: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
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
      this.buildRoom(this.ctx, this.master);
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

  /** A small soft room (generated impulse response) plus a reusable noise buffer. */
  private buildRoom(ctx: AudioContext, out: GainNode): void {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * 1.4);
    const ir = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 4500;
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.5;
    this.reverbIn.connect(conv).connect(damp).connect(out);
    const nb = ctx.createBuffer(1, Math.floor(rate * 1.5), rate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
  }

  private gate(key?: string, minGapMs = 0): AudioContext | null {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled || this.paused) return null;
    if (key) {
      const now = performance.now();
      if (now - (this.lastPlay.get(key) ?? -1e9) < minGapMs) return null;
      this.lastPlay.set(key, now);
    }
    return ctx;
  }

  /** Envelope gain node routed to the master (and optionally the room). */
  private voice(ctx: AudioContext, start: number, dur: number, gain: number, attack: number, reverb: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + Math.min(attack, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    g.connect(this.master!);
    if (reverb > 0 && this.reverbIn) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      g.connect(send).connect(this.reverbIn);
    }
    return g;
  }

  /** Plays filtered-noise voices (same throttling as `play`). */
  noise(voices: Noise[], key?: string, minGapMs = 0): void {
    const ctx = this.gate(key, minGapMs);
    if (!ctx || !this.noiseBuf) return;
    const t0 = ctx.currentTime;
    for (const v of voices) {
      const start = t0 + (v.delay ?? 0);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = v.type ?? 'bandpass';
      f.Q.value = v.q ?? 1;
      f.frequency.setValueAtTime(v.freq, start);
      if (v.to) f.frequency.exponentialRampToValueAtTime(v.to, start + v.dur);
      src.connect(f).connect(this.voice(ctx, start, v.dur, v.gain ?? 0.2, v.attack ?? 0.002, v.reverb ?? 0));
      src.start(start, Math.random() * Math.max(0, this.noiseBuf.duration - v.dur - 0.06), v.dur + 0.05);
    }
  }

  /**
   * Plays a list of tones. `key` + `minGapMs` throttle rapid repeats
   * (e.g. dozens of beads landing in one frame).
   */
  play(tones: Tone[], key?: string, minGapMs = 0): void {
    const ctx = this.gate(key, minGapMs);
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (const t of tones) {
      const start = t0 + (t.delay ?? 0);
      const osc = ctx.createOscillator();
      osc.type = t.type ?? 'sine';
      osc.frequency.setValueAtTime(t.freq, start);
      if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
      osc.connect(this.voice(ctx, start, t.dur, t.gain ?? 0.3, t.attack ?? 0.008, t.reverb ?? 0));
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

  /** Soft glassy marble click (ASMR-style). `semitone` raises the pitch for streaks. */
  plink(semitone = 0): void {
    const f = 1046.5 * 2 ** (semitone / 12);
    this.play([
      { freq: f, dur: 0.09, type: 'sine', gain: 0.12 },
      { freq: f * 2.76, dur: 0.035, type: 'sine', gain: 0.03 },
    ], 'plink', 28);
  }

  /** Round bubbly pop. */
  bloop(): void {
    this.play([
      { freq: 170, to: 540, dur: 0.12, type: 'sine', gain: 0.3 },
      { freq: 950, to: 1500, dur: 0.05, type: 'sine', gain: 0.05, delay: 0.03 },
    ], 'bloop', 40);
  }

  /** Sparkly rising arpeggio for finishing a set. */
  shimmer(): void {
    const notes = [783.99, 987.77, 1174.66, 1567.98];
    this.play([
      ...notes.map((f, i) => ({ freq: f, dur: 0.5, type: 'sine' as const, gain: 0.12, delay: i * 0.05 })),
      ...notes.map((f, i) => ({ freq: f * 2, dur: 0.25, type: 'sine' as const, gain: 0.025, delay: i * 0.05 + 0.01 })),
    ]);
  }

  win(): void {
    this.play([523.25, 659.25, 783.99, 1046.5].map((f, i) => ({ freq: f, dur: 0.45, type: 'triangle' as const, gain: 0.22, delay: i * 0.11 })));
  }
}
