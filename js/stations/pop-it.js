/**
 * Station 3: Mega Silicone Pop-It & Infinite Bubble Wrap
 * Neumorphic convex/concave tactile simulation with 3D shadows,
 * pitch-varying acoustic pop impulses, and sweep-to-pop multi-touch.
 */

class PopItStation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.modes = [
      { name: 'Rainbow Heart', shape: 'heart', rows: 6, cols: 6 },
      { name: 'Gamepad Pop', shape: 'gamepad', rows: 5, cols: 7 },
      { name: 'Bubble Wrap', shape: 'grid', rows: 7, cols: 6 },
      { name: 'Zen Hexagon', shape: 'hex', rows: 6, cols: 6 }
    ];

    this.rainbowColors = [
      '#FF8080', '#FFB380', '#FFE680', '#80FFB3', '#80D4FF', '#B380FF'
    ];

    this.currentModeIndex = 0;
    this.bubbles = [];
    this.confetti = [];
    this.isSwiping = false;
    this.poppedCount = 0;

    this.initBoard();
  }

  get width() {
    return this.canvas.logicalWidth || this.canvas.width;
  }

  get height() {
    return this.canvas.logicalHeight || this.canvas.height;
  }

  initBoard() {
    this.bubbles = [];
    this.confetti = [];
    const mode = this.modes[this.currentModeIndex];
    const bubbleRadius = 24;
    const spacing = 58;

    const startX = this.width / 2 - ((mode.cols - 1) * spacing) / 2;
    const startY = this.height / 2 - ((mode.rows - 1) * spacing) / 2;

    let index = 0;
    for (let r = 0; r < mode.rows; r++) {
      const color = this.rainbowColors[r % this.rainbowColors.length];

      for (let c = 0; c < mode.cols; c++) {
        // Filter shapes to form Heart or Gamepad outlines
        let isValid = true;
        if (mode.shape === 'heart') {
          // Heart mask logic
          if (r === 0 && (c === 0 || c === 2 || c === 3 || c === 5)) isValid = false;
          if (r === 4 && (c === 0 || c === 5)) isValid = false;
          if (r === 5 && (c <= 1 || c >= 4)) isValid = false;
        } else if (mode.shape === 'gamepad') {
          if (r === 0 && (c < 2 || c > 4)) isValid = false;
          if (r === 4 && (c === 2 || c === 3 || c === 4)) isValid = false;
        }

        if (isValid) {
          const bx = startX + c * spacing;
          const by = startY + r * spacing;

          this.bubbles.push({
            id: index++,
            x: bx,
            y: by,
            r: bubbleRadius,
            row: r,
            col: c,
            color: mode.shape === 'grid' ? '#E2E8F0' : color,
            isPopped: false,
            scaleAnim: 1.0,
            isBubbleWrap: mode.shape === 'grid'
          });
        }
      }
    }
  }

  setMode(index) {
    this.currentModeIndex = index % this.modes.length;
    this.initBoard();
  }

  nextMode() {
    this.setMode(this.currentModeIndex + 1);
  }

  reset() {
    this.bubbles.forEach((b) => (b.isPopped = false));
    this.poppedCount = 0;
  }

  flipBoard() {
    // Invert all bubbles with a staggered ripple sound
    this.bubbles.forEach((b, i) => {
      setTimeout(() => {
        b.isPopped = !b.isPopped;
        b.scaleAnim = 1.25;
        if (window.audioEngine) {
          window.audioEngine.playPopSound(b.x, b.id, !b.isPopped);
        }
      }, i * 22);
    });
  }

  onPointerDown(x, y) {
    this.isSwiping = true;
    this.checkPop(x, y);
  }

  onPointerMove(x, y) {
    if (this.isSwiping) {
      this.checkPop(x, y);
    }
  }

  onPointerUp() {
    this.isSwiping = false;
  }

  checkPop(px, py) {
    for (let b of this.bubbles) {
      const dx = px - b.x;
      const dy = py - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < b.r && !b.isPopped) {
        b.isPopped = true;
        b.scaleAnim = 0.85;
        this.poppedCount++;

        // Audio trigger
        if (window.audioEngine) {
          window.audioEngine.playPopSound(b.x, b.id, true);
        }

        // Haptic
        if (window.triggerHaptic) {
          window.triggerHaptic(18);
        }

        // Check if all popped -> Celebration confetti!
        if (this.bubbles.every((bubble) => bubble.isPopped)) {
          this._spawnConfetti();
        }
        break;
      }
    }
  }

  _spawnConfetti() {
    for (let i = 0; i < 40; i++) {
      this.confetti.push(
        new Particle(this.width / 2, this.height / 2 - 50, {
          vx: (Math.random() - 0.5) * 12,
          vy: -Math.random() * 8 - 4,
          size: Math.random() * 8 + 6,
          color: this.rainbowColors[i % this.rainbowColors.length],
          gravity: 0.22,
          decay: 0.012,
          shape: 'sparkle'
        })
      );
    }
  }

  update() {
    // Animate bubble recoil
    for (let b of this.bubbles) {
      b.scaleAnim += (1.0 - b.scaleAnim) * 0.18;
    }

    // Update confetti
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const alive = this.confetti[i].update();
      if (!alive) {
        this.confetti.splice(i, 1);
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Board Silicone Base Plate
    this._drawBasePlate(ctx);

    // 2. Draw Bubbles
    for (let b of this.bubbles) {
      this._drawBubble(ctx, b);
    }

    // 3. Draw Confetti
    for (let c of this.confetti) {
      c.draw(ctx);
    }
  }

  _drawBasePlate(ctx) {
    if (this.bubbles.length === 0) return;

    // Calculate bounding box
    let minX = 9999, maxX = -9999, minY = 9999, maxY = -9999;
    for (let b of this.bubbles) {
      if (b.x < minX) minX = b.x;
      if (b.x > maxX) maxX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.y > maxY) maxY = b.y;
    }

    const pad = 42;
    const rx = minX - pad;
    const ry = minY - pad;
    const rw = maxX - minX + pad * 2;
    const rh = maxY - minY + pad * 2;

    ctx.save();
    // Soft Neumorphic Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 14;

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(rx, ry, rw, rh, 36);
    ctx.fill();
    ctx.restore();

    // Subtle edge rim
    ctx.strokeStyle = 'rgba(235, 230, 225, 0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(rx + 6, ry + 6, rw - 12, rh - 12, 30);
    ctx.stroke();
  }

  _drawBubble(ctx, b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(b.scaleAnim, b.scaleAnim);

    const r = b.r;

    // Silicone Rim / Cavity Shadow
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fill();

    if (!b.isPopped) {
      // 1. UNPOPPED: 3D Convex Dome
      // Drop shadow underneath convex dome
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.restore();

      // Top-Left Soft Specular Highlight
      const highlight = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 2, -r * 0.3, -r * 0.3, r * 0.8);
      highlight.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
      highlight.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
      highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = highlight;
      ctx.fill();

      // Bottom Inner Shading for spherical depth
      const shade = ctx.createRadialGradient(r * 0.35, r * 0.35, 2, r * 0.3, r * 0.3, r * 0.8);
      shade.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
      shade.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = shade;
      ctx.fill();
    } else {
      // 2. POPPED: 3D Inverted Concave Depression
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.globalAlpha = 0.85;
      ctx.fill();

      // Inner Concave Shadow (top-left is dark because it's recessed!)
      const innerShadow = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
      innerShadow.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
      innerShadow.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)');
      innerShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = innerShadow;
      ctx.fill();

      // Recessed bottom rim bounce light
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r - 3, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }

    ctx.restore();
  }
}

window.PopItStation = PopItStation;
