export interface PointerSink {
  pointerDown?(x: number, y: number): void;
  pointerMove?(x: number, y: number): void;
  pointerUp?(x: number, y: number): void;
}

/** Routes pointer events (mouse, touch, pen) to a sink in canvas CSS-pixel coordinates. */
export function attachPointer(canvas: HTMLCanvasElement, sink: () => PointerSink | null): void {
  const pos = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sink()?.pointerDown?.(...pos(e));
  });
  canvas.addEventListener('pointermove', (e) => sink()?.pointerMove?.(...pos(e)));
  canvas.addEventListener('pointerup', (e) => sink()?.pointerUp?.(...pos(e)));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
