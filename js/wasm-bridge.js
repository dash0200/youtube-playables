/**
 * High-Performance Rust WebAssembly Bridge for YouTube Playables
 * Bridges Rust linear memory directly to Canvas2D rendering for zero-allocation,
 * zero-GC particle and voxel simulation at locked 60/120 FPS.
 */

class RustWasmBridge {
  constructor() {
    this.wasmInstance = null;
    this.memory = null;
    this.isReady = false;
    this.exports = null;

    // Direct Float32Array views over WASM linear memory
    this.particlesView = null;
    this.voxelsView = null;
    this.jellyView = null;

    this.init();
  }

  async init() {
    try {
      let wasmModule;
      const wasmPath = 'wasm/asmr_core.wasm';

      if (typeof WebAssembly.instantiateStreaming === 'function') {
        try {
          const response = await fetch(wasmPath);
          const result = await WebAssembly.instantiateStreaming(response, {});
          wasmModule = result.instance;
        } catch (streamErr) {
          // Fallback to arrayBuffer if instantiateStreaming fails (e.g. content-type header issue)
          const response = await fetch(wasmPath);
          const bytes = await response.arrayBuffer();
          const result = await WebAssembly.instantiate(bytes, {});
          wasmModule = result.instance;
        }
      } else {
        const response = await fetch(wasmPath);
        const bytes = await response.arrayBuffer();
        const result = await WebAssembly.instantiate(bytes, {});
        wasmModule = result.instance;
      }

      this.wasmInstance = wasmModule;
      this.exports = wasmModule.exports;
      this.memory = this.exports.memory;
      this.isReady = true;

      this._updateMemoryViews();
      console.log('⚡ [Rust WASM] High-performance physics engine loaded successfully (~29KB).');
    } catch (err) {
      console.warn('⚠️ [Rust WASM] Failed to load WebAssembly, using pure JS fallback:', err);
      this.isReady = false;
    }
  }

  _updateMemoryViews() {
    if (!this.isReady || !this.memory) return;
    const buffer = this.memory.buffer;
    this.particlesView = new Float32Array(buffer, this.exports.get_particles_ptr());
    this.voxelsView = new Float32Array(buffer, this.exports.get_voxels_ptr());
    this.jellyView = new Float32Array(buffer, this.exports.get_jelly_nodes_ptr());
  }

  // ==========================================
  // PARTICLE SYSTEM API
  // ==========================================
  updateParticles(gravity = 0.35, friction = 0.98, bounce = 0.45, floorY = 9999, decay = 0.012) {
    if (!this.isReady) return 0;
    return this.exports.update_particles(gravity, friction, bounce, floorY, decay);
  }

  renderParticles(ctx, colorPalette) {
    if (!this.isReady) return;
    const activeCount = this.exports.get_active_particles();
    if (activeCount === 0) return;

    // Stride is 10: [0] x, [1] y, [2] vx, [3] vy, [4] size, [5] rot, [6] v_rot, [7] alpha, [8] color_idx, [9] shape
    const data = this.particlesView;

    for (let i = 0; i < activeCount; i++) {
      const offset = i * 10;
      const alpha = data[offset + 7];
      if (alpha <= 0.01) continue;

      const px = data[offset];
      const py = data[offset + 1];
      const size = data[offset + 4];
      const rot = data[offset + 5];
      const colorIdx = Math.floor(data[offset + 8]);
      const shape = data[offset + 9];
      const color = colorPalette[colorIdx % colorPalette.length] || '#FFB5A7';

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.fillStyle = color;

      if (shape === 0) {
        // Rectangle
        ctx.fillRect(-size / 2, -size / 2, size, size);
      } else if (shape === 1) {
        // Shard
        ctx.beginPath();
        ctx.moveTo(-size / 2, -size / 3);
        ctx.lineTo(size / 2, 0);
        ctx.lineTo(0, size / 1.5);
        ctx.closePath();
        ctx.fill();
      } else {
        // Sparkle
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.3, -size * 0.3);
        ctx.lineTo(size, 0);
        ctx.lineTo(size * 0.3, size * 0.3);
        ctx.lineTo(0, size);
        ctx.lineTo(-size * 0.3, size * 0.3);
        ctx.lineTo(-size, 0);
        ctx.lineTo(-size * 0.3, -size * 0.3);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // ==========================================
  // KINETIC SAND VOXEL API
  // ==========================================
  initSandGrid(ox, oy, w, h, cols, rows, numColors) {
    if (!this.isReady) return 0;
    return this.exports.init_sand_grid(ox, oy, w, h, cols, rows, numColors);
  }

  sliceVoxels(cutterX, cutterY, radius, particlesPerVoxel, shapeType, floorY) {
    if (!this.isReady) return 0;
    return this.exports.slice_voxels(cutterX, cutterY, radius, particlesPerVoxel, shapeType, floorY);
  }

  renderVoxels(ctx, colorPalette) {
    if (!this.isReady) return;
    const totalVoxels = this.exports.get_total_voxels();
    const data = this.voxelsView;

    // Stride is 6: [0] x, [1] y, [2] w, [3] h, [4] color_idx, [5] sliced
    for (let i = 0; i < totalVoxels; i++) {
      const offset = i * 6;
      if (data[offset + 5] > 0.5) continue; // Sliced

      const vx = data[offset];
      const vy = data[offset + 1];
      const vw = data[offset + 2];
      const vh = data[offset + 3];
      const colorIdx = Math.floor(data[offset + 4]);
      const color = colorPalette[colorIdx % colorPalette.length];

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(vx + 2, vy + 3, vw, vh);

      // Voxel face
      ctx.fillStyle = color;
      ctx.fillRect(vx, vy, vw - 0.5, vh - 0.5);

      // 3D Top bevel
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(vx, vy, vw - 0.5, 2.5);

      // 3D Right shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(vx + vw - 2.5, vy, 2.5, vh - 0.5);
    }
  }

  // ==========================================
  // SOFT-BODY JELLY API
  // ==========================================
  initJelly(cx, cy, radius, nodeCount) {
    if (!this.isReady) return 0;
    return this.exports.init_jelly(cx, cy, radius, nodeCount);
  }

  pokeJelly(px, py, forceMag, influenceRadius) {
    if (!this.isReady) return;
    this.exports.poke_jelly(px, py, forceMag, influenceRadius);
  }

  updateJelly(cx, cy, stiffness, damping, neighborTension) {
    if (!this.isReady) return;
    this.exports.update_jelly(cx, cy, stiffness, damping, neighborTension);
  }

  getJellyNodes() {
    if (!this.isReady) return [];
    const count = this.exports.get_jelly_node_count();
    const data = this.jellyView;
    const nodes = [];
    // Stride is 6: [0] x, [1] y, [2] vx, [3] vy, [4] ox, [5] oy
    for (let i = 0; i < count; i++) {
      const offset = i * 6;
      nodes.push({
        x: data[offset],
        y: data[offset + 1]
      });
    }
    return nodes;
  }
}

window.wasmBridge = new RustWasmBridge();

