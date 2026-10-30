/**
 * High-Fidelity Procedural ASMR Sound Synthesizer & Binaural Audio Engine
 * Uses Web Audio API for zero-latency, zero-asset, dynamic procedural sounds.
 * Supports stereo binaural panning (left/right ear tingles), granular slicing,
 * silicone popping, viscous squishing, hydraulic crushing, and pentatonic crystal chimes.
 */

class ASMRAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.ambientGain = null;
    this.ambientNode = null;
    this.isMuted = false;
    this.volume = 0.85;
    this.ambientEnabled = false;
    this.initialized = false;

    // Pentatonic scale frequencies in Hz (C major pentatonic across octaves 4, 5, 6)
    this.chimePitches = [
      261.63, 293.66, 329.63, 392.00, 440.00, // C4, D4, E4, G4, A4
      523.25, 587.33, 659.25, 783.99, 880.00, // C5, D5, E5, G5, A5
      1046.50, 1174.66, 1318.51               // C6, D6, E6
    ];

    // Pre-create noise buffers for performance
    this.noiseBuffers = {};

    this._bindUserInteraction();
  }

  _bindUserInteraction() {
    const resumeAudio = () => {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    };

    window.addEventListener('pointerdown', resumeAudio, { once: true });
    window.addEventListener('keydown', resumeAudio, { once: true });
    window.addEventListener('touchstart', resumeAudio, { once: true });
  }

  init() {
    if (this.initialized) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn('Web Audio API not supported in this browser.');
        return;
      }

      this.ctx = new AudioCtx();

      // Master Dynamics Compressor: softens sharp transients, guarantees warm, velvety ASMR ear-feel
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(24, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

      // Connect Master chain -> Destination
      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Generate reusable white and pink noise buffers
      this._generateNoiseBuffers();

      // Setup ambient background channel
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.ambientGain.connect(this.compressor);

      this.initialized = true;
      console.log('[ASMR Audio] Web Audio Engine initialized.');
    } catch (e) {
      console.warn('[ASMR Audio] Initialization failed:', e);
    }
  }

  _generateNoiseBuffers() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const bufferLength = sampleRate * 2; // 2 seconds loop

    // 1. White Noise Buffer
    const whiteBuffer = this.ctx.createBuffer(1, bufferLength, sampleRate);
    const whiteData = whiteBuffer.getChannelData(0);
    for (let i = 0; i < bufferLength; i++) {
      whiteData[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffers.white = whiteBuffer;

    // 2. Pink Noise Buffer (Paul Kellet's filtered pink noise algorithm for velvety sand/rain)
    const pinkBuffer = this.ctx.createBuffer(1, bufferLength, sampleRate);
    const pinkData = pinkBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferLength; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    this.noiseBuffers.pink = pinkBuffer;
  }

  /**
   * Calculates stereo panning [-1.0 ... 1.0] from screen X coordinate
   */
  getPanning(screenX) {
    if (typeof screenX !== 'number') return 0;
    const width = window.innerWidth || 800;
    const norm = (screenX / width) * 2 - 1;
    return Math.max(-0.95, Math.min(0.95, norm));
  }

  /**
   * Helper to create a panned gain node connected to the compressor
   */
  _createPannedChannel(pan = 0) {
    if (!this.ctx) return null;
    let panner;
    if (this.ctx.createStereoPanner) {
      panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, this.ctx.currentTime);
    } else {
      // Fallback for older WebKit
      panner = this.ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.setPosition(pan, 0, 1 - Math.abs(pan));
    }

    const gain = this.ctx.createGain();
    gain.connect(panner);
    panner.connect(this.compressor);
    return { gain, panner };
  }

  // ==========================================
  // STATION 1: KINETIC SAND / SOAP SLICE SOUND
  // ==========================================
  playSliceSound(screenX, speed = 1.0, materialType = 'sand') {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;
    const pan = this.getPanning(screenX);
    const channel = this._createPannedChannel(pan);
    if (!channel) return;

    // Granular burst using filtered pink/white noise
    const bufferSource = this.ctx.createBufferSource();
    bufferSource.buffer = materialType === 'soap' ? this.noiseBuffers.white : this.noiseBuffers.pink;
    bufferSource.loop = false;

    // Dual Bandpass filter for tactile crispy resonance
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';

    // Different frequency profiles for materials
    const baseFreq = materialType === 'soap' ? 2600 : 1850;
    const centerFreq = Math.min(5500, Math.max(900, baseFreq * (0.8 + speed * 0.35)));
    filter.frequency.setValueAtTime(centerFreq, now);
    filter.Q.setValueAtTime(materialType === 'soap' ? 4.5 : 2.5, now);

    // Filter frequency sweep slightly downwards to mimic knife cutting through layer
    filter.frequency.exponentialRampToValueAtTime(centerFreq * 0.85, now + 0.08);

    // Fast crispy micro-envelope
    const duration = 0.045 + Math.random() * 0.035;
    channel.gain.gain.setValueAtTime(0.001, now);
    channel.gain.gain.linearRampToValueAtTime(0.55 * Math.min(1.2, speed * 0.7), now + 0.006);
    channel.gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    bufferSource.connect(filter);
    filter.connect(channel.gain);

    bufferSource.start(now);
    bufferSource.stop(now + duration + 0.01);

    // Micro subtle sub-click for blade resistance
    this._playSubClick(now, pan, materialType === 'soap' ? 380 : 220);
  }

  _playSubClick(now, pan, freq) {
    const channel = this._createPannedChannel(pan);
    if (!channel) return;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + 0.03);

    channel.gain.gain.setValueAtTime(0.2, now);
    channel.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(channel.gain);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  // ==========================================
  // STATION 2: VISCOUS SLIME & JELLY SQUISH
  // ==========================================
  playSquishSound(screenX, intensity = 1.0, isRelease = false) {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;
    const pan = this.getPanning(screenX);
    const channel = this._createPannedChannel(pan);
    if (!channel) return;

    // Carrier oscillator + Modulator (FM synthesis for wet rubbery squish)
    const carrier = this.ctx.createOscillator();
    const modulator = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();

    carrier.type = 'sine';
    modulator.type = 'sine';

    // Frequencies: pitch glide down or upward 'plop'
    const startFreq = isRelease ? 220 : 160 + Math.random() * 60;
    const endFreq = isRelease ? 340 : 90 + Math.random() * 30;

    carrier.frequency.setValueAtTime(startFreq, now);
    carrier.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);

    modulator.frequency.setValueAtTime(65 + Math.random() * 40, now);
    modGain.gain.setValueAtTime(140 * intensity, now);
    modGain.gain.exponentialRampToValueAtTime(10, now + 0.12);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    // Low-pass filter for soft squishy warmth
    const lpFilter = this.ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.setValueAtTime(isRelease ? 2400 : 1600, now);
    lpFilter.frequency.exponentialRampToValueAtTime(400, now + 0.14);

    const dur = 0.14;
    channel.gain.gain.setValueAtTime(0.001, now);
    channel.gain.gain.linearRampToValueAtTime(0.45 * intensity, now + 0.015);
    channel.gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    carrier.connect(lpFilter);
    lpFilter.connect(channel.gain);

    carrier.start(now);
    modulator.start(now);
    carrier.stop(now + dur + 0.02);
    modulator.stop(now + dur + 0.02);

    // Wet bubble pop burst
    if (Math.random() > 0.4 || isRelease) {
      this._playSlimeBubble(now + 0.02, pan);
    }
  }

  _playSlimeBubble(now, pan) {
    const channel = this._createPannedChannel(pan);
    if (!channel) return;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const popPitch = 400 + Math.random() * 450;
    osc.frequency.setValueAtTime(popPitch, now);
    osc.frequency.exponentialRampToValueAtTime(popPitch * 1.8, now + 0.04);

    channel.gain.gain.setValueAtTime(0.2, now);
    channel.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(channel.gain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  // ==========================================
  // STATION 3: SILICONE POP-IT & BUBBLE WRAP
  // ==========================================
  playPopSound(screenX, pitchIndex = 0, isPoppingIn = true) {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;
    const pan = this.getPanning(screenX);
    const channel = this._createPannedChannel(pan);
    if (!channel) return;

    // Deep sub thump (satisfying tactile bass)
    const baseFreq = isPoppingIn ? 140 : 170;
    const pitchOffset = (pitchIndex % 7) * 12; // Slight melodic variation per bubble
    const startPitch = baseFreq + pitchOffset;

    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(startPitch * 2.2, now);
    subOsc.frequency.exponentialRampToValueAtTime(startPitch * 0.6, now + 0.065);

    // Crisp tactile snap (bandpassed click)
    const snapOsc = this.ctx.createOscillator();
    snapOsc.type = 'triangle';
    snapOsc.frequency.setValueAtTime(1400 + pitchOffset * 10, now);
    snapOsc.frequency.exponentialRampToValueAtTime(400, now + 0.035);

    const snapGain = this.ctx.createGain();
    snapGain.gain.setValueAtTime(0.35, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    snapOsc.connect(snapGain);
    snapGain.connect(channel.gain);

    // Envelope
    channel.gain.gain.setValueAtTime(0.001, now);
    channel.gain.gain.linearRampToValueAtTime(0.65, now + 0.004);
    channel.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    subOsc.connect(channel.gain);

    subOsc.start(now);
    snapOsc.start(now);
    subOsc.stop(now + 0.095);
    snapOsc.stop(now + 0.04);
  }

  // ==========================================
  // STATION 4: HYDRAULIC PRESS CRUSHER
  // ==========================================
  playCrushStrain(screenX, strainProgress = 0.5) {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;
    const pan = this.getPanning(screenX);
    const channel = this._createPannedChannel(pan);
    if (!channel) return;

    // Low hydraulic motor hum + groaning friction
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55 + strainProgress * 35, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120 + strainProgress * 150, now);

    channel.gain.gain.setValueAtTime(0.01, now);
    channel.gain.gain.linearRampToValueAtTime(0.25 * strainProgress, now + 0.08);
    channel.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(filter);
    filter.connect(channel.gain);

    osc.start(now);
    osc.stop(now + 0.19);

    // Crackle ticks
    if (Math.random() < strainProgress * 0.8) {
      this._playCrushCrackle(now + 0.02, pan);
    }
  }

  _playCrushCrackle(now, pan) {
    const channel = this._createPannedChannel(pan);
    if (!channel) return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffers.white;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200 + Math.random() * 2000, now);
    filter.Q.setValueAtTime(6.0, now);

    channel.gain.gain.setValueAtTime(0.3, now);
    channel.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    source.connect(filter);
    filter.connect(channel.gain);

    source.start(now);
    source.stop(now + 0.03);
  }

  playCrushExplosion(screenX) {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;
    const pan = this.getPanning(screenX);
    const channel = this._createPannedChannel(pan);
    if (!channel) return;

    // 1. Massive sub-thump bass impact
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(95, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.35);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.7, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    subOsc.connect(subGain);
    subGain.connect(channel.gain);

    // 2. High crunch fracture burst (powder & glass shatter)
    const crunchSource = this.ctx.createBufferSource();
    crunchSource.buffer = this.noiseBuffers.pink;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2800, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + 0.28);
    filter.Q.setValueAtTime(1.8, now);

    const crunchGain = this.ctx.createGain();
    crunchGain.gain.setValueAtTime(0.65, now);
    crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    crunchSource.connect(filter);
    filter.connect(crunchGain);
    crunchGain.connect(channel.gain);

    // 3. Resonant crystal chime sparkle
    const bellOsc = this.ctx.createOscillator();
    bellOsc.type = 'sine';
    bellOsc.frequency.setValueAtTime(1244.5, now); // D#6
    bellOsc.frequency.exponentialRampToValueAtTime(1200, now + 0.4);

    const bellGain = this.ctx.createGain();
    bellGain.gain.setValueAtTime(0.2, now);
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    bellOsc.connect(bellGain);
    bellGain.connect(channel.gain);

    channel.gain.gain.setValueAtTime(0.9, now);

    subOsc.start(now);
    crunchSource.start(now);
    bellOsc.start(now);

    subOsc.stop(now + 0.36);
    crunchSource.stop(now + 0.3);
    bellOsc.stop(now + 0.46);
  }

  // ==========================================
  // STATION 5: ZEN PENTATONIC CRYSTAL CHIMES
  // ==========================================
  playChime(noteIndex = 0, screenX = null) {
    if (!this.initialized || this.isMuted) return;
    const now = this.ctx.currentTime;
    const pan = screenX !== null ? this.getPanning(screenX) : ((noteIndex % 5) - 2) * 0.35;
    const channel = this._createPannedChannel(pan);
    if (!channel) return;

    const basePitch = this.chimePitches[noteIndex % this.chimePitches.length];

    // Crystal Bell acoustic partials: Fundamental (1.0x), Harmonic 2 (2.756x), Harmonic 3 (5.404x)
    const partials = [
      { ratio: 1.0, amp: 0.55, decay: 1.4 },
      { ratio: 2.756, amp: 0.25, decay: 0.8 },
      { ratio: 5.404, amp: 0.12, decay: 0.45 }
    ];

    partials.forEach(({ ratio, amp, decay }) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(basePitch * ratio, now);

      const partGain = this.ctx.createGain();
      partGain.gain.setValueAtTime(0.001, now);
      partGain.gain.linearRampToValueAtTime(amp, now + 0.004);
      partGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

      osc.connect(partGain);
      partGain.connect(channel.gain);

      osc.start(now);
      osc.stop(now + decay + 0.05);
    });

    // Gentle tactile strike click (wood/mallet hit)
    const strike = this.ctx.createOscillator();
    strike.type = 'triangle';
    strike.frequency.setValueAtTime(900, now);
    strike.frequency.exponentialRampToValueAtTime(250, now + 0.02);

    const strikeGain = this.ctx.createGain();
    strikeGain.gain.setValueAtTime(0.18, now);
    strikeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    strike.connect(strikeGain);
    strikeGain.connect(channel.gain);

    strike.start(now);
    strike.stop(now + 0.03);
  }

  // ==========================================
  // AMBIENT BACKGROUND SOUNDSCAPE (Warm Rain / Zen Drone)
  // ==========================================
  toggleAmbient(enable) {
    if (enable === undefined) {
      this.ambientEnabled = !this.ambientEnabled;
    } else {
      this.ambientEnabled = enable;
    }

    if (!this.initialized) return this.ambientEnabled;

    const now = this.ctx.currentTime;
    if (this.ambientEnabled) {
      this._startAmbientRain();
      this.ambientGain.gain.linearRampToValueAtTime(0.22, now + 1.5);
    } else {
      this.ambientGain.gain.linearRampToValueAtTime(0.0001, now + 0.8);
      setTimeout(() => {
        if (!this.ambientEnabled && this.ambientNode) {
          try { this.ambientNode.stop(); } catch(e) {}
          this.ambientNode = null;
        }
      }, 900);
    }

    return this.ambientEnabled;
  }

  _startAmbientRain() {
    if (this.ambientNode) return;
    if (!this.noiseBuffers.pink) return;

    // Pink noise through smooth low-pass & gentle resonant band to sound like gentle warm summer rain
    const rainSource = this.ctx.createBufferSource();
    rainSource.buffer = this.noiseBuffers.pink;
    rainSource.loop = true;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(850, this.ctx.currentTime);

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.setValueAtTime(420, this.ctx.currentTime);
    bp.gain.setValueAtTime(3.5, this.ctx.currentTime);

    rainSource.connect(lp);
    lp.connect(bp);
    bp.connect(this.ambientGain);

    rainSource.start();
    this.ambientNode = rainSource;
  }

  // ==========================================
  // SYSTEM & YOUTUBE INTEGRATION CONTROLS
  // ==========================================
  setMuted(muted) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(this.isMuted ? 0 : this.volume, now + 0.05);
    }
  }

  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }
}

window.audioEngine = new ASMRAudioEngine();

