import { wasmSupported } from '@shared/wasm/load';
import { Playables } from '@shared/sdk/playables';
import { TsSim } from './ts-sim';
import type { Sim } from './types';

export * from './types';

/**
 * The .wasm is produced by `npm run wasm -- bead-loop` (cargo build of
 * rust/crates/bead-loop-wasm) into src/wasm/. The glob resolves to {} when it
 * hasn't been built yet, so the game still builds and runs on the TS fallback.
 */
const wasmUrls = import.meta.glob('../wasm/*.wasm', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export async function createSim(): Promise<Sim> {
  const url = Object.values(wasmUrls)[0];
  if (url && wasmSupported()) {
    try {
      const { WasmSim } = await import('./wasm-sim');
      const sim = await WasmSim.load(url);
      console.info('[bead-loop] simulation: Rust/WebAssembly');
      return sim;
    } catch (e) {
      console.warn('[bead-loop] wasm failed, using TypeScript fallback', e);
      Playables.logWarning();
    }
  } else {
    console.info('[bead-loop] simulation: TypeScript fallback (run `npm run wasm -- bead-loop` to build Rust)');
  }
  return new TsSim();
}
