//! Level generation (native, std). Every generated level is played by the
//! heuristic bot on the real simulation; levels the bot can't clear without
//! jamming are rejected, so every shipped level is provably solvable.

use bead_loop::bot;
use bead_loop::sim::{Level, EMPTY, K, MAX_SLOTS};
use playables_core::rng::Rng;
use serde::{Deserialize, Serialize};

/// JSON shape consumed by games/bead-loop/src/game/levels.ts.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LevelJson {
    pub n: u32,
    pub colors: usize,
    pub cap: usize,
    pub slots: usize,
    pub speed: f64,
    pub par: u32,
    /// One string per tube: block colours bottom → top as digits.
    pub tubes: Vec<String>,
    /// Belt slots: '.' = empty, digit = colour.
    pub belt: String,
}

pub struct Params {
    pub colors: usize,
    pub cap: usize,
    pub free: usize,
    pub slots: usize,
    pub speed: f64,
}

/// Difficulty curve. Edit here, then `npm run levels -- bead-loop`.
pub fn params(n: u32) -> Params {
    let n = n as usize;
    let colors = if n <= 3 { 3 } else if n <= 9 { 4 } else if n <= 18 { 5 } else { 6 };
    let cap = (4 + (n - 1) / 5).min(7);
    let free = if n <= 6 { 2 } else if n <= 14 { 1 } else { 0 };
    let total = colors * cap * K;
    let belt_start = colors * free * K;
    let ratio = (0.7 - n as f64 * 0.012).max(0.33);
    let slots = ((total as f64 * ratio).round() as usize).max(belt_start + 2 * K).min(MAX_SLOTS);
    let speed = (22.0 + n as f64 * 0.25).min(34.0);
    Params { colors, cap, free, slots, speed }
}

pub fn build(n: u32, attempt: u32) -> Option<Level> {
    let p = params(n);
    let mut rng = Rng::new(0xbead_u32.wrapping_add(n.wrapping_mul(7919)).wrapping_add(attempt.wrapping_mul(104_729)));
    let fill = p.cap - p.free;
    let mut pool: Vec<u8> = (0..p.colors).flat_map(|c| std::iter::repeat(c as u8).take(fill)).collect();
    rng.shuffle(&mut pool);
    let mut l = Level::empty();
    l.colors = p.colors;
    l.cap = p.cap;
    l.slots = p.slots;
    l.speed = p.speed;
    for t in 0..p.colors {
        l.fill[t] = fill as u8;
        for b in 0..fill {
            l.tubes[t][b] = pool[t * fill + b];
        }
        // reject tubes that are already pure shell colour (trivial)
        if (0..fill).all(|b| l.tubes[t][b] == t as u8) {
            return None;
        }
    }
    // Remaining beads start on the belt in clumps of 3-6.
    let mut runs: Vec<Vec<u8>> = Vec::new();
    for c in 0..p.colors {
        let mut left = p.free * K;
        while left > 0 {
            let len = left.min(rng.int(3, 6) as usize);
            runs.push(vec![c as u8; len]);
            left -= len;
        }
    }
    rng.shuffle(&mut runs);
    let beads: usize = runs.iter().map(|r| r.len()).sum();
    let total_gap = p.slots - beads;
    let weights: Vec<f64> = runs.iter().map(|_| 0.4 + rng.float() * 1.2).collect();
    let wsum: f64 = weights.iter().sum();
    let mut belt: Vec<u8> = Vec::with_capacity(p.slots);
    for (i, run) in runs.iter().enumerate() {
        let gap = ((weights[i] / wsum) * total_gap as f64).floor() as usize;
        belt.extend(std::iter::repeat(EMPTY).take(gap));
        belt.extend_from_slice(run);
    }
    belt.resize(p.slots, EMPTY);
    l.belt[..p.slots].copy_from_slice(&belt);
    Some(l)
}

/// Bot must clear the level in every scenario (port positions as on different
/// screens, reaction times, frame rates) so levels aren't fragile.
fn robust(l: &Level) -> Option<f64> {
    let base = bot::nominal_ports(l.colors);
    let mut worst: f64 = 0.0;
    for shift in [0.0, 0.012] {
        for think in [0.3, 0.4, 0.5] {
            for dt in [1.0 / 60.0, 1.0 / 30.0] {
                let mut p = base;
                for (t, v) in p.iter_mut().enumerate().take(l.colors) {
                    *v += shift * if t % 2 == 0 { 1.0 } else { 0.6 };
                }
                worst = worst.max(bot::play_with(l, &p, think, dt, 400.0)?);
            }
        }
    }
    Some(worst)
}

/// Finds the first attempt the bot clears robustly. Returns (level, worst bot seconds, attempt).
pub fn generate(n: u32) -> (Level, f64, u32) {
    for attempt in 0..1500 {
        if let Some(l) = build(n, attempt) {
            if let Some(t) = robust(&l) {
                return (l, t, attempt);
            }
        }
    }
    panic!("level {n}: no solvable layout found");
}

pub fn to_json(n: u32, l: &Level, bot_secs: f64) -> LevelJson {
    let digit = |c: u8| if c == EMPTY { '.' } else { (b'0' + c) as char };
    LevelJson {
        n,
        colors: l.colors,
        cap: l.cap,
        slots: l.slots,
        speed: l.speed,
        par: (bot_secs * 1.15 + 5.0).round() as u32,
        tubes: (0..l.colors).map(|t| l.tubes[t][..l.fill[t] as usize].iter().map(|&c| digit(c)).collect()).collect(),
        belt: l.belt[..l.slots].iter().map(|&c| digit(c)).collect(),
    }
}

pub fn from_json(j: &LevelJson) -> Level {
    let mut l = Level::empty();
    l.colors = j.colors;
    l.cap = j.cap;
    l.slots = j.slots;
    l.speed = j.speed;
    for (t, s) in j.tubes.iter().enumerate() {
        l.fill[t] = s.len() as u8;
        for (b, ch) in s.bytes().enumerate() {
            l.tubes[t][b] = ch - b'0';
        }
    }
    for (i, ch) in j.belt.bytes().enumerate() {
        l.belt[i] = if ch == b'.' { EMPTY } else { ch - b'0' };
    }
    l
}
