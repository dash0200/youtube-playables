# AGENTS.md — YouTube Playables monorepo

Guide for AI coding agents (and humans) working in this repo. Each game also has
its own `games/<id>/GAME.md`. Read it before touching that game.

## What this repo is
Several small HTML5 canvas games for **YouTube Playables**, built with **Vite +
TypeScript**, sharing one engine (`shared/src`) and one asset folder
(`shared/assets`). Each game builds to its own self-contained bundle.

## Layout
```
shared/
  src/
    boot.ts            standard Playables boot (splash → firstFrameReady → load → gameReady, pause wiring)
    sdk/               Playables wrapper (ONLY place that touches window.ytgame) + SDK types
    engine/            Stage (DPR canvas), GameLoop, SceneManager, input, math, ease, rng, path, particles
    audio/sfx.ts       procedural WebAudio SFX that respect YouTube audio state
    save/save-store.ts versioned JSON save on loadData/saveData
    ui/                Button, draw helpers, colours, glyphs, bead sprites, icons
    styles/base.css    full-bleed canvas CSS
  assets/              shared files (icons/*.svg …), imported via '@shared-assets/...'
games/
  _template/           copied by `npm run new-game`
  <game-id>/           index.html, game.json, GAME.md, public/, src/
rust/                  Cargo workspace (see "Rust / WebAssembly" below)
  crates/playables-core   shared no_std helpers (rng, math, paths) for every game
  crates/<game>           no_std game rules, natively testable
  crates/<game>-wasm      C-ABI exports → wasm32-unknown-unknown
  crates/<game>-tools     native tools (level generators, parity traces)
scripts/game.mjs       CLI: dev | build | build-all | preview | zip | new | list | wasm | task
vite.config.ts         single config; GAME env selects games/<id>
dist/<id>/             build output (git-ignored)
releases/<id>-<ver>.zip  upload-ready bundles (git-ignored)
```

## Commands
```bash
npm install
npm run list
npm run dev -- <game-id>          # dev server
npm run build -- <game-id>
npm run build:all
npm run zip -- <game-id>          # build + validate Playables limits + zip
npm run new-game -- <id> "Title"  # scaffold from games/_template
npm run typecheck                 # must pass before committing
npm run wasm -- <game-id>         # cargo build the game's -wasm crate (game.json "wasm")
npm run levels -- <game-id>       # game.json scripts.levels (e.g. Rust level generator)
npm run parity -- <game-id>       # game.json scripts.parity (Rust ↔ TS check)
npm run test:rust                 # cargo test for the whole workspace
```

## Rust / WebAssembly
- Hot game logic (simulation, per-frame geometry) lives in Rust: `no_std`, **no
  allocator**, fixed-size struct-of-arrays state, exported with `#[no_mangle] extern "C"`.
  JS reads state through zero-copy typed-array views (memory never grows).
- Heavy offline work (level generation + solver verification) runs as native Rust tools.
- Each game keeps a TypeScript mirror of its sim as a fallback, kept identical by a
  checksum parity test. Rule changes go into BOTH and must pass `npm run parity`.
- `npm run build`/`zip` try to build wasm first. Without Rust installed they warn and
  use the committed `.wasm` (or the TS fallback). **Commit the built .wasm.**
- Setup: install Rust from https://rustup.rs, then `rustup target add wasm32-unknown-unknown`.
- Shared loader: `shared/src/wasm/load.ts` (`instantiateWasm`). Import wasm with
  `import.meta.glob('./wasm/*.wasm', { query: '?url', import: 'default', eager: true })`
  so the bundle still builds before the first wasm build.

## Conventions
- Import shared code with `@shared/...`, shared files with `@shared-assets/...`.
  Never use relative paths that climb from a game into `shared/`.
- **Reusable across games → `shared/`. Game-specific → `games/<id>/`.** If you
  improve something in `shared/`, keep it backward compatible or update every game
  (`npm run build:all` + typecheck).
- Game folders are kebab-case. File names in a bundle must match `[A-Za-z0-9_.-]`.
- Keep game rules in pure classes (no drawing), rendering in separate modules, and
  wiring in scenes. See `games/bead-loop` for the pattern.
- Canvas 2D, no engine dependency. Draw in CSS pixels; `Stage` handles DPR.
- Strict TypeScript (`noUnusedLocals`, `noUnusedParameters`).
- New game checklist: `npm run new-game`, edit `game.json`, write `GAME.md`,
  implement, `npm run zip`.

## YouTube Playables rules (enforced by shared code; don't bypass)
- `index.html` loads `<script src="https://www.youtube.com/game_api/v1"></script>`
  **before** game code. `index.html` sits at the bundle root.
- Call `firstFrameReady()` while a loading screen shows, and `gameReady()` only when
  the game is interactive. `bootPlayable` does both.
- On `onPause`, stop everything (loop, audio, input) and save. Resume only on
  `onResume`. **Never** use the Page Visibility API.
- Save progress only through `Playables.saveData` (via `SaveStore`). `await load()`
  before saving. Saves must stay backward compatible (version + migrate). Size < 500 KiB.
- Audio: no master mute button. Respect `isAudioEnabled` and `onAudioEnabledChange`
  (`Sfx` does). Sound starts only after a user gesture.
- `sendScore` takes an integer. The best score sent must equal the best score in the save.
- Bundle: relative paths only (`base: './'`), no external network requests or CDN
  fonts, initial bundle < 30 MiB (aim < 15), each file < 30 MiB (aim < 512 KiB),
  ≤ 8000 files, total < 250 MiB. `npm run zip` checks these.
- Must work on mobile (iOS/Android YouTube app) and desktop, in any aspect ratio.
- The SDK does nothing locally. Run the official Playables test suite before release.
- Docs: https://developers.google.com/youtube/gaming/playables

## Content
Games may borrow *mechanics* from existing games, but art, names, characters,
text and branding must be original.
