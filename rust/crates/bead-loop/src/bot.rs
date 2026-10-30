//! Simple heuristic player used by the level generator to prove every level
//! is solvable (and to derive par times). Runs the real simulation.

use crate::sim::*;
use playables_core::path::RoundedRect;

/// Port fractions for the reference portrait layout (390x844), mirroring
/// computeLayout() in games/bead-loop/src/game/layout.ts closely enough for
/// solvability checks. Runtime ports come from the real layout.
pub fn nominal_ports(colors: usize) -> [f64; MAX_TUBES] {
    let col_w = 390.0_f64;
    let loop_w = col_w - col_w * 0.12;
    let radius = loop_w * 0.13;
    let span = loop_w - radius * 2.0 - loop_w * 0.05;
    let c = colors as f64;
    let tw = (span / (c + (c - 1.0) * 0.4)).min(col_w * 0.16);
    let loop_h = loop_w * 0.62;
    let path = RoundedRect::new(col_w * 0.06, 100.0, loop_w, loop_h, radius.min(loop_h * 0.3));
    let total_w = c * tw + (c - 1.0) * tw * 0.4;
    let start_x = col_w / 2.0 - total_w / 2.0;
    let mut out = [0.0; MAX_TUBES];
    for (i, o) in out.iter_mut().enumerate().take(colors) {
        let cx = start_x + i as f64 * tw * 1.4 + tw / 2.0;
        *o = path.param_at_bottom_x(cx) / path.length();
    }
    out
}

fn has_wrong(s: &Sim, t: usize) -> bool {
    let len = s.tube_len[t] as usize;
    (0..len).any(|j| s.tube_beads[t * MAX_BEADS + j] != s.tube_shell[t])
}

/// Picks a tube to tap, or None to wait.
pub fn choose(s: &Sim) -> Option<usize> {
    let free = s.scal[S_FREE] as usize;
    let mut best: Option<(usize, usize)> = None;
    for t in 0..s.n_tubes {
        if s.complete[t] != 0 || s.q_len[t] as usize >= QUEUE_TAP_LIMIT || s.fall_len[t] > 0 {
            continue;
        }
        let len = s.tube_len[t] as usize;
        if len == 0 || !has_wrong(s, t) {
            continue;
        }
        let run = s.top_run(t);
        let top = s.intake(t);
        let score = if top != s.tube_shell[t] {
            if free < run + K {
                continue;
            }
            run
        } else {
            // Top is the right colour but wrong beads are buried: dig only when
            // the tube is full and there is plenty of room on the belt.
            if s.space(t) > 0 || free < run + 2 * K {
                continue;
            }
            1000 + run
        };
        if best.map_or(true, |(_, b)| score < b) {
            best = Some((t, score));
        }
    }
    best.map(|(t, _)| t)
}

/// Plays a level to completion. Returns the clear time in seconds, or None if
/// the bot jammed or ran out of time.
pub fn play(level: &Level, max_time: f64) -> Option<f64> {
    play_with(level, &nominal_ports(level.colors), 0.3, 1.0 / 30.0, max_time)
}

/// Same as `play` with explicit port positions, bot reaction time and frame step (seconds).
pub fn play_with(level: &Level, ports: &[f64; MAX_TUBES], think: f64, dt: f64, max_time: f64) -> Option<f64> {
    let mut s = Sim::new(level);
    for t in 0..level.colors {
        s.set_port(t, ports[t]);
    }
    let mut next = 0.5;
    while s.scal[S_TIME] < max_time {
        if s.scal[S_TIME] >= next {
            next += think;
            if let Some(t) = choose(&s) {
                s.tap(t);
            }
        }
        s.update(dt);
        s.clear_events();
        if s.won() {
            return Some(s.scal[S_ELAPSED]);
        }
        if s.lost() {
            return None;
        }
    }
    None
}
