# Bead Loop — game guide for AI agents

> Read this before changing anything in `games/bead-loop/`. Repo-wide rules
> (shared code, Playables requirements, commands) are in `/AGENTS.md`.

## One-line pitch
Coloured beads ride a conveyor loop. Tap a tube to kick its wrong-coloured
block onto the belt; every tube automatically catches beads of its own colour
as they pass its port. Fill every tube with its own colour to win.

## How to run
```bash
npm run dev -- bead-loop      # http://localhost:5173 (hot reload)
npm run build -- bead-loop    # dist/bead-loop
npm run zip -- bead-loop      # releases/bead-loop-<version>.zip  (upload this)
npm run typecheck
```
Dev-only helpers: press **P** to simulate YouTube pause/resume. Save data is in
`localStorage["ytp-save:bead-loop"]` outside YouTube. Clear it to reset progress.

## Rules (source of truth: `src/game/board.ts`)
| Concept | Detail |
|---|---|
| Belt | `level.slots` slots moving **clockwise** at `level.speed` slots/s. Slot `i` sits at belt parameter `(i + offset) mod N`. |
| Tube | One per colour (`tube.color === index`). Holds `cap` blocks; a block is `BEADS_PER_BLOCK` (4) beads. |
| Block | A 2x2 bead pack of one colour. Tube contents are `blocks` (bottom → top) plus loose `sorted` beads drawn above them. |
| Port | Where a tube's pipe meets the bottom edge of the loop. Each time a slot passes a port: **(1)** if it holds the tube's colour and the tube has `space`, the bead falls in; **(2)** else if the slot is empty and the tube has queued beads, one is pushed onto the belt. |
| Tap | Removes the **top-most wrong-coloured block** from the tube (own-colour blocks above it slide down), animates it up (`EJECT_TIME`), then puts its 4 beads in the tube's `queue`. Refused (shake + `deny`) if there is no wrong block or the queue already holds `MAX_QUEUE_BLOCKS` blocks. |
| Complete | A tube is complete when every block is its own colour and `blocks*4 + sorted === cap*4`. |
| Win | All tubes complete and no beads still falling. Bead conservation guarantees the belt is then empty. |
| Fail | None. The game is relaxing; skill shows in clear time (stars). |
| Stars | `starsFor(seconds, par)`: ≤ par → 3, ≤ 1.6×par → 2, else 1. Timer starts on the first successful tap. |

Space accounting: `space = cap*4 - blocks*4 - sorted - falling.length`. Ejecting a
block frees space immediately, so tube X can start catching X-beads while its
ejected block is still waiting to get onto the belt. That swap is what prevents
deadlocks. Keep it if you change the rules.

## Levels (`src/game/levels.ts`)
- Procedurally generated from a fixed seed per level number (`0xbead + n*7919`),
  so every player gets the same level. There are no level files.
- `params(n)` is the difficulty curve: colours 3→6, `cap` 4→8, `free` blocks per
  tube 2→1, belt `slots = 72 + colors*14`, speed 15→24 slots/s.
- Generation deals `cap - free` blocks of every colour into the tubes (rejecting
  deals where any tube has no wrong block). The remaining `free*4` beads per
  colour start on the belt in clumps of 2–4.
- `par = 6 + wrongBlocks*1.9 + colors*1.5` seconds.
- `MAX_LEVEL` (constants.ts) = number of levels in level select (60). It can be
  raised freely. Generation is unbounded, and the score is "levels cleared".
- Changing `params()` or the seed changes existing levels for players who have
  already beaten them. Prefer adding new behaviour for higher level numbers only.

## Files
```
games/bead-loop/
├─ index.html          SDK <script> first, then src/main.ts
├─ game.json           id/title/version (version names the release zip)
├─ GAME.md             this file
├─ public/             game-only static files (copied as-is)
└─ src/
   ├─ main.ts          boot (bootPlayable), save, score sync, App wiring
   ├─ app.ts           App interface + SaveData shape/defaults
   ├─ game/
   │  ├─ constants.ts  palette (+ glyphs), timings, theme colours
   │  ├─ levels.ts     LevelDef, generator, stars
   │  ├─ board.ts      pure rules/state (no drawing) + events
   │  ├─ layout.ts     responsive geometry (loop path, tubes, ports)
   │  └─ render.ts     all drawing for the board + background
   └─ scenes/
      ├─ menu.ts       title screen (Play / Levels)
      ├─ levels.ts     level select (4x5 grid, 3 pages)
      └─ play.ts       gameplay, HUD, win panel, sfx/particles from events
```
Architecture: `Board` owns state and emits `events` (`absorb`, `land`, `eject`,
`deny`, `complete`, `win`). `PlayScene` turns events into sound and particles and
clears them each frame. `render.ts` only reads state. Keep logic out of rendering.

## Shared code used (`/shared/src`)
`bootPlayable` (boot + pause wiring), `Playables` (SDK wrapper), `SaveStore`,
`Sfx` (procedural WebAudio; presets `tick/pop/deny/chime/win/click`),
`RoundedRectPath` (belt geometry), `Particles`, `Button/ButtonSet`, `drawBead`
(cached glossy bead sprites), glyphs, icons from `/shared/assets/icons`.

## Save data (`SaveData` in app.ts, version 1)
```ts
{ unlocked: number, stars: number[], times: number[], scoreSent: number }
```
- Saved with `save.flush()` on every win and on `onPause`.
- Score sent to YouTube = `unlocked - 1` (levels cleared). `scoreSent` keeps the
  YouTube best equal to the save (certification rule); it is re-synced at boot.
- Adding fields is safe (defaults are merged). For renames or restructures, bump
  the version in `new SaveStore(defaultSave, 1)` and add a `migrate` function.
  Never break old saves.

## Visual style
Original look: dark purple gradient, glossy beads with a shape glyph per colour
(circle/square/triangle/diamond/star/plus) for colour-blind players, glass tubes
with a coloured cap showing the glyph (✓ when complete). Layout is a centred
portrait column (≤ 0.62 aspect), so landscape and desktop work with side margins.
Do not copy art, names or branding from the reference game. Keep the look original.

## Playables checklist for this game
- [x] SDK script before game code, `firstFrameReady` on splash, `gameReady` at menu
- [x] Loop + audio stop on `onPause`, progress saved on pause
- [x] `loadData` awaited before any `saveData`; no other storage in Playables
- [x] No master mute button; audio follows `isAudioEnabled` / `onAudioEnabledChange`
- [x] Relative paths only, ~40 KB bundle, no network requests, system fonts
- [x] `sendScore` best == save best
- [ ] Localisation (`Playables.getLanguage()`): English only for now
- [ ] Run the official Playables test suite before submitting

## Ideas / backlog
- Locked tubes that open after N completions; a "frozen" block that needs two taps.
- Optional move limit mode (taps are fixed per level today, so use time-based goals).
- Haptics (`navigator.vibrate`) on complete, if allowed.
- Rewarded ad (`ytgame.ads.requestRewardedAd`) for a slow-motion belt power-up.
- Localised strings (strings live in menu.ts, levels.ts, play.ts, render.ts).

## Gotchas
- `Board.setPorts()` must run after every layout change (PlayScene.resize does it).
- Slots crossing a port are processed in a `while` loop, so high speeds never skip beads.
- Falling beads land FIFO with equal duration; landing order is relied on in render.
- `clearSpriteCache()` on resize, because sprite sizes are tied to layout and DPR.
- The SDK does nothing when served locally, so verify integration with the official test suite.
