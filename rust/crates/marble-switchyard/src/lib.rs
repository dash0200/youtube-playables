//! Marble Switchyard game logic. `no_std`, no heap: compiles to tiny
//! WebAssembly and runs natively for tests and the parity trace.
#![cfg_attr(not(test), no_std)]

pub mod sim;

#[cfg(test)]
mod tests {
    use super::sim::*;

    /// Gate over two cups: colour 0 on the left, colour 1 on the right.
    fn two_cups(seq: &[u8], start: u8) -> Level {
        let mut l = Level::empty();
        l.set_tree(b"GCC");
        l.n_gates = 1;
        l.gate_start[0] = start;
        l.n_cups = 2;
        l.cup_color[..2].copy_from_slice(&[0, 1]);
        l.cup_cap[..2].copy_from_slice(&[2, 2]);
        l.set_seq(seq);
        l.interval = 1.0;
        l.speed = 2.0;
        l.spills = 3;
        l
    }

    fn run(s: &mut Sim, secs: f64) {
        for _ in 0..(secs * 60.0) as usize {
            s.update(1.0 / 60.0);
            s.clear_events();
        }
    }

    #[test]
    fn tree_parses_in_pre_order() {
        let mut l = Level::empty();
        l.set_tree(b"GGCCC");
        let s = Sim::new(&l);
        assert_eq!(s.n_nodes, 5);
        assert_eq!(s.n_gates, 2);
        assert_eq!(s.n_cups, 3);
        // root gate's children: inner gate (node 1) and the right cup (node 4)
        assert_eq!(s.node_left[0], 1);
        assert_eq!(s.node_right[0], 4);
        // all cups sit on the bottom row
        assert_eq!(s.node_row[2], 2);
        assert_eq!(s.node_row[4], 2);
        assert_eq!(s.edge_len(0), HOPPER_DROP);
        assert_eq!(s.edge_len(4), 2.0);
    }

    #[test]
    fn routes_by_gate_and_wins() {
        let mut s = Sim::new(&two_cups(&[0, 0, 1, 1], 0));
        run(&mut s, 3.5); // two colour-0 marbles go left
        assert_eq!(s.cup_count[0], 2);
        s.tap(0); // now right for the colour-1 marbles
        run(&mut s, 5.0);
        assert_eq!(s.cup_count[1], 2);
        assert!(s.won());
        assert_eq!(s.spills(), 0);
    }

    #[test]
    fn wrong_cup_spills_and_returns_the_marble() {
        let mut s = Sim::new(&two_cups(&[1, 0, 0, 1], 0));
        run(&mut s, 2.4); // the first marble (colour 1) goes left into cup 0
        assert_eq!(s.spills(), 1);
        assert_eq!(s.cup_count[0], 0);
        assert_eq!(s.q_len, 3); // 2 still waiting (one more dropped at 2.2 s) + the returned one
        assert_eq!(s.queue_at(s.q_len - 1), 1);
    }

    #[test]
    fn too_many_spills_loses() {
        let mut s = Sim::new(&two_cups(&[1, 1, 1, 0], 0));
        run(&mut s, 10.0);
        assert!(s.lost());
    }

    #[test]
    fn linked_gates_flip_together_and_auto_gates_flip_themselves() {
        let mut l = Level::empty();
        l.set_tree(b"GGCCGCC");
        l.n_gates = 3;
        l.gate_link[1] = 1;
        l.gate_link[2] = 1;
        l.gate_auto[0] = 1;
        l.n_cups = 4;
        l.cup_cap[..4].copy_from_slice(&[1, 1, 1, 1]);
        l.cup_color[..4].copy_from_slice(&[0, 1, 2, 3]);
        l.set_seq(&[0]);
        l.interval = 1.0;
        l.speed = 2.0;
        l.spills = 3;
        let mut s = Sim::new(&l);
        s.tap(1);
        assert_eq!(s.gate_state[1], 1);
        assert_eq!(s.gate_state[2], 1);
        run(&mut s, 2.0); // the marble passes the auto root gate, which then flips
        assert_eq!(s.gate_state[0], 1);
    }
}
