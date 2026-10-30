//! Marble Switchyard rules. Pure, deterministic, no allocation.
//!
//! MUST stay step-for-step identical to `games/marble-switchyard/src/sim/sim.ts`
//! (the TypeScript version, also used by the level generator).
//! `npm run parity -- marble-switchyard` compares the two.
//!
//! Rules
//! - The track is a binary tree in pre-order ('G' gate, 'C' cup). Marbles drop
//!   from the hopper onto the root and roll down at `speed` rows/s; at a gate
//!   they take the branch the gate points to *when they reach it*.
//! - Tapping a gate flips it (and every gate with the same non-zero link).
//!   AUTO gates also flip by themselves after each marble passes.
//! - A marble of the cup's colour (with room) fills it; anything else spills:
//!   the marble goes back to the end of the hopper queue. `spills` spills lose.
//!   Every cup full wins.

use playables_core::math::floor;

pub const MAX_NODES: usize = 16;
pub const MAX_GATES: usize = 8;
pub const MAX_CUPS: usize = 8;
pub const MAX_MARBLES: usize = 32;
pub const QCAP: usize = 128;
pub const MAX_EVENTS: usize = 128;
pub const MAX_TREE: usize = 32;

pub const KIND_GATE: u8 = 0;
pub const KIND_CUP: u8 = 1;

/// Rows between the hopper's drop point and the root gate.
pub const HOPPER_DROP: f64 = 1.0;
/// Seconds before the first marble leaves the hopper.
pub const FIRST_DROP: f64 = 1.2;

pub const EV_SPAWN: u8 = 1;
pub const EV_PASS: u8 = 2;
pub const EV_FLIP: u8 = 3;
pub const EV_CUP: u8 = 4;
pub const EV_FULL: u8 = 5;
pub const EV_SPILL: u8 = 6;
pub const EV_WIN: u8 = 7;
pub const EV_LOSE: u8 = 8;

pub const S_TIME: usize = 0;
pub const S_SPAWN_T: usize = 1;
pub const S_SPILLS: usize = 2;
pub const S_WON: usize = 3;
pub const S_LOST: usize = 4;
pub const S_NEXT_ID: usize = 5;
pub const S_INTERVAL: usize = 6;
pub const S_SPEED: usize = 7;
pub const S_MAX_SPILLS: usize = 8;
pub const NSCAL: usize = 10;

/// One level (see LevelData in levels.json).
#[derive(Clone)]
pub struct Level {
    pub tree: [u8; MAX_TREE],
    pub tree_len: usize,
    pub n_gates: usize,
    pub gate_start: [u8; MAX_GATES],
    pub gate_auto: [u8; MAX_GATES],
    pub gate_link: [u8; MAX_GATES],
    pub n_cups: usize,
    pub cup_color: [u8; MAX_CUPS],
    pub cup_cap: [u8; MAX_CUPS],
    pub seq: [u8; QCAP],
    pub seq_len: usize,
    pub interval: f64,
    pub speed: f64,
    pub spills: u32,
}

impl Level {
    pub fn empty() -> Self {
        Level {
            tree: [0; MAX_TREE], tree_len: 0, n_gates: 0,
            gate_start: [0; MAX_GATES], gate_auto: [0; MAX_GATES], gate_link: [0; MAX_GATES],
            n_cups: 0, cup_color: [0; MAX_CUPS], cup_cap: [0; MAX_CUPS],
            seq: [0; QCAP], seq_len: 0, interval: 1.0, speed: 1.0, spills: 3,
        }
    }

    pub fn set_tree(&mut self, t: &[u8]) {
        let n = t.len().min(MAX_TREE);
        self.tree[..n].copy_from_slice(&t[..n]);
        self.tree_len = n;
    }

    pub fn set_seq(&mut self, s: &[u8]) {
        let n = s.len().min(QCAP);
        self.seq[..n].copy_from_slice(&s[..n]);
        self.seq_len = n;
    }
}

