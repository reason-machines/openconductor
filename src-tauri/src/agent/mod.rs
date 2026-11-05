//! Agent runner and provider abstraction.
//!
//! * [`secret`] - [`SecretStore`], where provider API keys and tokens live
//!   (the macOS Keychain in the app, memory in tests), and [`SecretString`],
//!   which never prints its value.
//!
//! What the reference app does and how this maps to it is recorded in
//! `evidence/providers/README.md`. The module is tested standalone with
//! `tools/agent/run-rust-tests.sh`.

pub mod secret;

pub use secret::{MemorySecretStore, SecretStore, SecretString};
