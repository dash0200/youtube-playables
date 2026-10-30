//! Bead Loop game logic. `no_std`, no heap: compiles to tiny WebAssembly and
//! runs natively for tests and tools.
#![cfg_attr(not(test), no_std)]

pub mod bot;
pub mod sim;

#[cfg(test)]
mod tests {
    use super::sim::*;

    fn simple_level() -> Level {
        // 3 colours, cap 2. Tube0 = [1,0], tube1 = [0,2], tube2 = [2,1]; 0 free blocks.
        let mut l = Level::empty();
        l.colors = 3;
        l.cap = 2;
        l.slots = 60;
        l.speed = 30.0;
        l.fill = [2, 2, 2, 0, 0, 0];
        l.tubes[0][..2].copy_from_slice(&[1, 0]);
        l.tubes[1][..2].copy_from_slice(&[0, 2]);
        l.tubes[2][..2].copy_from_slice(&[2, 1]);
        l
    }

    fn total_beads(s: &Sim) -> usize {
        let belt = s.slot_color[..s.n_slots].iter().filter(|&&c| c != EMPTY).count();
        let tubes: usize = (0..s.n_tubes).map(|t| s.tube_len[t] as usize + s.fall_len[t] as usize + s.q_len[t] as usize).sum();
        belt + tubes
    }

    #[test]
    fn intake_is_top_colour() {
        let s = Sim::new(&simple_level());
        assert_eq!(s.intake(0), 0); // top block of tube 0 is colour 0
        assert_eq!(s.intake(1), 2); // tube 1 (blue shell) currently pulls colour 2
    }

    #[test]
    fn tap_ejects_top_run_and_conserves_beads() {
        let mut s = Sim::new(&simple_level());
        let ports = crate::bot::nominal_ports(3);
        for t in 0..3 {
            s.set_port(t, ports[t]);
        }
        let before = total_beads(&s);
        assert!(s.tap(1));
        assert_eq!(s.q_len[1] as usize, K);
        assert_eq!(s.intake(1), 0);
        for _ in 0..600 {
            s.update(1.0 / 60.0);
            assert_eq!(total_beads(&s), before);
        }
    }

    fn run(s: &mut Sim, secs: f64) {
        let ports = crate::bot::nominal_ports(s.n_tubes);
        for t in 0..s.n_tubes {
            s.set_port(t, ports[t]);
        }
        for _ in 0..(secs * 60.0) as usize {
            s.update(1.0 / 60.0);
        }
    }

    #[test]
    fn open_tube_absorbs_own_colour_until_complete() {
        let mut l = simple_level();
        l.fill = [1, 2, 2, 0, 0, 0];
        l.tubes[0][0] = 0; // tube 0 = [0]: open, one block of space
        for i in 0..K {
            l.belt[i * 3] = 0;
            l.belt[i * 3 + 1] = 1; // other colours pass by untouched
        }
        let mut s = Sim::new(&l);
        assert!(s.is_open(0));
        run(&mut s, 10.0);
        assert_eq!(s.tube_len[0] as usize, 2 * K);
        assert!((0..2 * K).all(|j| s.tube_beads[j] == 0));
        assert_eq!(s.complete[0], 1);
    }

    #[test]
    fn wrong_top_blocks_intake() {
        let mut l = simple_level();
        l.fill = [1, 2, 2, 0, 0, 0]; // tube 0 = [1]: shell 0 with colour 1 on top
        for i in 0..K {
            l.belt[i * 3] = 0;
            l.belt[i * 3 + 1] = 1;
        }
        let mut s = Sim::new(&l);
        assert!(!s.is_open(0));
        run(&mut s, 10.0);
        // Neither its own colour nor the top colour gets in while blocked.
        assert_eq!(s.tube_len[0] as usize, K);
        assert_eq!(s.fall_len[0], 0);
    }

    #[test]
    fn tapping_the_blocker_reopens_the_tube() {
        let mut l = simple_level();
        l.fill = [2, 2, 2, 0, 0, 0];
        l.tubes[0][..2].copy_from_slice(&[0, 1]); // own colour under a wrong block
        for i in 0..K {
            l.belt[i * 4] = 0;
        }
        let mut s = Sim::new(&l);
        assert!(!s.is_open(0));
        let ports = crate::bot::nominal_ports(3);
        for t in 0..3 {
            s.set_port(t, ports[t]);
        }
        assert!(s.tap(0));
        assert!(s.is_open(0));
        for _ in 0..600 {
            s.update(1.0 / 60.0);
        }
        assert_eq!(s.tube_len[0] as usize, 2 * K);
        assert!((0..2 * K).all(|j| s.tube_beads[j] == 0));
    }

    #[test]
    fn jam_loses() {
        let mut l = simple_level();
        l.slots = 10;
        for i in 0..10 {
            l.belt[i] = 2;
        }
        l.fill = [2, 2, 2, 0, 0, 0];
        let mut s = Sim::new(&l);
        for t in 0..3 {
            s.set_port(t, 0.7 + t as f64 * 0.05);
        }
        s.tap(0); // start the timer; belt full of colour 2 no tube can take (tube 2 is full)
        for _ in 0..(60.0 * (JAM_TIME + 1.0)) as usize {
            s.update(1.0 / 60.0);
        }
        assert!(s.lost());
    }
}
