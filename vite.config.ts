import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * One Vite config for every game. The game to build/serve is chosen with the
 * GAME env var, which scripts/game.mjs sets for you:
 *   npm run dev -- bead-loop
 *   npm run build -- bead-loop
 */
const repoRoot = dirname(fileURLToPath(import.meta.url));
const game = process.env.GAME;

if (!game) {
  throw new Error('No game selected. Use: npm run dev -- <game-folder>');
}
const gameRoot = resolve(repoRoot, 'games', game);
if (!existsSync(resolve(gameRoot, 'index.html'))) {
  throw new Error(`games/${game}/index.html not found`);
}

export default defineConfig({
  root: gameRoot,
  // Playables requires every bundle reference to be relative.
  base: './',
  publicDir: resolve(gameRoot, 'public'),
  resolve: {
    alias: {
      '@shared': resolve(repoRoot, 'shared/src'),
      '@shared-assets': resolve(repoRoot, 'shared/assets'),
    },
  },
  define: {
    __GAME_ID__: JSON.stringify(game),
  },
  server: {
    host: true,
    fs: { allow: [repoRoot] },
  },
  preview: { host: true },
  build: {
    outDir: resolve(repoRoot, 'dist', game),
    emptyOutDir: true,
    target: 'es2020',
    assetsDir: 'assets',
    assetsInlineLimit: 4096,
    sourcemap: false,
  },
});
