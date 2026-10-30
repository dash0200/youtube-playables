//! Prints the scripted session's checksums for one level (parity with the TS sim).
//! cargo run --release -p marble-switchyard-tools --bin ms-trace -- <levels.json> <level>
use marble_switchyard_tools::{to_level, trace, LevelJson};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let levels: Vec<LevelJson> = serde_json::from_str(&std::fs::read_to_string(&args[1]).unwrap()).unwrap();
    let n: usize = args[2].parse().unwrap();
    for line in trace(&to_level(&levels[n - 1])) {
        println!("{line}");
    }
}
