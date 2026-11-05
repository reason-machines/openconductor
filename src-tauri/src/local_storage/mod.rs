//! Conductor's file-backed local-storage subsystems: the store
//! ([`store`], Tauri-free and tested standalone by
//! `evidence/persistence/local-storage/run-tests.sh`) and its IPC commands
//! ([`commands`]). The frontend client and the 11 subsystem definitions are
//! in `src/lib/local-storage/`.

pub mod commands;
pub mod store;
