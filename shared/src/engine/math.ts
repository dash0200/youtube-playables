export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Frame-rate independent exponential smoothing toward `b`. */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));
/** Always-positive modulo. */
export const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Deterministic 0..1 hash of an integer (stable visual jitter). */
export function hash01(i: number): number {
  let x = Math.imul(i | 0, 374761393) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function pointInRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}
