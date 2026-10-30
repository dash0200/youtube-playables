# Marble Switchyard: game guide for AI agents

> Read this before changing anything in `games/marble-switchyard/`.
> Repo-wide rules (shared code, Playables requirements, commands) are in `/AGENTS.md`.

## One-line pitch
Glass marbles drop from a hopper onto a branching brass track. **Tap a gate to
flip it**; each marble takes the branch its gate points to when it gets there.
Send every marble to the cup of its colour. Three spills and the level is lost.

## Commands
```bash
npm run dev -- marble-switchyard        # play locally (hot reload)
npm run levels -- marble-switchyard     # regenerate + bot-verify levels.json (TS generator via Vite SSR)
node games/marble-switchyard/tools/debug-play.mjs <level> [attempt] [seed]   # trace a naive game
npm run zip -- marble-switchyard        # build + validate + releases/*.zip
npm run typecheck
```
Dev helpers (dev server only, stripped from builds): `?unlock` or **U** unlocks
every level; `?debug` exposes `window.__marbles` (the App); the **Solve** button
lets the planning bot play. **P** simulates YouTube pause/resume.

## Rules (source of truth: `src/sim/sim.ts`)
| Concept | Detail |
|---|---|
| Track | A binary tree written in pre-order (`'G'` gate, `'C'` cup), e.g. `GGCCC`. Distances are in *rows*; marbles roll at `speed` rows/s. |
| Hopper | Releases the `seq` colours one by one every `interval` s (first after 1.2 s). The next marbles are visible in the hopper tray. |
| Gate | Points left or right. Tapping flips it (and every gate with the same `link`). A marble decides at the moment it reaches the gate. |
| Auto gate | Also flips by itself after every marble that passes (teal arrow). From level 10. |
| Linked gates | Share a `link` id and flip together (pink dot). From level 20. |
| Cup | Colour + capacity. A marble of its colour fills it. |
| Spill | Wrong colour (or a full cup): the marble goes back to the end of the hopper queue and a spill is used. `spills` (3) spills loses. |
| Win | Every cup full. Stars: ≤ par → 3, ≤ 1.5×par → 2, else 1. |

Strategy the player learns: watch the hopper, set a marble's whole route before
it drops; time flips in the gap between marbles; plan for auto gates flipping
under the marble ahead.

## Architecture
```
src/
├─ main.ts              boot, save/score, dev unlock + ?debug
├─ app.ts               App interface and SaveData
├─ sim/
│  ├─ sim.ts            rules: tree, gates, marbles, cups, events (pure, deterministic, no screen sizes)
│  └─ bot.ts            Planner (planning bot: routes every marble in flight + the next 2 in the hopper,
│                       predicts auto gates, respects links) and the naive policy; playBot / playNaive
├─ game/
│  ├─ levels.json       GENERATED. Never hand-edit
│  ├─ constants.ts      levels access, starsFor, palette (+ glyphs), theme
│  ├─ layout.ts         responsive geometry: hopper, rows, node positions, Bézier rails, cups
│  ├─ fx.ts             visual-only animation (flipper swings, cup bounces, spill flyers, rings, sparkles)
│  ├─ render.ts         canvas drawing (¼-res bokeh background, rails, gates, cups, hopper, marbles)
│  └─ sounds.ts         procedural ASMR sounds (drop, glassy clack, flipper click, cup plinks, spill thunk, chimes)
├─ scenes/              menu (bot-played demo board behind the title), levels (select), play
└─ tools/generate.ts    offline level generator (not bundled)
tools/gen-levels.mjs    runs the generator through Vite SSR → src/game/levels.json
tools/debug-play.mjs    tuning aid: replays a candidate with the naive player, printing taps and spills
```
Unlike Bead Loop there is no Rust/WebAssembly sim: a level has at most a dozen
marbles and 5 gates, so the TypeScript sim is far below a millisecond per frame,
and the same code runs in the game and in the generator (no parity to keep).

## Levels and difficulty
- 60 levels. Board size in `params()` (`src/tools/generate.ts`): cups 2 → 3 → 4 →
  5 → 6 (levels 1-2, 3-6, 7-14, 15-28, 29+), cup size 3 → 4 → 5, colours ≤ cups.
- **Calm pace, puzzle difficulty.** Marbles roll at a near-constant 2.0-2.3 rows/s.
  Drop spacing = (`BASE_INTERVAL` 0.55 + `PER_GATE` 0.42 × gates on the longest
  route) × `SPACING` (a narrow 1.25 → 0.88 sweep), at least 0.95 s, and ×1.5 on
  levels 1-5. Deeper boards get more time per marble, so a player always has
  about 0.55-0.65 s per gate decision. Later levels get harder through puzzle
  features instead: more auto gates (from 10, mostly 1-2 from 25), linked gates
  (from 20, every level from 50), more cups sharing a colour.
- **Solvable:** the planning bot must win in 6 scenarios (reaction 0.25/0.45/0.7 s
  × 30/60 fps); par = worst bot time × 1.1 + 3 s.
- **Difficulty is measured:** the naive player follows one marble at a time
  (oldest first), setting the first wrong gate on its route at a 0.4-0.75 s
  reaction, ignoring other marbles and auto-gate side effects. `target(n)` is its
  win rate (~95 % early → 35-40 % at 60, small sawtooth). Candidates sweep spacing
  and the first within ±10 % (confirmed on fresh seeds) is kept.
- Measured (average per band, naive win vs target): 1-10 ≈ 99 % (90), 11-30 86 %
  (74), 31-45 67 % (57), 46-60 48 % (45). Because the pace is capped, mid levels
  land ~10 points easier than target; that's intended (calm > frantic). Levels
  average ~25 s early and ~65 s late (longest par 83 s). Generation takes ~2 min.
- Levels 1-2 coach the player (the planner's advice glows) until 4 flips.

## Save data (`SaveData` in app.ts, version 1)
`{ unlocked, stars[], times[], scoreSent }`. Saved on win and on pause. Score sent
to YouTube = levels cleared, kept equal to the save. Add fields freely; renames
need a version bump + `migrate`.

## Visual style
Calm deep-teal twilight with drifting bokeh; brass rails (branches a gate isn't
pointing to are dimmed grey); gates are dark discs with a swinging brass flipper;
glossy glass marbles with a shape glyph per colour (colour-blind friendly);
glass cups tinted with their colour, a colour tab with the glyph (✓ when full),
and a faint "marbles still needed" count. Original art, names and sounds.

## Playables checklist
- [x] SDK first, firstFrameReady on splash, gameReady at menu
- [x] Pause stops loop + audio and saves; no Page Visibility API
- [x] Only Playables save API; loadData before saveData
- [x] No master mute; follows YouTube audio state
- [x] Relative paths, no network requests, system fonts; any aspect ratio; touch + mouse
- [x] `sendScore` best == save best
- [ ] Localisation (English only)
- [ ] Run the official Playables test suite

## Backlog
- Guided hint (rewarded ad) and easier retry after 2 losses, as in Bead Loop
  (`Planner.advise()` already gives the move; the tutorial uses it).
- More mechanics for variety later: one-way gates, cups that accept two colours,
  timed gates, marble "trains".
- Rust port only if the sim ever gets heavy (not needed now).
