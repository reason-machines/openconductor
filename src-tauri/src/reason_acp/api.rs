//! The public Reason API operations OpenConductor may run, through the
//! `reason` CLI (Routines on Reason Loops, Settings › Organization on the
//! Reason workspace): [`LaunchConfig::api_call`] checks the operation against
//! [`OPERATIONS`] and runs it with [`LaunchConfig::call`] (`reason
//! [--workspace SLUG] call OPERATION --input-file -`, `cloud.rs`).
//!
//! The CLI signs the request with its own login or `REASON_API_KEY` and pins
//! the Workspace, so OpenConductor never holds a Reason credential. The
//! app can read and change Loops, read the Workspace's members, and list,
//! set and delete its environment variables (secrets, values write-only)
//! and MCP servers; nothing else the API offers.

use std::path::Path;

use serde_json::Value;

use super::cli::LaunchConfig;
use super::cloud::CallError;

/// The operations OpenConductor may call, by `reason tools` id.
pub const OPERATIONS: &[&str] = &[
    // Who is signed in (`user_id` decides "Me" and who may change a routine).
    "getSelf",
    // The Reasons a routine can be filed under, and their Loops.
    "listReasons",
    "listReasonLoops",
    "getReasonLoop",
    "createReasonLoop",
    "updateReasonLoop",
    "deleteReasonLoop",
    "runReasonLoop",
    // Authors' emails in the routines table; Settings › Organization › Members.
    "listMembers",
    // Settings › Organization › Environment: Personal (`user`) and Shared
    // (`organization`) variables. Values go in on stdin and never come back.
    "listSecrets",
    "setSecret",
    "deleteSecret",
    // Settings › Organization › MCP.
    "listMcpServers",
    "createMcpServer",
    "updateMcpServer",
    "deleteMcpServer",
];

impl LaunchConfig {
    /// One of [`OPERATIONS`] with `input` on stdin. Anything else is refused
    /// (`operation_not_allowed`) without running the CLI.
    pub fn api_call(&self, dir: &Path, operation: &str, input: &Value) -> Result<Value, CallError> {
        if !OPERATIONS.contains(&operation) {
            return Err(CallError {
                code: "operation_not_allowed".into(),
                message: format!("OpenConductor does not call {operation}"),
            });
        }
        self.call(dir, operation, Some(input))
    }
}
