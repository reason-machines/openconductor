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
//! * [`screen`]: an `alacritty_terminal` grid of what the terminal shows,
//!   read back as text or as a restorable ANSI snapshot.
//! * `kill`: hangs up the process group, then SIGKILL after a grace period.
//! * [`wire`]: `pty_spawn` arguments and the events the webview receives.
//! * [`shell_exec`]: one-shot `/bin/sh -c` commands, optionally cancellable
//!   (`execute_shell_command[_cancellable]`, `cancel_shell_command`).
//!
//! No Tauri types here, so the module is tested on its own
//! (`tools/terminal/run-rust-tests.sh`); the Tauri command layer
//! (`terminal_commands.rs`) forwards events through an [`EventSink`].

pub mod flow;
mod kill;
mod manager;
pub mod screen;
pub mod scrollback;
pub mod shell_exec;
pub mod spawn;
pub mod wire;

#[cfg(test)]
mod tests;

pub use flow::{FlowGate, FlowLimits};
pub use manager::PtyManager;
pub use screen::{ScreenSnapshot, ScreenState, TerminalModes};
pub use scrollback::Scrollback;
pub use shell_exec::{ShellOutput, ShellRequest, ShellRunner};
pub use spawn::{EventSink, ExitInfo, Program, PtyEvent, Result, SpawnRequest, TerminalError};
pub use wire::{SpawnArgs, WireEvent};
