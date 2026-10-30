#!/usr/bin/env node
/**
 * Generates games/marble-switchyard/src/game/levels.json with the TypeScript
 * generator (src/tools/generate.ts), loaded through Vite SSR so @shared aliases
 * resolve. Usage: npm run levels -- marble-switchyard [count]
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const count = Number(process.argv[2] ?? 60);
process.env.GAME = 'marble-switchyard';
const { createServer } = await import('vite');
const server = await createServer({ configFile: resolve(root, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const gen = await server.ssrLoadModule('/src/tools/generate.ts');

const levels = [];
const t0 = Date.now();
for (let n = 1; n <= count; n++) {
  const g = gen.generate(n);
  levels.push(g.level);
  const l = g.level;
  console.log(
    `level ${String(n).padStart(2)}: ${l.cups.length} cups, ${new Set(l.cups.map((c) => c.color)).size} colours, ` +
      `${l.seq.length} marbles, tree ${l.tree.padEnd(11)} every ${l.interval.toFixed(2)}s, par ${String(l.par).padStart(3)}s, ` +
      `naive ${(g.naive * 100).toFixed(0).padStart(3)}% (target ${(gen.target(n) * 100).toFixed(0)}%, attempt ${g.attempt})`,
  );
}
writeFileSync(resolve(root, 'games/marble-switchyard/src/game/levels.json'), JSON.stringify(levels));
console.log(`wrote ${levels.length} levels in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await server.close();
