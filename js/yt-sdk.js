/**
 * YouTube Playables SDK Wrapper & Adapter
 * Handles platform lifecycle, audio sync, cloud saves, and pause/resume.
 * Works seamlessly in both live YouTube Playables environment and local standalone testing.
 */

class YouTubePlayablesSDK {
  constructor() {
    this.isInPlayables = false;
    this.isMuted = false;
    this.isPaused = false;
    this.onAudioChangeCallbacks = [];
    this.onPauseCallbacks = [];
    this.onResumeCallbacks = [];

    this._initSDK();
  }

  _initSDK() {
    // Check if YouTube Playables SDK is loaded
    if (typeof window.ytgame !== 'undefined') {
      this.isInPlayables = true;
      console.log('[YT Playables] Running inside YouTube Playables environment.');

      // Check initial audio state
      if (window.ytgame.system && typeof window.ytgame.system.isAudioEnabled === 'function') {
        this.isMuted = !window.ytgame.system.isAudioEnabled();
      }

      // Hook audio change listener
      if (window.ytgame.system && typeof window.ytgame.system.onAudioEnabledChange === 'function') {
        window.ytgame.system.onAudioEnabledChange((enabled) => {
          this.isMuted = !enabled;
          console.log(`[YT Playables] Audio state changed: ${enabled ? 'Enabled' : 'Muted'}`);
          this.onAudioChangeCallbacks.forEach((cb) => cb(!this.isMuted));
        });
      }

      // Hook pause & resume
      if (window.ytgame.system && typeof window.ytgame.system.onPause === 'function') {
        window.ytgame.system.onPause(() => {
          this.isPaused = true;
          console.log('[YT Playables] Game Paused');
          this.onPauseCallbacks.forEach((cb) => cb());
        });
      }

      if (window.ytgame.system && typeof window.ytgame.system.onResume === 'function') {
        window.ytgame.system.onResume(() => {
          this.isPaused = false;
          console.log('[YT Playables] Game Resumed');
          this.onResumeCallbacks.forEach((cb) => cb());
        });
      }
    } else {
      console.log('[YT Playables] Standalone mode (simulating YouTube Playables environment).');
      this.isInPlayables = false;
      this.isMuted = false;
      
      // Page visibility fallback for pause/resume in standalone
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.isPaused = true;
          this.onPauseCallbacks.forEach((cb) => cb());
        } else {
          this.isPaused = false;
          this.onResumeCallbacks.forEach((cb) => cb());
        }
      });
    }
  }

  /**
   * Must be called as soon as initial loading / splash screen renders.
   */
  firstFrameReady() {
    if (this.isInPlayables && window.ytgame.game && typeof window.ytgame.game.firstFrameReady === 'function') {
      window.ytgame.game.firstFrameReady();
      console.log('[YT Playables] firstFrameReady() dispatched.');
    } else {
      console.log('[YT Playables Mock] firstFrameReady()');
    }
  }

  /**
   * Must be called when game loading is complete and user can interact.
   */
  gameReady() {
    if (this.isInPlayables && window.ytgame.game && typeof window.ytgame.game.gameReady === 'function') {
      window.ytgame.game.gameReady();
      console.log('[YT Playables] gameReady() dispatched.');
    } else {
      console.log('[YT Playables Mock] gameReady()');
    }
  }

  /**
   * Register audio enable/disable listener
   */
  onAudioEnabledChange(callback) {
    this.onAudioChangeCallbacks.push(callback);
  }

  /**
   * Register pause listener
   */
  onPause(callback) {
    this.onPauseCallbacks.push(callback);
  }

  /**
   * Register resume listener
   */
  onResume(callback) {
    this.onResumeCallbacks.push(callback);
  }

  /**
   * Load saved player data
   */
  async loadData() {
    if (this.isInPlayables && window.ytgame.game && typeof window.ytgame.game.loadData === 'function') {
      try {
        const raw = await window.ytgame.game.loadData();
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        console.warn('[YT Playables] Failed to load data from YouTube cloud:', err);
        return null;
      }
    } else {
      // LocalStorage fallback for standalone testing
      try {
        const local = localStorage.getItem('asmr_zen_lab_save');
        return local ? JSON.parse(local) : null;
      } catch (e) {
        return null;
      }
    }
  }

  /**
   * Save player data
   */
  async saveData(data) {
    const serialized = JSON.stringify(data);
    if (this.isInPlayables && window.ytgame.game && typeof window.ytgame.game.saveData === 'function') {
      try {
        await window.ytgame.game.saveData(serialized);
        console.log('[YT Playables] Saved to cloud successfully.');
      } catch (err) {
        console.warn('[YT Playables] Failed to save cloud data:', err);
      }
    } else {
      // LocalStorage fallback
      try {
        localStorage.setItem('asmr_zen_lab_save', serialized);
      } catch (e) {
        console.warn('LocalStorage save failed:', e);
      }
    }
  }

  /**
   * Get language code
   */
  getLanguage() {
    if (this.isInPlayables && window.ytgame.system && typeof window.ytgame.system.getLanguage === 'function') {
      return window.ytgame.system.getLanguage() || navigator.language || 'en';
    }
    return navigator.language || 'en';
  }
}

window.ytSDK = new YouTubePlayablesSDK();
