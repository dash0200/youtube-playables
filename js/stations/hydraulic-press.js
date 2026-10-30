/**
 * Station 4: Hydraulic Press Crusher
 * Realistic mechanical piston, pressure gauge, progressive micro-fractures,
 * screen-shake recoil, explosive multi-particle debris, and deep ASMR crunch audio.
 */

class HydraulicPressStation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.items = [
      {
        name: 'Rainbow Bath Bomb',
        type: 'bathbomb',
        colors: ['#FF6B6B', '#FFE66D', '#4ECDC4', '#9B5DE5', '#F15BB5'],
        shape: 'sphere',
        shatterPieces: 100
      },
      {
        name: 'Golden Honeycomb',
        type: 'honeycomb',
        colors: ['#FFAA00', '#FF8800', '#FFDD00', '#CC6600'],
        shape: 'hex',
        shatterPieces: 85
      },
      {
        name: 'Crystal Amethyst',
        type: 'crystal',
        colors: ['#9D4EDD', '#7B2CBF', '#5A189A', '#E0AAFF', '#C77DFF'],
        shape: 'crystal',
        shatterPieces: 110
      },
      {
        name: 'Pastel Chalk Bar',
        type: 'chalk',
        colors: ['#BEE1E6', '#FDE2E4', '#FAD2E1', '#E2ECE9', '#FFF1E6'],
        shape: 'cube',
        shatterPieces: 90
      }
    ];

    this.currentItemIndex = 0;
    this.pressY = 80;
    this.targetPressY = 80;
    this.minPressY = 80;
    this.maxPressY = 0; // Calculated dynamically based on canvas
    this.isPressing = false;
    this.crushProgress = 0; // 0.0 to 1.0
    this.isShattered = false;
    this.shatterParticles = [];
    this.fractureLines = [];
    this.screenShake = 0;
    this.leverY = 0;

    this.initItem();
  }

  get width() {
    return this.canvas.logicalWidth || this.canvas.width;
  }

  get height() {
    return this.canvas.logicalHeight || this.canvas.height;
  }

  initItem() {
    this.isShattered = false;
    this.crushProgress = 0;
    this.pressY = this.minPressY;
    this.targetPressY = this.minPressY;
    this.shatterParticles = [];
    this.fractureLines = [];

    // Pre-generate stress fracture paths
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const length = 20 + Math.random() * 45;
      this.fractureLines.push({
        x1: (Math.random() - 0.5) * 30,
        y1: (Math.random() - 0.5) * 30,
        x2: Math.cos(angle) * length,
        y2: Math.sin(angle) * length,
        threshold: 0.2 + (i / 14) * 0.65
      });
    }
  }

  setItem(index) {
    this.currentItemIndex = index % this.items.length;
    this.initItem();
  }

  nextItem() {
    this.setItem(this.currentItemIndex + 1);
  }

  reset() {
    this.initItem();
  }

  onPointerDown(x, y) {
    this.isPressing = true;
    this.updatePressTarget(y);
  }

  onPointerMove(x, y) {
    if (this.isPressing) {
      this.updatePressTarget(y);
    }
  }

  onPointerUp() {
    this.isPressing = false;
    // Release piston back up if not shattered or to clear
    if (this.isShattered) {
      this.targetPressY = this.minPressY;
    } else {
      this.targetPressY = this.minPressY;
    }
  }

  updatePressTarget(pointerY) {
    const anvilY = this.height / 2 + 100;
    const itemHeight = 90;
    this.maxPressY = anvilY - 10;

    // Follow pointer down
    const clampedY = Math.max(this.minPressY, Math.min(this.maxPressY, pointerY));
    this.targetPressY = clampedY;

    // Compute progress against item
    const contactY = anvilY - itemHeight;
    if (clampedY > contactY && !this.isShattered) {
      const depth = clampedY - contactY;
      this.crushProgress = Math.min(1.0, depth / (itemHeight - 12));

      // Audio strain & creak
      if (window.audioEngine) {
        window.audioEngine.playCrushStrain(this.width / 2, this.crushProgress);
      }

      // Haptic pulse
      if (window.triggerHaptic) {
        window.triggerHaptic(Math.floor(10 + this.crushProgress * 20));
      }

      // Trigger shatter explosion at 90% deformation
      if (this.crushProgress >= 0.88) {
        this.shatter();
      }
    } else if (!this.isShattered) {
      this.crushProgress = 0;
    }
  }

  shatter() {
    if (this.isShattered) return;
    this.isShattered = true;
    this.screenShake = 18;

    const item = this.items[this.currentItemIndex];
    const itemX = this.width / 2;
    const itemY = this.height / 2 + 50;
    const floorY = this.height / 2 + 105;

    // Explode into particle debris
    for (let i = 0; i < item.shatterPieces; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 12 + 2;
      const color = item.colors[i % item.colors.length];

      this.shatterParticles.push(
        new Particle(itemX + (Math.random() - 0.5) * 50, itemY + (Math.random() - 0.5) * 20, {
          vx: Math.cos(angle) * speed,
          vy: -Math.abs(Math.sin(angle) * speed) - 3,
          gravity: 0.38,
          friction: 0.96,
          size: Math.random() * 9 + 4,
          color: color,
          decay: 0.008,
          shape: item.type === 'crystal' ? 'shard' : 'rect',
          floorY: floorY
        })
      );
    }

    // Epic Crunch Sound
    if (window.audioEngine) {
      window.audioEngine.playCrushExplosion(itemX);
    }

    // Heavy Haptic
    if (window.triggerHaptic) {
      window.triggerHaptic(50);
    }
  }

  update() {
    // Smooth piston movement
    this.pressY += (this.targetPressY - this.pressY) * 0.25;

    // Camera shake decay
    if (this.screenShake > 0) {
      this.screenShake *= 0.85;
      if (this.screenShake < 0.2) this.screenShake = 0;
    }

    // Update debris
    for (let i = this.shatterParticles.length - 1; i >= 0; i--) {
      const alive = this.shatterParticles[i].update();
      if (!alive) {
        this.shatterParticles.splice(i, 1);
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const itemX = w / 2;
    const anvilY = h / 2 + 100;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Apply screen shake
    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(sx, sy);
    }

    // 1. Draw Cast Iron Anvil & Frame
    this._drawAnvil(ctx, itemX, anvilY);

    // 2. Draw Crunchable Item (or remaining crushed base)
    if (!this.isShattered) {
      this._drawCrunchable(ctx, itemX, anvilY - 45);
    }

    // 3. Draw Exploded Shatter Debris
    for (let p of this.shatterParticles) {
      p.draw(ctx);
    }

    // 4. Draw Heavy Hydraulic Piston Head & Column
    this._drawPiston(ctx, itemX, this.pressY);

    // 5. Draw Pressure Gauge HUD
    this._drawGauge(ctx, w - 85, 95);

    ctx.restore();
  }

  _drawAnvil(ctx, ax, ay) {
    // Base Anvil Platform
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;

    const baseGrad = ctx.createLinearGradient(ax - 130, 0, ax + 130, 0);
    baseGrad.addColorStop(0, '#64748B');
    baseGrad.addColorStop(0.5, '#94A3B8');
    baseGrad.addColorStop(1, '#475569');

    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.roundRect(ax - 120, ay, 240, 50, 12);
    ctx.fill();
    ctx.restore();

    // Polished Steel Top Surface
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(ax - 110, ay, 220, 6);

    // Pillar Guides
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(ax - 115, 30, 16, ay - 30);
    ctx.fillRect(ax + 99, 30, 16, ay - 30);
  }

  _drawCrunchable(ctx, cx, cy) {
    const item = this.items[this.currentItemIndex];
    const squishScaleY = 1.0 - this.crushProgress * 0.75;
    const squishScaleX = 1.0 + this.crushProgress * 0.65;
    const radius = 42;

    ctx.save();
    ctx.translate(cx, cy + (this.crushProgress * 30));
    ctx.scale(squishScaleX, squishScaleY);

    // Item Body
    if (item.shape === 'sphere') {
      // Concentric Rainbow Bath Bomb
      for (let i = item.colors.length - 1; i >= 0; i--) {
        const r = radius * ((i + 1) / item.colors.length);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = item.colors[i];
        ctx.fill();
      }
    } else if (item.shape === 'hex') {
      // Honeycomb Cells
      ctx.fillStyle = item.colors[0];
      ctx.beginPath();
      ctx.roundRect(-radius, -radius * 0.8, radius * 2, radius * 1.6, 16);
      ctx.fill();
      // Honey shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(-radius * 0.7, -radius * 0.5, radius * 1.4, 6);
    } else if (item.shape === 'crystal') {
      // Geometric Crystal Cluster
      ctx.fillStyle = item.colors[1];
      ctx.beginPath();
      ctx.moveTo(0, -radius * 1.2);
      ctx.lineTo(radius * 0.9, -radius * 0.3);
      ctx.lineTo(radius * 0.7, radius);
      ctx.lineTo(-radius * 0.7, radius);
      ctx.lineTo(-radius * 0.9, -radius * 0.3);
      ctx.closePath();
      ctx.fill();

      // Crystal facet
      ctx.fillStyle = item.colors[3];
      ctx.beginPath();
      ctx.moveTo(0, -radius * 1.2);
      ctx.lineTo(radius * 0.4, 0);
      ctx.lineTo(0, radius);
      ctx.lineTo(-radius * 0.4, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      // Pastel Chalk Block
      ctx.fillStyle = item.colors[0];
      ctx.beginPath();
      ctx.roundRect(-radius, -radius * 0.8, radius * 2, radius * 1.6, 12);
      ctx.fill();
    }

    // Stress Micro-Fractures
    if (this.crushProgress > 0.15) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.2;
      for (let f of this.fractureLines) {
        if (this.crushProgress >= f.threshold) {
          ctx.beginPath();
          ctx.moveTo(f.x1, f.y1);
          ctx.lineTo(f.x2, f.y2);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  _drawPiston(ctx, px, py) {
    const pw = 160;
    const ph = 40;

    // Piston Shaft
    const shaftGrad = ctx.createLinearGradient(px - 35, 0, px + 35, 0);
    shaftGrad.addColorStop(0, '#64748B');
    shaftGrad.addColorStop(0.5, '#E2E8F0');
    shaftGrad.addColorStop(1, '#475569');
    ctx.fillStyle = shaftGrad;
    ctx.fillRect(px - 35, 0, 70, py);

    // Heavy Steel Press Block
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;

    const blockGrad = ctx.createLinearGradient(px - pw / 2, 0, px + pw / 2, 0);
    blockGrad.addColorStop(0, '#334155');
    blockGrad.addColorStop(0.5, '#94A3B8');
    blockGrad.addColorStop(1, '#1E293B');

    ctx.fillStyle = blockGrad;
    ctx.beginPath();
    ctx.roundRect(px - pw / 2, py, pw, ph, 8);
    ctx.fill();
    ctx.restore();

    // Polished Mirror Steel Under-face
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(px - pw / 2 + 6, py + ph - 4, pw - 12, 4);
  }

  _drawGauge(ctx, gx, gy) {
    const tons = Math.floor(this.crushProgress * 100);

    ctx.save();
    // Dial background
    ctx.beginPath();
    ctx.arc(gx, gy, 38, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 10;
    ctx.fill();

    // Dial rim
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Needle
    const angle = -Math.PI * 0.75 + (this.crushProgress * Math.PI * 1.5);
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(angle) * 26, gy + Math.sin(angle) * 26);
    ctx.stroke();

    // Text Label
    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${tons}T`, gx, gy + 18);
    ctx.font = '9px system-ui';
    ctx.fillStyle = '#64748B';
    ctx.fillText('PRESSURE', gx, gy + 28);

    ctx.restore();
  }
}

window.HydraulicPressStation = HydraulicPressStation;
