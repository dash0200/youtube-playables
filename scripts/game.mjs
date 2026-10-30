#!/usr/bin/env node
/**
 * Cross-platform CLI for the monorepo.
 *
 *   npm run list                       list games
 *   npm run dev       -- <game>        dev server with hot reload
 *   npm run build     -- <game>        production build -> dist/<game>
 *   npm run build:all                  build every game
 *   npm run preview   -- <game>        build + serve dist/<game>
 *   npm run zip       -- <game>        build + validate + releases/<game>-<version>.zip
 *   npm run new-game  -- <id> ["Title"] scaffold games/<id> from games/_template
 *   npm run wasm      -- <game>        cargo build the game's Rust crate → .wasm (see game.json "wasm")
 *   npm run levels    -- <game>        run game.json scripts.levels   (e.g. Rust level generator)
 *   npm run parity    -- <game>        run game.json scripts.parity   (Rust ↔ TS check)
 *
 * If <game> is omitted and only one game exists, that game is used.
 */
import {
  readdirSync, existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, statSync,
} from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const gamesDir = join(root, 'games');
const configFile = join(root, 'vite.config.ts');

const MiB = 1024 * 1024;
const LIMITS = {
  fileMust: 30 * MiB,
  fileShould: 512 * 1024,
  totalMust: 250 * MiB,
  maxFiles: 8000,
};
const NAME_RE = /^[A-Za-z0-9_.-]+$/;
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

const [cmd, ...args] = process.argv.slice(2);

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function listGames() {
  if (!existsSync(gamesDir)) return [];
  return readdirSync(gamesDir)
    .filter((n) => !n.startsWith('_') && existsSync(join(gamesDir, n, 'index.html')))
    .sort();
}

function pickGame(name) {
  const games = listGames();
  if (name) {
    if (!games.includes(name)) die(`Unknown game "${name}". Available: ${games.join(', ') || '(none)'}`);
    return name;
  }
  if (games.length === 1) return games[0];
  die(`Pass a game name, e.g. "npm run ${cmd} -- ${games[0] ?? 'my-game'}". Available: ${games.join(', ')}`);
}

function readMeta(game) {
  const p = join(gamesDir, game, 'game.json');
  if (!existsSync(p)) return { id: game, title: game, version: '0.0.0' };
  return JSON.parse(readFileSync(p, 'utf8'));
}

async function vite() {
  return import('vite');
}

/**
 * Builds the game's Rust crate to wasm32-unknown-unknown and copies the .wasm
 * into the game's source tree. game.json: { "wasm": { "crate": "x-wasm", "out": "src/wasm/x.wasm" } }
 * Returns false (with a warning) if cargo or the wasm target is unavailable.
 */
function buildWasm(game, { required = false } = {}) {
  const cfg = readMeta(game).wasm;
  if (!cfg) return true;
  const rustDir = join(root, 'rust');
  console.log(`\n▶ Building Rust crate ${cfg.crate} → wasm`);
  const r = spawnSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown', '-p', cfg.crate], {
    cwd: rustDir, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    const msg = 'Rust → wasm build failed. Install Rust (https://rustup.rs) and run: rustup target add wasm32-unknown-unknown';
    if (required) die(msg);
    console.warn(`  ⚠ ${msg}\n  ⚠ Continuing with the existing .wasm (or the TypeScript fallback if none).`);
    return false;
  }
  const built = join(rustDir, 'target', 'wasm32-unknown-unknown', 'release', `${cfg.crate.replaceAll('-', '_')}.wasm`);
  const out = join(gamesDir, game, cfg.out);
  mkdirSync(resolve(out, '..'), { recursive: true });
  cpSync(built, out);
  console.log(`  ✔ ${relative(root, out)} (${fmt(statSync(out).size)})`);
  return true;
}

