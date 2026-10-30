#!/usr/bin/env node
/**
 * Rust <-> TypeScript parity check for the Marble Switchyard simulation.
 * Runs the same scripted session through the native Rust sim (cargo `ms-trace`)
 * and the TypeScript sim (via Vite SSR so @shared aliases resolve), and compares
 * state checksums every second. Usage: npm run parity -- marble-switchyard
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const levelsPath = resolve(root, 'games/marble-switchyard/src/game/levels.json');
const levels = JSON.parse(readFileSync(levelsPath, 'utf8'));
const pick = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, levels.length].filter((n, i, a) => n <= levels.length && a.indexOf(n) === i);

process.env.GAME = 'marble-switchyard';
const { createServer } = await import('vite');
const server = await createServer({ configFile: resolve(root, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { Sim } = await server.ssrLoadModule('/src/sim/sim.ts');

let failed = 0;
for (const n of pick) {
  const rust = execFileSync('cargo', ['run', '-q', '--release', '-p', 'marble-switchyard-tools', '--bin', 'ms-trace', '--', levelsPath, String(n)], {
    cwd: resolve(root, 'rust'), encoding: 'utf8', shell: process.platform === 'win32',
  }).trim().split(/\r?\n/);
  // same script as trace() in rust/crates/marble-switchyard-tools/src/lib.rs
  const sim = new Sim(levels[n - 1]);
  const ts = [];
  for (let f = 0; f < 3600; f++) {
    if (f % 23 === 0 && sim.gate.length > 0) sim.tap((Math.floor(f / 23) * 5 + 1) % sim.gate.length);
    sim.update(1 / 60);
    sim.events.length = 0;
    if (f % 60 === 59) ts.push(`${f} ${sim.checksum()}`);
  }
  const bad = ts.findIndex((line, i) => line !== rust[i]);
  if (bad >= 0 || ts.length !== rust.length) {
    failed++;
    console.log(`✖ level ${n}: first mismatch at line ${bad}\n  rust: ${rust[bad]}\n  ts:   ${ts[bad]}`);
  } else console.log(`✔ level ${n}: ${ts.length} checkpoints identical`);
}
await server.close();
process.exit(failed ? 1 : 0);
