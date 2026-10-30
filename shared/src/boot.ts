import { Stage } from './engine/stage';
import { GameLoop } from './engine/loop';
import { SceneManager, type Scene } from './engine/scene';
import { attachPointer, type PointerSink } from './engine/input';
import { Sfx } from './audio/sfx';
import { Playables } from './sdk/playables';

export interface Core {
  stage: Stage;
  scenes: SceneManager;
  sfx: Sfx;
  loop: GameLoop;
}

export interface BootOptions {
  /** Draws the loading screen. `t` is seconds since boot. */
  drawSplash(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
  /** Load save data, images, etc. Runs while the splash is visible. */
  load(core: Core): Promise<void>;
  /** First interactive scene (usually the main menu). */
  firstScene(core: Core): Scene;
  /** Called on Playables onPause, after the loop and audio are stopped. Save progress here. */
  onPause?(): void;
  onResume?(): void;
  /** Minimum splash time in seconds (avoid a 1-frame flash). */
  minSplash?: number;
}

/**
 * Standard Playables boot sequence shared by all games:
 *  1. canvas + loop + scene manager + audio
 *  2. draw splash → firstFrameReady()
 *  3. await load() (save data, assets)
 *  4. show first scene → gameReady()
 *  5. wire onPause/onResume to stop/restart the loop and audio
 */
export async function bootPlayable(opts: BootOptions): Promise<Core> {
  Playables.installErrorReporting();
  const host = document.getElementById('app') ?? document.body;
  const stage = new Stage(host);
  const scenes = new SceneManager(stage);
  const sfx = new Sfx();
  const loop = new GameLoop(
    (dt) => scenes.update(dt),
    () => {
      stage.beginFrame();
      scenes.render(stage.ctx);
    },
  );
  const core: Core = { stage, scenes, sfx, loop };

  let t = 0;
  const splash: Scene = {
    resize() {},
    update(dt) {
      t += dt;
    },
    render(ctx) {
      opts.drawSplash(ctx, stage.width, stage.height, t);
    },
  };
  scenes.go(splash, false);
  stage.beginFrame();
  splash.render(stage.ctx);
  Playables.firstFrameReady();
  loop.start();

  const sink: PointerSink = {
    pointerDown: (x, y) => {
      sfx.unlock(); // audio may only start after a user gesture
      scenes.pointerDown(x, y);
    },
    pointerMove: (x, y) => scenes.pointerMove(x, y),
    pointerUp: (x, y) => scenes.pointerUp(x, y),
  };
  attachPointer(stage.canvas, () => sink);

  Playables.onPause(() => {
    loop.pause();
    sfx.pause();
    opts.onPause?.();
  });
  Playables.onResume(() => {
    loop.resume();
    sfx.resume();
    opts.onResume?.();
  });

  const minSplash = new Promise((r) => setTimeout(r, (opts.minSplash ?? 0.4) * 1000));
  await Promise.all([opts.load(core), minSplash]);
  scenes.go(opts.firstScene(core));
  Playables.gameReady();
  return core;
}
