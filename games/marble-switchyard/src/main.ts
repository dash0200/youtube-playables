import '@shared/styles/base.css';
import { bootPlayable } from '@shared/boot';
import { Playables } from '@shared/sdk/playables';
import { SaveStore } from '@shared/save/save-store';
import { loadIcons, type Icons } from '@shared/ui/icons';
import { text } from '@shared/ui/draw';
import { defaultSave, type App, type SaveData } from './app';
import { MAX_LEVEL, PALETTE } from './game/constants';
import { drawBackground } from './game/render';
import { MenuScene } from './scenes/menu';
import { LevelSelectScene } from './scenes/levels';
import { PlayScene } from './scenes/play';

const save = new SaveStore<SaveData>(defaultSave, 1);
let app: App;

// Dev only (stripped from builds): open with ?unlock or press U to unlock every
// level. Not saved and sends no score, so real progress is untouched.
let devUnlockAll = import.meta.env.DEV && new URLSearchParams(location.search).has('unlock');
if (import.meta.env.DEV) {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'u' && e.key !== 'U') return;
    devUnlockAll = !devUnlockAll;
    console.info(`[marble-switchyard:dev] unlock all levels ${devUnlockAll ? 'on' : 'off'}`);
  });
}

void bootPlayable({
  drawSplash(ctx, w, h, t) {
    drawBackground(ctx, w, h);
    const s = Math.min(w, h * 0.62);
    text(ctx, 'MARBLE', w / 2, h * 0.42, s * 0.1, '#fff', { weight: 900, shadow: '#0b4a52' });
    text(ctx, 'SWITCHYARD', w / 2, h * 0.49, s * 0.075, '#ffcf7a', { weight: 900, shadow: '#5a3b10' });
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.3 + Math.max(0, Math.sin(t * 5 - i * 0.7)) * 0.7;
      ctx.fillStyle = PALETTE[i].hex;
      ctx.beginPath();
      ctx.arc(w / 2 + (i - 1) * s * 0.06, h * 0.57, s * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  async load(core) {
    const [icons] = await Promise.all([loadIcons(), save.load()]);
    app = createApp(core, icons);
    // Test hook for automated play-testing; dev server only, with ?debug in the URL.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('debug')) (window as unknown as { __marbles: App }).__marbles = app;
    // Keep YouTube's best score in sync with the save (certification rule).
    const cleared = save.data.unlocked - 1;
    if (cleared > save.data.scoreSent) {
      save.data.scoreSent = cleared;
      void Playables.sendScore(cleared);
      save.save();
    }
  },

  firstScene: () => new MenuScene(app),

  onPause() {
    void save.flush();
  },
});

function createApp(core: Parameters<Parameters<typeof bootPlayable>[0]['load']>[0], icons: Icons): App {
  const a: App = {
    ...core,
    save,
    icons,
    goMenu: () => core.scenes.go(new MenuScene(a)),
    goLevels: () => core.scenes.go(new LevelSelectScene(a)),
    play: (n) => core.scenes.go(new PlayScene(a, Math.max(1, Math.min(MAX_LEVEL, n)))),
    isUnlocked: (n) => devUnlockAll || n <= save.data.unlocked,
    recordWin(level, seconds, stars) {
      const d = save.data;
      const i = level - 1;
      d.stars[i] = Math.max(d.stars[i] ?? 0, stars);
      d.times[i] = d.times[i] ? Math.min(d.times[i], seconds) : seconds;
      d.unlocked = Math.max(d.unlocked, Math.min(level + 1, MAX_LEVEL + 1));
      const cleared = d.unlocked - 1;
      if (cleared > d.scoreSent) {
        d.scoreSent = cleared;
        void Playables.sendScore(cleared);
      }
      void save.flush();
    },
  };
  return a;
}