/// Struct-of-arrays state. The TypeScript side reads these arrays straight
/// from wasm memory (see marble-switchyard-wasm), so field types are ABI.
pub struct Sim {
    // tree (static per level)
    pub n_nodes: usize,
    pub node_kind: [u8; MAX_NODES],
    pub node_parent: [i32; MAX_NODES],
    pub node_left: [i32; MAX_NODES],
    pub node_right: [i32; MAX_NODES],
    pub node_ref: [u8; MAX_NODES],
    pub node_row: [u8; MAX_NODES],
    pub n_gates: usize,
    pub n_cups: usize,
    pub gate_node: [u8; MAX_GATES],
    pub cup_node: [u8; MAX_CUPS],
    // dynamic
    pub scal: [f64; NSCAL],
    pub gate_state: [u8; MAX_GATES],
    pub gate_auto: [u8; MAX_GATES],
    pub gate_link: [u8; MAX_GATES],
    pub cup_color: [u8; MAX_CUPS],
    pub cup_cap: [u8; MAX_CUPS],
    pub cup_count: [u8; MAX_CUPS],
    pub m_n: u32,
    pub m_id: [i32; MAX_MARBLES],
    pub m_color: [u8; MAX_MARBLES],
    pub m_to: [i32; MAX_MARBLES],
    pub m_from: [i32; MAX_MARBLES],
    pub m_d: [f64; MAX_MARBLES],
    pub m_len: [f64; MAX_MARBLES],
    pub queue: [u8; QCAP],
    pub q_head: u32,
    pub q_len: u32,
    pub ev_len: u32,
    pub ev_type: [u8; MAX_EVENTS],
    pub ev_a: [i32; MAX_EVENTS],
    pub ev_b: [i32; MAX_EVENTS],
}

impl Sim {
    pub fn new(l: &Level) -> Self {
        let mut s = Sim {
            n_nodes: 0,
            node_kind: [0; MAX_NODES], node_parent: [-1; MAX_NODES], node_left: [-1; MAX_NODES],
            node_right: [-1; MAX_NODES], node_ref: [0; MAX_NODES], node_row: [0; MAX_NODES],
            n_gates: 0, n_cups: 0, gate_node: [0; MAX_GATES], cup_node: [0; MAX_CUPS],
            scal: [0.0; NSCAL],
            gate_state: [0; MAX_GATES], gate_auto: [0; MAX_GATES], gate_link: [0; MAX_GATES],
            cup_color: [0; MAX_CUPS], cup_cap: [0; MAX_CUPS], cup_count: [0; MAX_CUPS],
            m_n: 0, m_id: [0; MAX_MARBLES], m_color: [0; MAX_MARBLES], m_to: [0; MAX_MARBLES],
            m_from: [-1; MAX_MARBLES], m_d: [0.0; MAX_MARBLES], m_len: [0.0; MAX_MARBLES],
            queue: [0; QCAP], q_head: 0, q_len: 0,
            ev_len: 0, ev_type: [0; MAX_EVENTS], ev_a: [0; MAX_EVENTS], ev_b: [0; MAX_EVENTS],
        };
        s.parse_tree(&l.tree[..l.tree_len]);
        for g in 0..s.n_gates {
            s.gate_state[g] = l.gate_start[g] & 1;
            s.gate_auto[g] = l.gate_auto[g];
            s.gate_link[g] = l.gate_link[g];
        }
        for c in 0..s.n_cups {
            s.cup_color[c] = l.cup_color[c];
            s.cup_cap[c] = l.cup_cap[c];
        }
        for i in 0..l.seq_len {
            s.q_push(l.seq[i]);
        }
        s.scal[S_SPAWN_T] = FIRST_DROP;
        s.scal[S_NEXT_ID] = 1.0;
        s.scal[S_INTERVAL] = l.interval;
        s.scal[S_SPEED] = l.speed;
        s.scal[S_MAX_SPILLS] = l.spills as f64;
        s
    }

