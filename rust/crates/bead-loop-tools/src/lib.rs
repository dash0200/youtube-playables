//! Level generation (native, std). Every candidate level is played by the
//! planning bot on the real simulation (it must clear it in every scenario, so
//! every shipped level is provably solvable) and by a "naive" player that knows
//! the rules but doesn't plan. Among the solvable candidates the generator keeps
//! the one whose naive win rate is closest to the level's difficulty target, so
//! the curve is measured, not guessed.

use bead_loop::bot;
use bead_loop::sim::{Level, Sim, EMPTY, K, MAX_BEADS, MAX_SLOTS, QUEUE_TAP_LIMIT, S_ELAPSED, S_TIME};
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
    /// Easier layout of the same board, served after repeated losses
    /// (same colours, cap, speed and par; roomier loop / kinder layout).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub easy: Option<EasyJson>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EasyJson {
    pub slots: usize,
    pub tubes: Vec<String>,
    pub belt: String,
}

pub struct Params {
    pub colors: usize,
    pub cap: usize,
    /// Empty blocks per tube at start; those beads start on the belt.
    pub free: usize,
    pub speed: f64,
}

/// Loop room as a fraction of all beads. Candidates sweep from loose to tight
/// in steps of this size; the generator keeps whichever hits the target.
pub const RATIOS: [f64; 10] = [0.6, 0.52, 0.46, 0.41, 0.37, 0.34, 0.31, 0.28, 0.26, 0.24];

/// Belt slots for a loop-room ratio (never fewer than the starting belt beads + 2 blocks).
pub fn slots_for(p: &Params, ratio: f64) -> usize {
    let total = p.colors * p.cap * K;
    let belt_start = p.colors * p.free * K;
    ((total as f64 * ratio).round() as usize).max(belt_start + 2 * K).min(MAX_SLOTS)
}

/// Board size curve over a long, gentle progression (150 levels). Edit here
/// (and `target`), then `npm run levels -- bead-loop`.
pub fn params(n: u32) -> Params {
    let n = n as usize;
    // 3-4 colours are onboarding: even unplanned play clears them at any loop
    // size, so the real challenge (tight loops) only comes with 5-6 colours.
    let colors = if n <= 2 { 3 } else if n <= 8 { 4 } else if n <= 25 { 5 } else { 6 };
    let cap = if n <= 2 { 4 } else if n <= 20 { 5 } else if n <= 60 { 6 } else { 7 };
    let free = if n <= 2 { 2 } else if n <= 25 { 1 } else { 0 };
    let speed = (22.0 + n as f64 * 0.08).min(32.0);
    Params { colors, cap, free, speed }
}

/// Target win rate (0..1) of the naive player. Casual players quit after
/// repeated failure, so most levels stay comfortable and difficulty arrives
/// slowly: ~95% while learning, 90 -> 70% by level 50, 70 -> 50% by 100,
/// 50 -> 30% by 150. Every 5th level is a small spike and the next a breather;
/// the spikes grow with the level so early play never hits a wall.
pub fn target(n: u32) -> f64 {
    let x = n as f64;
    let base = if n <= 10 {
        0.95
    } else if n <= 50 {
        0.9 - (x - 10.0) * (0.2 / 40.0)
    } else if n <= 100 {
        0.7 - (x - 50.0) * (0.2 / 50.0)
    } else {
        (0.5 - (x - 100.0) * (0.2 / 50.0)).max(0.3)
    };
    let (spike, rest) = if n <= 50 { (0.06, 0.04) } else if n <= 100 { (0.1, 0.06) } else { (0.12, 0.08) };
    let saw = if n > 10 && n % 5 == 0 { -spike } else if n > 10 && n % 5 == 1 { rest } else { 0.0 };
    (base + saw).clamp(0.15, 0.97)
}

/// Target for the easier variant served after repeated losses: clearly kinder,
/// so a stuck player gets through and keeps going.
pub fn easy_target(n: u32) -> f64 {
    (target(n) + 0.25).clamp(0.6, 0.97)
}

