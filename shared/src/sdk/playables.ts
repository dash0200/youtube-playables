import type { YTGameSDK } from './ytgame';

/**
 * Thin, safe wrapper around the YouTube Playables SDK.
 *
 * Every game talks to YouTube ONLY through this module. Outside the Playables
 * environment (local dev, plain browser) it falls back to harmless behaviour:
 * localStorage for save data, console logs for scores, and a dev-only "P" key
 * that simulates onPause/onResume.
 *
 * Rules this wrapper helps you follow (Playables certification):
 *  - firstFrameReady() while a loading screen is visible, gameReady() only when interactive.
 *  - Never use the Page Visibility API for pausing; use onPause/onResume.
 *  - Await loadData() before the first saveData().
 *  - No in-game master mute; respect isAudioEnabled()/onAudioEnabledChange().
 */
const yt: YTGameSDK | undefined = typeof window !== 'undefined' ? window.ytgame : undefined;
const IN_PLAYABLES = !!(yt && yt.IN_PLAYABLES_ENV);
const DEV_SAVE_KEY = `ytp-save:${__GAME_ID__}`;

let loadedOnce = false;
/** Length of the simulated ad outside YouTube. */
const DEV_AD_MS = 1200;
const devPause: Array<() => void> = [];
const devResume: Array<() => void> = [];
let devPaused = false;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.warn('[playables]', e);
    return fallback;
  }
}

if (!IN_PLAYABLES && typeof window !== 'undefined') {
  // Dev helper: press P to simulate YouTube pausing/resuming the game.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'p' && e.key !== 'P') return;
    devPaused = !devPaused;
    console.info(`[playables:dev] ${devPaused ? 'onPause' : 'onResume'}`);
    (devPaused ? devPause : devResume).forEach((cb) => cb());
  });
}

export const Playables = {
  inPlayables: IN_PLAYABLES,

  firstFrameReady(): void {
    if (IN_PLAYABLES) safe(() => yt!.game.firstFrameReady(), undefined);
    else console.info('[playables:dev] firstFrameReady');
  },

  gameReady(): void {
    if (IN_PLAYABLES) safe(() => yt!.game.gameReady(), undefined);
    else console.info('[playables:dev] gameReady');
  },

  async loadData(): Promise<string> {
    try {
      const data = IN_PLAYABLES ? await yt!.game.loadData() : (localStorage.getItem(DEV_SAVE_KEY) ?? '');
      loadedOnce = true;
      return data ?? '';
    } catch (e) {
      console.warn('[playables] loadData failed', e);
      loadedOnce = true;
      return '';
    }
  },

  async saveData(data: string): Promise<void> {
    if (!loadedOnce) {
      console.warn('[playables] saveData called before loadData; ignored');
      return;
    }
    try {
      if (IN_PLAYABLES) await yt!.game.saveData(data);
      else localStorage.setItem(DEV_SAVE_KEY, data);
    } catch (e) {
      console.warn('[playables] saveData failed', e);
    }
  },

  /** Integer score. The best score sent must equal the best score in the save. */
  async sendScore(value: number): Promise<void> {
    const v = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
    if (!IN_PLAYABLES) {
      console.info('[playables:dev] sendScore', v);
      return;
    }
    try {
      await yt!.engagement.sendScore({ value: v });
    } catch (e) {
      console.warn('[playables] sendScore failed', e);
    }
  },

  /**
   * Opt-in rewarded ad. Rules (Playables certification): start it only from a
   * clearly labelled button, never automatically, and never block normal
   * progress behind it. `rewardId` is a fixed name per reward type (no user
   * data). Returns 'granted' when the player earned the reward, 'declined' when
   * they skipped it, and 'unavailable' when no ad could be shown (ads only reach
   * some users), so give the reward anyway or offer another path.
   * Outside YouTube: the dev server simulates a short ad and grants; a built
   * game hosted elsewhere (a web demo) reports 'unavailable' right away.
   */
  async requestRewardedAd(rewardId: string): Promise<'granted' | 'declined' | 'unavailable'> {
    if (!IN_PLAYABLES) {
      if (!import.meta.env.DEV) return 'unavailable';
      console.info('[playables:dev] rewarded ad', rewardId);
      await new Promise((r) => setTimeout(r, DEV_AD_MS));
      return 'granted';
    }
    try {
      return (await yt!.ads.requestRewardedAd(rewardId)) ? 'granted' : 'declined';
    } catch (e) {
      console.warn('[playables] rewarded ad unavailable', e);
      return 'unavailable';
    }
  },

  /** Interstitial ad at a natural break (between levels, after game over), never mid-play. Never reward on it. */
  async requestInterstitialAd(): Promise<void> {
    if (!IN_PLAYABLES) {
      console.info('[playables:dev] interstitial ad');
      return;
    }
    try {
      await yt!.ads.requestInterstitialAd();
    } catch (e) {
      console.warn('[playables] interstitial ad unavailable', e);
    }
  },

  isAudioEnabled(): boolean {
    return IN_PLAYABLES ? safe(() => yt!.system.isAudioEnabled(), true) : true;
  },

  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void {
    return IN_PLAYABLES ? safe(() => yt!.system.onAudioEnabledChange(cb), () => {}) : () => {};
  },

  onPause(cb: () => void): () => void {
    if (IN_PLAYABLES) return safe(() => yt!.system.onPause(cb), () => {});
    devPause.push(cb);
    return () => devPause.splice(devPause.indexOf(cb), 1);
  },

  onResume(cb: () => void): () => void {
    if (IN_PLAYABLES) return safe(() => yt!.system.onResume(cb), () => {});
    devResume.push(cb);
    return () => devResume.splice(devResume.indexOf(cb), 1);
  },

  async getLanguage(): Promise<string> {
    if (IN_PLAYABLES) {
      try {
        return await yt!.system.getLanguage();
      } catch {
        return 'en';
      }
    }
    return navigator.language || 'en';
  },

  logError(): void {
    if (IN_PLAYABLES) safe(() => yt!.health.logError(), undefined);
  },

  logWarning(): void {
    if (IN_PLAYABLES) safe(() => yt!.health.logWarning(), undefined);
  },

  /** Forwards uncaught errors to YouTube's health reporting. Call once at boot. */
  installErrorReporting(): void {
    window.addEventListener('error', () => Playables.logError());
    window.addEventListener('unhandledrejection', () => Playables.logError());
  },
};
