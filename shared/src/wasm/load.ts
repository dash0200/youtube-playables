/**
 * Loads a WebAssembly module that ships inside the game bundle.
 *
 * Use a Vite URL import so the .wasm is hashed and referenced relatively
 * (Playables requires relative paths and no external requests):
 *
 *   const urls = import.meta.glob('./wasm/*.wasm', { query: '?url', import: 'default', eager: true });
 *   const inst = await instantiateWasm(Object.values(urls)[0] as string);
 *
 * Falls back from instantiateStreaming to ArrayBuffer when the server sends a
 * wrong MIME type (common on static hosts).
 */
export async function instantiateWasm(url: string, imports: WebAssembly.Imports = {}): Promise<WebAssembly.Instance> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`wasm fetch failed: ${res.status} ${url}`);
  const streaming = typeof WebAssembly.instantiateStreaming === 'function' &&
    (res.headers.get('content-type') ?? '').includes('application/wasm');
  if (streaming) {
    try {
      const { instance } = await WebAssembly.instantiateStreaming(res.clone(), imports);
      return instance;
    } catch (e) {
      console.warn('[wasm] streaming compile failed, retrying with ArrayBuffer', e);
    }
  }
  const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), imports);
  return instance;
}

/** True if this browser can run WebAssembly at all. */
export const wasmSupported = (): boolean => typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
