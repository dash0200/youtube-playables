//! C-ABI exports for Marble Switchyard, compiled to `wasm32-unknown-unknown`.
//!
//! `SLOTS` simulations live in static memory (no allocator): the menu's demo
//! board and a level can both be alive during a scene fade. JS writes a level
//! into `ms_input_ptr()`, calls `ms_init(slot, ...)`, then each frame calls
//! `ms_update(slot, dt)` and reads state through typed-array views on the
//! pointers below (see games/marble-switchyard/src/sim/wasm-sim.ts).
//!
//! Input layout (bytes): [tree_len, tree[MAX_TREE], n_gates,
//!   (start, auto, link) x MAX_GATES, n_cups, (color, cap) x MAX_CUPS,
//!   seq_len_lo, seq_len_hi, seq[QCAP]]
#![cfg_attr(target_arch = "wasm32", no_std)]
#![allow(static_mut_refs)]

use core::ptr::addr_of_mut;
use marble_switchyard::sim::*;

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

pub const SLOTS: usize = 4;
pub const INPUT_LEN: usize = 1 + MAX_TREE + 1 + 3 * MAX_GATES + 1 + 2 * MAX_CUPS + 2 + QCAP;

static mut INPUT: [u8; INPUT_LEN] = [0; INPUT_LEN];
static mut SIMS: [Option<Sim>; SLOTS] = [None, None, None, None];

#[inline]
fn sim(slot: u32) -> &'static mut Sim {
    // SAFETY: single-threaded wasm; ms_init(slot) must be called first.
    unsafe { (*addr_of_mut!(SIMS))[slot as usize % SLOTS].as_mut().unwrap() }
}

#[no_mangle]
pub extern "C" fn ms_input_ptr() -> *mut u8 {
    addr_of_mut!(INPUT) as *mut u8
}

/// Constants so JS can verify it was built against the same layout.
#[no_mangle]
pub extern "C" fn ms_const(k: u32) -> u32 {
    (match k {
        0 => MAX_NODES,
        1 => MAX_GATES,
        2 => MAX_CUPS,
        3 => MAX_MARBLES,
        4 => QCAP,
        5 => MAX_EVENTS,
        6 => MAX_TREE,
        7 => NSCAL,
        8 => INPUT_LEN,
        9 => SLOTS,
        _ => 0,
    }) as u32
}

#[no_mangle]
pub extern "C" fn ms_init(slot: u32, interval: f64, speed: f64, spills: u32) -> i32 {
    let inp = unsafe { &*addr_of_mut!(INPUT) };
    let mut l = Level::empty();
    let mut o = 0;
    l.tree_len = (inp[o] as usize).min(MAX_TREE);
    o += 1;
    l.tree.copy_from_slice(&inp[o..o + MAX_TREE]);
    o += MAX_TREE;
    l.n_gates = (inp[o] as usize).min(MAX_GATES);
    o += 1;
    for g in 0..MAX_GATES {
        l.gate_start[g] = inp[o];
        l.gate_auto[g] = inp[o + 1];
        l.gate_link[g] = inp[o + 2];
        o += 3;
    }
    l.n_cups = (inp[o] as usize).min(MAX_CUPS);
    o += 1;
    for c in 0..MAX_CUPS {
        l.cup_color[c] = inp[o];
        l.cup_cap[c] = inp[o + 1];
        o += 2;
    }
    l.seq_len = (inp[o] as usize | ((inp[o + 1] as usize) << 8)).min(QCAP);
    o += 2;
    l.seq.copy_from_slice(&inp[o..o + QCAP]);
    l.interval = interval;
    l.speed = speed;
    l.spills = spills;
    if l.tree_len == 0 || l.n_cups == 0 {
        return -1;
    }
    unsafe {
        (*addr_of_mut!(SIMS))[slot as usize % SLOTS] = Some(Sim::new(&l));
    }
    0
}

#[no_mangle]
pub extern "C" fn ms_tap(slot: u32, g: u32) -> i32 {
    sim(slot).tap(g as usize) as i32
}

#[no_mangle]
pub extern "C" fn ms_update(slot: u32, dt: f64) {
    sim(slot).update(dt);
}

#[no_mangle]
pub extern "C" fn ms_clear_events(slot: u32) {
    sim(slot).clear_events();
}

#[no_mangle]
pub extern "C" fn ms_ev_len(slot: u32) -> u32 {
    sim(slot).ev_len
}

#[no_mangle]
pub extern "C" fn ms_marbles(slot: u32) -> u32 {
    sim(slot).m_n
}

#[no_mangle]
pub extern "C" fn ms_q_head(slot: u32) -> u32 {
    sim(slot).q_head
}

#[no_mangle]
pub extern "C" fn ms_q_len(slot: u32) -> u32 {
    sim(slot).q_len
}

#[no_mangle]
pub extern "C" fn ms_checksum(slot: u32) -> u32 {
    sim(slot).checksum()
}

macro_rules! ptr_export {
    ($name:ident, $field:ident, $t:ty) => {
        #[no_mangle]
        pub extern "C" fn $name(slot: u32) -> *const $t {
            sim(slot).$field.as_ptr()
        }
    };
}

ptr_export!(ms_scal, scal, f64);
ptr_export!(ms_gate_state, gate_state, u8);
ptr_export!(ms_cup_count, cup_count, u8);
ptr_export!(ms_m_id, m_id, i32);
ptr_export!(ms_m_color, m_color, u8);
ptr_export!(ms_m_to, m_to, i32);
ptr_export!(ms_m_from, m_from, i32);
ptr_export!(ms_m_d, m_d, f64);
ptr_export!(ms_m_len, m_len, f64);
ptr_export!(ms_queue, queue, u8);
ptr_export!(ms_ev_type, ev_type, u8);
ptr_export!(ms_ev_a, ev_a, i32);
ptr_export!(ms_ev_b, ev_b, i32);
