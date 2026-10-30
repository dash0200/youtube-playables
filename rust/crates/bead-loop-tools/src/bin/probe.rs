//! Tuning aid: for each level and loop-room ratio, how many candidate layouts
//! the planning bot clears robustly, and their median naive win rate.
//! cargo run --release -p bead-loop-tools --bin probe -- [from] [to] [candidates]
use bead_loop_tools::{build, naive_rate, params, robust, target, RATIOS};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let from: u32 = args.get(1).map_or(1, |s| s.parse().unwrap());
    let to: u32 = args.get(2).map_or(60, |s| s.parse().unwrap());
    let cands: u32 = args.get(3).map_or(40, |s| s.parse().unwrap());
    for n in from..=to {
        let p = params(n);
        let mut line = format!("level {:>2} {}c cap{} target {:>3.0}% |", n, p.colors, p.cap, target(n) * 100.0);
        for (ri, &ratio) in RATIOS.iter().enumerate() {
            let mut rates = Vec::new();
            for k in 0..cands {
                // same attempt numbering as the generator: attempt % RATIOS.len() picks the ratio
                if let Some(l) = build(n, k * RATIOS.len() as u32 + ri as u32) {
                    if robust(&l).is_some() {
                        rates.push(naive_rate(&l, 16, 1000));
                    }
                }
            }
            rates.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let med = rates.get(rates.len() / 2).map_or("  --".to_string(), |r| format!("{:>4.0}", r * 100.0));
            line += &format!(" {:.2}:{}/{}{}", ratio, rates.len(), cands, med);
        }
        println!("{line}");
    }
}
