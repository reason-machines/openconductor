//! Native menu items that open frontend UI.
//!
//! Conductor builds Tauri's default menu and appends its own items to the
//! default submenus. Each item carries an id; clicking it emits a matching event
//! to the webview, which owns the UI. Ids, labels and log strings come from the
//! string table of `Conductor.app/Contents/MacOS/conductor` 0.87.6 (see
//! evidence/keybindings/README.md, "Native menu").
//!
//! So far: Help > Keyboard Shortcuts, and Toggle Left Sidebar / Toggle Right
//! Sidebar. The other Help items (Documentation, Best Practices, Changelog,
//! Send Feedback, Submit a Prompt, Diagnostics, Debug) follow the same shape
//! once their features exist.
//!
//! The sidebar items have no accelerator: in the string run their labels are
//! not followed by one, unlike `Settings...` (`CmdOrCtrl+,`); ⌘B / ⌥⌘B are
//! the webview's `view.toggleLeftSidebar` / `view.toggleRightSidebar`. The
//! webview flips `left_panel_visible` / `right_panel_visible` on the events
//! (decoded renderApp-D_fmY7hW.js, `lva` / `ova` @ byte 10,931,680, listened
//! for @ 10,931,122). Which submenu Conductor appends them to was not
//! decompiled (REA gap); they go in View here.
//!
//! Close Window is removed. Tauri's default macOS menu has it, with ⌘W, in
//! both File and Window, and a menu key equivalent wins over the webview, so
//! ⌘W closed the whole window instead of reaching `nav.closeTab` /
//! `terminal.closeTab`. Conductor's binary holds the literals `Close Window`
//! and `Window` next to its menu builder and logs
//! `Warning: Could not find Close Window item in <menu>` (`strings -a` on
//! 0.87.6, re-read 2026-11-06), so it looks the item up by label and drops it.
//! Whether it also touches File was not decompiled (REA gap: no decompiler
//! engine on Sven's Mac); removing it only from Window would leave ⌘W on
//! File's copy, so it goes from both here.

use tauri::{AppHandle, Emitter, Runtime};

/// Help > Keyboard Shortcuts.
pub const KEYBOARD_SHORTCUTS_ID: &str = "keyboard_shortcuts";
#[cfg(target_os = "macos")]
const KEYBOARD_SHORTCUTS_LABEL: &str = "Keyboard Shortcuts";
/// Event the help dialog listens for (src/App.tsx); it toggles the dialog.
pub const KEYBOARD_SHORTCUTS_EVENT: &str = "open_keyboard_shortcuts_dialog";

/// View > Toggle Left Sidebar. The id is also the event name.
pub const TOGGLE_LEFT_SIDEBAR_ID: &str = "toggle_left_sidebar";
/// View > Toggle Right Sidebar. The id is also the event name.
pub const TOGGLE_RIGHT_SIDEBAR_ID: &str = "toggle_right_sidebar";
#[cfg(target_os = "macos")]
const SIDEBAR_ITEMS: &[(&str, &str)] = &[
    (TOGGLE_LEFT_SIDEBAR_ID, "Toggle Left Sidebar"),
    (TOGGLE_RIGHT_SIDEBAR_ID, "Toggle Right Sidebar"),
];

/// Tauri's Close Window label, with or without its `&` mnemonic (muda's `C&lose Window`).
pub const CLOSE_WINDOW_LABEL: &str = "Close Window";

/// Whether a menu item label is Close Window.
pub fn is_close_window(label: &str) -> bool {
    label.replace('&', "") == CLOSE_WINDOW_LABEL
}

/// The webview event a menu item id emits, if it is one of ours.
pub fn event_for(id: &str) -> Option<&'static str> {
    match id {
        KEYBOARD_SHORTCUTS_ID => Some(KEYBOARD_SHORTCUTS_EVENT),
        TOGGLE_LEFT_SIDEBAR_ID => Some(TOGGLE_LEFT_SIDEBAR_ID),
        TOGGLE_RIGHT_SIDEBAR_ID => Some(TOGGLE_RIGHT_SIDEBAR_ID),
        _ => None,
    }
}

/// Tauri's default macOS menu with Conductor's sidebar and Help items appended.
///
/// A failed append is logged and skipped, like Conductor, so the app still
/// starts with the default menu.
#[cfg(target_os = "macos")]
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{Menu, MenuItem, HELP_SUBMENU_ID};

    let menu = Menu::default(app)?;
    remove_close_window(&menu);
    let view = menu.items().ok().and_then(|items| {
        items.iter().find_map(|kind| {
            let sub = kind.as_submenu()?;
            (sub.text().ok()? == "View").then(|| sub.clone())
        })
    });
    for (id, label) in SIDEBAR_ITEMS {
        let added = view.as_ref().and_then(|view| {
            let item = MenuItem::with_id(app, *id, *label, true, None::<&str>).ok()?;
            view.append(&item).ok()
        });
        if added.is_none() {
            eprintln!("Warning: Could not add {label} menu item");
        }
    }
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

/// Drops Close Window (⌘W) from every top-level submenu that has it, so ⌘W
/// reaches the webview's dispatcher. Logs, like Conductor, when a submenu
/// that should hold it does not.
#[cfg(target_os = "macos")]
fn remove_close_window<R: Runtime>(menu: &tauri::menu::Menu<R>) {
    let submenus = menu
        .items()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|kind| kind.as_submenu().cloned());
    for sub in submenus {
        let name = sub.text().unwrap_or_default();
        let close = sub.items().unwrap_or_default().into_iter().find(|item| {
            item.as_predefined_menuitem()
                .and_then(|p| p.text().ok())
                .is_some_and(|t| is_close_window(&t))
        });
        match close {
            Some(item) => {
                if let Err(e) = sub.remove(&item) {
                    eprintln!("Warning: Could not remove Close Window item in {name}: {e}");
                }
            }
            None if name == "File" || name == "Window" => {
                eprintln!("Warning: Could not find Close Window item in {name}");
            }
            None => {}
        }
    }
}

/// Forwards a clicked menu item to the webview.
pub fn handle_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let Some(event) = event_for(id) else {
        return;
    };
    if let Err(e) = app.emit(event, ()) {
        if event == KEYBOARD_SHORTCUTS_EVENT {
            eprintln!("Failed to emit keyboard shortcuts dialog event: {e}");
        } else {
            eprintln!("Failed to emit {event} event: {e}");
        }
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
    fn sidebar_items_emit_their_toggle_events() {
        assert_eq!(
            event_for("toggle_left_sidebar"),
            Some("toggle_left_sidebar")
        );
        assert_eq!(
            event_for("toggle_right_sidebar"),
            Some("toggle_right_sidebar")
        );
    }

    #[test]
    fn close_window_is_matched_with_or_without_its_mnemonic() {
        assert!(is_close_window("Close Window"));
        assert!(is_close_window("C&lose Window"));
        assert!(!is_close_window("Close"));
        assert!(!is_close_window("Minimize"));
    }

    #[test]
    fn other_ids_emit_nothing() {
        assert_eq!(event_for("documentation"), None);
        assert_eq!(event_for(""), None);
    }
}
