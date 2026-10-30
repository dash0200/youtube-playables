//! cargo run --release -p bead-loop-tools --bin gen-levels -- <out.json> [count]
use bead_loop_tools::{generate, to_json};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let out = args.get(1).expect("usage: gen-levels <out.json> [count]");
    let count: u32 = args.get(2).map(|s| s.parse().unwrap()).unwrap_or(60);
    let mut levels = Vec::new();
    for n in 1..=count {
        let (l, secs, attempt) = generate(n);
        let j = to_json(n, &l, secs);
        eprintln!("level {:>3}: {} colours, cap {}, {} slots, bot {:>6.1}s, par {:>3}s (attempt {})", n, j.colors, j.cap, j.slots, secs, j.par, attempt);
        levels.push(j);
    }
    std::fs::write(out, serde_json::to_string(&levels).unwrap()).unwrap();
    eprintln!("wrote {} levels to {}", levels.len(), out);
}
