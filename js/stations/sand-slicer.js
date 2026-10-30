/**
 * Station 1: Kinetic Sand & Soap Slicer 3D
 * Sliceable layered voxel grid with crisp particle physics, realistic blade kinematics,
 * dynamic shadows, and high-frequency ASMR slicing sound.
 */

class SandSlicerStation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.themes = [
      {
        name: 'Rainbow Sand',
        type: 'sand',
        colors: ['#FF6B8B', '#FFD166', '#06D6A0', '#118AB2', '#8338EC'],
        particleShape: 'rect'
      },
      {
        name: 'Honeycomb Soap',
        type: 'soap',
        colors: ['#FFE066', '#F7B267', '#F27059', '#F4845F', '#F79D65'],
        particleShape: 'shard'
      },
      {
        name: 'Galaxy Cake',
        type: 'sand',
        colors: ['#240046', '#5A189A', '#9D4EDD', '#E0AAFF', '#7209B7'],
        particleShape: 'sparkle'
      },
      {
        name: 'Matcha Cream',
        type: 'soap',
        colors: ['#A3B18A', '#588157', '#3A5A40', '#DAD7CD', '#E9EDC9'],
        particleShape: 'rect'
      }
    ];

    this.currentThemeIndex = 0;
    this.particles = [];
    this.voxels = [];
    this.cols = 16;
    this.rows = 14;
    this.gridWidth = 320;
    this.gridHeight = 240;

    this.isCutting = false;
    this.lastPointer = null;
    this.cutterPos = new Vec2(0, 0);
    this.bladeAngle = 0;
    this.bladeTargetAngle = 0;
    this.sliceCount = 0;
    this.combo = 0;
    this.lastSliceTime = 0;

    this.initGrid();
  }

  get width() {
    return this.canvas.logicalWidth || this.canvas.width;
  }

  get height() {
    return this.canvas.logicalHeight || this.canvas.height;
  }

  initGrid() {
    this.voxels = [];
    this.particles = [];
    const theme = this.themes[this.currentThemeIndex];
    const originX = (this.width - this.gridWidth) / 2;
    const originY = (this.height - this.gridHeight) / 2 - 20;

    if (window.wasmBridge && window.wasmBridge.isReady) {
      this.cols = 28;
      this.rows = 22;
      window.wasmBridge.initSandGrid(
        originX,
        originY,
        this.gridWidth,
        this.gridHeight,
        this.cols,
        this.rows,
        theme.colors.length
      );
    } else {
      this.cols = 16;
      this.rows = 14;
      const cellW = this.gridWidth / this.cols;
      const cellH = this.gridHeight / this.rows;

      for (let r = 0; r < this.rows; r++) {
        const colorIndex = Math.floor((r / this.rows) * theme.colors.length);
        const color = theme.colors[colorIndex];

        for (let c = 0; c < this.cols; c++) {
          this.voxels.push({
            col: c,
            row: r,
            w: cellW,
            h: cellH,
            color: color,
            sliced: false,
            depth: 18 - (r / this.rows) * 6, // 2.5D bevel depth
            sparkle: Math.random() > 0.8
          });
        }
      }
    }
  }

  setTheme(index) {
    this.currentThemeIndex = index % this.themes.length;
    this.initGrid();
  }

  nextTheme() {
    this.setTheme(this.currentThemeIndex + 1);
  }

  reset() {
    this.initGrid();
    this.combo = 0;
  }

  onPointerDown(x, y) {
    this.isCutting = true;
    this.lastPointer = new Vec2(x, y);
    this.cutterPos.set(x, y);
    this.checkSlice(x, y, 0);
  }

  onPointerMove(x, y) {
    this.cutterPos.set(x, y);

    if (this.isCutting && this.lastPointer) {
      const dx = x - this.lastPointer.x;
      const dy = y - this.lastPointer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 3) {
        // Smooth blade angle tracking
        this.bladeTargetAngle = Math.atan2(dy, dx);
        this.checkSlice(x, y, dist);
        this.lastPointer.set(x, y);
      }
    }
  }

  onPointerUp() {
    this.isCutting = false;
    this.lastPointer = null;
  }

  checkSlice(px, py, speed) {
    const originX = (this.width - this.gridWidth) / 2;
    const originY = (this.height - this.gridHeight) / 2 - 20;
    const theme = this.themes[this.currentThemeIndex];
    let slicedThisStep = 0;
    const sliceRadius = 18;

    if (window.wasmBridge && window.wasmBridge.isReady) {
      const shapeType = theme.particleShape === 'shard' ? 1 : (theme.particleShape === 'sparkle' ? 2 : 0);
      const floorY = originY + this.gridHeight + 110;
      slicedThisStep = window.wasmBridge.sliceVoxels(px, py, sliceRadius, 3, shapeType, floorY);
    } else {
      for (let i = 0; i < this.voxels.length; i++) {
        const v = this.voxels[i];
        if (v.sliced) continue;

        const vx = originX + v.col * v.w + v.w / 2;
        const vy = originY + v.row * v.h + v.h / 2;

        const dx = px - vx;
        const dy = py - vy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < sliceRadius) {
          v.sliced = true;
          slicedThisStep++;

          // Spawn tumbling physics crumb particles
          const particleCount = theme.type === 'soap' ? 3 : 5;
          for (let p = 0; p < particleCount; p++) {
            this.particles.push(
              new Particle(vx, vy, {
                vx: (Math.random() - 0.5) * 5 + (px - vx) * 0.1,
                vy: -Math.random() * 4 - 1,
                size: Math.random() * 7 + 4,
                color: v.color,
                gravity: 0.35,
                decay: 0.012,
                shape: theme.particleShape,
                floorY: originY + this.gridHeight + 110
              })
            );
          }
        }
      }
    }

    if (slicedThisStep > 0) {
      this.sliceCount += slicedThisStep;
      this.combo++;
      const now = performance.now();
      this.lastSliceTime = now;

      // Audio trigger with stereo panning
      if (window.audioEngine) {
        window.audioEngine.playSliceSound(px, Math.min(2.5, speed * 0.08 + 0.8), theme.type);
      }

      // Haptic feedback
      if (window.triggerHaptic) {
        window.triggerHaptic(12);
      }
    }
  }

  update() {
    // Interpolate blade angle smoothly
    let diff = this.bladeTargetAngle - this.bladeAngle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.bladeAngle += diff * 0.25;

    // Update particles in Rust WASM or JS
    if (window.wasmBridge && window.wasmBridge.isReady) {
      const originY = (this.height - this.gridHeight) / 2 - 20;
      const floorY = originY + this.gridHeight + 110;
      window.wasmBridge.updateParticles(0.35, 0.98, 0.45, floorY, 0.012);
    } else {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const alive = this.particles[i].update();
        if (!alive) {
          this.particles.splice(i, 1);
        }
      }
    }

    // Reset combo if paused cutting
    if (performance.now() - this.lastSliceTime > 800) {
      this.combo = 0;
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const originX = (w - this.gridWidth) / 2;
    const originY = (h - this.gridHeight) / 2 - 20;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Wooden Cutting Board / Zen Tray
    this._drawCuttingBoard(originX, originY);

    // 2. Draw Voxels with 2.5D bevel depth
    if (window.wasmBridge && window.wasmBridge.isReady) {
      window.wasmBridge.renderVoxels(ctx, theme.colors);
    } else {
      for (let i = 0; i < this.voxels.length; i++) {
        const v = this.voxels[i];
        if (v.sliced) continue;

        const vx = originX + v.col * v.w;
        const vy = originY + v.row * v.h;

        // Drop shadow per block
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.fillRect(vx + 2, vy + 3, v.w, v.h);

        // Main Voxel Face
        ctx.fillStyle = v.color;
        ctx.fillRect(vx, vy, v.w - 0.5, v.h - 0.5);

        // 3D Top bevel highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fillRect(vx, vy, v.w - 0.5, 2.5);

        // 3D Right shade
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(vx + v.w - 2.5, vy, 2.5, v.h - 0.5);

        // Sparkle glint
        if (v.sparkle) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.fillRect(vx + v.w * 0.3, vy + v.h * 0.3, 2, 2);
        }
      }
    }

    // 3. Draw Crumb & Sand Particles
    if (window.wasmBridge && window.wasmBridge.isReady) {
      window.wasmBridge.renderParticles(ctx, theme.colors);
    } else {
      for (let p of this.particles) {
        p.draw(ctx);
      }
    }

    // 4. Draw Cutting Blade / Knife
    this._drawKnife(ctx);

    // 5. Draw Combo & Slice Counter HUD
    this._drawHUD(ctx, originX, originY);
  }

  _drawCuttingBoard(ox, oy) {
    const ctx = this.ctx;
    const bw = this.gridWidth + 80;
    const bh = this.gridHeight + 140;
    const bx = ox - 40;
    const by = oy - 20;

    // Board Drop Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;

    // Rounded Board Body (Maple Wood / Zen Porcelain aesthetic)
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 24);
    ctx.fill();
    ctx.restore();

    // Subtle Wood Grain / Inner Border
    ctx.strokeStyle = 'rgba(230, 225, 220, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx + 8, by + 8, bw - 16, bh - 16, 18);
    ctx.stroke();

    // Catch Basin Groove for crumbs at bottom
    ctx.fillStyle = 'rgba(240, 235, 230, 0.6)';
    ctx.beginPath();
    ctx.roundRect(bx + 18, by + bh - 32, bw - 36, 16, 8);
    ctx.fill();
  }

  _drawKnife(ctx) {
    if (!this.cutterPos || (this.cutterPos.x === 0 && this.cutterPos.y === 0)) return;

    ctx.save();
    ctx.translate(this.cutterPos.x, this.cutterPos.y);
    ctx.rotate(this.bladeAngle);

    // Blade Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 8;

    // Metallic Blade Body
    const bladeGrad = ctx.createLinearGradient(0, -8, 0, 8);
    bladeGrad.addColorStop(0, '#FFFFFF');
    bladeGrad.addColorStop(0.4, '#E2E8F0');
    bladeGrad.addColorStop(1, '#94A3B8');

    ctx.fillStyle = bladeGrad;
    ctx.beginPath();
    ctx.moveTo(35, 0); // Blade tip
    ctx.lineTo(-45, -12);
    ctx.lineTo(-55, 0);
    ctx.lineTo(-45, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Razor Sharp Edge Highlight
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(35, 0);
    ctx.lineTo(-45, 12);
    ctx.stroke();

    // Knife Handle
    const handleGrad = ctx.createLinearGradient(-55, 0, -100, 0);
    handleGrad.addColorStop(0, '#334155');
    handleGrad.addColorStop(1, '#1E293B');
    ctx.fillStyle = handleGrad;
    ctx.beginPath();
    ctx.roundRect(-100, -8, 48, 16, 6);
    ctx.fill();

    // Handle Brass Rivets
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(-68, 0, 2.5, 0, Math.PI * 2);
    ctx.arc(-88, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawHUD(ctx, ox, oy) {
    if (this.combo > 1) {
      ctx.save();
      ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#6366F1';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(99, 102, 241, 0.3)';
      ctx.shadowBlur = 10;
      ctx.fillText(`✨ ${this.combo} CRUNCH COMBO!`, this.width / 2, oy - 35);
      ctx.restore();
    }
  }
}

window.SandSlicerStation = SandSlicerStation;
