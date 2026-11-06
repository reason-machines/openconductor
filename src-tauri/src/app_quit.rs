//! Quit through the webview, as Conductor 0.87.6 does.
//!
//! Conductor's binary registers the commands `set_quit_handler_ready(ready)`
//! and `quit_app`, emits `quit_requested`, and logs `Custom quit menu item
//! clicked` and `Failed to emit quit_requested event` (`strings -a` on
//! `MacOS/conductor`, sha256 `0ba55751…`). Its webview registers its
//! `quit_requested` listener and then calls `set_quit_handler_ready(true)`
//! (renderApp-D_fmY7hW.js `v5a`). From then on the native Quit item (⌘Q)
//! asks the webview, which confirms while agents run and calls `quit_app`.
//! Until then, or if the emit fails, Quit exits directly, so the app can
//! always be quit.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, Manager, Runtime, State};

/// Event the webview answers with a confirm dialog or `quit_app`.
pub const QUIT_REQUESTED_EVENT: &str = "quit_requested";

/// Whether the webview listens for `quit_requested`.
#[derive(Default)]
pub struct QuitHandler(AtomicBool);

impl QuitHandler {
    pub fn is_ready(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

/// What the native Quit item does.
#[derive(Debug, PartialEq, Eq)]
pub enum QuitRoute {
    /// Ask the webview (`quit_requested`).
    AskWebview,
    /// Nothing listens: exit now.
    ExitNow,
}

pub fn quit_route(handler_ready: bool) -> QuitRoute {
    if handler_ready {
        QuitRoute::AskWebview
    } else {
        QuitRoute::ExitNow
    }
}

#[derive(Clone, serde::Serialize)]
struct QuitRequested {
    source: &'static str,
}

/// The native Quit item was chosen (menu click or ⌘Q).
pub fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    eprintln!("Custom quit menu item clicked");
    let ready = app.try_state::<QuitHandler>().is_some_and(|h| h.is_ready());
    if quit_route(ready) == QuitRoute::AskWebview {
        match app.emit(QUIT_REQUESTED_EVENT, QuitRequested { source: "menu" }) {
            Ok(()) => return,
            Err(e) => eprintln!("Failed to emit quit_requested event: {e}"),
        }
    }
    app.exit(0);
}

#[tauri::command]
pub fn set_quit_handler_ready(ready: bool, handler: State<'_, QuitHandler>) {
    handler.0.store(ready, Ordering::SeqCst);
}

#[tauri::command]
pub fn quit_app<R: Runtime>(app: AppHandle<R>) {
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quit_asks_the_webview_only_once_it_listens() {
        assert_eq!(quit_route(true), QuitRoute::AskWebview);
        assert_eq!(quit_route(false), QuitRoute::ExitNow);
    }

    #[test]
    fn the_handler_starts_not_ready() {
        let h = QuitHandler::default();
        assert!(!h.is_ready());
        h.0.store(true, Ordering::SeqCst);
        assert!(h.is_ready());
    }
}
