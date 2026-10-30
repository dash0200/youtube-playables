# YouTube Playables

Monorepo of HTML5 games for YouTube Playables. Vite + TypeScript, with a shared
engine and shared assets.

| Game | Folder | Docs |
|---|---|---|
| Bead Loop | `games/bead-loop` | [GAME.md](games/bead-loop/GAME.md) |

## Quick start
```bash
npm install
npm run dev -- bead-loop       # play locally
npm run zip -- bead-loop       # releases/bead-loop-1.0.0.zip → upload to Playables
```

## Add a new game
```bash
npm run new-game -- my-game "My Game"
npm run dev -- my-game
```
It starts from `games/_template`, already wired to the shared boot, SDK, save and audio.

See [AGENTS.md](AGENTS.md) for structure, conventions and Playables requirements.