    /// Builds the node arrays from pre-order 'G'/'C' (same numbering as parseTree in sim.ts).
    fn parse_tree(&mut self, t: &[u8]) {
        let mut i = 0usize;
        // explicit stack instead of recursion: (node, child slot to fill: 0 = left, 1 = right)
        let mut stack: [(usize, u8); MAX_NODES] = [(0, 0); MAX_NODES];
        let mut sp = 0usize;
        while i < t.len() && self.n_nodes < MAX_NODES {
            let idx = self.n_nodes;
            self.n_nodes += 1;
            let parent = if sp > 0 { stack[sp - 1].0 as i32 } else { -1 };
            self.node_parent[idx] = parent;
            if sp > 0 {
                let (p, slot) = stack[sp - 1];
                if slot == 0 {
                    self.node_left[p] = idx as i32;
                    stack[sp - 1].1 = 1;
                } else {
                    self.node_right[p] = idx as i32;
                    sp -= 1; // parent complete
                }
            }
            let depth = if parent < 0 { 0 } else { self.node_row[parent as usize] + 1 };
            self.node_row[idx] = depth;
            if t[i] == b'G' {
                self.node_kind[idx] = KIND_GATE;
                self.node_ref[idx] = self.n_gates as u8;
                self.gate_node[self.n_gates] = idx as u8;
                self.n_gates += 1;
                stack[sp] = (idx, 0);
                sp += 1;
            } else {
                self.node_kind[idx] = KIND_CUP;
                self.node_ref[idx] = self.n_cups as u8;
                self.cup_node[self.n_cups] = idx as u8;
                self.n_cups += 1;
            }
            i += 1;
        }
        // cups all sit on the bottom row
        let mut bottom = 0u8;
        for k in 0..self.n_nodes {
            bottom = bottom.max(self.node_row[k]);
        }
        for k in 0..self.n_nodes {
            if self.node_kind[k] == KIND_CUP {
                self.node_row[k] = bottom;
            }
        }
    }

    // ---------- queries ----------
    pub fn edge_len(&self, node: usize) -> f64 {
        let p = self.node_parent[node];
        if p < 0 {
            HOPPER_DROP
        } else {
            self.node_row[node] as f64 - self.node_row[p as usize] as f64
        }
    }

    pub fn won(&self) -> bool {
        self.scal[S_WON] != 0.0
    }

    pub fn lost(&self) -> bool {
        self.scal[S_LOST] != 0.0
    }

    pub fn over(&self) -> bool {
        self.won() || self.lost()
    }

    pub fn spills(&self) -> u32 {
        self.scal[S_SPILLS] as u32
    }

    pub fn queue_at(&self, k: u32) -> u8 {
        self.queue[((self.q_head + k) as usize) % QCAP]
    }

    // ---------- helpers ----------
    fn q_push(&mut self, c: u8) {
        if (self.q_len as usize) < QCAP {
            let i = ((self.q_head + self.q_len) as usize) % QCAP;
            self.queue[i] = c;
            self.q_len += 1;
        }
    }

    fn q_shift(&mut self) -> u8 {
        let c = self.queue[self.q_head as usize];
        self.q_head = ((self.q_head as usize + 1) % QCAP) as u32;
        self.q_len -= 1;
        c
    }

    fn event(&mut self, kind: u8, a: i32, b: i32) {
        let n = self.ev_len as usize;
        if n < MAX_EVENTS {
            self.ev_type[n] = kind;
            self.ev_a[n] = a;
            self.ev_b[n] = b;
            self.ev_len += 1;
        }
    }

    pub fn clear_events(&mut self) {
        self.ev_len = 0;
    }

    fn remove_marble(&mut self, i: usize) {
        let n = self.m_n as usize;
        for k in i..n - 1 {
            self.m_id[k] = self.m_id[k + 1];
            self.m_color[k] = self.m_color[k + 1];
            self.m_to[k] = self.m_to[k + 1];
            self.m_from[k] = self.m_from[k + 1];
            self.m_d[k] = self.m_d[k + 1];
            self.m_len[k] = self.m_len[k + 1];
        }
        self.m_n -= 1;
    }

    // ---------- API ----------
    pub fn tap(&mut self, g: usize) -> bool {
        if self.over() || g >= self.n_gates {
            return false;
        }
        let link = self.gate_link[g];
        for k in 0..self.n_gates {
            if k == g || (link != 0 && self.gate_link[k] == link) {
                self.gate_state[k] ^= 1;
                self.event(EV_FLIP, k as i32, 0);
            }
        }
        true
    }

