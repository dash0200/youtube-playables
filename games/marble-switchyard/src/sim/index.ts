import { wasmSupported } from '@shared/wasm/load';
import { Playables } from '@shared/sdk/playables';
import { Sim, type LevelData, type MarbleSim } from './sim';

export * from './sim';

/**
 * The .wasm is produced by `npm run wasm -- marble-switchyard` (cargo build of
 * rust/crates/marble-switchyard-wasm) into src/wasm/ and committed. The glob
 * resolves to {} when it hasn't been built, so the game still builds and runs
 * on the TypeScript sim.
 */
const wasmUrls = import.meta.glob('../wasm/*.wasm', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export interface SimFactory {
  backend: 'wasm' | 'ts';
  create(level: LevelData): MarbleSim;
}

export async function loadSimFactory(): Promise<SimFactory> {
  const url = Object.values(wasmUrls)[0];
  if (url && wasmSupported()) {
    try {
      const { WasmModule } = await import('./wasm-sim');
      const mod = await WasmModule.load(url);
      console.info('[marble-switchyard] simulation: Rust/WebAssembly');
      return { backend: 'wasm', create: (l) => mod.create(l) };
    } catch (e) {
      console.warn('[marble-switchyard] wasm failed, using TypeScript fallback', e);
      Playables.logWarning();
    }
  } else {
    console.info('[marble-switchyard] simulation: TypeScript fallback (run `npm run wasm -- marble-switchyard` to build Rust)');
  }
  return { backend: 'ts', create: (l) => new Sim(l) };
}
