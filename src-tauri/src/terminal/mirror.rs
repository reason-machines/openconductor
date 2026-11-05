//! Screens with no program behind them.
//!
//! The reference's webview keeps one per remote terminal
//! (`remote-terminal-mirror:<sessionId>`): it creates it with
//! `pty_create_mirror`, writes the remote output into it with
//! `pty_write_mirror`, and reads it back with the same `pty_screen_text` /
//! `pty_screen_snapshot` a local terminal answers. The reference's source
//! file is `workspace_runtime_core/src/terminal_mirror.rs`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use super::screen::{ScreenState, DEFAULT_SCROLLBACK_LINES};
use super::spawn::{Result, TerminalError};

/// Cap on scrollback rows derived from `maxBufferedBytes`.
const MAX_SCROLLBACK_LINES: usize = 100_000;

#[derive(Default)]
pub(crate) struct Mirrors(Mutex<HashMap<String, Arc<Mutex<ScreenState>>>>);

impl Mirrors {
    /// A blank mirror. Replaces one with the same id.
    pub(crate) fn create(&self, id: &str, cols: u16, rows: u16, max_buffered_bytes: Option<usize>) {
        let lines = scrollback_lines(cols, rows, max_buffered_bytes);
        let screen = Arc::new(Mutex::new(ScreenState::new(cols, rows, lines)));
        self.0.lock().unwrap().insert(id.to_owned(), screen);
    }

    pub(crate) fn get(&self, id: &str) -> Result<Arc<Mutex<ScreenState>>> {
        self.0
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| TerminalError::MirrorNotFound(id.to_owned()))
    }

    pub(crate) fn delete(&self, id: &str) -> Result<()> {
        self.0
            .lock()
            .unwrap()
            .remove(id)
            .map(drop)
            .ok_or_else(|| TerminalError::MirrorNotFound(id.to_owned()))
    }

    pub(crate) fn ids(&self) -> Vec<String> {
        let mut ids: Vec<_> = self.0.lock().unwrap().keys().cloned().collect();
        ids.sort();
        ids
    }
}

/// Scrollback rows for a mirror. The reference sizes its buffer in bytes;
/// we keep rows, so a byte budget becomes about one row per `cols` bytes
/// (at least one screenful, at most [`MAX_SCROLLBACK_LINES`]).
pub(crate) fn scrollback_lines(cols: u16, rows: u16, max_buffered_bytes: Option<usize>) -> usize {
    match max_buffered_bytes {
        None => DEFAULT_SCROLLBACK_LINES,
        Some(bytes) => (bytes / usize::from(cols.max(1)))
            .max(usize::from(rows))
            .min(MAX_SCROLLBACK_LINES),
    }
}
