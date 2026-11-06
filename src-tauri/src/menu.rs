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
//!
//! The app menu gets Conductor's `Settings...` (`CmdOrCtrl+,`) and its own
//! Quit (`custom_quit`, `Cmd+Q`) in place of Tauri's predefined Quit. Both are
//! native accelerators, so ⌘, and ⌘Q reach the webview only as these items'
//! events: `open_settings_page` (Conductor's webview opens Settings › General
//! on it, renderApp @ ~10,884,627) and `quit_requested` (app_quit.rs).
//! Conductor finds `Settings...` again by label to give it the `gearshape` SF
//! Symbol; that icon is not copied. Its position in the app menu and its item
//! id were not decompiled (REA gap: no decompiler engine on Sven's Mac); it
//! goes after About here, and its id is `settings`.

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

/// App menu > Settings... (⌘,).
pub const SETTINGS_ID: &str = "settings";
#[cfg(target_os = "macos")]
const SETTINGS_LABEL: &str = "Settings...";
#[cfg(target_os = "macos")]
const SETTINGS_ACCELERATOR: &str = "CmdOrCtrl+,";
/// Event the webview opens Settings › General on (src/App.tsx).
pub const SETTINGS_EVENT: &str = "open_settings_page";

/// App menu > Quit (⌘Q), which asks the webview first (app_quit.rs).
pub const CUSTOM_QUIT_ID: &str = "custom_quit";
#[cfg(target_os = "macos")]
const CUSTOM_QUIT_ACCELERATOR: &str = "Cmd+Q";

/// Whether a menu item label is the app menu's Quit (`Quit <app>`, with or without `&`).
pub fn is_quit_label(label: &str) -> bool {
    label.replace('&', "").starts_with("Quit")
}

/// The webview event a menu item id emits, if it is one of ours.
pub fn event_for(id: &str) -> Option<&'static str> {
    match id {
        SETTINGS_ID => Some(SETTINGS_EVENT),
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
    add_settings_and_quit(app, &menu);
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

/// Adds `Settings...` after About and swaps Tauri's predefined Quit for
/// `custom_quit` at the same place in the app menu (the first submenu).
#[cfg(target_os = "macos")]
fn add_settings_and_quit<R: Runtime>(app: &AppHandle<R>, menu: &tauri::menu::Menu<R>) {
    use tauri::menu::{MenuItem, PredefinedMenuItem};

    let Some(app_menu) = menu
        .items()
        .ok()
        .and_then(|items| items.first().and_then(|kind| kind.as_submenu().cloned()))
    else {
        eprintln!("Warning: Could not add Settings menu item");
        return;
    };
    // About is first, then a separator; Settings... and its own separator follow.
    let settings = MenuItem::with_id(
        app,
        SETTINGS_ID,
        SETTINGS_LABEL,
        true,
        Some(SETTINGS_ACCELERATOR),
    )
    .and_then(|item| app_menu.insert(&item, 2))
    .and_then(|()| PredefinedMenuItem::separator(app))
    .and_then(|sep| app_menu.insert(&sep, 3));
    if settings.is_err() {
        eprintln!("Warning: Could not add Settings menu item");
    }

    let items = app_menu.items().unwrap_or_default();
    let quit = items.iter().enumerate().find(|(_, item)| {
        item.as_predefined_menuitem()
            .and_then(|p| p.text().ok())
            .is_some_and(|t| is_quit_label(&t))
    });
    let label = quit
        .and_then(|(_, item)| item.as_predefined_menuitem().and_then(|p| p.text().ok()))
        .map(|t| t.replace('&', ""))
        .unwrap_or_else(|| format!("Quit {}", app.package_info().name));
    let at = quit.map_or(items.len(), |(i, _)| i);
    let added = MenuItem::with_id(
        app,
        CUSTOM_QUIT_ID,
        &label,
        true,
        Some(CUSTOM_QUIT_ACCELERATOR),
    )
    .and_then(|item| app_menu.insert(&item, at));
    match added {
        // Only drop the predefined Quit once ours is in, so the app can always be quit.
        Ok(()) => {
            if let Some((_, item)) = quit {
                if let Err(e) = app_menu.remove(item) {
                    eprintln!("Warning: Could not remove the default Quit menu item: {e}");
                }
            }
        }
        Err(_) => eprintln!("Warning: Could not add Quit menu item"),
    }
}

/// Forwards a clicked menu item to the webview.
pub fn handle_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if id == CUSTOM_QUIT_ID {
        crate::app_quit::request_quit(app);
        return;
    }
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
    fn settings_item_emits_the_settings_page_event() {
        assert_eq!(event_for("settings"), Some("open_settings_page"));
    }

    #[test]
    fn quit_is_handled_natively_not_as_a_plain_event() {
        // custom_quit goes through app_quit::request_quit, which decides whether to ask the webview.
        assert_eq!(event_for("custom_quit"), None);
    }

    #[test]
    fn quit_label_is_matched_with_or_without_its_mnemonic() {
        assert!(is_quit_label("Quit OpenConductor"));
        assert!(is_quit_label("&Quit OpenConductor"));
        assert!(!is_quit_label("Hide OpenConductor"));
        assert!(!is_quit_label("Settings..."));
    }

    #[test]
    fn other_ids_emit_nothing() {
        assert_eq!(event_for("documentation"), None);
        assert_eq!(event_for(""), None);
    }
}
