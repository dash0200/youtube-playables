//! Deterministic scripted run printed as checksums. The TypeScript fallback runs
//! the same script (scripts/parity-bead-loop.ts); outputs must match exactly.
//! cargo run -p bead-loop-tools --bin trace -- <levels.json> <level>
use bead_loop::sim::Sim;
use bead_loop_tools::{from_json, LevelJson};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let levels: Vec<LevelJson> = serde_json::from_str(&std::fs::read_to_string(&args[1]).unwrap()).unwrap();
    let n: usize = args[2].parse().unwrap();
    let l = from_json(&levels[n - 1]);
    let mut s = Sim::new(&l);
    for t in 0..l.colors {
        s.set_port(t, 0.62 + t as f64 * 0.025);
    }
    for f in 0..2400u32 {
        if f % 25 == 0 {
            s.tap(((f / 25) as usize * 7 + 3) % l.colors);
        }
        s.update(1.0 / 60.0);
        s.clear_events();
        if f % 60 == 59 {
            println!("{} {:.6} {}", f, s.scal[0], s.checksum());
        }
    }
}
