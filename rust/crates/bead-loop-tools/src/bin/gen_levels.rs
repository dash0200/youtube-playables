//! cargo run --release -p bead-loop-tools --bin gen-levels -- <out.json> [count]
//! Levels are independent, so they're generated in parallel; output is deterministic.
use bead_loop_tools::{generate, target, to_json, LevelJson};
use std::sync::atomic::{AtomicU32, Ordering};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let out = args.get(1).expect("usage: gen-levels <out.json> [count]");
    let count: u32 = args.get(2).map(|s| s.parse().unwrap()).unwrap_or(60);
    let next = AtomicU32::new(1);
    let workers = std::thread::available_parallelism().map_or(4, |n| n.get());
    let mut done: Vec<(LevelJson, f64, u32)> = std::thread::scope(|sc| {
        let handles: Vec<_> = (0..workers)
            .map(|_| {
                sc.spawn(|| {
                    let mut mine = Vec::new();
                    loop {
                        let n = next.fetch_add(1, Ordering::Relaxed);
                        if n > count {
                            break mine;
                        }
                        let g = generate(n);
                        mine.push((to_json(n, &g.level, g.bot_secs), g.naive, g.attempt));
                    }
                })
            })
            .collect();
        handles.into_iter().flat_map(|h| h.join().unwrap()).collect()
    });
    done.sort_by_key(|(j, _, _)| j.n);
    for (j, naive, attempt) in &done {
        eprintln!(
            "level {:>3}: {} colours, cap {}, {:>3} slots, speed {:>4.1}, par {:>3}s, naive win {:>3.0}% (target {:>3.0}%, attempt {})",
            j.n, j.colors, j.cap, j.slots, j.speed, j.par, naive * 100.0, target(j.n) * 100.0, attempt
        );
    }
    let levels: Vec<LevelJson> = done.into_iter().map(|(j, _, _)| j).collect();
    std::fs::write(out, serde_json::to_string(&levels).unwrap()).unwrap();
    eprintln!("wrote {} levels to {}", levels.len(), out);
}
