//! Agent runner and provider abstraction.
//!
//! * [`claude`] - Claude Code providers: its own login, and an Anthropic API
//!   key or auth token, optionally through a gateway with model overrides.
//! * [`claude_cloud`] - Claude Code on Bedrock, Vertex AI and Foundry.
//! * [`codex`] - Codex (login, OpenAI API key, OpenRouter / Vercel AI
//!   Gateway), Cursor and OpenCode providers.
//! * [`env`] - [`AgentKind`] and [`LaunchEnv`], the environment an agent
//!   process is launched with. A launch clears every inherited variable that
//!   would route the agent elsewhere before setting its own.
//! * [`provider`] - the [`Provider`] trait: how an agent CLI is pointed at a
//!   model backend and authenticated, producing a [`LaunchEnv`] from its
//!   options and secrets.
//! * [`secret`] - [`SecretStore`], where provider API keys and tokens live
//!   (the macOS Keychain in the app, memory in tests), and [`SecretString`],
//!   which never prints its value.
//!
//! What the reference app does and how this maps to it is recorded in
//! `evidence/providers/README.md`. The module is tested standalone with
//! `tools/agent/run-rust-tests.sh`.

pub mod claude;
pub mod claude_cloud;
pub mod codex;
pub mod env;
pub mod provider;
pub mod secret;

pub use env::{AgentKind, LaunchEnv};
pub use provider::{Provider, ProviderError};
pub use secret::{MemorySecretStore, SecretStore, SecretString};