    pub fn update(&mut self, dt: f64) {
        if dt <= 0.0 || self.over() {
            return;
        }
        self.scal[S_TIME] += dt;
        self.scal[S_SPAWN_T] -= dt;
        if self.scal[S_SPAWN_T] <= 0.0 && self.q_len > 0 {
            let color = self.q_shift();
            let id = self.scal[S_NEXT_ID] as i32;
            self.scal[S_NEXT_ID] += 1.0;
            if (self.m_n as usize) < MAX_MARBLES {
                let k = self.m_n as usize;
                self.m_id[k] = id;
                self.m_color[k] = color;
                self.m_to[k] = 0;
                self.m_from[k] = -1;
                self.m_d[k] = 0.0;
                self.m_len[k] = self.edge_len(0);
                self.m_n += 1;
            }
            self.event(EV_SPAWN, id, color as i32);
            self.scal[S_SPAWN_T] += self.scal[S_INTERVAL];
        } else if self.scal[S_SPAWN_T] < 0.0 {
            self.scal[S_SPAWN_T] = 0.0;
        }
        let step = self.scal[S_SPEED] * dt;
        let mut i = self.m_n as usize;
        while i > 0 {
            i -= 1;
            self.m_d[i] += step;
            while self.m_d[i] >= self.m_len[i] {
                self.m_d[i] -= self.m_len[i];
                let node = self.m_to[i] as usize;
                if self.node_kind[node] == KIND_GATE {
                    let g = self.node_ref[node] as usize;
                    let next = if self.gate_state[g] == 0 { self.node_left[node] } else { self.node_right[node] };
                    self.event(EV_PASS, g as i32, self.m_id[i]);
                    if self.gate_auto[g] != 0 {
                        self.gate_state[g] ^= 1;
                        self.event(EV_FLIP, g as i32, -1);
                    }
                    self.m_from[i] = self.m_to[i];
                    self.m_to[i] = next;
                    self.m_len[i] = self.edge_len(next as usize);
                } else {
                    let c = self.node_ref[node] as usize;
                    self.land(i, c);
                    self.remove_marble(i);
                    break;
                }
            }
            if self.over() {
                return;
            }
        }
    }

    fn land(&mut self, i: usize, c: usize) {
        let color = self.m_color[i];
        let id = self.m_id[i];
        if self.cup_color[c] == color && self.cup_count[c] < self.cup_cap[c] {
            self.cup_count[c] += 1;
            self.event(EV_CUP, c as i32, id);
            if self.cup_count[c] == self.cup_cap[c] {
                self.event(EV_FULL, c as i32, id);
            }
            if (0..self.n_cups).all(|k| self.cup_count[k] == self.cup_cap[k]) {
                self.scal[S_WON] = 1.0;
                self.event(EV_WIN, -1, -1);
            }
            return;
        }
        self.scal[S_SPILLS] += 1.0;
        self.event(EV_SPILL, c as i32, id);
        self.q_push(color);
        if self.scal[S_SPILLS] >= self.scal[S_MAX_SPILLS] {
            self.scal[S_LOST] = 1.0;
            self.event(EV_LOSE, c as i32, id);
        } else if self.q_len == 1 && self.scal[S_SPAWN_T] <= 0.0 {
            // the hopper had run dry: give the returned marble a moment before it drops
            self.scal[S_SPAWN_T] = self.scal[S_INTERVAL];
        }
    }

    /// Order-sensitive FNV-1a checksum of the logical state (parity tests).
    /// Floats enter as floor(x * 1e6) so both sides hash identical integers.
    pub fn checksum(&self) -> u32 {
        let mut h: u32 = 0x811c_9dc5;
        let mut mix = |b: u32| {
            h ^= b;
            h = h.wrapping_mul(0x0100_0193);
        };
        let fx = |x: f64| floor(x * 1e6) as i64 as u32;
        mix(fx(self.scal[S_TIME]));
        mix(fx(self.scal[S_SPAWN_T]));
        mix(self.m_n);
        for k in 0..self.m_n as usize {
            mix(self.m_id[k] as u32);
            mix(self.m_color[k] as u32);
            mix(self.m_to[k] as u32);
            mix(fx(self.m_d[k]));
        }
        for g in 0..self.n_gates {
            mix(self.gate_state[g] as u32);
        }
        for c in 0..self.n_cups {
            mix(self.cup_count[c] as u32);
        }
        mix(self.q_len);
        for k in 0..self.q_len {
            mix(self.queue_at(k) as u32);
        }
        mix(self.scal[S_SPILLS] as u32);
        mix(self.scal[S_WON] as u32);
        mix(self.scal[S_LOST] as u32);
        h
    }
}
