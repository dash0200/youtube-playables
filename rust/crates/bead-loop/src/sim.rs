//! Bead Loop rules. Pure, deterministic, no allocation.
//!
//! MUST stay step-for-step identical to `games/bead-loop/src/sim/ts-sim.ts`
//! (the TypeScript fallback). `cargo run -p bead-loop-tools --bin trace` and
//! `npm run parity` compare the two.
//!
//! Rules
//! - Belt: `n_slots` slots move clockwise at `speed` slots/s. Slot i is at belt
//!   parameter (i + offset) mod n.
//! - Tube t has a shell colour (= t) and a stack of beads (bottom → top).
//! - A tube is OPEN while its top bead is its shell colour (or it is empty).
//!   Whenever a slot passes the port of an open tube with space, a bead of the
//!   shell colour drops in. A wrong colour on top blocks the tube until tapped.
//!   An empty slot passing a port takes one bead from that tube's queue.
//! - TAP ejects the top run (all top beads of the same colour, plus beads still
//!   falling in) into the tube's queue; they re-enter the belt via empty slots.
//! - Complete: tube full and every bead is its shell colour. Win: all complete.
//! - LOSE: belt 100% full with no absorption for JAM_TIME seconds.

use playables_core::math::{floor, hash01, modp};
use playables_core::path::RoundedRect;

pub const K: usize = 9; // beads per block (3x3)
pub const MAX_TUBES: usize = 6;
pub const MAX_CAP: usize = 8;
pub const MAX_BEADS: usize = MAX_CAP * K;
pub const QCAP: usize = 128;
pub const MAX_SLOTS: usize = 320;
pub const EMPTY: u8 = 255;
pub const FALL_TIME: f64 = 0.3;
pub const JAM_TIME: f64 = 3.0;
/// A tube may be tapped only while fewer than this many beads wait in its queue.
pub const QUEUE_TAP_LIMIT: usize = K;
pub const MAX_EVENTS: usize = 256;

pub const EV_ABSORB: u8 = 1;
pub const EV_LAND: u8 = 2;
pub const EV_EJECT: u8 = 3;
pub const EV_DENY: u8 = 4;
pub const EV_COMPLETE: u8 = 5;
pub const EV_WIN: u8 = 6;
pub const EV_LOSE: u8 = 7;

pub const S_OFFSET: usize = 0;
pub const S_TIME: usize = 1;
pub const S_ELAPSED: usize = 2;
pub const S_JAM: usize = 3;
pub const S_WON: usize = 4;
pub const S_LOST: usize = 5;
pub const S_TAPS: usize = 6;
pub const S_STARTED: usize = 7;
pub const S_FREE: usize = 8;
pub const NSCAL: usize = 12;

#[derive(Clone)]
pub struct Level {
    pub colors: usize,
    pub cap: usize,
    pub slots: usize,
    pub speed: f64,
    /// Blocks per tube at start.
    pub fill: [u8; MAX_TUBES],
    /// Block colours per tube, bottom → top (first `fill[t]` entries used).
    pub tubes: [[u8; MAX_CAP]; MAX_TUBES],
    /// Initial belt (EMPTY or colour); first `slots` entries used.
    pub belt: [u8; MAX_SLOTS],
}

impl Level {
    pub fn empty() -> Self {
        Level { colors: 0, cap: 0, slots: 0, speed: 0.0, fill: [0; MAX_TUBES], tubes: [[0; MAX_CAP]; MAX_TUBES], belt: [EMPTY; MAX_SLOTS] }
    }
}