/// How far the measured naive win rate may stray from the target.
pub const TARGET_BAND: f64 = 0.08;
/// Naive games per candidate.
pub const NAIVE_RUNS: u32 = 80;

pub fn build(n: u32, attempt: u32) -> Option<Level> {
    let p = params(n);
    let slots = slots_for(&p, RATIOS[attempt as usize % RATIOS.len()]);
    let mut rng = Rng::new(0xbead_u32.wrapping_add(n.wrapping_mul(7919)).wrapping_add(attempt.wrapping_mul(104_729)));
    let fill = p.cap - p.free;
    let mut pool: Vec<u8> = (0..p.colors).flat_map(|c| std::iter::repeat(c as u8).take(fill)).collect();
    rng.shuffle(&mut pool);
    let mut l = Level::empty();
    l.colors = p.colors;
    l.cap = p.cap;
    l.slots = slots;
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
    let total_gap = slots - beads;
    let weights: Vec<f64> = runs.iter().map(|_| 0.4 + rng.float() * 1.2).collect();
    let wsum: f64 = weights.iter().sum();
    let mut belt: Vec<u8> = Vec::with_capacity(slots);
    for (i, run) in runs.iter().enumerate() {
        let gap = ((weights[i] / wsum) * total_gap as f64).floor() as usize;
        belt.extend(std::iter::repeat(EMPTY).take(gap));
        belt.extend_from_slice(run);
    }
    belt.resize(slots, EMPTY);
    l.belt[..slots].copy_from_slice(&belt);
    Some(l)
}

// ---------------------------------------------------------------- simulated players

fn has_wrong(s: &Sim, t: usize) -> bool {
    (0..s.tube_len[t] as usize).any(|j| s.tube_beads[t * MAX_BEADS + j] != s.tube_shell[t])
}

fn tappable(s: &Sim, t: usize) -> bool {
    s.complete[t] == 0 && (s.q_len[t] as usize) < QUEUE_TAP_LIMIT && s.tube_len[t] > 0
}

/// Plays with a tap policy at a human-ish 0.45-0.75 s reaction; Some(clear seconds) on a win.
pub fn play_policy(l: &Level, seed: u32, mut policy: impl FnMut(&Sim, &mut Rng) -> Option<usize>) -> Option<f64> {
    let mut s = Sim::new(l);
    let p = bot::nominal_ports(l.colors);
    for t in 0..l.colors {
        s.set_port(t, p[t]);
    }
    let mut rng = Rng::new(seed.wrapping_mul(31).wrapping_add(7));
    let mut next = 0.5;
    while s.scal[S_TIME] < 240.0 && !s.won() && !s.lost() {
        if s.scal[S_TIME] >= next {
            next += 0.45 + rng.float() * 0.3;
            if let Some(t) = policy(&s, &mut rng) {
                s.tap(t);
            }
        }
        s.update(1.0 / 30.0);
        s.clear_events();
    }
    if s.won() { Some(s.scal[S_ELAPSED]) } else { None }
}

/// Doesn't know the rules: taps any tube.
pub fn random_policy(s: &Sim, rng: &mut Rng) -> Option<usize> {
    Some(rng.int(0, s.n_tubes as i32 - 1) as usize)
}

/// Knows the rule (unblock tubes, dig out buried beads) but never checks the
/// room left on the loop and picks targets at random.
pub fn naive_policy(s: &Sim, rng: &mut Rng) -> Option<usize> {
    let pick = |rng: &mut Rng, c: &[usize]| if c.is_empty() { None } else { Some(c[rng.int(0, c.len() as i32 - 1) as usize]) };
    let blocked: Vec<usize> = (0..s.n_tubes).filter(|&t| tappable(s, t) && !s.is_open(t)).collect();
    if !blocked.is_empty() {
        return pick(rng, &blocked);
    }
    let buried: Vec<usize> = (0..s.n_tubes).filter(|&t| tappable(s, t) && has_wrong(s, t)).collect();
    if rng.float() < 0.5 { pick(rng, &buried) } else { None }
}

