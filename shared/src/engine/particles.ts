interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rect: boolean;
  rot: number;
  vr: number;
}

/** Lightweight particle bursts and confetti, drawn in CSS-pixel space. */
export class Particles {
  private list: Particle[] = [];
  gravity = 900;

  burst(x: number, y: number, color: string, count = 14, speed = 240, size = 4): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.list.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3,
        life: 0, max: 0.45 + Math.random() * 0.35, size: size * (0.6 + Math.random() * 0.6),
        color, rect: false, rot: 0, vr: 0,
      });
    }
  }

  confetti(x: number, y: number, colors: readonly string[], count = 80, spread = 500): void {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const s = spread * (0.5 + Math.random() * 0.7);
      this.list.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, max: 1.4 + Math.random() * 1.0, size: 5 + Math.random() * 5,
        color: colors[i % colors.length], rect: true, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
      });
    }
  }

  clear(): void {
    this.list.length = 0;
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.list.splice(i, 1);
        continue;
      }
      const drag = p.rect ? 0.985 : 0.995;
      p.vx *= drag;
      p.vy = p.vy * drag + this.gravity * dt * (p.rect ? 0.45 : 1);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const a = 1 - (p.life / p.max) ** 2;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.rect) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