/// Struct-of-arrays state. The TypeScript side reads these arrays directly
/// from wasm memory (see bead-loop-wasm), so field types are part of the ABI.
#[repr(C)]
pub struct Sim {
    pub n_slots: usize,
    pub n_tubes: usize,
    pub cap: usize,
    pub speed: f64,
    pub scal: [f64; NSCAL],
    pub slot_color: [u8; MAX_SLOTS],
    pub slot_born: [f64; MAX_SLOTS],
    pub tube_shell: [u8; MAX_TUBES],
    pub tube_beads: [u8; MAX_TUBES * MAX_BEADS],
    pub tube_len: [u16; MAX_TUBES],
    pub fall_t: [f64; MAX_TUBES * MAX_BEADS],
    pub fall_len: [u16; MAX_TUBES],
    pub queue: [u8; MAX_TUBES * QCAP],
    pub q_head: [u16; MAX_TUBES],
    pub q_len: [u16; MAX_TUBES],
    pub port: [f64; MAX_TUBES],
    pub last_idx: [i32; MAX_TUBES],
    pub combo: [u16; MAX_TUBES],
    pub shake: [f64; MAX_TUBES],
    pub flash: [f64; MAX_TUBES],
    pub complete: [u8; MAX_TUBES],
    pub events: [u8; MAX_EVENTS * 2],
    pub ev_len: u16,
    pub pos: [f32; MAX_SLOTS * 2],
    pub path: RoundedRect,
    pub jitter: f64,
}

impl Sim {
    pub fn new(l: &Level) -> Self {
        let mut s = Sim {
            n_slots: l.slots.clamp(1, MAX_SLOTS),
            n_tubes: l.colors.min(MAX_TUBES),
            cap: l.cap.min(MAX_CAP),
            speed: l.speed,
            scal: [0.0; NSCAL],
            slot_color: [EMPTY; MAX_SLOTS],
            slot_born: [-1.0; MAX_SLOTS],
            tube_shell: [0; MAX_TUBES],
            tube_beads: [EMPTY; MAX_TUBES * MAX_BEADS],
            tube_len: [0; MAX_TUBES],
            fall_t: [0.0; MAX_TUBES * MAX_BEADS],
            fall_len: [0; MAX_TUBES],
            queue: [EMPTY; MAX_TUBES * QCAP],
            q_head: [0; MAX_TUBES],
            q_len: [0; MAX_TUBES],
            port: [0.0; MAX_TUBES],
            last_idx: [0; MAX_TUBES],
            combo: [0; MAX_TUBES],
            shake: [0.0; MAX_TUBES],
            flash: [0.0; MAX_TUBES],
            complete: [0; MAX_TUBES],
            events: [0; MAX_EVENTS * 2],
            ev_len: 0,
            pos: [0.0; MAX_SLOTS * 2],
            path: RoundedRect::default(),
            jitter: 0.0,
        };
        for t in 0..s.n_tubes {
            s.tube_shell[t] = t as u8;
            for b in 0..(l.fill[t] as usize).min(s.cap) {
                for _ in 0..K {
                    s.push_bead(t, l.tubes[t][b]);
                }
            }
        }
        for i in 0..s.n_slots {
            s.slot_color[i] = l.belt[i];
        }
        s.scal[S_FREE] = s.free_slots() as f64;
        s
    }

    // ---------- queries ----------
    /// Colour of the top bead (shell colour if empty).
    #[inline]
    pub fn intake(&self, t: usize) -> u8 {
        let len = self.tube_len[t] as usize;
        if len == 0 {
            self.tube_shell[t]
        } else {
            self.tube_beads[t * MAX_BEADS + len - 1]
        }
    }

    /// True while the tube can take beads: top is its own colour, or it is empty.
    #[inline]
    pub fn is_open(&self, t: usize) -> bool {
        self.intake(t) == self.tube_shell[t]
    }

    #[inline]
    pub fn space(&self, t: usize) -> usize {
        (self.cap * K).saturating_sub(self.tube_len[t] as usize + self.fall_len[t] as usize)
    }

    pub fn top_run(&self, t: usize) -> usize {
        let len = self.tube_len[t] as usize;
        if len == 0 {
            return 0;
        }
        let c = self.tube_beads[t * MAX_BEADS + len - 1];
        let mut n = 0;
        while n < len && self.tube_beads[t * MAX_BEADS + len - 1 - n] == c {
            n += 1;
        }
        n
    }

    pub fn is_full_shell(&self, t: usize) -> bool {
        let len = self.tube_len[t] as usize;
        len == self.cap * K && (0..len).all(|j| self.tube_beads[t * MAX_BEADS + j] == self.tube_shell[t])
    }

    pub fn free_slots(&self) -> usize {
        self.slot_color[..self.n_slots].iter().filter(|&&c| c == EMPTY).count()
    }

