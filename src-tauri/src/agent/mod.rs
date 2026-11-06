//! Agent runner and provider abstraction.
//!
//! * [`auth_sources`] - every sign-in found for Claude Code and Codex (CLI
//!   logins, OpenConductor's Keychain, the login shell), which one a chat
//!   uses, and what a first launch imports.
//! * [`byok`] - [`ProviderConfig`], the provider an agent uses as stored in
//!   settings, and the connect / disconnect / status operations behind the
//!   providers settings page. Never returns a secret value.
//! * [`claude`] - Claude Code providers: its own login, and an Anthropic API
//!   key or auth token, optionally through a gateway with model overrides.
//! * [`claude_cli`] - launching a Claude Code session: the six
//!   [`PermissionMode`]s and the stream-json `claude` command line.
//! * [`claude_stream`] - the stream-json lines exchanged with a running
//!   `claude`: user turns, control requests, permission prompts and replies,
//!   and turn results.
//! * [`claude_session`] - a running `claude` process: spawn, write messages,
//!   receive stdout events and stderr lines; killed on drop.
//! * [`claude_cloud`] - Claude Code on Bedrock, Vertex AI and Foundry.
//! * [`codex`] - Codex (login, OpenAI API key, OpenRouter / Vercel AI
//!   Gateway), Cursor and OpenCode providers.
//! * [`codex_cli`] - launching Codex: [`codex_cli::CodexPolicy`] (approval
//!   policy and sandbox, or inherit) and the `codex app-server` command line.
//! * [`codex_rpc`] - the JSON-RPC requests the app sends a running `codex
//!   app-server`: handshake, threads, turns and approval answers.
//! * [`codex_consent`] - MCP elicitations and permission requests that
//!   wait on the user (`needs_user_input`), and the answers Codex expects.
//! * [`codex_events`] - what the app-server sends back: responses, approval
//!   requests and turn notifications.
//! * [`codex_session`] - a running `codex app-server`: JSON-RPC calls that
//!   wait for their response, approval answers, and the notifications in
//!   between; killed on drop.
//! * [`codex_wire`] - the payloads a Codex chat window receives: reply
//!   text, reasoning, tool rows, approval prompts, notices, turn ends.
//! * [`codex_runner`] - one Codex chat: a thread that owns its app-server,
//!   runs prompts one at a time, answers approvals and stops turns.
//! * [`env`] - [`AgentKind`] and [`LaunchEnv`], the environment an agent
//!   process is launched with. A launch clears every inherited variable that
//!   would route the agent elsewhere before setting its own.
//! * [`handoff`] - handing the active credential to another machine (VM,
//!   cloud computer, container) over a shell, never on a command line.
//! * [`keychain`] - the app's [`SecretStore`]: the macOS login Keychain
//!   ([`keychain::default_store`]), memory on other platforms.
//! * [`provider`] - the [`Provider`] trait: how an agent CLI is pointed at a
//!   model backend and authenticated, producing a [`LaunchEnv`] from its
//!   options and secrets.
//! * [`reason`] - Reason, signed in with its own CLI (`reason login`); it
//!   runs over ACP (`crate::reason_acp`), not stream-json.
//! * [`secret`] - [`SecretStore`], where provider API keys and tokens live
//!   (the macOS Keychain in the app, memory in tests), and [`SecretString`],
//!   which never prints its value.
//!
//! What the reference app does and how this maps to it is recorded in
//! `evidence/providers/README.md`. The module is tested standalone with
//! `tools/agent/run-rust-tests.sh`.

pub mod auth_sources;
pub mod byok;
pub mod claude;
pub mod claude_cli;
pub mod claude_cloud;
pub mod claude_session;
pub mod claude_stream;
pub mod codex;
pub mod codex_cli;
pub mod codex_consent;
pub mod codex_events;
pub mod codex_rpc;
pub mod codex_runner;
pub mod codex_session;
pub mod codex_wire;
pub mod env;
pub mod handoff;
pub mod keychain;
pub mod provider;
pub mod reason;
pub mod secret;
// Mounted here as well as at the crate root because tools/agent/run-rust-tests.sh
// builds this module as a crate of its own.
#[cfg(all(test, unix))]
#[allow(clippy::duplicate_mod)]
#[path = "../test_exe.rs"]
mod test_exe;

pub use byok::{ProviderConfig, ProviderStatus};
pub use claude_cli::{ClaudeLaunch, PermissionMode};
pub use claude_session::{ClaudeSession, SessionEvent};
pub use env::{AgentKind, LaunchEnv};
pub use provider::{Provider, ProviderError};
pub use secret::{MemorySecretStore, SecretStore, SecretString};
