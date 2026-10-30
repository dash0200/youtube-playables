//! C-ABI exports for Bead Loop, compiled to `wasm32-unknown-unknown`.
//!
//! One global simulation lives in static memory (no allocator). JS writes the
//! level into `bl_input_ptr()`, calls `bl_init`, then each frame calls
//! `bl_update` + `bl_compute_positions` and reads state through typed-array
//! views on the pointers below (see games/bead-loop/src/sim/wasm-sim.ts).
//!
//! Input layout (bytes): [colors, cap, slots_lo, slots_hi,
//!   fill[MAX_TUBES], tubes[MAX_TUBES][MAX_CAP], belt[MAX_SLOTS]]
#![cfg_attr(target_arch = "wasm32", no_std)]
#![allow(static_mut_refs)]

use bead_loop::sim::*;
use core::ptr::addr_of_mut;

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

pub const INPUT_LEN: usize = 4 + MAX_TUBES + MAX_TUBES * MAX_CAP + MAX_SLOTS;

static mut INPUT: [u8; INPUT_LEN] = [0; INPUT_LEN];
static mut SIM: Option<Sim> = None;

#[inline]
fn sim() -> &'static mut Sim {
    // SAFETY: single-threaded wasm; bl_init must be called first.
    unsafe { (*addr_of_mut!(SIM)).as_mut().unwrap() }
}

#[no_mangle]
pub extern "C" fn bl_input_ptr() -> *mut u8 {
    unsafe { addr_of_mut!(INPUT) as *mut u8 }
}

/// Constants so JS can verify it was built against the same layout.
#[no_mangle]
pub extern "C" fn bl_const(k: u32) -> u32 {
    (match k {
        0 => K,
        1 => MAX_TUBES,
        2 => MAX_CAP,
        3 => MAX_BEADS,
        4 => QCAP,
        5 => MAX_SLOTS,
        6 => NSCAL,
        7 => MAX_EVENTS,
        8 => INPUT_LEN,
        _ => 0,
    }) as u32
}

#[no_mangle]
pub extern "C" fn bl_init(speed: f64) -> i32 {
    let inp = unsafe { &*addr_of_mut!(INPUT) };
    let mut l = Level::empty();
    l.colors = inp[0] as usize;
    l.cap = inp[1] as usize;
    l.slots = inp[2] as usize | ((inp[3] as usize) << 8);
    l.speed = speed;
    if l.colors == 0 || l.colors > MAX_TUBES || l.cap == 0 || l.cap > MAX_CAP || l.slots == 0 || l.slots > MAX_SLOTS {
        return -1;
    }
    let mut o = 4;
    l.fill.copy_from_slice(&inp[o..o + MAX_TUBES]);
    o += MAX_TUBES;
    for t in 0..MAX_TUBES {
        l.tubes[t].copy_from_slice(&inp[o..o + MAX_CAP]);
        o += MAX_CAP;
    }
    l.belt.copy_from_slice(&inp[o..o + MAX_SLOTS]);
    unsafe {
        *addr_of_mut!(SIM) = Some(Sim::new(&l));
    }
    0
}

#[no_mangle]
pub extern "C" fn bl_set_port(t: u32, frac: f64) {
    sim().set_port(t as usize, frac)
}
#[no_mangle]
pub extern "C" fn bl_tap(t: u32) -> i32 {
    sim().tap(t as usize) as i32
}
#[no_mangle]
pub extern "C" fn bl_update(dt: f64) {
    sim().update(dt)
}
#[no_mangle]
pub extern "C" fn bl_clear_events() {
    sim().clear_events()
}
#[no_mangle]
pub extern "C" fn bl_ev_len() -> u32 {
    sim().ev_len as u32
}
#[no_mangle]
pub extern "C" fn bl_set_path(x: f64, y: f64, w: f64, h: f64, r: f64, jitter: f64) {
    sim().set_path(x, y, w, h, r, jitter)
}
#[no_mangle]
pub extern "C" fn bl_compute_positions() {
    sim().compute_positions()
}
#[no_mangle]
pub extern "C" fn bl_checksum() -> u32 {
    sim().checksum()
}

macro_rules! ptr_export {
    ($name:ident, $field:ident, $t:ty) => {
        #[no_mangle]
        pub extern "C" fn $name() -> *const $t {
            sim().$field.as_ptr()
        }
    };
}
ptr_export!(bl_scal, scal, f64);
ptr_export!(bl_slot_color, slot_color, u8);
ptr_export!(bl_slot_born, slot_born, f64);
ptr_export!(bl_tube_shell, tube_shell, u8);
ptr_export!(bl_tube_beads, tube_beads, u8);
ptr_export!(bl_tube_len, tube_len, u16);
ptr_export!(bl_fall_t, fall_t, f64);
ptr_export!(bl_fall_len, fall_len, u16);
ptr_export!(bl_queue, queue, u8);
ptr_export!(bl_q_head, q_head, u16);
ptr_export!(bl_q_len, q_len, u16);
ptr_export!(bl_shake, shake, f64);
ptr_export!(bl_flash, flash, f64);
ptr_export!(bl_complete, complete, u8);
ptr_export!(bl_combo, combo, u16);
ptr_export!(bl_events, events, u8);
ptr_export!(bl_pos, pos, f32);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ffi_roundtrip() {
        let inp = unsafe { &mut *addr_of_mut!(INPUT) };
        inp.fill(0);
        inp[0] = 3;
        inp[1] = 2;
        inp[2] = 60;
        inp[4..7].copy_from_slice(&[2, 2, 2]);
        let o = 4 + MAX_TUBES;
        inp[o..o + 2].copy_from_slice(&[1, 0]);
        inp[o + MAX_CAP..o + MAX_CAP + 2].copy_from_slice(&[0, 2]);
        inp[o + 2 * MAX_CAP..o + 2 * MAX_CAP + 2].copy_from_slice(&[2, 1]);
        let b = o + MAX_TUBES * MAX_CAP;
        inp[b..b + MAX_SLOTS].fill(EMPTY);
        assert_eq!(bl_init(30.0), 0);
        bl_set_port(0, 0.7);
        assert_eq!(bl_tap(0), 1);
        bl_update(0.5);
        bl_set_path(0.0, 0.0, 300.0, 200.0, 40.0, 2.0);
        bl_compute_positions();
        assert!(bl_ev_len() > 0);
        assert_eq!(bl_const(0) as usize, K);
    }
}
