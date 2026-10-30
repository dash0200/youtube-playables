/**
 * Main Game Controller & Orchestrator
 * Coordinates ASMR stations, canvas lifecycle, touch/mouse input parity,
 * satisfaction progression, and YouTube Playables SDK integration.
 */

class ASMRZenLabGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.currentStationIndex = 0;
    this.stations = [];
    this.activeStation = null;

    // Progression & Stats
    this.tingleScore = 0;
    this.level = 1;
    this.ranks = [
      'Zen Beginner',
      'Gentle Tingler',
      'Whisper Seeker',
      'Sensory Crafter',
      'ASMR Master',
      'Infinite Serenity'
    ];

    this.isPaused = false;
    this.lastFrameTime = performance.now();

    this.init();
  }

  async init() {
    // Notify YouTube Playables of initial frame render
    if (window.ytSDK) {
      window.ytSDK.firstFrameReady();
    }

    // Resize canvas to match display resolution
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Initialize Stations
    this.stations = [
      new SandSlicerStation(this.canvas),
      new SlimeJellyStation(this.canvas),
      new PopItStation(this.canvas),
      new HydraulicPressStation(this.canvas),
      new ZenChimesStation(this.canvas)
    ];

    this.switchStation(0);

    // Bind Pointer & Touch Inputs
    this.bindInputs();

    // Bind UI Buttons
    this.bindUI();

    // Setup YouTube Playables Hooks
    this.setupYTHooks();

    // Load saved progression
    await this.loadProgression();

    // Mark Game as fully ready for YouTube Playables
    if (window.ytSDK) {
      window.ytSDK.gameReady();
    }

    // Start RAF Render Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  resizeCanvas() {
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5); // Cap to 2.5 for mobile GPU balance

    // Keep logical width/height on canvas object for stations
    this.canvas.logicalWidth = rect.width;
    this.canvas.logicalHeight = rect.height;

    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);

    // Rescale 2D context to CSS logical pixels
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Inform active station of canvas dimension changes if needed
    if (this.activeStation && typeof this.activeStation.initGrid === 'function') {
      this.activeStation.initGrid();
    } else if (this.activeStation && typeof this.activeStation.initSlime === 'function') {
      this.activeStation.initSlime();
    } else if (this.activeStation && typeof this.activeStation.initBoard === 'function') {
      this.activeStation.initBoard();
    } else if (this.activeStation && typeof this.activeStation.initChimes === 'function') {
      this.activeStation.initChimes();
    }
  }

  switchStation(index) {
    this.currentStationIndex = index % this.stations.length;
    this.activeStation = this.stations[this.currentStationIndex];

    // Update Station Navigation Pills
    document.querySelectorAll('.station-tab').forEach((tab, i) => {
      if (i === this.currentStationIndex) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Update Variant / Action button label
    this.updateControlsUI();
  }

  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  bindInputs() {
    const canvas = this.canvas;

    const onDown = (e) => {
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      const p = this.getPointerPos(e);
      if (this.activeStation && this.activeStation.onPointerDown) {
        this.activeStation.onPointerDown(p.x, p.y);
      }
      this.addTinglePoints(3);
    };

    const onMove = (e) => {
      e.preventDefault();
      const p = this.getPointerPos(e);
      if (this.activeStation && this.activeStation.onPointerMove) {
        this.activeStation.onPointerMove(p.x, p.y);
      }
    };

    const onUp = (e) => {
      e.preventDefault();
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) {}
      const p = this.getPointerPos(e);
      if (this.activeStation && this.activeStation.onPointerUp) {
        this.activeStation.onPointerUp(p.x, p.y);
      }
      this.saveProgression();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    // Prevent touch scrolling gestures over canvas
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  bindUI() {
    // Station switcher tabs
    document.querySelectorAll('.station-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const idx = parseInt(tab.dataset.station, 10);
        this.switchStation(idx);
        if (window.audioEngine) {
          window.audioEngine.playPopSound(window.innerWidth / 2, 3, false);
        }
      });
    });

    // Variant / Style toggle button
    const btnVariant = document.getElementById('btn-variant');
    if (btnVariant) {
      btnVariant.addEventListener('click', () => {
        if (this.activeStation) {
          if (this.activeStation.nextTheme) this.activeStation.nextTheme();
          else if (this.activeStation.nextMode) this.activeStation.nextMode();
          else if (this.activeStation.nextItem) this.activeStation.nextItem();
          else if (this.activeStation.toggleAutoDrop) {
            const state = this.activeStation.toggleAutoDrop();
            btnVariant.textContent = state ? 'Auto Drop: ON' : 'Auto Drop: OFF';
          }
        }
        if (window.audioEngine) {
          window.audioEngine.playPopSound(window.innerWidth / 2, 2, false);
        }
      });
    }

    // Reset button
    const btnReset = document.getElementById('btn-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (this.activeStation && this.activeStation.reset) {
          this.activeStation.reset();
        }
        if (window.audioEngine) {
          window.audioEngine.playPopSound(window.innerWidth / 2, 0, false);
        }
      });
    }

    // Audio Mute toggle
    const btnMute = document.getElementById('btn-mute');
    if (btnMute) {
      btnMute.addEventListener('click', () => {
        if (window.audioEngine) {
          const isMuted = window.audioEngine.toggleMute();
          btnMute.textContent = isMuted ? '🔇' : '🔊';
          btnMute.classList.toggle('muted', isMuted);
        }
      });
    }

    // Ambient Rain toggle
    const btnAmbient = document.getElementById('btn-ambient');
    if (btnAmbient) {
      btnAmbient.addEventListener('click', () => {
        if (window.audioEngine) {
          const active = window.audioEngine.toggleAmbient();
          btnAmbient.classList.toggle('active', active);
        }
      });
    }
  }

  updateControlsUI() {
    const btnVariant = document.getElementById('btn-variant');
    if (!btnVariant) return;

    if (this.currentStationIndex === 0) {
      btnVariant.textContent = '🎨 Change Sand/Soap';
    } else if (this.currentStationIndex === 1) {
      btnVariant.textContent = '🍓 Change Slime';
    } else if (this.currentStationIndex === 2) {
      btnVariant.textContent = '💖 Change Shape';
    } else if (this.currentStationIndex === 3) {
      btnVariant.textContent = '💥 Change Item';
    } else if (this.currentStationIndex === 4) {
      btnVariant.textContent = '💧 Auto Marbles: ON';
    }
  }

  addTinglePoints(pts) {
    this.tingleScore += pts;
    const requiredForNext = this.level * 180;

    if (this.tingleScore >= requiredForNext) {
      this.tingleScore -= requiredForNext;
      this.level++;
      if (window.audioEngine) {
        window.audioEngine.playChime(4, window.innerWidth / 2);
      }
    }

    this.updateProgressionUI();
  }

  updateProgressionUI() {
    const bar = document.getElementById('tingle-progress');
    const levelLabel = document.getElementById('tingle-rank');
    if (bar) {
      const required = this.level * 180;
      const pct = Math.min(100, Math.floor((this.tingleScore / required) * 100));
      bar.style.width = `${pct}%`;
    }
    if (levelLabel) {
      const rankIdx = Math.min(this.ranks.length - 1, this.level - 1);
      levelLabel.textContent = `Lv.${this.level} ${this.ranks[rankIdx]}`;
    }
  }

  async loadProgression() {
    if (window.ytSDK) {
      const data = await window.ytSDK.loadData();
      if (data) {
        this.tingleScore = data.tingleScore || 0;
        this.level = data.level || 1;
        this.updateProgressionUI();
      }
    }
  }

  async saveProgression() {
    if (window.ytSDK) {
      await window.ytSDK.saveData({
        tingleScore: this.tingleScore,
        level: this.level
      });
    }
  }

  setupYTHooks() {
    if (!window.ytSDK) return;

    // Synchronize mute status when YouTube master audio changes
    window.ytSDK.onAudioEnabledChange((enabled) => {
      if (window.audioEngine) {
        window.audioEngine.setMuted(!enabled);
      }
      const btnMute = document.getElementById('btn-mute');
      if (btnMute) {
        btnMute.textContent = enabled ? '🔊' : '🔇';
        btnMute.classList.toggle('muted', !enabled);
      }
    });

    // YouTube Pause & Resume
    window.ytSDK.onPause(() => {
      this.isPaused = true;
      if (window.audioEngine) {
        window.audioEngine.setMuted(true);
      }
    });

    window.ytSDK.onResume(() => {
      this.isPaused = false;
      if (window.audioEngine && !window.ytSDK.isMuted) {
        window.audioEngine.setMuted(false);
      }
    });
  }

  loop(currentTime) {
    requestAnimationFrame((t) => this.loop(t));

    if (this.isPaused) return;

    if (this.activeStation) {
      this.activeStation.update();
      this.activeStation.draw();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new ASMRZenLabGame();
});
