//! Difficulty report: for each level, how often a random tapper jams vs the bot's result.
//! cargo run --release -p bead-loop-tools --bin difficulty -- <levels.json>
use bead_loop::bot::nominal_ports;
use bead_loop::sim::Sim;
use bead_loop_tools::{from_json, LevelJson};
use playables_core::rng::Rng;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let levels: Vec<LevelJson> = serde_json::from_str(&std::fs::read_to_string(&args[1]).unwrap()).unwrap();
    for j in levels.iter().filter(|j| j.n == 1 || j.n % 5 == 0) {
        let l = from_json(j);
        let (mut lost, mut won, mut fast) = (0, 0, 0);
        let runs = 40;
        for r in 0..runs {
            let mut s = Sim::new(&l);
            let p = nominal_ports(l.colors);
            for t in 0..l.colors { s.set_port(t, p[t]); }
            let mut rng = Rng::new(r * 31 + 7);
            let mut next = 0.5;
            while s.scal[1] < 150.0 && !s.won() && !s.lost() {
                if s.scal[1] >= next { next += 0.45; s.tap(rng.int(0, l.colors as i32 - 1) as usize); }
                s.update(1.0 / 30.0);
                s.clear_events();
            }
            if s.lost() { lost += 1 } else if s.won() { won += 1; if s.scal[2] <= j.par as f64 * 1.6 { fast += 1 } }
        }
        println!("level {:>2}: slots {:>3}  random tapper: {:>3}% jam, {:>3}% win, {:>3}% win within 2-star time  (par {}s)", j.n, j.slots, lost * 100 / runs, won * 100 / runs, fast * 100 / runs, j.par);
    }
}
