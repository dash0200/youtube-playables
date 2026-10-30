//! Difficulty report for every level, from three simulated players:
//! - random: taps any tube at random (doesn't know the rules)
//! - naive:  knows the rule (clears blocked tubes, digs out buried beads) but
//!   never checks room on the loop and reacts at human speed
//! - slow bot: the planning bot with a human-ish 0.8 s reaction time
//! Compare the naive column with the target the generator aimed for.
//! cargo run --release -p bead-loop-tools --bin difficulty -- <levels.json> [level]
//! With a level number, prints its naive win rate over many seed batches instead.
use bead_loop::bot::{self, nominal_ports};
use bead_loop_tools::{easy_from_json, easy_target, from_json, naive_policy, naive_rate, play_policy, random_policy, target, LevelJson};

const RUNS: u32 = 60;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let levels: Vec<LevelJson> = serde_json::from_str(&std::fs::read_to_string(&args[1]).unwrap()).unwrap();
    if let Some(n) = args.get(2).map(|s| s.parse::<usize>().unwrap()) {
        let l = from_json(&levels[n - 1]);
        let batches: Vec<String> = (0..10).map(|b| format!("{:.0}", naive_rate(&l, 40, 1000 + b * 7919) * 100.0)).collect();
        println!("level {n}: naive win % per 40-game batch: {} (target {:.0})", batches.join(" "), target(n as u32) * 100.0);
        return;
    }
    println!("level col cap slots speed  par | random% naive% target% naive3★% | easy% target% | slowbot");
    let mut sum = [0u32; 3];
    for j in &levels {
        let l = from_json(j);
        let (mut rnd, mut nav, mut nav3) = (0, 0, 0);
        // seeds differ from the generator's, so this is an independent check
        for r in 0..RUNS {
            if play_policy(&l, r + 5000, random_policy).is_some() {
                rnd += 1;
            }
            if let Some(secs) = play_policy(&l, r + 9000, naive_policy) {
                nav += 1;
                if secs <= j.par as f64 {
                    nav3 += 1;
                }
            }
        }
        let slow = bot::play_with(&l, &nominal_ports(l.colors), 0.8, 1.0 / 30.0, 400.0);
        let easy = easy_from_json(j).map_or(-1.0, |e| naive_rate(&e, RUNS, 9000) * 100.0);
        sum[0] += rnd * 100 / RUNS;
        sum[1] += nav * 100 / RUNS;
        sum[2] += u32::from(slow.is_some());
        println!(
            "{:>5} {:>3} {:>3} {:>5} {:>5.1} {:>4} | {:>7} {:>6} {:>7.0} {:>9} | {:>5.0} {:>7.0} | {}",
            j.n, l.colors, l.cap, l.slots, l.speed, j.par,
            rnd * 100 / RUNS, nav * 100 / RUNS, target(j.n) * 100.0, nav3 * 100 / RUNS,
            easy, easy_target(j.n) * 100.0,
            slow.map_or("jam".to_string(), |s| format!("{s:.0}s")),
        );
    }
    let n = levels.len() as u32;
    println!("avg random {}%  naive {}%  slow bot clears {}/{}", sum[0] / n, sum[1] / n, sum[2], n);
}
