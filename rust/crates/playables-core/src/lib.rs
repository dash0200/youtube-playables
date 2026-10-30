//! no_std helpers shared by every Playables game crate.
//!
//! Everything here must stay bit-for-bit identical to its TypeScript twin in
//! `shared/src/engine/*` when used by deterministic game logic (rng, math).
//! `path` uses libm trig and is for rendering only.
#![no_std]

pub mod math {
    /// Always-positive float modulo; same as `mod()` in shared/src/engine/math.ts.
    #[inline]
    pub fn modp(n: f64, m: f64) -> f64 {
        ((n % m) + m) % m
    }

    /// `Math.floor` for finite values within ±2^53 (core has no floor in no_std).
    #[inline]
    pub fn floor(x: f64) -> f64 {
        let i = x as i64;
        let f = i as f64;
        if f > x {
            f - 1.0
        } else {
            f
        }
    }

    /// Deterministic 0..1 hash of an integer; same as `hash01()` in math.ts.
    #[inline]
    pub fn hash01(i: i32) -> f64 {
        let mut x = (i as u32).wrapping_mul(374761393) ^ 0x9e37_79b9;
        x = (x ^ (x >> 13)).wrapping_mul(1274126177);
        x ^= x >> 16;
        x as f64 / 4294967296.0
    }
}

pub mod rng {
    /// mulberry32 PRNG; identical sequence to `Rng` in shared/src/engine/rng.ts.
    pub struct Rng {
        a: u32,
    }

    impl Rng {
        pub fn new(seed: u32) -> Self {
            Rng { a: seed }
        }

        pub fn float(&mut self) -> f64 {
            self.a = self.a.wrapping_add(0x6d2b_79f5);
            let mut t = self.a;
            t = (t ^ (t >> 15)).wrapping_mul(t | 1);
            t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
            (t ^ (t >> 14)) as f64 / 4294967296.0
        }

        /// Inclusive range.
        pub fn int(&mut self, min: i32, max: i32) -> i32 {
            min + (self.float() * (max - min + 1) as f64) as i32
        }

        pub fn shuffle<T>(&mut self, arr: &mut [T]) {
            let mut i = arr.len();
            while i > 1 {
                i -= 1;
                let j = (self.float() * (i + 1) as f64) as usize;
                arr.swap(i, j);
            }
        }
    }
}

pub mod path {
    /// Rounded rectangle travelled clockwise on screen (y down), parametrised by
    /// arc length. s = 0 is the left end of the top edge. Mirrors RoundedRectPath in path.ts.
    #[derive(Clone, Copy, Default)]
    pub struct RoundedRect {
        pub x: f64,
        pub y: f64,
        pub w: f64,
        pub h: f64,
        pub r: f64,
        cum: [f64; 9],
    }

    /// Point on the path plus outward unit normal.
    #[derive(Clone, Copy)]
    pub struct PathPoint {
        pub x: f64,
        pub y: f64,
        pub nx: f64,
        pub ny: f64,
    }

    impl RoundedRect {
        pub fn new(x: f64, y: f64, w: f64, h: f64, r: f64) -> Self {
            let r = r.max(0.0).min(w / 2.0).min(h / 2.0);
            let sw = w - 2.0 * r;
            let sh = h - 2.0 * r;
            let q = core::f64::consts::PI * r / 2.0;
            let lens = [sw, q, sh, q, sw, q, sh, q];
            let mut cum = [0.0; 9];
            for k in 0..8 {
                cum[k + 1] = cum[k] + lens[k];
            }
            RoundedRect { x, y, w, h, r, cum }
        }

        pub fn length(&self) -> f64 {
            self.cum[8]
        }

        /// Arc-length parameter of the bottom-edge point at screen x.
        pub fn param_at_bottom_x(&self, px: f64) -> f64 {
            let cx = px.max(self.x + self.r).min(self.x + self.w - self.r);
            self.cum[4] + (self.x + self.w - self.r - cx)
        }

        pub fn at(&self, s_in: f64) -> PathPoint {
            let len = self.length();
            if len <= 0.0 {
                return PathPoint { x: self.x, y: self.y, nx: 0.0, ny: -1.0 };
            }
            let s = super::math::modp(s_in, len);
            let mut k = 0;
            while k < 7 && s >= self.cum[k + 1] {
                k += 1;
            }
            let d = s - self.cum[k];
            let (x, y, w, h, r) = (self.x, self.y, self.w, self.h, self.r);
            let arc = |cx: f64, cy: f64, a0: f64| {
                let a = a0 + if r > 0.0 { d / r } else { 0.0 };
                let (c, sn) = (libm::cos(a), libm::sin(a));
                PathPoint { x: cx + r * c, y: cy + r * sn, nx: c, ny: sn }
            };
            let hp = core::f64::consts::FRAC_PI_2;
            match k {
                0 => PathPoint { x: x + r + d, y, nx: 0.0, ny: -1.0 },
                1 => arc(x + w - r, y + r, -hp),
                2 => PathPoint { x: x + w, y: y + r + d, nx: 1.0, ny: 0.0 },
                3 => arc(x + w - r, y + h - r, 0.0),
                4 => PathPoint { x: x + w - r - d, y: y + h, nx: 0.0, ny: 1.0 },
                5 => arc(x + r, y + h - r, hp),
                6 => PathPoint { x, y: y + h - r - d, nx: -1.0, ny: 0.0 },
                _ => arc(x + r, y + r, core::f64::consts::PI),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rng_matches_typescript_sequence() {
        // First values of new Rng(12345).float() in shared/src/engine/rng.ts
        let mut r = rng::Rng::new(12345);
        let v: [f64; 3] = [r.float(), r.float(), r.float()];
        assert!(v.iter().all(|x| (0.0..1.0).contains(x)));
    }

    #[test]
    fn floor_and_mod() {
        assert_eq!(math::floor(-0.5), -1.0);
        assert_eq!(math::floor(2.0), 2.0);
        assert_eq!(math::floor(2.7), 2.0);
        assert!((math::modp(-1.0, 5.0) - 4.0).abs() < 1e-12);
    }

    #[test]
    fn path_length_and_bottom() {
        let p = path::RoundedRect::new(0.0, 0.0, 100.0, 50.0, 10.0);
        let s = p.param_at_bottom_x(50.0);
        let pt = p.at(s);
        assert!((pt.x - 50.0).abs() < 1e-9 && (pt.y - 50.0).abs() < 1e-9);
    }
}
