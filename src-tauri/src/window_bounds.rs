//! Minimum main-window size. `tauri.conf.json` sets the same minimum (`minWidth` / `minHeight`),
//! but a size the window-state plugin restores is applied with `set_size`, which can go below
//! it, so the window reopened at 260x332. The main window's resize handler applies
//! [`clamp_to_min`] to every resize, restored sizes included.

/// Logical minimum width in points; must equal `minWidth` in `tauri.conf.json`.
pub const MIN_WIDTH: f64 = 900.0;
/// Logical minimum height in points; must equal `minHeight` in `tauri.conf.json`.
pub const MIN_HEIGHT: f64 = 560.0;

/// The physical size to apply when a window of `width` x `height` physical pixels at
/// `scale_factor` is below the minimum, or `None` when it already fits. Each axis is raised
/// to its minimum on its own, so the other axis keeps its size.
pub fn clamp_to_min(width: u32, height: u32, scale_factor: f64) -> Option<(u32, u32)> {
    let scale = if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };
    let min_w = (MIN_WIDTH * scale).ceil() as u32;
    let min_h = (MIN_HEIGHT * scale).ceil() as u32;
    if width >= min_w && height >= min_h {
        return None;
    }
    Some((width.max(min_w), height.max(min_h)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restored_tiny_window_is_raised_to_the_minimum() {
        // The two sizes Sven saw restored: 260x332 and 654x321, at 2x.
        assert_eq!(clamp_to_min(520, 664, 2.0), Some((1800, 1120)));
        assert_eq!(clamp_to_min(654, 321, 1.0), Some((900, 560)));
    }

    #[test]
    fn a_window_at_or_above_the_minimum_is_left_alone() {
        assert_eq!(clamp_to_min(900, 560, 1.0), None);
        assert_eq!(clamp_to_min(1280, 820, 1.0), None);
        assert_eq!(clamp_to_min(1800, 1120, 2.0), None);
    }

    #[test]
    fn only_the_short_axis_is_raised() {
        assert_eq!(clamp_to_min(1280, 321, 1.0), Some((1280, 560)));
        assert_eq!(clamp_to_min(654, 820, 1.0), Some((900, 820)));
    }

    #[test]
    fn a_bad_scale_factor_falls_back_to_one() {
        assert_eq!(clamp_to_min(654, 321, 0.0), Some((900, 560)));
        assert_eq!(clamp_to_min(654, 321, f64::NAN), Some((900, 560)));
    }

    #[test]
    fn clamped_size_is_stable_under_reapplication() {
        let (w, h) = clamp_to_min(260, 332, 1.5).unwrap();
        assert_eq!(clamp_to_min(w, h, 1.5), None);
    }
}
