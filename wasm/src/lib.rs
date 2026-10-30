//! High-Performance Rust ASMR Physics Engine for WebAssembly
//! Handles high-density kinetic sand slicing, particle physics, and soft-body jelly mesh.
//! Compiles into an ultra-compact (~20KB) zero-dependency WASM binary.

// Simple fast Pseudo-Random Number Generator (Xorshift32)
static mut RNG_STATE: u32 = 0x12345678;

#[inline(always)]
fn rand_f32() -> f32 {
    unsafe {
        let mut x = RNG_STATE;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        RNG_STATE = x;
        (x as f32) / (u32::MAX as f32)
    }
}

#[inline(always)]
fn rand_range(min: f32, max: f32) -> f32 {
    min + rand_f32() * (max - min)
}

// ============================================================================
// 1. PARTICLE SYSTEM (Zero-Allocation, Flat Linear Memory)
// ============================================================================
const MAX_PARTICLES: usize = 2000;
const PARTICLE_STRIDE: usize = 10;
// Particle layout in f32:
// [0] x, [1] y, [2] vx, [3] vy, [4] size, [5] rot, [6] v_rot, [7] alpha, [8] color_idx, [9] shape
static mut PARTICLES_DATA: [f32; MAX_PARTICLES * PARTICLE_STRIDE] = [0.0; MAX_PARTICLES * PARTICLE_STRIDE];
static mut ACTIVE_PARTICLES: usize = 0;

#[no_mangle]
pub extern "C" fn get_particles_ptr() -> *const f32 {
    unsafe { PARTICLES_DATA.as_ptr() }
}

#[no_mangle]
pub extern "C" fn get_active_particles() -> usize {
    unsafe { ACTIVE_PARTICLES }
}

#[no_mangle]
pub extern "C" fn clear_particles() {
    unsafe {
        ACTIVE_PARTICLES = 0;
    }
}

#[no_mangle]
pub extern "C" fn spawn_particle(
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    size: f32,
    rot: f32,
    v_rot: f32,
    alpha: f32,
    color_idx: f32,
    shape: f32,
) {
    unsafe {
        if ACTIVE_PARTICLES >= MAX_PARTICLES {
            return;
        }
        let offset = ACTIVE_PARTICLES * PARTICLE_STRIDE;
        PARTICLES_DATA[offset] = x;
        PARTICLES_DATA[offset + 1] = y;
        PARTICLES_DATA[offset + 2] = vx;
        PARTICLES_DATA[offset + 3] = vy;
        PARTICLES_DATA[offset + 4] = size;
        PARTICLES_DATA[offset + 5] = rot;
        PARTICLES_DATA[offset + 6] = v_rot;
        PARTICLES_DATA[offset + 7] = alpha;
        PARTICLES_DATA[offset + 8] = color_idx;
        PARTICLES_DATA[offset + 9] = shape;
        ACTIVE_PARTICLES += 1;
    }
}

#[no_mangle]
pub extern "C" fn update_particles(gravity: f32, friction: f32, bounce: f32, floor_y: f32, decay: f32) -> usize {
    unsafe {
        let mut i = 0;
        while i < ACTIVE_PARTICLES {
            let offset = i * PARTICLE_STRIDE;

            // Update velocity
            PARTICLES_DATA[offset + 3] += gravity; // vy += gravity
            PARTICLES_DATA[offset + 2] *= friction; // vx *= friction
            PARTICLES_DATA[offset + 3] *= friction; // vy *= friction

            // Update position & rotation
            PARTICLES_DATA[offset] += PARTICLES_DATA[offset + 2];     // x += vx
            PARTICLES_DATA[offset + 1] += PARTICLES_DATA[offset + 3]; // y += vy
            PARTICLES_DATA[offset + 5] += PARTICLES_DATA[offset + 6]; // rot += v_rot

            // Decay alpha
            PARTICLES_DATA[offset + 7] -= decay; // alpha -= decay

            // Floor collision
            let py = PARTICLES_DATA[offset + 1];
            if py > floor_y {
                PARTICLES_DATA[offset + 1] = floor_y;
                PARTICLES_DATA[offset + 3] = -PARTICLES_DATA[offset + 3] * bounce;
                PARTICLES_DATA[offset + 2] *= 0.78;
                PARTICLES_DATA[offset + 6] *= 0.6;
            }

            // Check lifetime
            if PARTICLES_DATA[offset + 7] <= 0.01 {
                // Swap-and-pop fast removal
                ACTIVE_PARTICLES -= 1;
                if i < ACTIVE_PARTICLES {
                    let last_offset = ACTIVE_PARTICLES * PARTICLE_STRIDE;
                    for k in 0..PARTICLE_STRIDE {
                        PARTICLES_DATA[offset + k] = PARTICLES_DATA[last_offset + k];
                    }
                }
            } else {
                i += 1;
            }
        }
        ACTIVE_PARTICLES
    }
}

