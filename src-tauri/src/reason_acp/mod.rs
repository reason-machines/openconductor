//! Reason as an agent provider, over the Agent Client Protocol (ACP).
//!
//! OpenConductor runs `reason acp` (the Reason CLI's ACP agent) as a child
//! process and speaks JSON-RPC to it on stdin/stdout. Each OpenConductor
//! chat maps to one Reason Session.
//!
//! * [`rpc`]: newline-delimited JSON-RPC 2.0 transport with in-order
//!   dispatch of notifications before the responses that follow them.
//! * [`cli`]: finding the `reason` binary and starting `reason acp`.
//! * [`updates`]: `session/update` to provider events, error notices sent
//!   as text, and local/cloud path mapping.
//! * [`provider`]: one Reason Session per chat; follow-up, Stop, resume.
//!
//! The module depends on `std`, `serde` and `serde_json` only, so it builds
//! and tests on its own (`tools/reason-acp/run-rust-tests.sh`) before the
//! Tauri crate wires it into commands.

pub mod cli;
pub mod provider;
pub mod rpc;
pub mod updates;

#[cfg(test)]
mod cli_tests;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod updates_tests;