    pub fn slot_at(&self, p: f64) -> i32 {
        modp(floor(p - self.scal[S_OFFSET]), self.n_slots as f64) as i32
    }

    pub fn won(&self) -> bool {
        self.scal[S_WON] != 0.0
    }

    pub fn lost(&self) -> bool {
        self.scal[S_LOST] != 0.0
    }

    // ---------- mutation helpers ----------
    fn push_bead(&mut self, t: usize, c: u8) {
        let len = self.tube_len[t] as usize;
        if len < MAX_BEADS {
            self.tube_beads[t * MAX_BEADS + len] = c;
            self.tube_len[t] += 1;
        }
    }

    fn q_push(&mut self, t: usize, c: u8) {
        let len = self.q_len[t] as usize;
        if len >= QCAP {
            return;
        }
        let i = (self.q_head[t] as usize + len) % QCAP;
        self.queue[t * QCAP + i] = c;
        self.q_len[t] += 1;
    }

    fn q_pop(&mut self, t: usize) -> u8 {
        let h = self.q_head[t] as usize;
        let c = self.queue[t * QCAP + h];
        self.q_head[t] = ((h + 1) % QCAP) as u16;
        self.q_len[t] -= 1;
        c
    }

    fn event(&mut self, kind: u8, tube: u8) {
        let n = self.ev_len as usize;
        if n < MAX_EVENTS {
            self.events[n * 2] = kind;
            self.events[n * 2 + 1] = tube;
            self.ev_len += 1;
        }
    }

    pub fn clear_events(&mut self) {
        self.ev_len = 0;
    }

    // ---------- API ----------
    pub fn set_port(&mut self, t: usize, frac: f64) {
        if t >= self.n_tubes {
            return;
        }
        self.port[t] = frac * self.n_slots as f64;
        self.last_idx[t] = self.slot_at(self.port[t]);
    }

    pub fn tap(&mut self, t: usize) -> bool {
        if t >= self.n_tubes || self.won() || self.lost() {
            return false;
        }
        let len = self.tube_len[t] as usize;
        let fl = self.fall_len[t] as usize;
        if self.complete[t] != 0 || self.q_len[t] as usize >= QUEUE_TAP_LIMIT || (len == 0 && fl == 0) {
            self.shake[t] = 1.0;
            self.event(EV_DENY, t as u8);
            return false;
        }
        let color = self.tube_shell[t];
        for _ in 0..fl {
            self.q_push(t, color);
        }
        self.fall_len[t] = 0;
        let run = self.top_run(t);
        for _ in 0..run {
            let l = self.tube_len[t] as usize;
            let c = self.tube_beads[t * MAX_BEADS + l - 1];
            self.tube_beads[t * MAX_BEADS + l - 1] = EMPTY;
            self.tube_len[t] -= 1;
            self.q_push(t, c);
        }
        self.combo[t] = 0;
        self.scal[S_TAPS] += 1.0;
        self.scal[S_STARTED] = 1.0;
        self.event(EV_EJECT, t as u8);
        true
    }

    fn arrive(&mut self, t: usize, i: usize) -> bool {
        let c = self.slot_color[i];
        if self.complete[t] == 0 && c == self.tube_shell[t] && self.is_open(t) && self.space(t) > 0 {
            self.slot_color[i] = EMPTY;
            let fl = self.fall_len[t] as usize;
            self.fall_t[t * MAX_BEADS + fl] = 0.0;
            self.fall_len[t] += 1;
            self.combo[t] += 1;
            self.event(EV_ABSORB, t as u8);
            return true;
        }
        if c == EMPTY && self.q_len[t] > 0 {
            let q = self.q_pop(t);
            self.slot_color[i] = q;
            self.slot_born[i] = self.scal[S_TIME];
        }
        false
    }