// ============================================================================
// 2. KINETIC SAND & SOAP VOXEL GRID (High-Density Micro-Voxels)
// ============================================================================
const MAX_VOXELS: usize = 1200;
const VOXEL_STRIDE: usize = 6;
// Voxel layout: [0] x, [1] y, [2] w, [3] h, [4] color_idx, [5] sliced (1.0 = sliced, 0.0 = solid)
static mut VOXELS_DATA: [f32; MAX_VOXELS * VOXEL_STRIDE] = [0.0; MAX_VOXELS * VOXEL_STRIDE];
static mut TOTAL_VOXELS: usize = 0;

#[no_mangle]
pub extern "C" fn get_voxels_ptr() -> *const f32 {
    unsafe { VOXELS_DATA.as_ptr() }
}

#[no_mangle]
pub extern "C" fn get_total_voxels() -> usize {
    unsafe { TOTAL_VOXELS }
}

#[no_mangle]
pub extern "C" fn init_sand_grid(
    origin_x: f32,
    origin_y: f32,
    grid_w: f32,
    grid_h: f32,
    cols: usize,
    rows: usize,
    num_colors: usize,
) -> usize {
    unsafe {
        let count = cols * rows;
        TOTAL_VOXELS = if count > MAX_VOXELS { MAX_VOXELS } else { count };

        let cell_w = grid_w / (cols as f32);
        let cell_h = grid_h / (rows as f32);

        let mut idx = 0;
        for r in 0..rows {
            let color_idx = ((r as f32 / rows as f32) * (num_colors as f32)) as usize % num_colors;
            for c in 0..cols {
                if idx >= TOTAL_VOXELS {
                    break;
                }
                let offset = idx * VOXEL_STRIDE;
                VOXELS_DATA[offset] = origin_x + (c as f32) * cell_w;
                VOXELS_DATA[offset + 1] = origin_y + (r as f32) * cell_h;
                VOXELS_DATA[offset + 2] = cell_w;
                VOXELS_DATA[offset + 3] = cell_h;
                VOXELS_DATA[offset + 4] = color_idx as f32;
                VOXELS_DATA[offset + 5] = 0.0; // Not sliced
                idx += 1;
            }
        }
        TOTAL_VOXELS
    }
}

#[no_mangle]
pub extern "C" fn slice_voxels(
    cutter_x: f32,
    cutter_y: f32,
    radius: f32,
    particles_per_voxel: usize,
    shape_type: f32,
    floor_y: f32,
) -> usize {
    unsafe {
        let mut sliced_count = 0;
        let r2 = radius * radius;

        for i in 0..TOTAL_VOXELS {
            let offset = i * VOXEL_STRIDE;
            if VOXELS_DATA[offset + 5] > 0.5 {
                continue; // Already sliced
            }

            let vx = VOXELS_DATA[offset] + VOXELS_DATA[offset + 2] * 0.5;
            let vy = VOXELS_DATA[offset + 1] + VOXELS_DATA[offset + 3] * 0.5;

            let dx = cutter_x - vx;
            let dy = cutter_y - vy;
            let dist2 = dx * dx + dy * dy;

            if dist2 <= r2 {
                VOXELS_DATA[offset + 5] = 1.0; // Mark sliced
                sliced_count += 1;

                // Spawn tumbling physics crumbs in Rust
                let color_idx = VOXELS_DATA[offset + 4];
                for _ in 0..particles_per_voxel {
                    let p_vx = rand_range(-2.5, 2.5) + (cutter_x - vx) * 0.06;
                    let p_vy = rand_range(-3.5, -0.8);
                    let size = rand_range(3.5, 8.0);
                    let rot = rand_range(0.0, 6.28);
                    let v_rot = rand_range(-0.15, 0.15);

                    spawn_particle(
                        vx,
                        vy,
                        p_vx,
                        p_vy,
                        size,
                        rot,
                        v_rot,
                        1.0,
                        color_idx,
                        shape_type,
                    );
                }
            }
        }
        sliced_count
    }
}

