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

void bootPlayable({
  drawSplash(ctx, w, h, t) {
    drawBackground(ctx, w, h, window.devicePixelRatio || 1);
    const s = Math.min(w, h * 0.62);
    text(ctx, 'BEAD LOOP', w / 2, h * 0.45, s * 0.11, '#fff', { weight: 900, shadow: '#5b3fd6' });
    for (let i = 0; i < 3; i++) {
      const a = Math.max(0, Math.sin(t * 5 - i * 0.7));
      ctx.globalAlpha = 0.3 + a * 0.7;
      ctx.fillStyle = PALETTE[i].hex;
      ctx.beginPath();
      ctx.arc(w / 2 + (i - 1) * s * 0.06, h * 0.55, s * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  async load(core) {
    const [icons] = await Promise.all([loadIcons(), save.load()]);
    app = createApp(core, icons);
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
