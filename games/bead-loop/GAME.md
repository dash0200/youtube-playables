# Bead Loop: game guide for AI agents

> Read this before changing anything in `games/bead-loop/` or `rust/crates/bead-loop*`.
> Repo-wide rules (shared code, Playables requirements, commands) are in `/AGENTS.md`.

## One-line pitch
Beads ride a conveyor loop above a row of tubes. **Each tube takes only its own
colour, and only while its own colour is on top** (or it's empty). A wrong
colour on top blocks it: tap the tube to eject its top run back onto the loop.
Get every tube full of its own colour without letting the loop jam.

## Commands
```bash
npm run dev -- bead-loop        # play locally (hot reload)
npm run wasm -- bead-loop       # Rust → src/wasm/bead_loop.wasm (needs rustup target wasm32-unknown-unknown)
npm run levels -- bead-loop     # regenerate + bot-verify levels.json (Rust, native)
npm run parity -- bead-loop     # Rust sim vs TypeScript sim, must print all ✔
npm run test:rust               # cargo tests (rules, FFI, core)
npm run zip -- bead-loop        # build (incl. wasm if Rust available) + validate + releases/*.zip
npm run typecheck
cargo run --release --manifest-path rust/Cargo.toml -p bead-loop-tools --bin difficulty -- games/bead-loop/src/game/levels.json [level]
cargo run --release --manifest-path rust/Cargo.toml -p bead-loop-tools --bin probe -- [from] [to] [candidates]
```
**Windows without Visual Studio C++ build tools:** the default MSVC Rust
toolchain can't link native code (Git Bash's `link` also shadows MSVC's). Use the
GNU toolchain from PowerShell for any cargo step, including the npm scripts:
`$env:RUSTUP_TOOLCHAIN='1.97.0-x86_64-pc-windows-gnu'; $env:CARGO_TARGET_DIR="$PWD\rust\target\gnu"`.
ust	arget\gnu"`.
`npm run wasm`/`build` pick that GNU toolchain automatically when the MSVC one fails
(it needs the wasm target: `rustup +1.97.0-x86_64-pc-windows-gnu target add wasm32-unknown-unknown`).
Dev helpers: **P** simulates YouTube pause/resume. Add `?debug` to the URL to
expose `window.__beadLoop` (the App, including `sim.s` state) for automated
play-tests. Save data lives in `localStorage["ytp-save:bead-loop"]` outside YouTube.
`?unlock` (or **U**) opens every level. In a level, the **Solve** button (top
centre, under Hint) hands control to the generator's planning bot
(`src/dev/autoplay.ts` via `game/advisor.ts`); tap it again to stop. It's verified from the start of a
level; started mid-game it does its best. All of these are `import.meta.env.DEV`
only and stripped from builds. Levels have many solutions (it's real-time; tap
order and timing both vary), so the bot shows one, not "the" answer.

## Rules (source of truth: `rust/crates/bead-loop/src/sim.rs`)
| Concept | Detail |
|---|---|
| Belt | `slots` positions moving **clockwise** at `speed` slots/s. Slot `i` sits at belt parameter `(i + offset) mod N`. Limited capacity is the core pressure. |
| Tube | One per colour; **shell colour = tube index**. Holds `cap` blocks × `K`=9 beads. Contents are a bead stack (bottom → top). |
| **Intake** | A tube is **open** while its top bead is its shell colour, or it is empty (`is_open`). Whenever a slot passes the port of an open tube with space, a bead of the **shell colour** falls in. A wrong colour on top **blocks** the tube: nothing gets in (not even its own colour) until that run is tapped off. |
| Queue | Ejected beads wait in the tube's pipe and drop into **empty** passing slots. |
| Tap | Ejects the **top run** (all consecutive top beads of one colour, plus beads still falling in) into the queue. Denied (shake) if the tube is complete, empty, or its queue already holds ≥ `K` beads. |
| Complete | Tube full and every bead is its shell colour → glows, ✓ on the cap, no more intake/taps. |
| Win | All tubes complete and nothing falling. |
| **Lose** | Belt 100 % full with no absorption for `JAM_TIME` (3 s) → "Loop jammed!". Timer counts only after the first tap. |
| Stars | ≤ par → 3, ≤ 1.6×par → 2, else 1. Par = bot's worst clear time × 1.15 + 5 s. |

Strategy the player learns: unblock the tube whose colour is piling up on the
loop first (unblocking frees room, because that tube starts eating); dig out
buried wrong beads early, before more of the own colour lands on top of them;
don't eject runs whose own tube is still blocked when the loop is nearly full.

## Architecture
```
rust/crates/
├─ playables-core/      shared no_std: mulberry32 Rng, modp/floor/hash01, RoundedRect path (libm)
├─ bead-loop/           no_std, no alloc: sim.rs (rules, SoA state, positions, checksum), bot.rs (solver/heuristic player)
├─ bead-loop-wasm/      C-ABI exports (bl_*) over one static Sim → wasm32-unknown-unknown
└─ bead-loop-tools/     native std: gen-levels, trace (parity), difficulty + probe (tuning reports)

games/bead-loop/src/
├─ main.ts              boot, createSim(), save/score, ?debug hook
├─ app.ts               App interface (+ sim) and SaveData
├─ sim/
│  ├─ types.ts          constants + SimState layout (MUST match sim.rs), read helpers
│  ├─ wasm-sim.ts       loads .wasm, zero-copy typed-array views into wasm memory
│  ├─ ts-sim.ts         TypeScript mirror of sim.rs (fallback when wasm missing/fails)
│  └─ index.ts          createSim(): wasm if src/wasm/*.wasm exists, else TS
├─ wasm/bead_loop.wasm  build output of `npm run wasm` (commit it)
├─ game/
│  ├─ levels.json       GENERATED by Rust tool. Never hand-edit
│  ├─ levels.ts         typed access + starsFor
│  ├─ constants.ts      palette (+ glyphs), theme
│  ├─ layout.ts         responsive geometry (loop path, tubes, port fractions)
│  ├─ fx.ts             BoardFx: visual-only animation state (squash, wobble, flyers, rings, sparkles)
│  ├─ sounds.ts         BeadSounds: procedural ASMR sounds (grain ticks, pour, melt plop, kalimba chimes)
│  └─ render.ts         canvas drawing; reads SimState + BoardFx only
├─ scenes/              menu, levels (select), play (HUD, win/lose panels, events → sfx)
├─ game/advisor.ts      move advice from the planning bot (TS port of bot.rs choose) + risky taps; HintGuide
├─ dev/autoplay.ts      DEV ONLY: Solve button's bot (uses advisor.chooseTap)
└─ tools/parity.mjs     Rust ↔ TS checksum comparison
```
Per frame (PlayScene.update): `sim.update(dt)` → `sim.computePositions()` (belt
bead x/y, done in wasm) → read `events` → sfx + `BoardFx` → `clearEvents()` →
`board.update()`. Rendering only reads `sim.s` and `BoardFx`.

### Juice / animation (`fx.ts`, visual only)
`BoardFx` never touches rules, so no parity work is needed for visual changes.
PlayScene feeds it sim events (ABSORB → port pulse, LAND → bead squash + tube
wobble + landing streak, DENY → wobble, COMPLETE → shimmer/rings/sparkles, WIN)
and taps (`onEject` with a pre-tap `TubeSnapshot`, so ejected beads fly from
where they were into the pipe; `pending` hides their queue entries until they
arrive). Pipe beads glide up via `qOff` when the sim pops the queue.
Sound (`sounds.ts`, built on `Sfx.noise` filtered-noise voices and the `reverb`
send in shared `sfx.ts`): each landing is 2-3 randomised micro "ticks" of plastic
grains (slightly brighter in a streak); a tap is a soft press plus a rustling pour
of ticks scaled by how many beads come out; a cell melting into a block is a round
"plop"; a refused tap is a muffled knock; finishing a tube plays a kalimba-like
pentatonic arpeggio that climbs with each finished tube; the win is a rising run
settling on a soft chord in a small room. Randomised pitch/length/timing keeps
streams organic. Throttled per sound key so streams never machine-gun.

### Render performance
Budget is mobile. Everything gradient-heavy and static (tube glass front/back,
caps, candy stacks, glows, pipes, the board panel + belt channel) is painted once
into cached layers (`layer()` in render.ts) and blitted. Each tube's settled
beads are cached per tube and repainted only when the stack changes; only
animating beads are drawn live. The background is composed at ¼ resolution and
upscaled in one blit. Cleared on resize via `clearLayerCache()`. Avoid per-frame
`createLinearGradient`, `shadowBlur` and per-slot paths; keep a render of the
heaviest level (60) to a few ms.

### Rust ↔ TypeScript contract
- `types.ts` constants and `SimState` arrays mirror `sim.rs` field-for-field.
  `WasmSim.load` checks `bl_const()` and refuses a mismatched build.
- `ts-sim.ts` must stay **step-for-step identical** to `sim.rs` (same operation
  order, f64 maths, no transcendental functions in logic). After ANY rule change:
  edit both → `npm run test:rust` → `npm run parity -- bead-loop` → `npm run wasm -- bead-loop`.
- The wasm module never allocates (no_std, no alloc), so memory never grows and
  typed-array views stay valid.
- wasm input buffer layout: `[colors, cap, slots_lo, slots_hi, fill[6], tubes[6][8], belt[320]]`.

## Levels
- Generated offline by `bead-loop-tools::generate` (seed per level number and attempt).
- **Solvable:** the planning bot (`bot.rs`) must clear every level in **12
  scenarios** (2 port offsets × reaction 0.3/0.55/0.8 s × 2 frame rates) within
  75 s, so levels aren't fragile on different screens or for slow players.
- **Difficulty is measured, not guessed.** A "naive" simulated player knows the
  rule (clears blocked tubes, digs buried beads) but never plans around loop
  room and reacts at 0.45-0.75 s. `target(n)` sets its win rate per level; the
  generator sweeps loop room (`RATIOS`, loose → tight) and keeps the first
  solvable layout within ±8 % of target, confirmed on a second set of seeds.
- Board size in `params()`: colours 3 → 4 → 5 → 6 (levels 1-2, 3-8, 9-25, 26+),
  cap 4 → 5 → 6 → 7 (1-2, 3-20, 21-60, 61+), starting free space 2 → 1 → 0
  blocks per tube (0 from level 26), speed 22 → 32 slots/s (reached at ~125).

### Difficulty targets (naive player's win rate)
Goal: keep casual players hooked. Repeated failure makes people quit, so most
levels stay comfortable and difficulty arrives slowly over 150 levels.
| Levels | Target | Feel |
|---|---|---|
| 1-10 | ~95 % | learn the rule (3-4 colours) |
| 11-50 | 90 → 70 % | comfortable, steady progress |
| 51-100 | 70 → 50 % | needs some thought |
| 101-150 | 50 → 30 % | needs a plan |
Sawtooth: every 5th level is a spike and the next a breather; spikes grow with
the level (−6/+4 points up to 50, −10/+6 up to 100, −12/+8 after).
Measured (60 fresh games per level, averages per band):
| Levels | Random tapping | Naive (target) | Easy variant (target) |
|---|---|---|---|
| 1-10 | 100 % | 100 % (95) | 100 % (97) |
| 11-50 | 39 % | 80 % (79) | 100 % (97) |
| 51-100 | 12 % | 59 % (59) | 87 % (84) |
| 101-150 | 6 % | 39 % (39) | 65 % (66) |
The slow (0.8 s) bot clears 150/150. Single levels can sit up to ~20 points off
target (measurement noise plus layout luck); the band averages are on target.
- `difficulty` prints, per level, random / naive win rates vs target, the easy
  variant's naive rate and the slow bot; with a level number it prints the naive
  rate over 10 seed batches (batch-to-batch noise is about ±8 points). `probe`
  maps solvability and naive rate against loop room for chosen levels.

### Slow toggle
A **Slow** button (hourglass, next to Back) runs the whole sim at 0.6× (`SLOW_SPEED`
in play.ts): belt, falls, and the jam countdown, so a player who wants time to think
can take it. The choice is saved (`SaveData.slow`) and kept across levels. The timer,
stars and best times use **real seconds played** (`PlayScene.elapsed`), so slow mode
costs time instead of handing out cheap 3-star clears.

### Guided hint (rewarded ad)
The **Hint** button (top centre) and **Retry with a hint** (lose panel) offer an
opt-in rewarded ad (`Playables.requestRewardedAd('hint')`). If the ad is
unavailable (not every user gets ads) the hint is free; if the player skips it,
a toast explains and nothing changes. The game freezes while the ad shows. For
`HINT_SECONDS` (20) the planning bot (`game/advisor.ts`, re-checked 4×/s and
after every tap) coaches live:
- **Tap:** the suggested tube glows with a "tap here" ripple ("Tap the glowing tube").
- **Wait:** no glow and "Let it flow…" when the best move is to do nothing.
- **Why:** beads on the loop waiting for the suggested tube shimmer.
- **Avoid:** red ✕ on tubes whose tap would flood a loop that's ≥ 70 % full (the
  run's own tube is blocked, or it's the tube's own colour).
A bar under the Hint button shows the time left. The player still makes every
tap; the hint is visual only (no rule or level changes). From the start of a
level the advice is the bot's proven line; mid-game it's strong but can't
guarantee a save. Ads must also be switched on in the Playables Developer
Portal (monetization settings) before release.

### Easier retry (rescue after repeated losses)
Every level ships an `easy` variant in levels.json: same colours, cap, speed and
par, generated from its own seed range with `easy_target(n) = target + 25 points`
(at least 60 %), and bot-verified like the main layout. After
`EASY_AFTER_LOSSES` (2) jams in a row on a level (`SaveData.losses`), the game
quietly serves the easy layout; the lose panel tells the player "Next try: a
gentler layout". A win resets the count. Stars use the main par, so they stay
honest. Restarting mid-level doesn't count as a loss.
- Regenerating changes levels players may have beaten. Prefer appending
  (raise the count in game.json scripts.levels) over editing early params.

## Save data (`SaveData` in app.ts, version 1)
`{ unlocked, stars[], times[], scoreSent, losses[], slow }` (`losses` = jams in a row
per level, drives the easier retry; `slow` = the Slow toggle). Saved on win, on loss and on pause. Score
sent to YouTube = levels cleared (`unlocked - 1`), kept equal to the save.
Add fields freely; renames need a version bump + `migrate`.

## Visual style
Calm, "satisfying" (ASMR-like) feel: deep purple twilight with slow drifting bokeh,
beads drawn as **clumps of 5 tiny candy-glass grains** (soft contact shadow, light
glowing through, crisp specular), so the belt, pipes and loose cells read as a pour
of many small beads. One simulated bead = one clump; each clump is baked into a
sprite (4 arrangements) and costs one drawImage. Grains are too small for glyphs, so
the colour-blind glyphs live on blocks and caps. Glass tubes are tinted
with the shell colour, and a
moving conveyor tread. **Stacks:** a full cell of one colour (9 beads) is drawn as
a candy block instead of a 3×3 grid, and consecutive same-colour blocks merge
into one column (glyph once per block so the count stays readable). Mixed or
partly filled cells still show loose beads. When a cell's 9th bead lands, the
beads melt into the block. Motion is soft and springy: beads pop onto the belt, fall
then tuck into place and squash on landing, tubes jiggle like jelly, completed
tubes glow, shimmer and twinkle; tapped clumps tumble up into the pipe. **Port rings
glow in the tube's colour while it is open and turn dim and dashed while blocked.** Inside the loop: level, timer,
loop-capacity meter (green → yellow → red), and a jam countdown. Don't copy art,
names or branding from the reference game.

## Playables checklist
- [x] SDK first, firstFrameReady on splash, gameReady at menu (wasm loads during splash)
- [x] Pause stops loop + audio and saves; no Page Visibility API
- [x] Only Playables save API; loadData before saveData
- [x] No master mute; follows YouTube audio state
- [x] Relative paths, wasm served from the bundle (no network), system fonts
- [x] Built `src/wasm/bead_loop.wasm` committed (22.9 KiB): builds and the Vercel demo run the Rust sim
- [ ] Run the official Playables test suite

## Backlog
- Locked tubes (the reference shows extra greyed tubes) that open after N completions.
- Undo last tap (costs a star), or a "slow belt" rewarded-ad power-up.
- Localised strings (menu.ts, levels.ts, play.ts, render.ts).
- Move bead sprite batching to wasm + WebGL if bead counts grow a lot.

## Gotchas
- `setPort`/`setPath` must run after every layout change (PlayScene.resize does it).
- Slots crossing a port are handled in a loop, so big frame gaps never skip beads.
- Falling beads land FIFO with equal duration; their colour = current intake.
- Tapping while beads are falling converts them into the ejected run (keeps the stack consistent).
- `levels.json` is imported at build time; regenerate it, don't edit it.