/// Naive win rate (0..1) over `runs` games seeded from `seed`.
pub fn naive_rate(l: &Level, runs: u32, seed: u32) -> f64 {
    let wins = (0..runs).filter(|&r| play_policy(l, seed + r, naive_policy).is_some()).count();
    wins as f64 / runs as f64
}

// ---------------------------------------------------------------- generation

/// The planning bot must clear the level in every scenario (port positions as
/// on different screens, reaction times up to a slow human-ish 0.8 s, frame rates).
/// Returns the worst clear time.
pub fn robust(l: &Level) -> Option<f64> {
    let base = bot::nominal_ports(l.colors);
    let mut worst: f64 = 0.0;
    for shift in [0.0, 0.012] {
        for think in [0.3, 0.55, 0.8] {
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

pub struct Generated {
    pub level: Level,
    pub bot_secs: f64,
    pub attempt: u32,
    pub naive: f64,
}

/// Longest acceptable bot clear time; slower layouts drag.
pub const MAX_BOT_SECS: f64 = 75.0;

/// Tries candidates in seed order and returns the first solvable one inside the
/// band around `goal`, or the closest solvable one after 600 attempts. A
/// candidate that looks on target is re-measured with fresh seeds before it's
/// accepted, so a lucky first measurement can't sneak an easy level through.
/// `first_attempt` separates seed ranges (the easy variant uses its own).
pub fn generate_for(n: u32, goal: f64, first_attempt: u32) -> Generated {
    let mut best: Option<(f64, Generated)> = None;
    for attempt in first_attempt..first_attempt + 600 {
        let Some(l) = build(n, attempt) else { continue };
        let Some(secs) = robust(&l) else { continue };
        if secs > MAX_BOT_SECS {
            continue;
        }
        let mut naive = naive_rate(&l, NAIVE_RUNS, 1000);
        if (naive - goal).abs() <= TARGET_BAND {
            naive = (naive + naive_rate(&l, NAIVE_RUNS, 50_000)) / 2.0;
        }
        let miss = (naive - goal).abs();
        if best.as_ref().map_or(true, |(m, _)| miss < *m) {
            best = Some((miss, Generated { level: l, bot_secs: secs, attempt, naive }));
        }
        if miss <= TARGET_BAND {
            break;
        }
    }
    best.unwrap_or_else(|| panic!("level {n}: no solvable layout found")).1
}

/// The level itself.
pub fn generate(n: u32) -> Generated {
    generate_for(n, target(n), 0)
}

/// Its easier variant (own seed range, kinder target).
pub fn generate_easy(n: u32) -> Generated {
    generate_for(n, easy_target(n), 100_000)
}

pub fn to_json(n: u32, l: &Level, bot_secs: f64) -> LevelJson {
    LevelJson {
        n,
        colors: l.colors,
        cap: l.cap,
        slots: l.slots,
        speed: l.speed,
        par: (bot_secs * 1.15 + 5.0).round() as u32,
        tubes: tube_strings(l),
        belt: belt_string(l),
        easy: None,
    }
}

fn digit(c: u8) -> char {
    if c == EMPTY { '.' } else { (b'0' + c) as char }
}

fn tube_strings(l: &Level) -> Vec<String> {
    (0..l.colors).map(|t| l.tubes[t][..l.fill[t] as usize].iter().map(|&c| digit(c)).collect()).collect()
}

fn belt_string(l: &Level) -> String {
    l.belt[..l.slots].iter().map(|&c| digit(c)).collect()
}

pub fn to_easy_json(l: &Level) -> EasyJson {
    EasyJson { slots: l.slots, tubes: tube_strings(l), belt: belt_string(l) }
}

/// The easier variant as a full Level (same board settings as the main level).
pub fn easy_from_json(j: &LevelJson) -> Option<Level> {
    let e = j.easy.as_ref()?;
    let mut v = j.clone();
    v.slots = e.slots;
    v.tubes = e.tubes.clone();
    v.belt = e.belt.clone();
    v.easy = None;
    Some(from_json(&v))
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
