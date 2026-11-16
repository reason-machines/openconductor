//! Native menu items that open frontend UI.
//!
//! Conductor builds Tauri's default menu and appends its own items to the
//! default submenus. Each item carries an id; clicking it emits a matching event
//! to the webview, which owns the UI. Ids, labels and log strings come from the
//! string table of `Conductor.app/Contents/MacOS/conductor` 0.87.6 (see
//! evidence/keybindings/README.md, "Native menu").
//!
//! Help menu items (8): Keyboard Shortcuts, Documentation, Best Practices,
//! Changelog, Send Feedback (⌘⌥F), Submit a Prompt, Diagnostics, Open Debug
//! Tools (⌘⌥I). All confirmed from `strings -a -t d` on the Conductor binary
//! 2026-11-15; see constants below for exact byte offsets.
//! Separator structure: not in binary log strings; items appended flat.
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

// ── Help menu: remaining 7 items ─────────────────────────────────────────────
// Evidence: `strings -a -t d /Applications/Conductor.app/Contents/MacOS/conductor`
// on Sven's Mac (sven m5 max), re-read 2026-11-15.
//
// String run at byte 22,085,559 (packed, sequential in binary):
//   keyboard_shortcutsKeyboard Shortcutsdocumentation
//   best_practicesBest PracticeschangelogChangelog
//   send_feedbackCmdOrCtrl+Alt+f
//   submit_a_promptSubmit a Prompt...diagnosticsDiagnostics...
//   debugCmdOrCtrl+Alt+i
//
// Labels "Send Feedback..." and "Open Debug Tools" from string run
// at byte 22,069,162: "Send Feedback...Open Debug Tools".
// "Documentation" is the natural capitalisation of id `documentation`
// (same pattern as best_practices→"Best Practices", changelog→"Changelog").
//
// Event names from byte 22,086,375:
//   open_diagnostics_page  open_submit_prompt_dialog  open_changelog_url
//   open_best_practices_url  open_feedback_dialog
//   open_keyboard_shortcuts_dialog  open_documentation_url
//
// Error-log strings confirm emit calls:
//   byte 46,901,646 "Failed to emit diagnostics page event:"
//   byte 46,901,833 "Failed to emit changelog URL event:"
//   byte 46,902,016 "Failed to emit documentation URL event:"
//
// `debug` has no emit event string anywhere in the binary; Conductor opens the
// web inspector directly from the native side (WebviewWindow::open_devtools).

/// Help > Documentation.
pub const DOCUMENTATION_ID: &str = "documentation";
#[cfg(target_os = "macos")]
const DOCUMENTATION_LABEL: &str = "Documentation";
/// Event emitted to the webview (src/App.tsx).
pub const DOCUMENTATION_EVENT: &str = "open_documentation_url";

/// Help > Best Practices.
pub const BEST_PRACTICES_ID: &str = "best_practices";
#[cfg(target_os = "macos")]
const BEST_PRACTICES_LABEL: &str = "Best Practices";
/// Event emitted to the webview.
pub const BEST_PRACTICES_EVENT: &str = "open_best_practices_url";

/// Help > Changelog.
pub const CHANGELOG_ID: &str = "changelog";
#[cfg(target_os = "macos")]
const CHANGELOG_LABEL: &str = "Changelog";
/// Event emitted to the webview.
pub const CHANGELOG_EVENT: &str = "open_changelog_url";

/// Help > Send Feedback... (⌘⌥F).
pub const SEND_FEEDBACK_ID: &str = "send_feedback";
#[cfg(target_os = "macos")]
const SEND_FEEDBACK_LABEL: &str = "Send Feedback...";
#[cfg(target_os = "macos")]
const SEND_FEEDBACK_ACCELERATOR: &str = "CmdOrCtrl+Alt+f";
/// Event emitted to the webview.
pub const SEND_FEEDBACK_EVENT: &str = "open_feedback_dialog";

/// Help > Submit a Prompt...
pub const SUBMIT_A_PROMPT_ID: &str = "submit_a_prompt";
#[cfg(target_os = "macos")]
const SUBMIT_A_PROMPT_LABEL: &str = "Submit a Prompt...";
/// Event emitted to the webview.
pub const SUBMIT_A_PROMPT_EVENT: &str = "open_submit_prompt_dialog";

/// Help > Diagnostics...
pub const DIAGNOSTICS_ID: &str = "diagnostics";
#[cfg(target_os = "macos")]
const DIAGNOSTICS_LABEL: &str = "Diagnostics...";
/// Event emitted to the webview.
pub const DIAGNOSTICS_EVENT: &str = "open_diagnostics_page";

