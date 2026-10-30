/**
 * Types for the YouTube Playables SDK (loaded by
 * <script src="https://www.youtube.com/game_api/v1"></script>).
 * Reference: https://developers.google.com/youtube/gaming/playables/reference/sdk
 */
export interface YTGameSDK {
  IN_PLAYABLES_ENV: boolean;
  SDK_VERSION: string;
  ads: {
    requestInterstitialAd(): Promise<void>;
    requestRewardedAd(rewardId: string): Promise<boolean>;
  };
  engagement: {
    sendScore(score: { value: number }): Promise<void>;
    openYTContent(content: { id: string; contentType?: unknown }): Promise<void>;
  };
  game: {
    firstFrameReady(): void;
    gameReady(): void;
    loadData(): Promise<string>;
    saveData(data: string): Promise<void>;
  };
  health: {
    logError(): void;
    logWarning(): void;
  };
  system: {
    getLanguage(): Promise<string>;
    isAudioEnabled(): boolean;
    onAudioEnabledChange(cb: (enabled: boolean) => void): () => void;
    onPause(cb: () => void): () => void;
    onResume(cb: () => void): () => void;
  };
}

declare global {
  interface Window {
    ytgame?: YTGameSDK;
  }
}
