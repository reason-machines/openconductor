//! PTY-backed terminals for the terminal panel.
//!
//! Recreates the backend half of the reference app's `pty_*` commands
//! (`pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`, `pty_ack_bytes`;
//! see `evidence/terminal/NOTES.md`). The reference links `portable-pty`
//! 0.9.0, so this module uses the same crate.
//!
//! * [`spawn`]: request, events and errors; validates the working
//!   directory and size before anything starts.
//! * [`PtyManager`]: starts the user's login shell (or an argv) on a PTY
//!   and emits `Ready`, then `Data` chunks, then one `Exit`.
//! * [`flow`]: output stops once `FlowLimits::high` bytes are unacked and
//!   resumes when `pty_ack_bytes` brings it down to `FlowLimits::low`.
//! * [`scrollback`]: bounded history for late renderers to replay.
//! * `kill`: hangs up the process group, then SIGKILL after a grace period.
//! * [`wire`]: `pty_spawn` arguments and the events the webview receives.
//!
//! No Tauri types here, so the module is tested on its own
//! (`tools/terminal/run-rust-tests.sh`); the Tauri command layer
//! (`terminal_commands.rs`) forwards events through an [`EventSink`].

pub mod flow;
mod kill;
mod manager;
pub mod scrollback;
pub mod spawn;
pub mod wire;

#[cfg(test)]
mod tests;

pub use flow::{FlowGate, FlowLimits};
pub use manager::PtyManager;
pub use scrollback::Scrollback;
pub use spawn::{EventSink, ExitInfo, Program, PtyEvent, Result, SpawnRequest, TerminalError};
pub use wire::{SpawnArgs, WireEvent};
