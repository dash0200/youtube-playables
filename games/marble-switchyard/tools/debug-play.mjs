#!/usr/bin/env node
/** Tuning aid: replays one generated level with the naive player and prints every tap and spill.
 *  node games/marble-switchyard/tools/debug-play.mjs <level> [attempt] [seed] */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const [n = 4, attempt = 0, seed = 1000] = process.argv.slice(2).map(Number);
process.env.GAME = 'marble-switchyard';
const { createServer } = await import('vite');
const server = await createServer({ configFile: resolve(root, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const gen = await server.ssrLoadModule('/src/tools/generate.ts');
const { Sim, EV } = await server.ssrLoadModule('/src/sim/sim.ts');
const { Planner } = await server.ssrLoadModule('/src/sim/bot.ts');
const { Rng } = await server.ssrLoadModule('/@fs/' + resolve(root, 'shared/src/engine/rng.ts').replaceAll('\\', '/'));

const l = gen.build(n, attempt);
console.log(JSON.stringify({ tree: l.tree, cups: l.cups, gates: l.gates, seq: l.seq, interval: l.interval, speed: l.speed }));
const sim = new Sim(l);
const plan = new Planner(sim);
const rng = new Rng(seed * 7919 + 17);
let next = 0.4;
while (!sim.over && sim.time < 300) {
  if (sim.time >= next) {
    next += 0.4 + rng.float() * 0.35;
    const a = plan.naive();
    if (a.gate >= 0) {
      sim.tap(a.gate);
      console.log(`${sim.time.toFixed(2)} tap gate ${a.gate} for marble ${a.marble} -> cup ${a.cup}`);
    }
  }
  sim.update(1 / 30);
  for (const e of sim.events) {
    if (e.type === EV.SPILL) console.log(`${sim.time.toFixed(2)} SPILL marble ${e.b} in cup ${e.a} (cup colour ${sim.cups[e.a].color}, ${sim.cups[e.a].count}/${sim.cups[e.a].cap})`);
    if (e.type === EV.SPAWN) console.log(`${sim.time.toFixed(2)} spawn marble ${e.a} colour ${e.b}`);
    if (e.type === EV.CUP) console.log(`${sim.time.toFixed(2)} cup ${e.a} <- marble ${e.b}`);
  }
  sim.events.length = 0;
}
console.log(sim.won ? 'WON' : sim.lost ? 'LOST' : 'TIMEOUT', sim.time.toFixed(1), 'spills', sim.spills);
await server.close();
