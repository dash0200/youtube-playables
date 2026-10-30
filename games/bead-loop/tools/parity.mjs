#!/usr/bin/env node
/**
 * Rust ↔ TypeScript parity check for the Bead Loop simulation.
 * Runs the same scripted session through the native Rust sim (cargo `trace`)
 * and the TypeScript fallback (via Vite SSR so @shared aliases resolve), then
 * compares state checksums every second. Usage: npm run parity -- bead-loop
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const levelsPath = resolve(root, 'games/bead-loop/src/game/levels.json');
const levels = JSON.parse(readFileSync(levelsPath, 'utf8'));
const pick = [1, 2, 5, 10, 15, 20, 30, 45, levels.length].filter((n, i, a) => n <= levels.length && a.indexOf(n) === i);

process.env.GAME = 'bead-loop';
const { createServer } = await import('vite');
const server = await createServer({ configFile: resolve(root, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { TsSim } = await server.ssrLoadModule('/src/sim/ts-sim.ts');

let failed = 0;
for (const n of pick) {
  const rust = execFileSync('cargo', ['run', '-q', '--release', '-p', 'bead-loop-tools', '--bin', 'trace', '--', levelsPath, String(n)], {
    cwd: resolve(root, 'rust'), encoding: 'utf8',
  }).trim().split('\n');
  const l = levels[n - 1];
  const sim = new TsSim();
  sim.init(l);
  for (let t = 0; t < l.colors; t++) sim.setPort(t, 0.62 + t * 0.025);
  const ts = [];
  for (let f = 0; f < 2400; f++) {
    if (f % 25 === 0) sim.tap((Math.floor(f / 25) * 7 + 3) % l.colors);
    sim.update(1 / 60);
    sim.clearEvents();
    if (f % 60 === 59) ts.push(`${f} ${sim.s.scal[0].toFixed(6)} ${sim.checksum()}`);
  }
  const bad = ts.findIndex((line, i) => line !== rust[i]);
  if (bad >= 0 || ts.length !== rust.length) {
    failed++;
    console.log(`✖ level ${n}: first mismatch at line ${bad}\n  rust: ${rust[bad]}\n  ts:   ${ts[bad]}`);
  } else console.log(`✔ level ${n}: ${ts.length} checkpoints identical`);
}
await server.close();
process.exit(failed ? 1 : 0);
