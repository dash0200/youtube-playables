/**
 * Station 5: Zen Pentatonic Chime Spiral & Glass Marbles
 * Mesmerizing physics marble dropper bouncing across tuned acoustic chime bars,
 * emitting pure pentatonic harmonic chimes with binaural stereo panning.
 */

class ZenChimesStation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.chimes = [];
    this.marbles = [];
    this.rings = [];
    this.autoDrop = true;
    this.lastDropTime = 0;
    this.dropInterval = 900; // ms

    this.initChimes();
  }

  get width() {
    return this.canvas.logicalWidth || this.canvas.width;
  }

  get height() {
    return this.canvas.logicalHeight || this.canvas.height;
  }

  initChimes() {
    this.chimes = [];
    this.marbles = [];
    this.rings = [];

    const w = this.width;
    const h = this.height;
    const cx = w / 2;

    // 8 Tuned Chime Bars arranged in a cascading acoustic path
    const notesData = [
      { x: cx - 90, y: 150, length: 110, angle: 0.22, note: 0, color: '#FFB5A7' },
      { x: cx + 80, y: 220, length: 100, angle: -0.25, note: 1, color: '#FCD5CE' },
      { x: cx - 80, y: 290, length: 95, angle: 0.24, note: 2, color: '#F8EDEB' },
      { x: cx + 70, y: 360, length: 90, angle: -0.22, note: 3, color: '#D8E2DC' },
      { x: cx - 60, y: 430, length: 85, angle: 0.20, note: 4, color: '#ECE4DB' },
      { x: cx + 50, y: 500, length: 80, angle: -0.18, note: 5, color: '#FFE5D9' }
    ];

    for (let d of notesData) {
      this.chimes.push({
        x: d.x,
        y: d.y,
        length: d.length,
        angle: d.angle,
        note: d.note,
        color: d.color,
        glow: 0,
        width: 14
      });
    }
  }

  reset() {
    this.marbles = [];
    this.rings = [];
  }

  toggleAutoDrop() {
    this.autoDrop = !this.autoDrop;
    return this.autoDrop;
  }

  dropMarble(x = null, y = 60) {
    const cx = this.width / 2;
    const spawnX = x !== null ? x : cx + (Math.random() - 0.5) * 40;

    this.marbles.push({
      x: spawnX,
      y: y,
      vx: (Math.random() - 0.5) * 1.5,
      vy: 1.2,
      r: 10,
      color: Math.random() > 0.4 ? '#FFD700' : '#A7F3D0',
      isGlass: Math.random() > 0.5
    });

    if (window.audioEngine) {
      // Soft spawn click
      window.audioEngine._playSubClick(
        window.audioEngine.ctx ? window.audioEngine.ctx.currentTime : 0,
        window.audioEngine.getPanning(spawnX),
        440
      );
    }
  }

  onPointerDown(x, y) {
    this.dropMarble(x, y);
    if (window.triggerHaptic) {
      window.triggerHaptic(10);
    }
  }

  onPointerMove(x, y) {}

  onPointerUp() {}

  update() {
    const now = performance.now();
    if (this.autoDrop && now - this.lastDropTime > this.dropInterval) {
      this.dropMarble();
      this.lastDropTime = now;
    }

    const gravity = 0.32;
    const floorY = this.height - 40;

    // Update Marbles & Chime Collisions
    for (let i = this.marbles.length - 1; i >= 0; i--) {
      const m = this.marbles[i];
      m.vy += gravity;
      m.x += m.vx;
      m.y += m.vy;

      // Check collision against each chime bar line segment
      for (let ch of this.chimes) {
        const halfL = ch.length / 2;
        const cosA = Math.cos(ch.angle);
        const sinA = Math.sin(ch.angle);

        const x1 = ch.x - cosA * halfL;
        const y1 = ch.y - sinA * halfL;
        const x2 = ch.x + cosA * halfL;
        const y2 = ch.y + sinA * halfL;

        // Line-circle distance
        const dx = x2 - x1;
        const dy = y2 - y1;
        const l2 = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((m.x - x1) * dx + (m.y - y1) * dy) / l2));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;

        const dist = Math.sqrt((m.x - projX) ** 2 + (m.y - projY) ** 2);

        if (dist < m.r + ch.width / 2 && m.vy > 0) {
          // Collision hit!
          ch.glow = 1.0;

          // Sound trigger
          if (window.audioEngine) {
            window.audioEngine.playChime(ch.note, m.x);
          }

          // Haptic
          if (window.triggerHaptic) {
            window.triggerHaptic(12);
          }

          // Soundwave ripple ring
          this.rings.push({
            x: projX,
            y: projY,
            r: 4,
            alpha: 0.8,
            color: ch.color
          });

          // Reflect velocity along normal
          const nx = -(y2 - y1) / Math.sqrt(l2);
          const ny = (x2 - x1) / Math.sqrt(l2);

          const dot = m.vx * nx + m.vy * ny;
          m.vx = (m.vx - 2 * dot * nx) * 0.72 + (ch.angle > 0 ? 1.5 : -1.5);
          m.vy = (m.vy - 2 * dot * ny) * 0.72;

          // Reposition outside bar
          m.x = projX + nx * (m.r + ch.width / 2 + 1);
          m.y = projY + ny * (m.r + ch.width / 2 + 1);
        }
      }

      // Tray collection at bottom
      if (m.y > floorY) {
        this.marbles.splice(i, 1);
      }
    }

    // Decay Chime Glows
    for (let ch of this.chimes) {
      if (ch.glow > 0) {
        ch.glow -= 0.035;
        if (ch.glow < 0) ch.glow = 0;
      }
    }

    // Update Ripple Rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.r += 2.2;
      ring.alpha -= 0.03;
      if (ring.alpha <= 0) {
        this.rings.splice(i, 1);
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Soundwave Ripple Rings
    for (let ring of this.rings) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = ring.alpha;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    // 2. Draw Tuned Xylophone / Crystal Chime Bars
    for (let ch of this.chimes) {
      this._drawChime(ctx, ch);
    }

    // 3. Draw Crystal & Gold Glass Marbles
    for (let m of this.marbles) {
      this._drawMarble(ctx, m);
    }

    // 4. Draw Zen Marble Collection Tray at Bottom
    this._drawTray(ctx, w, h);
  }

  _drawChime(ctx, ch) {
    ctx.save();
    ctx.translate(ch.x, ch.y);
    ctx.rotate(ch.angle);

    const halfL = ch.length / 2;
    const halfW = ch.width / 2;

    // Soft Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;

    // Chime Bar Body
    ctx.fillStyle = ch.color;
    ctx.beginPath();
    ctx.roundRect(-halfL, -halfW, ch.length, ch.width, 6);
    ctx.fill();

    // Glow on Strike
    if (ch.glow > 0) {
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 24 * ch.glow;
      ctx.strokeStyle = `rgba(255, 255, 255, ${ch.glow})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Steel Pin Mounting Dots
    ctx.fillStyle = '#64748B';
    ctx.beginPath();
    ctx.arc(-halfL + 12, 0, 2.5, 0, Math.PI * 2);
    ctx.arc(halfL - 12, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawMarble(ctx, m) {
    ctx.save();
    ctx.translate(m.x, m.y);

    // Marble Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;

    // Glass / Gold Spherical Body
    const grad = ctx.createRadialGradient(-m.r * 0.35, -m.r * 0.35, 1, 0, 0, m.r);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.3, m.color);
    grad.addColorStop(1, '#0F172A');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, m.r, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(-m.r * 0.35, -m.r * 0.35, m.r * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawTray(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - 130, h - 36, 260, 24, 12);
    ctx.fill();

    ctx.strokeStyle = 'rgba(226, 232, 240, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

window.ZenChimesStation = ZenChimesStation;
