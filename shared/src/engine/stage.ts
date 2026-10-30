/**
 * Full-window, DPR-aware canvas. All drawing uses CSS pixels; the transform
 * for device pixels is applied in beginFrame(). Listen for size changes with
 * onResize — Playables run in many aspect ratios (portrait phones, desktop,
 * landscape), so layouts must be recomputed, never hard-coded.
 */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  width = 1;
  height = 1;
  dpr = 1;
  private readonly listeners: Array<(w: number, h: number) => void> = [];

  constructor(private readonly host: HTMLElement, private readonly maxDpr = 2) {
    this.canvas = document.createElement('canvas');
    host.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(host);
    this.resize();
  }

  onResize(cb: (w: number, h: number) => void): void {
    this.listeners.push(cb);
  }

  resize(): void {
    const rect = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.beginFrame();
    this.listeners.forEach((cb) => cb(w, h));
  }

  beginFrame(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
}
