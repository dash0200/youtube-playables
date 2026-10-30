import { roundRect, text } from './draw';
import { shade } from './color';
import { pointInRect } from '../engine/math';

export interface ButtonOptions {
  label?: string;
  icon?: HTMLImageElement;
  color?: string;
  textColor?: string;
  onTap: () => void;
  /** 'pill' = filled button, 'ghost' = translucent icon button. */
  style?: 'pill' | 'ghost';
  disabled?: boolean;
}

/** Canvas button with press animation. Fires on pointer-down for snappy feel. */
export class Button {
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  visible = true;
  private press = 0;

  constructor(public opts: ButtonOptions) {}

  set(x: number, y: number, w: number, h: number): this {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    return this;
  }

  hit(px: number, py: number): boolean {
    const pad = Math.max(0, 44 - Math.min(this.w, this.h)) / 2; // >= 44px touch target
    return this.visible && !this.opts.disabled && pointInRect(px, py, this.x - pad, this.y - pad, this.w + pad * 2, this.h + pad * 2);
  }

  tap(): void {
    this.press = 1;
    this.opts.onTap();
  }

  update(dt: number): void {
    this.press = Math.max(0, this.press - dt * 6);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;
    const { x, y, w, h, opts } = this;
    const s = 1 - this.press * 0.08;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(s, s);
    ctx.globalAlpha = opts.disabled ? 0.4 : 1;
    const r = Math.min(h / 2, w / 2);
    if (opts.style === 'ghost') {
      roundRect(ctx, -w / 2, -h / 2, w, h, r * 0.6);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      const c = opts.color ?? '#7c5cff';
      roundRect(ctx, -w / 2, -h / 2 + h * 0.08, w, h, r);
      ctx.fillStyle = shade(c, -0.4);
      ctx.fill();
      roundRect(ctx, -w / 2, -h / 2, w, h, r);
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      g.addColorStop(0, shade(c, 0.18));
      g.addColorStop(1, c);
      ctx.fillStyle = g;
      ctx.fill();
    }
    const iconSize = h * 0.5;
    if (opts.icon && opts.label) {
      ctx.font = `800 ${Math.round(h * 0.38)}px system-ui`;
      const tw = ctx.measureText(opts.label).width;
      const total = iconSize + h * 0.18 + tw;
      ctx.drawImage(opts.icon, -total / 2, -iconSize / 2, iconSize, iconSize);
      text(ctx, opts.label, -total / 2 + iconSize + h * 0.18, 0, h * 0.38, opts.textColor ?? '#fff', { align: 'left', weight: 800 });
    } else if (opts.icon) {
      ctx.drawImage(opts.icon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
    } else if (opts.label) {
      text(ctx, opts.label, 0, 0, h * 0.4, opts.textColor ?? '#fff', { weight: 800 });
    }
    ctx.restore();
  }
}

export class ButtonSet {
  readonly list: Button[] = [];

  add(b: Button): Button {
    this.list.push(b);
    return b;
  }

  /** Returns true if a button consumed the tap. */
  down(x: number, y: number): boolean {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].hit(x, y)) {
        this.list[i].tap();
        return true;
      }
    }
    return false;
  }

  update(dt: number): void {
    this.list.forEach((b) => b.update(dt));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.list.forEach((b) => b.draw(ctx));
  }
}