// ============================================================================
// 3. SOFT-BODY JELLY MESH (Multi-Node Elastic Spring Simulation)
// ============================================================================
const MAX_JELLY_NODES: usize = 64;
// Node layout: [0] x, [1] y, [2] vx, [3] vy, [4] origin_rel_x, [5] origin_rel_y
static mut JELLY_DATA: [f32; MAX_JELLY_NODES * 6] = [0.0; MAX_JELLY_NODES * 6];
static mut JELLY_NODE_COUNT: usize = 0;
static mut JELLY_CENTER_X: f32 = 0.0;
static mut JELLY_CENTER_Y: f32 = 0.0;

#[no_mangle]
pub extern "C" fn get_jelly_nodes_ptr() -> *const f32 {
    unsafe { JELLY_DATA.as_ptr() }
}

#[no_mangle]
pub extern "C" fn get_jelly_node_count() -> usize {
    unsafe { JELLY_NODE_COUNT }
}

#[no_mangle]
pub extern "C" fn init_jelly(cx: f32, cy: f32, radius: f32, node_count: usize) -> usize {
    unsafe {
        JELLY_CENTER_X = cx;
        JELLY_CENTER_Y = cy;
        let count = if node_count > MAX_JELLY_NODES { MAX_JELLY_NODES } else { node_count };
        JELLY_NODE_COUNT = count;

        let step = (std::f32::consts::PI * 2.0) / (count as f32);
        for i in 0..count {
            let angle = (i as f32) * step;
            let rx = angle.cos() * radius;
            let ry = angle.sin() * radius;

            let offset = i * 6;
            JELLY_DATA[offset] = cx + rx;     // x
            JELLY_DATA[offset + 1] = cy + ry; // y
            JELLY_DATA[offset + 2] = 0.0;     // vx
            JELLY_DATA[offset + 3] = 0.0;     // vy
            JELLY_DATA[offset + 4] = rx;      // origin_rel_x
            JELLY_DATA[offset + 5] = ry;      // origin_rel_y
        }
        count
    }
}

#[no_mangle]
pub extern "C" fn poke_jelly(px: f32, py: f32, force_mag: f32, influence_radius: f32) {
    unsafe {
        let r2 = influence_radius * influence_radius;
        for i in 0..JELLY_NODE_COUNT {
            let offset = i * 6;
            let nx = JELLY_DATA[offset];
            let ny = JELLY_DATA[offset + 1];

            let dx = nx - px;
            let dy = ny - py;
            let d2 = dx * dx + dy * dy;

            if d2 < r2 {
                let dist = d2.sqrt();
                let factor = (1.0 - (dist / influence_radius)) * force_mag;
                let angle = dy.atan2(dx);
                JELLY_DATA[offset + 2] += angle.cos() * factor;
                JELLY_DATA[offset + 3] += angle.sin() * factor;
            }
        }
    }
}

#[no_mangle]
pub extern "C" fn update_jelly(cx: f32, cy: f32, stiffness: f32, damping: f32, neighbor_tension: f32) {
    unsafe {
        JELLY_CENTER_X = cx;
        JELLY_CENTER_Y = cy;
        let count = JELLY_NODE_COUNT;
        if count == 0 {
            return;
        }

        // 1. Hooke's Law spring force towards resting circle
        for i in 0..count {
            let offset = i * 6;
            let target_x = cx + JELLY_DATA[offset + 4];
            let target_y = cy + JELLY_DATA[offset + 5];

            let disp_x = JELLY_DATA[offset] - target_x;
            let disp_y = JELLY_DATA[offset + 1] - target_y;

            let acc_x = -stiffness * disp_x;
            let acc_y = -stiffness * disp_y;

            JELLY_DATA[offset + 2] = (JELLY_DATA[offset + 2] + acc_x) * damping;
            JELLY_DATA[offset + 3] = (JELLY_DATA[offset + 3] + acc_y) * damping;

            JELLY_DATA[offset] += JELLY_DATA[offset + 2];
            JELLY_DATA[offset + 1] += JELLY_DATA[offset + 3];
        }

        // 2. Neighbor Curvature Smoothing (keeps jelly organic & elastic)
        for i in 0..count {
            let prev_idx = (i + count - 1) % count;
            let next_idx = (i + 1) % count;

            let prev_offset = prev_idx * 6;
            let curr_offset = i * 6;
            let next_offset = next_idx * 6;

            let mid_x = (JELLY_DATA[prev_offset] + JELLY_DATA[next_offset]) * 0.5;
            let mid_y = (JELLY_DATA[prev_offset + 1] + JELLY_DATA[next_offset + 1]) * 0.5;

            JELLY_DATA[curr_offset + 2] += (mid_x - JELLY_DATA[curr_offset]) * neighbor_tension;
            JELLY_DATA[curr_offset + 3] += (mid_y - JELLY_DATA[curr_offset + 1]) * neighbor_tension;
        }
    }
}

