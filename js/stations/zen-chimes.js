/**
 * Station 5: Zen Pentatonic Chime Spiral & Glass Marbles
 * Mesmerizing physics marble dropper bouncing across tuned acoustic chime bars,
 * emitting pure pentatonic harmonic chimes with binaural stereo panning.
 * Features exact rigid-body surface contact physics and guaranteed cascading trajectory.
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
    this.dropInterval = 1400; // ms (relaxed cadence for melodic appreciation)

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

    // Dynamically calculate vertical spacing and sizes based on screen height
    const numBars = 6;
    const availH = h - 160;
    const gapY = Math.min(76, Math.max(54, availH / (numBars + 0.8)));
    const startY = Math.max(105, (h - gapY * numBars) / 2 - 15);

    // Dynamic bar length and lateral shift to guarantee flawless zig-zag overlap
    const barLength = Math.min(180, Math.max(140, w * 0.42));
    const shiftX = Math.min(45, w * 0.11);
    const angle = 0.27; // ~15.5 degrees inclination

    // 6 Tuned Pentatonic Bars (C4, D4, E4, G4, A4, C5)
    const notesData = [
      { name: 'C4', note: 0, color: '#FFB5A7', shift: -shiftX, angle: angle },
      { name: 'D4', note: 1, color: '#FCD5CE', shift: shiftX, angle: -angle },
      { name: 'E4', note: 2, color: '#B5E48C', shift: -shiftX, angle: angle },
      { name: 'G4', note: 3, color: '#90E0EF', shift: shiftX, angle: -angle },
      { name: 'A4', note: 4, color: '#CDB4DB', shift: -shiftX, angle: angle },
      { name: 'C5', note: 5, color: '#FFE5D9', shift: shiftX * 0.7, angle: -angle * 0.9 }
    ];

    for (let i = 0; i < notesData.length; i++) {
      const d = notesData[i];
      const cy = startY + i * gapY;
      this.chimes.push({
        id: i,
        name: d.name,
        x: cx + d.shift,
        y: cy,
        length: barLength,
        angle: d.angle,
        note: d.note,
        color: d.color,
        glow: 0,
        width: 16
      });
    }

    // Top drop chute coordinates
    this.chuteX = this.chimes[0].x - (barLength * 0.38) * Math.cos(angle);
    this.chuteY = startY - 45;
  }

  reset() {
    this.marbles = [];
    this.rings = [];
  }

  toggleAutoDrop() {
    this.autoDrop = !this.autoDrop;
    return this.autoDrop;
  }

  dropMarble(x = null, y = null) {
    let spawnX = x;
    let spawnY = y;

    if (spawnX === null || spawnY === null) {
      // Auto drop from the top wooden dispenser
      spawnX = this.chuteX + (Math.random() - 0.5) * 8;
      spawnY = this.chuteY;
    }

    const marbleColors = [
      '#FFD166', // Golden amber
      '#06D6A0', // Jade glass
      '#118AB2', // Ocean sapphire
      '#EF476F', // Rose quartz
      '#E0AAFF'  // Lavender amethyst
    ];

    this.marbles.push({
      x: spawnX,
      y: spawnY,
      vx: (Math.random() - 0.5) * 0.5,
      vy: 1.0,
      r: 9.5,
      color: marbleColors[Math.floor(Math.random() * marbleColors.length)],
      alpha: 1.0,
      inTray: false,
      lastHitBarId: -1,
      cooldown: 0
    });

    if (window.audioEngine) {
      window.audioEngine._playSubClick(
        window.audioEngine.ctx ? window.audioEngine.ctx.currentTime : 0,
        window.audioEngine.getPanning(spawnX),
        480
      );
    }
  }

  onPointerDown(x, y) {
    this.dropMarble(x, y);
    if (window.triggerHaptic) {
      window.triggerHaptic(12);
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

    const gravity = 0.34;
    const trayY = this.height - 48;
    const cx = this.width / 2;

    // Update Marbles with True Surface-Contact Physics
    for (let i = this.marbles.length - 1; i >= 0; i--) {
      const m = this.marbles[i];

      // Decrease cooldown between collision sounds
      if (m.cooldown > 0) m.cooldown--;

      if (!m.inTray) {
        // Free-fall acceleration
        m.vy += gravity;
        m.x += m.vx;
        m.y += m.vy;

        // Check collision against tuned chime bars
        for (let ch of this.chimes) {
          const halfL = ch.length / 2;
          const halfW = ch.width / 2;
          const cosA = Math.cos(ch.angle);
          const sinA = Math.sin(ch.angle);

          // Vector from chime bar center to marble center
          const dx = m.x - ch.x;
          const dy = m.y - ch.y;

          // Tangent distance along bar (from -halfL to +halfL)
          const s = dx * cosA + dy * sinA;

          // Normal distance towards top surface (positive when above top surface)
          // Unit normal pointing into sky: (sinA, -cosA)
          const dNormal = dx * sinA - dy * cosA;

          // Check if marble is touching or resting on the top surface of the bar
          if (Math.abs(s) <= halfL + m.r * 0.4) {
            const surfaceDist = dNormal - halfW; // 0 when on top surface, negative when penetrating

            if (surfaceDist <= m.r && surfaceDist >= -(m.r * 1.4)) {
              // Exact position resolution: place marble tangent to the top surface
              m.x = ch.x + s * cosA + (halfW + m.r) * sinA;
              m.y = ch.y + s * sinA - (halfW + m.r) * cosA;

              // Decompose velocity into Tangent (along slope) & Normal (perpendicular)
              const vTangent = m.vx * cosA + m.vy * sinA;
              const vImpact = -sinA * m.vx + cosA * m.vy; // Positive when falling into bar

              let newImpact = 0;
              if (vImpact > 0.4) {
                // Bounce with gentle acoustic restitution
                newImpact = -vImpact * 0.35;

                // Trigger chime strike if moving fast enough and not on instant repeat
                if (m.cooldown === 0 || m.lastHitBarId !== ch.id) {
                  ch.glow = 1.0;
                  m.lastHitBarId = ch.id;
                  m.cooldown = 14;

                  if (window.audioEngine) {
                    window.audioEngine.playChime(ch.note, m.x);
                  }

                  if (window.triggerHaptic) {
                    window.triggerHaptic(14);
                  }

                  // Soundwave ripple ring exactly at the contact point
                  const contactX = ch.x + s * cosA + halfW * sinA;
                  const contactY = ch.y + s * sinA - halfW * cosA;
                  this.rings.push({
                    x: contactX,
                    y: contactY,
                    r: 4,
                    alpha: 0.85,
                    color: ch.color
                  });
                }
              }

              // Gravity acceleration along the slope
              const gTangent = gravity * sinA;
              const newTangent = (vTangent + gTangent) * 0.985; // Rolling friction

              // Recompose Cartesian velocity
              m.vx = newTangent * cosA - newImpact * sinA;
              m.vy = newTangent * sinA + newImpact * cosA;
              break;
            }
          }
        }

        // Check if landing in the bottom collection tray
        if (m.y >= trayY - m.r && Math.abs(m.x - cx) <= 125) {
          m.inTray = true;
          m.y = trayY - m.r;

          if (Math.abs(m.vy) > 1.0 && window.audioEngine) {
            window.audioEngine._playSubClick(
              window.audioEngine.ctx ? window.audioEngine.ctx.currentTime : 0,
              window.audioEngine.getPanning(m.x),
              520
            );
          }
          m.vy = -m.vy * 0.22;
        }
      } else {
        // Settling physics inside the bottom tray
        m.y = trayY - m.r;
        m.vy = 0;
        // Gentle roll towards center of tray
        m.vx = (m.vx + (cx - m.x) * 0.04) * 0.84;
        m.x += m.vx;

        // Count marbles in tray; fade out oldest if overcrowded
        const trayMarbles = this.marbles.filter((item) => item.inTray);
        if (trayMarbles.length > 7 && m === trayMarbles[0]) {
          m.alpha -= 0.035;
          if (m.alpha <= 0) {
            this.marbles.splice(i, 1);
            continue;
          }
        }
      }

      // Remove fallen out marbles
      if (m.y > this.height + 40 || m.x < -40 || m.x > this.width + 40) {
        this.marbles.splice(i, 1);
      }
    }

    // Decay Chime Glows
    for (let ch of this.chimes) {
      if (ch.glow > 0) {
        ch.glow -= 0.04;
        if (ch.glow < 0) ch.glow = 0;
      }
    }

    // Update Ripple Rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.r += 2.4;
      ring.alpha -= 0.032;
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

    // 1. Draw Top Wooden Dispenser Funnel
    this._drawDispenser(ctx);

    // 2. Draw Soundwave Ripple Rings
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

    // 3. Draw Tuned Xylophone / Crystal Chime Bars
    for (let ch of this.chimes) {
      this._drawChime(ctx, ch);
    }

    // 4. Draw Crystal & Gold Glass Marbles
    for (let m of this.marbles) {
      this._drawMarble(ctx, m);
    }

    // 5. Draw Zen Marble Collection Tray at Bottom
    this._drawTray(ctx, w, h);
  }

  _drawDispenser(ctx) {
    const x = this.chuteX;
    const y = this.chuteY - 12;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    // Elegant wooden dispenser nozzle
    const grad = ctx.createLinearGradient(x - 20, 0, x + 20, 0);
    grad.addColorStop(0, '#E2E8F0');
    grad.addColorStop(0.5, '#FFFFFF');
    grad.addColorStop(1, '#CBD5E1');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x - 18, y - 8, 36, 16, 8);
    ctx.fill();

    // Inner drop aperture
    ctx.fillStyle = '#64748B';
    ctx.beginPath();
    ctx.arc(x, y + 2, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawChime(ctx, ch) {
    ctx.save();
    ctx.translate(ch.x, ch.y);
    ctx.rotate(ch.angle);

    const halfL = ch.length / 2;
    const halfW = ch.width / 2;

    // Soft Neumorphic Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;

    // Chime Bar Body
    ctx.fillStyle = ch.color;
    ctx.beginPath();
    ctx.roundRect(-halfL, -halfW, ch.length, ch.width, 8);
    ctx.fill();

    // Top Surface Light Edge (Gives it high physical definition)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillRect(-halfL + 6, -halfW, ch.length - 12, 3);

    // Glow on Strike
    if (ch.glow > 0) {
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 28 * ch.glow;
      ctx.strokeStyle = `rgba(255, 255, 255, ${ch.glow})`;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }

    // Steel Pin Mounting Dots
    ctx.fillStyle = '#64748B';
    ctx.beginPath();
    ctx.arc(-halfL + 14, 0, 2.5, 0, Math.PI * 2);
    ctx.arc(halfL - 14, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Musical Note Badge (e.g. "C4", "D4")
    ctx.fillStyle = 'rgba(71, 85, 105, 0.7)';
    ctx.font = 'bold 9px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch.name, 0, 0.5);

    ctx.restore();
  }

  _drawMarble(ctx, m) {
    ctx.save();
    ctx.globalAlpha = m.alpha;
    ctx.translate(m.x, m.y);

    // Soft Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 5;

    // Glass / Spherical Body
    const grad = ctx.createRadialGradient(-m.r * 0.35, -m.r * 0.35, 1, 0, 0, m.r);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.35, m.color);
    grad.addColorStop(1, '#0F172A');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, m.r, 0, Math.PI * 2);
    ctx.fill();

    // Specular Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(-m.r * 0.35, -m.r * 0.35, m.r * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawTray(ctx, w, h) {
    const cx = w / 2;
    const trayY = h - 48;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 6;

    // Tray Body
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(cx - 130, trayY - 6, 260, 28, 14);
    ctx.fill();

    // Soft Tray Rim
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Felt Catch Cushion
    ctx.fillStyle = 'rgba(241, 245, 249, 0.8)';
    ctx.beginPath();
    ctx.roundRect(cx - 120, trayY, 240, 16, 8);
    ctx.fill();

    ctx.restore();
  }
}

window.ZenChimesStation = ZenChimesStation;
