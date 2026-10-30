/**
 * Station 2: Squishy Jelly & Slime Lab
 * Soft-body spring mesh with Bezier curve smoothing, floating internal toppings,
 * wobble physics, and juicy FM-synthesized ASMR squish audio.
 */

class SlimeJellyStation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.themes = [
      {
        name: 'Kawaii Peach',
        primary: '#FF9AA2',
        secondary: '#FFB7B2',
        innerGlow: '#FFE5D9',
        toppingEmoji: '🍑',
        glitterColor: '#FFF0F5'
      },
      {
        name: 'Galaxy Slime',
        primary: '#7209B7',
        secondary: '#B5179E',
        innerGlow: '#4CC9F0',
        toppingEmoji: '⭐',
        glitterColor: '#E0AAFF'
      },
      {
        name: 'Honey Jelly',
        primary: '#F39C12',
        secondary: '#F1C40F',
        innerGlow: '#FEF9E7',
        toppingEmoji: '🍯',
        glitterColor: '#FFFFFF'
      },
      {
        name: 'Matcha Pudding',
        primary: '#588157',
        secondary: '#8AA37B',
        innerGlow: '#E9EDC9',
        toppingEmoji: '🍃',
        glitterColor: '#FAF0CA'
      }
    ];

    this.currentThemeIndex = 0;
    this.nodeCount = 28;
    this.radius = 130;
    this.nodes = [];
    this.center = new Vec2(canvas.width / 2, canvas.height / 2);
    this.isDragging = false;
    this.dragPointer = new Vec2(0, 0);
    this.toppings = [];
    this.ripples = [];

    this.initSlime();
  }

  get width() {
    return this.canvas.logicalWidth || this.canvas.width;
  }

  get height() {
    return this.canvas.logicalHeight || this.canvas.height;
  }

  initSlime() {
    this.center.set(this.width / 2, this.height / 2 + 10);
    this.nodes = [];

    if (window.wasmBridge && window.wasmBridge.isReady) {
      this.nodeCount = 48;
      window.wasmBridge.initJelly(this.center.x, this.center.y, this.radius, this.nodeCount);
    } else {
      this.nodeCount = 28;
      for (let i = 0; i < this.nodeCount; i++) {
        const angle = (i / this.nodeCount) * Math.PI * 2;
        const x = this.center.x + Math.cos(angle) * this.radius;
        const y = this.center.y + Math.sin(angle) * this.radius;

        // Spring node with soft stiffness and nice wobble damping
        this.nodes.push(new SpringPoint(x, y, 1.2, 0.075, 0.88));
      }
    }

    // Initialize floating toppings inside slime
    this.toppings = [];
    for (let i = 0; i < 7; i++) {
      const dist = Math.random() * (this.radius * 0.65);
      const angle = Math.random() * Math.PI * 2;
      this.toppings.push({
        relPos: new Vec2(Math.cos(angle) * dist, Math.sin(angle) * dist),
        vel: new Vec2(0, 0),
        size: 26 + Math.random() * 8,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.05
      });
    }
  }

  setTheme(index) {
    this.currentThemeIndex = index % this.themes.length;
  }

  nextTheme() {
    this.setTheme(this.currentThemeIndex + 1);
  }

  onPointerDown(x, y) {
    this.isDragging = true;
    this.dragPointer.set(x, y);
    this.poke(x, y, 1.0);
  }

  onPointerMove(x, y) {
    if (this.isDragging) {
      const dx = x - this.dragPointer.x;
      const dy = y - this.dragPointer.y;
      const speed = Math.sqrt(dx * dx + dy * dy);

      if (speed > 5) {
        this.poke(x, y, Math.min(1.5, speed * 0.04));
      }
      this.dragPointer.set(x, y);
    }
  }

  onPointerUp(x, y) {
    if (this.isDragging) {
      this.isDragging = false;
      if (window.audioEngine) {
        window.audioEngine.playSquishSound(x || this.center.x, 1.1, true);
      }
      if (window.triggerHaptic) {
        window.triggerHaptic(25);
      }
    }
  }

  poke(px, py, intensity = 1.0) {
    const touchPoint = new Vec2(px, py);
    const distToCenter = touchPoint.dist(this.center);

    // Ripple effect
    this.ripples.push({
      x: px,
      y: py,
      r: 8,
      alpha: 0.7,
      maxR: 70
    });

    // Deform spring nodes in Rust WASM or JS
    if (window.wasmBridge && window.wasmBridge.isReady) {
      window.wasmBridge.pokeJelly(px, py, 45 * intensity, 120);
    } else {
      for (let node of this.nodes) {
        const d = node.pos.dist(touchPoint);
        if (d < 120) {
          const forceMag = (1 - d / 120) * 45 * intensity;
          const pushAngle = Math.atan2(node.pos.y - py, node.pos.x - px);
          node.applyForce(Math.cos(pushAngle) * forceMag, Math.sin(pushAngle) * forceMag);
        }
      }
    }

    // Sound trigger
    if (window.audioEngine) {
      window.audioEngine.playSquishSound(px, intensity, false);
    }

    // Haptic
    if (window.triggerHaptic) {
      window.triggerHaptic(15);
    }
  }

  update() {
    this.center.set(this.width / 2, this.height / 2 + 10);

    // Update soft-body jelly nodes in Rust WASM or JS
    if (window.wasmBridge && window.wasmBridge.isReady) {
      window.wasmBridge.updateJelly(this.center.x, this.center.y, 0.075, 0.88, 0.05);
    } else {
      for (let node of this.nodes) {
        node.update();
      }

      // Neighbor tension constraints to keep the slime organic & elastic
      for (let i = 0; i < this.nodes.length; i++) {
        const prev = this.nodes[(i - 1 + this.nodes.length) % this.nodes.length];
        const curr = this.nodes[i];
        const next = this.nodes[(i + 1) % this.nodes.length];

        const midX = (prev.pos.x + next.pos.x) / 2;
        const midY = (prev.pos.y + next.pos.y) / 2;

        curr.vel.x += (midX - curr.pos.x) * 0.05;
        curr.vel.y += (midY - curr.pos.y) * 0.05;
      }
    }

    // Update internal floating toppings
    for (let top of this.toppings) {
      top.rot += top.vRot;
      top.relPos.x += (Math.random() - 0.5) * 0.4;
      top.relPos.y += (Math.random() - 0.5) * 0.4;

      // Keep within slime bounds
      const dist = top.relPos.mag();
      if (dist > this.radius * 0.6) {
        top.relPos.normalize().mult(this.radius * 0.6);
      }
    }

    // Update ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.r += 2.8;
      r.alpha -= 0.035;
      if (r.alpha <= 0) {
        this.ripples.splice(i, 1);
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const theme = this.themes[this.currentThemeIndex];

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Clean Porcelain Saucer / Zen Pad
    this._drawSaucer(ctx);

    // 2. Slime Soft Drop Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 18;
    this._drawSlimePath(ctx);
    ctx.fillStyle = theme.primary;
    ctx.fill();
    ctx.restore();

    // 3. Main Translucent Slime Body with Jelly Gradient
    const jellyGrad = ctx.createRadialGradient(
      this.center.x - 30,
      this.center.y - 30,
      10,
      this.center.x,
      this.center.y,
      this.radius * 1.2
    );
    jellyGrad.addColorStop(0, theme.innerGlow);
    jellyGrad.addColorStop(0.5, theme.secondary);
    jellyGrad.addColorStop(1, theme.primary);

    ctx.save();
    this._drawSlimePath(ctx);
    ctx.fillStyle = jellyGrad;
    ctx.globalAlpha = 0.92;
    ctx.fill();

    // Inner Border
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.stroke();

    // Clip toppings & sparkles inside the jelly
    ctx.clip();

    // 4. Draw Floating Internal Toppings & Glitter
    this._drawToppings(ctx, theme);

    ctx.restore();

    // 5. Specular Gloss Highlights (gives it that ultra-satisfying wet, juicy glass shine)
    this._drawSpecularHighlights(ctx);

    // 6. Draw Tactile Ripples
    for (let r of this.ripples) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${r.alpha})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawSaucer(ctx) {
    const cx = this.center.x;
    const cy = this.center.y + 15;
    const sw = this.radius * 2.8;
    const sh = this.radius * 2.5;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Subtle Dish Rim
    ctx.strokeStyle = 'rgba(235, 230, 225, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, sw / 2 - 12, sh / 2 - 12, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawSlimePath(ctx) {
    ctx.beginPath();
    let nodes;
    if (window.wasmBridge && window.wasmBridge.isReady) {
      nodes = window.wasmBridge.getJellyNodes();
    } else {
      nodes = this.nodes.map((n) => n.pos);
    }

    const len = nodes.length;
    if (len === 0) return;

    for (let i = 0; i < len; i++) {
      const curr = nodes[i];
      const next = nodes[(i + 1) % len];

      // Midpoint Bezier smoothing
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;

      if (i === 0) {
        ctx.moveTo(midX, midY);
      } else {
        ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
      }
    }
    ctx.closePath();
  }

  _drawToppings(ctx, theme) {
    ctx.font = '24px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let top of this.toppings) {
      ctx.save();
      const tx = this.center.x + top.relPos.x;
      const ty = this.center.y + top.relPos.y;
      ctx.translate(tx, ty);
      ctx.rotate(top.rot);
      ctx.fillText(theme.toppingEmoji, 0, 0);

      // Micro glitter sparkler
      ctx.fillStyle = theme.glitterColor;
      ctx.beginPath();
      ctx.arc(8, -8, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawSpecularHighlights(ctx) {
    // Wet jelly reflection curve near top left
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    const hx = this.center.x - this.radius * 0.42;
    const hy = this.center.y - this.radius * 0.48;
    ctx.ellipse(hx, hy, this.radius * 0.32, this.radius * 0.16, -0.45, 0, Math.PI * 2);
    ctx.fill();

    // Secondary baby glint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.ellipse(hx + 35, hy + 22, 6, 4, -0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

window.SlimeJellyStation = SlimeJellyStation;
