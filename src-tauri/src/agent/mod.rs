//! Agent runner and provider abstraction.
//!
//! * [`env`] - [`AgentKind`] and [`LaunchEnv`], the environment an agent
//!   process is launched with. A launch clears every inherited variable that
//!   would route the agent elsewhere before setting its own.
//! * [`secret`] - [`SecretStore`], where provider API keys and tokens live
//!   (the macOS Keychain in the app, memory in tests), and [`SecretString`],
//!   which never prints its value.
//!
//! What the reference app does and how this maps to it is recorded in
//! `evidence/providers/README.md`. The module is tested standalone with
//! `tools/agent/run-rust-tests.sh`.

pub mod env;
pub mod secret;

pub use env::{AgentKind, LaunchEnv};
pub use secret::{MemorySecretStore, SecretStore, SecretString};