    pub fn update(&mut self, dt: f64) {
        if dt <= 0.0 {
            return;
        }
        self.scal[S_TIME] += dt;
        let active = self.scal[S_STARTED] != 0.0 && !self.won() && !self.lost();
        if active {
            self.scal[S_ELAPSED] += dt;
        }
        let n = self.n_slots as f64;
        let mut absorbed = false;
        if !self.lost() {
            self.scal[S_OFFSET] = modp(self.scal[S_OFFSET] + self.speed * dt, n);
            for t in 0..self.n_tubes {
                let idx = self.slot_at(self.port[t]);
                let mut guard = self.n_slots;
                while self.last_idx[t] != idx && guard > 0 {
                    self.last_idx[t] = (self.last_idx[t] - 1).rem_euclid(self.n_slots as i32);
                    let li = self.last_idx[t] as usize;
                    if self.arrive(t, li) {
                        absorbed = true;
                    }
                    guard -= 1;
                }
            }
        }
        for t in 0..self.n_tubes {
            let base = t * MAX_BEADS;
            let fl = self.fall_len[t] as usize;
            for k in 0..fl {
                self.fall_t[base + k] += dt;
            }
            while self.fall_len[t] > 0 && self.fall_t[base] >= FALL_TIME {
                let fl = self.fall_len[t] as usize;
                for k in 1..fl {
                    self.fall_t[base + k - 1] = self.fall_t[base + k];
                }
                self.fall_len[t] -= 1;
                let c = self.tube_shell[t];
                self.push_bead(t, c);
                self.event(EV_LAND, t as u8);
            }
            self.shake[t] = (self.shake[t] - dt * 4.0).max(0.0);
            self.flash[t] = (self.flash[t] - dt * 1.6).max(0.0);
            if self.fall_len[t] == 0 {
                self.combo[t] = 0;
            }
            if self.complete[t] == 0 && self.is_full_shell(t) {
                self.complete[t] = 1;
                self.flash[t] = 1.0;
                self.event(EV_COMPLETE, t as u8);
            }
        }
        let free = self.free_slots();
        self.scal[S_FREE] = free as f64;
        if active {
            if free == 0 && !absorbed {
                self.scal[S_JAM] += dt;
            } else {
                self.scal[S_JAM] = 0.0;
            }
            if self.scal[S_JAM] >= JAM_TIME {
                self.scal[S_LOST] = 1.0;
                self.event(EV_LOSE, 255);
            }
        }
        if !self.won() && !self.lost() && (0..self.n_tubes).all(|t| self.complete[t] != 0 && self.fall_len[t] == 0) {
            self.scal[S_WON] = 1.0;
            self.event(EV_WIN, 255);
        }
    }

    // ---------- rendering support (runs in wasm every frame) ----------
    pub fn set_path(&mut self, x: f64, y: f64, w: f64, h: f64, r: f64, jitter: f64) {
        self.path = RoundedRect::new(x, y, w, h, r);
        self.jitter = jitter;
    }

    /// Screen position of every belt slot → `pos` (x, y pairs).
    pub fn compute_positions(&mut self) {
        let n = self.n_slots as f64;
        let spacing = self.path.length() / n;
        let off = self.scal[S_OFFSET];
        for i in 0..self.n_slots {
            let p = self.path.at(modp(i as f64 + off, n) * spacing);
            let j = (hash01(i as i32) - 0.5) * self.jitter;
            self.pos[i * 2] = (p.x + p.nx * j) as f32;
            self.pos[i * 2 + 1] = (p.y + p.ny * j) as f32;
        }
    }

    /// Order-sensitive FNV-1a checksum of the logical state (parity tests).
    pub fn checksum(&self) -> u32 {
        let mut h: u32 = 0x811c_9dc5;
        let mut mix = |b: u32| {
            h ^= b;
            h = h.wrapping_mul(0x0100_0193);
        };
        for i in 0..self.n_slots {
            mix(self.slot_color[i] as u32);
        }
        for t in 0..self.n_tubes {
            mix(self.tube_len[t] as u32);
            for j in 0..self.tube_len[t] as usize {
                mix(self.tube_beads[t * MAX_BEADS + j] as u32);
            }
            mix(self.fall_len[t] as u32);
            mix(self.q_len[t] as u32);
            for k in 0..self.q_len[t] as usize {
                mix(self.queue[t * QCAP + (self.q_head[t] as usize + k) % QCAP] as u32);
            }
            mix(self.complete[t] as u32);
        }
        mix(self.scal[S_WON] as u32);
        mix(self.scal[S_LOST] as u32);
        mix(self.scal[S_TAPS] as u32);
        h
    }
}
