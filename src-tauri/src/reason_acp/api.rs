//! The public Reason API operations Routines (Reason Loops) and Settings ›
//! Organization (the signed-in Reason workspace) may run, through
//! the `reason` CLI: [`LaunchConfig::api_call`] checks the operation against
//! [`OPERATIONS`] and runs it with [`LaunchConfig::call`] (`reason
//! [--workspace SLUG] call OPERATION --input-file -`, `cloud.rs`).
//!
//! The CLI signs the request with its own login or `REASON_API_KEY` and pins
//! the Workspace, so OpenConductor never holds a Reason credential. The
//! pages can read and change Loops and read the Workspace, its members, MCP
//! servers and repositories, nothing else the API offers.

use std::path::Path;

use serde_json::Value;

use super::cli::LaunchConfig;
use super::cloud::CallError;

/// The operations Routines may call, by `reason tools` id.
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
    // Settings › Organization (src/org): the workspace and the caller's role in it,
    // its MCP servers and connectable services (MCP) and the repositories it reaches
    // (Cloud computer). Reads only.
    "listOrganizations",
    "getOwnRole",
    "listMcpServers",
    // MCP › Installed and Recommended: the services Reason connects, without credentials.
    "listConnections",
    "listRepositories",
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
