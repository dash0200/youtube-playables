# YouTube Playables

Monorepo of HTML5 games for YouTube Playables. Vite + TypeScript, with a shared
engine and shared assets.

| Game | Folder | Docs |
|---|---|---|
| Bead Loop | `games/bead-loop` | [GAME.md](games/bead-loop/GAME.md) |
| Marble Switchyard | `games/marble-switchyard` | [GAME.md](games/marble-switchyard/GAME.md) |

## Quick start
```bash
npm install
rustup target add wasm32-unknown-unknown   # once (Rust from https://rustup.rs)
npm run wasm -- bead-loop      # rebuild a game's Rust/WebAssembly simulation (committed already)
npm run dev -- bead-loop       # play locally
npm run zip -- bead-loop       # releases/bead-loop-<version>.zip → upload to Playables
```
Every game's rules are written in Rust (`rust/`) and compiled to WebAssembly; the
built `.wasm` is committed, so builds and the Vercel demos ship it even without Rust
installed. Each game keeps a TypeScript copy of its rules (checked identical by
`npm run parity`) as a fallback.

## Add a new game
```bash
npm run new-game -- my-game "My Game"
npm run dev -- my-game
```
It starts from `games/_template`, already wired to the shared boot, SDK, save and audio.

See [AGENTS.md](AGENTS.md) for structure, conventions and Playables requirements.
