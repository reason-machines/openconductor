//! The two file stores Conductor's sidecar keeps in the app data directory:
//!
//! * `outbox`: `sidecar-v2-session-event-outbox/`, a durable per-session
//!   queue of agent events not yet acknowledged by the frontend, replayed
//!   when the frontend reconnects.
//! * `completions`: `sidecar-v2-completions/slash-command-snapshots.json`,
//!   cached slash commands and skills per (user, repository, agent).
//!
//! Conductor 0.87.6 keeps both in its Bun sidecar (`conductor-runtime`,
//! classes `Lc6` and `Hp5`); its Rust shell passes their paths in
//! `CONDUCTOR_SESSION_EVENT_OUTBOX_ROOT` and
//! `CONDUCTOR_SIDECAR_V2_COMPLETIONS_DIR`. OpenConductor has no sidecar, so
//! both stores live in the app process with the same on-disk format.
//! Evidence: `evidence/persistence/sidecar-stores/README.md`.
//!
//! Tauri-free so it is tested on its own
//! (`evidence/persistence/sidecar-stores/run-tests.sh`).

pub mod completions;
pub mod outbox;
mod time;

use std::path::{Path, PathBuf};

/// Directory name of the session event outbox under the app data dir.
pub const OUTBOX_DIR: &str = "sidecar-v2-session-event-outbox";
/// Directory name of the completions store under the app data dir.
pub const COMPLETIONS_DIR: &str = "sidecar-v2-completions";
/// Overrides the outbox root, as in Conductor's sidecar.
pub const OUTBOX_ROOT_ENV: &str = "CONDUCTOR_SESSION_EVENT_OUTBOX_ROOT";
/// Overrides the completions directory, as in Conductor's sidecar.
pub const COMPLETIONS_DIR_ENV: &str = "CONDUCTOR_SIDECAR_V2_COMPLETIONS_DIR";

fn env_dir(name: &str) -> Option<PathBuf> {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

/// Where the outbox lives: `$CONDUCTOR_SESSION_EVENT_OUTBOX_ROOT` when set,
/// else `<app data>/sidecar-v2-session-event-outbox`.
pub fn outbox_root(app_data_dir: &Path) -> PathBuf {
    env_dir(OUTBOX_ROOT_ENV).unwrap_or_else(|| app_data_dir.join(OUTBOX_DIR))
}

/// Where the completions store lives: `$CONDUCTOR_SIDECAR_V2_COMPLETIONS_DIR`
/// when set, else `<app data>/sidecar-v2-completions`.
pub fn completions_dir(app_data_dir: &Path) -> PathBuf {
    env_dir(COMPLETIONS_DIR_ENV).unwrap_or_else(|| app_data_dir.join(COMPLETIONS_DIR))
}

/// A unique suffix for temporary files: pid, time and a process counter.
fn temp_suffix() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!(
        "{}.{:x}{:x}",
        std::process::id(),
        nanos,
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}