function runTask(task, game) {
  const cmdLine = readMeta(game).scripts?.[task];
  if (!cmdLine) die(`games/${game}/game.json has no scripts.${task}`);
  console.log(`▶ ${cmdLine}`);
  const r = spawnSync(cmdLine, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function buildGame(game) {
  if (process.env.SKIP_WASM !== '1') buildWasm(game);
  process.env.GAME = game;
  const { build } = await vite();
  console.log(`\n▶ Building ${game}`);
  await build({ configFile, logLevel: 'info' });
  return join(root, 'dist', game);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function fmt(bytes) {
  return bytes > MiB ? `${(bytes / MiB).toFixed(2)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`;
}

/** Checks the built bundle against the Playables file/size rules. */
function validateBundle(dist) {
  const files = walk(dist);
  const errors = [];
  const warnings = [];
  let total = 0;
  if (!existsSync(join(dist, 'index.html'))) errors.push('index.html must be at the bundle root');
  if (files.length > LIMITS.maxFiles) errors.push(`${files.length} files (max ${LIMITS.maxFiles})`);
  for (const f of files) {
    const rel = relative(dist, f);
    const size = statSync(f).size;
    total += size;
    for (const part of rel.split(sep)) {
      if (!NAME_RE.test(part)) errors.push(`Invalid file name "${rel}" (letters, digits, _ - . only)`);
    }
    if (size > LIMITS.fileMust) errors.push(`${rel} is ${fmt(size)} (max 30 MiB)`);
    else if (size > LIMITS.fileShould) warnings.push(`${rel} is ${fmt(size)} (recommended < 512 KiB)`);
  }
  if (total > LIMITS.totalMust) errors.push(`Bundle is ${fmt(total)} (max 250 MiB)`);
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  if (!html.includes('https://www.youtube.com/game_api/v1')) {
    errors.push('index.html does not load the Playables SDK (https://www.youtube.com/game_api/v1)');
  }
  if (/(src|href)="\/(?!\/)/.test(html)) errors.push('index.html contains absolute paths; use relative ones');
  return { files, total, errors, warnings };
}

async function zipGame(game) {
  const dist = await buildGame(game);
  const { files, total, errors, warnings } = validateBundle(dist);
  warnings.forEach((w) => console.warn(`  ⚠ ${w}`));
  if (errors.length) die(`Bundle check failed:\n  - ${errors.join('\n  - ')}`);
  const { zipSync } = await import('fflate');
  const entries = {};
  for (const f of files) {
    entries[relative(dist, f).split(sep).join('/')] = readFileSync(f);
  }
  const meta = readMeta(game);
  const outDir = join(root, 'releases');
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${game}-${meta.version}.zip`);
  writeFileSync(out, zipSync(entries, { level: 9 }));
  console.log(`\n✔ ${files.length} files, ${fmt(total)} unzipped → ${relative(root, out)} (${fmt(statSync(out).size)})`);
}

function scaffold(id, title) {
  if (!id || !ID_RE.test(id)) die('Usage: npm run new-game -- <kebab-case-id> ["Title"]');
  const dest = join(gamesDir, id);
  if (existsSync(dest)) die(`games/${id} already exists`);
  const tpl = join(gamesDir, '_template');
  cpSync(tpl, dest, { recursive: true });
  const niceTitle = title || id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  for (const f of walk(dest)) {
    if (!/\.(ts|html|json|md)$/.test(f)) continue;
    const src = readFileSync(f, 'utf8');
    writeFileSync(f, src.replaceAll('__GAME_ID__', id).replaceAll('__GAME_TITLE__', niceTitle));
  }
  console.log(`✔ Created games/${id}. Run: npm run dev -- ${id}`);
}

switch (cmd) {
  case 'list':
    console.log(listGames().map((g) => `${g}  (${readMeta(g).title} v${readMeta(g).version})`).join('\n') || '(no games)');
    break;
  case 'dev': {
    process.env.GAME = pickGame(args[0]);
    const { createServer } = await vite();
    const server = await createServer({ configFile });
    await server.listen();
    server.printUrls();
    break;
  }
  case 'build':
    await buildGame(pickGame(args[0]));
    break;
  case 'build-all':
    for (const g of listGames()) await buildGame(g);
    break;
  case 'preview': {
    const game = pickGame(args[0]);
    await buildGame(game);
    const { preview } = await vite();
    const server = await preview({ configFile });
    server.printUrls();
    break;
  }
  case 'zip':
    await zipGame(pickGame(args[0]));
    break;
  case 'new':
    scaffold(args[0], args[1]);
    break;
  case 'wasm':
    buildWasm(pickGame(args[0]), { required: true });
    break;
  case 'task':
    runTask(args[0], pickGame(args[1]));
    break;
  default:
    die('Commands: list | dev | build | build-all | preview | zip | new | wasm | task <name>');
}
