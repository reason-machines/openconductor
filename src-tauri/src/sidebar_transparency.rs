//! Experimental "Sidebar transparency": native macOS vibrancy behind the
//! workspace sidebar, as Conductor 0.87.6 does it (REA/Ghidra on its binary,
//! see the PR that added this file):
//!
//! - `conductor_lib::startup_sidebar_transparency_enabled` reads
//!   `experimental_sidebar_transparency` from conductor.db once at launch and
//!   is true only for the exact text `"true"`; any error reads as off. The
//!   main window is created transparent only then, which is why the setting
//!   "Takes effect after you restart".
//! - `conductor_lib::update_window_vibrancy({ isDarkMode, enabled })` runs on
//!   the main thread against the `main` window: `set_window_appearance` sets
//!   NSAppearanceNameDarkAqua / NSAppearanceNameAqua, then
//!   `apply_vibrancy(window, NSVisualEffectMaterial::Sidebar, None, None)`
//!   when enabled, else `clear_vibrancy`.
//!
//! Tauri's `set_effects` makes the same `window_vibrancy::apply_vibrancy`
//! call (and removes the previous effect view first, so repeated theme
//! changes don't stack views).

use openconductor_db::app_settings::{self, keys};
use openconductor_db::SqlitePool;
use tauri::window::{Effect, EffectsBuilder};
use tauri::{AppHandle, Manager, Theme, WebviewWindow, WebviewWindowBuilder};

/// Label of the window Conductor applies vibrancy to.
pub const MAIN_WINDOW: &str = "main";

/// The stored value turns transparency on only when it is exactly `"true"`.
pub fn enabled_from(value: Option<&str>) -> bool {
    value == Some("true")
}

/// `startup_sidebar_transparency_enabled`: the setting as stored at launch;
/// a read error is off.
pub fn startup_enabled(pool: &SqlitePool) -> bool {
    match tauri::async_runtime::block_on(app_settings::get(
        pool,
        keys::EXPERIMENTAL_SIDEBAR_TRANSPARENCY,
    )) {
        Ok(value) => enabled_from(value.as_deref()),
        Err(e) => {
            eprintln!("sidebar transparency: reading the setting failed, starting opaque: {e}");
            false
        }
    }
}

/// Create the main window from its tauri.conf.json entry (`"create": false`),
/// transparent when the setting was on at launch so the webview lets the
/// window's vibrancy through.
pub fn create_main_window(app: &AppHandle, transparent: bool) -> tauri::Result<WebviewWindow> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == MAIN_WINDOW)
        .cloned()
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    WebviewWindowBuilder::from_config(app, &config)?
        .transparent(transparent)
        .build()
}

/// The window appearance for the resolved light/dark mode; `None` follows
/// the system.
pub fn appearance(is_dark_mode: Option<bool>) -> Option<Theme> {
    is_dark_mode.map(|dark| if dark { Theme::Dark } else { Theme::Light })
}

/// JS: `invoke("update_window_vibrancy", { isDarkMode, enabled })`.
#[tauri::command]
pub fn update_window_vibrancy(
    app: AppHandle,
    is_dark_mode: Option<bool>,
    enabled: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_WINDOW)
        .ok_or("Main window not found")?;
    if !cfg!(target_os = "macos") {
        return Ok(());
    }
    window
        .set_theme(appearance(is_dark_mode))
        .map_err(|e| e.to_string())?;
    let effects = enabled.then(|| EffectsBuilder::new().effect(Effect::Sidebar).build());
    window.set_effects(effects).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_exact_text_true_turns_it_on() {
        // Conductor compares the 4-byte value to "true" (0x65757274).
        assert!(enabled_from(Some("true")));
        for v in [
            None,
            Some("false"),
            Some("TRUE"),
            Some("1"),
            Some("true "),
            Some(""),
        ] {
            assert!(!enabled_from(v), "{v:?}");
        }
    }

    #[test]
    fn startup_reads_the_stored_setting() {
        use tauri::async_runtime::block_on;
        let pool = block_on(openconductor_db::open_in_memory()).unwrap();
        let set = |v: &str| {
            block_on(app_settings::set(
                &pool,
                keys::EXPERIMENTAL_SIDEBAR_TRANSPARENCY,
                v,
            ))
            .unwrap()
        };
        assert!(!startup_enabled(&pool), "no row is off");
        set("true");
        assert!(startup_enabled(&pool));
        set("false");
        assert!(!startup_enabled(&pool));
    }

    #[test]
    fn dark_mode_picks_the_window_appearance() {
        assert_eq!(appearance(Some(true)), Some(Theme::Dark));
        assert_eq!(appearance(Some(false)), Some(Theme::Light));
        assert_eq!(appearance(None), None);
    }
}