/// Help > Open Debug Tools (⌘⌥I).
/// No webview event: Conductor opens the web inspector directly from the
/// native side. `handle_event` calls `WebviewWindow::open_devtools()`.
pub const DEBUG_ID: &str = "debug";
#[cfg(target_os = "macos")]
const DEBUG_LABEL: &str = "Open Debug Tools";
#[cfg(target_os = "macos")]
const DEBUG_ACCELERATOR: &str = "CmdOrCtrl+Alt+i";

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
///
/// Returns `None` for ids handled outside the emit path: `custom_quit`
/// (goes through `app_quit::request_quit`) and `debug` (opens devtools
/// directly — no event string found in the Conductor binary).
pub fn event_for(id: &str) -> Option<&'static str> {
    match id {
        SETTINGS_ID => Some(SETTINGS_EVENT),
        KEYBOARD_SHORTCUTS_ID => Some(KEYBOARD_SHORTCUTS_EVENT),
        TOGGLE_LEFT_SIDEBAR_ID => Some(TOGGLE_LEFT_SIDEBAR_ID),
        TOGGLE_RIGHT_SIDEBAR_ID => Some(TOGGLE_RIGHT_SIDEBAR_ID),
        DOCUMENTATION_ID => Some(DOCUMENTATION_EVENT),
        BEST_PRACTICES_ID => Some(BEST_PRACTICES_EVENT),
        CHANGELOG_ID => Some(CHANGELOG_EVENT),
        SEND_FEEDBACK_ID => Some(SEND_FEEDBACK_EVENT),
        SUBMIT_A_PROMPT_ID => Some(SUBMIT_A_PROMPT_EVENT),
        DIAGNOSTICS_ID => Some(DIAGNOSTICS_EVENT),
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
    // Items appended in Conductor's binary order: Keyboard Shortcuts,
    // Documentation, Best Practices, Changelog, Send Feedback (⌘⌥F),
    // Submit a Prompt, Diagnostics, Open Debug Tools (⌘⌥I).
    // Separator structure not confirmed from binary; items appended flat.
    let help_submenu = menu
        .get(HELP_SUBMENU_ID)
        .and_then(|kind| kind.as_submenu().cloned());
    let help_items: &[(&str, &str, Option<&str>)] = &[
        (KEYBOARD_SHORTCUTS_ID, KEYBOARD_SHORTCUTS_LABEL, None),
        (DOCUMENTATION_ID,      DOCUMENTATION_LABEL,      None),
        (BEST_PRACTICES_ID,     BEST_PRACTICES_LABEL,     None),
        (CHANGELOG_ID,          CHANGELOG_LABEL,          None),
        (SEND_FEEDBACK_ID,      SEND_FEEDBACK_LABEL,      Some(SEND_FEEDBACK_ACCELERATOR)),
        (SUBMIT_A_PROMPT_ID,    SUBMIT_A_PROMPT_LABEL,    None),
        (DIAGNOSTICS_ID,        DIAGNOSTICS_LABEL,        None),
        (DEBUG_ID,              DEBUG_LABEL,              Some(DEBUG_ACCELERATOR)),
    ];
    for &(id, label, accel) in help_items {
        let added = help_submenu.as_ref().and_then(|help| {
            let item = MenuItem::with_id(app, id, label, true, accel).ok()?;
            help.append(&item).ok()
        });
        if added.is_none() {
            eprintln!("Warning: Could not add {label} menu item");
        }
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
    // Open Debug Tools (⌘⌥I): no webview event — Conductor opens the web
    // inspector from the native side directly (no event string in binary).
    if id == DEBUG_ID {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            window.open_devtools();
        }
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
        // debug and custom_quit are handled outside event_for.
        assert_eq!(event_for("debug"), None);
        assert_eq!(event_for("custom_quit"), None);
        assert_eq!(event_for(""), None);
    }

    #[test]
    fn help_items_emit_their_events() {
        assert_eq!(event_for("documentation"),   Some("open_documentation_url"));
        assert_eq!(event_for("best_practices"),  Some("open_best_practices_url"));
        assert_eq!(event_for("changelog"),       Some("open_changelog_url"));
        assert_eq!(event_for("send_feedback"),   Some("open_feedback_dialog"));
        assert_eq!(event_for("submit_a_prompt"), Some("open_submit_prompt_dialog"));
        assert_eq!(event_for("diagnostics"),     Some("open_diagnostics_page"));
    }
}
