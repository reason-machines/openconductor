//! PTY-backed terminals for the terminal panel.
//!
//! Recreates the backend half of the reference app's `pty_*` commands
//! (see `evidence/terminal/NOTES.md`). No Tauri types here, so the module
//! is tested on its own (`tools/terminal/run-rust-tests.sh`).

pub mod flow;
mod kill;
mod manager;
pub mod scrollback;
pub mod spawn;

#[cfg(test)]
mod tests;

pub use flow::{FlowGate, FlowLimits};
pub use manager::PtyManager;
pub use scrollback::Scrollback;
pub use spawn::{EventSink, ExitInfo, Program, PtyEvent, Result, SpawnRequest, TerminalError};
