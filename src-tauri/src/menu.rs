//! Native menu items that open frontend UI.
//!
//! Conductor builds Tauri's default menu and appends its own items to the
//! default submenus. Each item carries an id; clicking it emits a matching event
//! to the webview, which owns the UI. Ids, labels and log strings come from the
//! string table of `Conductor.app/Contents/MacOS/conductor` 0.87.6 (see
//! evidence/keybindings/README.md, "Native menu").
//!
//! Only the Keyboard Shortcuts item exists so far. The other Help items
//! (Documentation, Best Practices, Changelog, Send Feedback, Submit a Prompt,
//! Diagnostics, Debug) follow the same shape once their features exist.

use tauri::{AppHandle, Emitter, Runtime};

/// Help > Keyboard Shortcuts.
pub const KEYBOARD_SHORTCUTS_ID: &str = "keyboard_shortcuts";
#[cfg(target_os = "macos")]
const KEYBOARD_SHORTCUTS_LABEL: &str = "Keyboard Shortcuts";
/// Event the help dialog listens for (src/App.tsx); it toggles the dialog.
pub const KEYBOARD_SHORTCUTS_EVENT: &str = "open_keyboard_shortcuts_dialog";

/// The webview event a menu item id emits, if it is one of ours.
pub fn event_for(id: &str) -> Option<&'static str> {
    match id {
        KEYBOARD_SHORTCUTS_ID => Some(KEYBOARD_SHORTCUTS_EVENT),
        _ => None,
    }
}

/// Tauri's default macOS menu with Conductor's Help items appended.
///
/// A failed append is logged and skipped, like Conductor, so the app still
/// starts with the default menu.
#[cfg(target_os = "macos")]
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{Menu, MenuItem, HELP_SUBMENU_ID};

    let menu = Menu::default(app)?;
    let added = menu
        .get(HELP_SUBMENU_ID)
        .and_then(|kind| kind.as_submenu().cloned())
        .and_then(|help| {
            let item = MenuItem::with_id(
                app,
                KEYBOARD_SHORTCUTS_ID,
                KEYBOARD_SHORTCUTS_LABEL,
                true,
                None::<&str>,
            )
            .ok()?;
            help.append(&item).ok()
        });
    if added.is_none() {
        eprintln!("Warning: Could not add Keyboard Shortcuts menu item");
    }
    Ok(menu)
}

/// Forwards a clicked menu item to the webview.
pub fn handle_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let Some(event) = event_for(id) else {
        return;
    };
    if let Err(e) = app.emit(event, ()) {
        eprintln!("Failed to emit keyboard shortcuts dialog event: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keyboard_shortcuts_item_emits_the_dialog_event() {
        assert_eq!(
            event_for("keyboard_shortcuts"),
            Some("open_keyboard_shortcuts_dialog")
        );
    }

    #[test]
    fn other_ids_emit_nothing() {
        assert_eq!(event_for("documentation"), None);
        assert_eq!(event_for(""), None);
    }
}
