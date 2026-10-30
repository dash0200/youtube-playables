/**
 * Physics, Vector Math, and Particle Simulation Utilities
 */

/**
 * Polyfill for CanvasRenderingContext2D.roundRect for maximum webview compatibility
 */
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii = 0) {
    let r = 0;
    if (typeof radii === 'number') {
      r = radii;
    } else if (Array.isArray(radii) && radii.length > 0) {
      r = radii[0];
    }
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);

    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  mult(n) {
    this.x *= n;
    this.y *= n;
    return this;
  }

  dist(v) {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  mag() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize() {
    const m = this.mag();
    if (m > 0.0001) {
      this.x /= m;
      this.y /= m;
    }
    return this;
  }

  copy() {
    return new Vec2(this.x, this.y);
  }
}

/**
 * Spring Node for soft-body squishy jelly simulation
 */
class SpringPoint {
  constructor(x, y, mass = 1.0, stiffness = 0.08, damping = 0.85) {
    this.origin = new Vec2(x, y);
    this.pos = new Vec2(x, y);
    this.vel = new Vec2(0, 0);
    this.acc = new Vec2(0, 0);
    this.mass = mass;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  update() {
    // Hooke's Law towards original resting shape: F = -k * x
    const dispX = this.pos.x - this.origin.x;
    const dispY = this.pos.y - this.origin.y;

    this.acc.x = (-this.stiffness * dispX) / this.mass;
    this.acc.y = (-this.stiffness * dispY) / this.mass;

    this.vel.x = (this.vel.x + this.acc.x) * this.damping;
    this.vel.y = (this.vel.y + this.acc.y) * this.damping;

    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y;
  }

  applyForce(fx, fy) {
    this.vel.x += fx / this.mass;
    this.vel.y += fy / this.mass;
  }
}

/**
 * General ASMR Particle for debris, crumbs, sparkles, and ripples
 */
class Particle {
  constructor(x, y, options = {}) {
    this.pos = new Vec2(x, y);
    this.vel = new Vec2(
      options.vx !== undefined ? options.vx : (Math.random() - 0.5) * 6,
      options.vy !== undefined ? options.vy : (Math.random() - 0.5) * 6 - 2
    );
    this.gravity = options.gravity !== undefined ? options.gravity : 0.28;
    this.friction = options.friction !== undefined ? options.friction : 0.98;
    this.size = options.size || 8;
    this.color = options.color || '#ff8eb3';
    this.alpha = 1.0;
    this.decay = options.decay || 0.015;
    this.rotation = Math.random() * Math.PI * 2;
    this.vRot = (Math.random() - 0.5) * 0.15;
    this.shape = options.shape || 'rect'; // 'rect', 'circle', 'shard', 'sparkle'
    this.bounce = options.bounce !== undefined ? options.bounce : 0.45;
    this.floorY = options.floorY || 99999;
  }

  update() {
    this.vel.y += this.gravity;
    this.vel.x *= this.friction;
    this.vel.y *= this.friction;

    this.pos.add(this.vel);
    this.rotation += this.vRot;
    this.alpha -= this.decay;

    // Floor collision
    if (this.pos.y > this.floorY) {
      this.pos.y = this.floorY;
      this.vel.y = -this.vel.y * this.bounce;
      this.vel.x *= 0.8;
      this.vRot *= 0.6;
    }

    return this.alpha > 0.01;
  }

  draw(ctx) {
    if (this.alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.rotation);
    ctx.fillStyle = this.color;

    if (this.shape === 'rect') {
      ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    } else if (this.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.shape === 'shard') {
      ctx.beginPath();
      ctx.moveTo(-this.size / 2, -this.size / 3);
      ctx.lineTo(this.size / 2, 0);
      ctx.lineTo(0, this.size / 1.5);
      ctx.closePath();
      ctx.fill();
    } else if (this.shape === 'sparkle') {
      ctx.beginPath();
      ctx.moveTo(0, -this.size);
      ctx.lineTo(this.size * 0.3, -this.size * 0.3);
      ctx.lineTo(this.size, 0);
      ctx.lineTo(this.size * 0.3, this.size * 0.3);
      ctx.lineTo(0, this.size);
      ctx.lineTo(-this.size * 0.3, this.size * 0.3);
      ctx.lineTo(-this.size, 0);
      ctx.lineTo(-this.size * 0.3, -this.size * 0.3);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * Mobile Haptic Trigger Helper
 */
function triggerHaptic(duration = 20) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(duration);
    } catch (e) {
      // Haptics might be blocked without user gesture
    }
  }
}

window.Vec2 = Vec2;
window.SpringPoint = SpringPoint;
window.Particle = Particle;
window.triggerHaptic = triggerHaptic;
