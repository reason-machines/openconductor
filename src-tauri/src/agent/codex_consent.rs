//! The two Codex server requests that wait on the user for something other
//! than a tool approval: an MCP server asking for information
//! (`mcpServer/elicitation/request`) and Codex asking for extra sandbox
//! permissions (`item/permissions/requestApproval`).
//!
//! Conductor 0.87.6 holds both for the user and sets the session to
//! `needs_user_input` (`codexMcpElicitation` and `codexPermissionApproval`
//! in its index chunk; `jD5`/`VD5`/`zD5`/`LD5` in its runtime sidecar map
//! them to and from the wire). Stop answers them the way its
//! `cancelCodexMcpConsent` does: the elicitation with `cancel`, the
//! permission request with `decline`. See `evidence/chat-status/codex-consent.md`.
//!
//! Pure: [`consent`] reads a request into a [`Consent`] for the chat window,
//! [`codex_result`] turns the user's [`ConsentAnswer`] into the JSON-RPC
//! result Codex expects.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::codex_rpc::RequestId;

pub const ELICITATION: &str = "mcpServer/elicitation/request";
pub const PERMISSIONS: &str = "item/permissions/requestApproval";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConsentKind {
    /// An MCP server needs information (a form, structured JSON, or a URL
    /// to open).
    Elicitation,
    /// Codex asks for filesystem or network access beyond its sandbox.
    Permissions,
}

/// A request the turn waits on until the user answers it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Consent {
    pub request_id: RequestId,
    pub kind: ConsentKind,
    pub turn_id: Option<String>,
    /// Who asks: the MCP server's name, or `codex` for permissions (as
    /// Conductor labels it).
    pub server_name: String,
    /// The elicitation's message.
    pub message: Option<String>,
    /// Elicitation mode: `form`, `openai/form` or `url`.
    pub mode: Option<String>,
    /// The JSON schema of a `form` or `openai/form` elicitation.
    pub requested_schema: Option<Value>,
    /// The page a `url` elicitation asks the user to open.
    pub url: Option<String>,
    /// Why Codex wants the permissions.
    pub reason: Option<String>,
    pub cwd: Option<String>,
    /// The permissions requested, as Codex sent them (`network`,
    /// `fileSystem`); granting sends them back unchanged.
    pub permissions: Option<Value>,
}

fn text(params: &Value, key: &str) -> Option<String> {
    params.get(key).and_then(Value::as_str).map(str::to_owned)
}

/// The consent a server request asks for, or `None` for any other method
/// (and for an elicitation whose mode is unknown, which the runner then
/// answers like any request it does not handle).
pub fn consent(id: &RequestId, method: &str, params: &Value) -> Option<Consent> {
    let base = Consent {
        request_id: id.clone(),
        kind: ConsentKind::Elicitation,
        turn_id: text(params, "turnId"),
        server_name: String::new(),
        message: None,
        mode: None,
        requested_schema: None,
        url: None,
        reason: None,
        cwd: None,
        permissions: None,
    };
    match method {
        ELICITATION => {
            let mode = match text(params, "mode")?.as_str() {
                "form" => "form",
                // Conductor accepts both spellings and calls it openai/form.
                "openai/form" | "openaiForm" => "openai/form",
                "url" => "url",
                _ => return None,
            };
            Some(Consent {
                server_name: text(params, "serverName").unwrap_or_else(|| "MCP server".into()),
                message: text(params, "message"),
                mode: Some(mode.into()),
                requested_schema: params.get("requestedSchema").cloned(),
                url: text(params, "url"),
                ..base
            })
        }
        PERMISSIONS => Some(Consent {
            kind: ConsentKind::Permissions,
            server_name: "codex".into(),
            reason: text(params, "reason"),
            cwd: text(params, "cwd"),
            permissions: Some(
                params
                    .get("permissions")
                    .cloned()
                    .unwrap_or_else(|| json!({})),
            ),
            ..base
        }),
        _ => None,
    }
}

/// How long a grant lasts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GrantScope {
    Turn,
    Session,
}

/// The user's answer, in the shape Conductor's cards send (`Nu8` for an
/// elicitation, `Cu8` for permissions).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ConsentAnswer {
    /// Elicitation: the form's content (none for a `url` elicitation).
    Accept {
        #[serde(default)]
        content: Option<Value>,
    },
    Decline,
    Cancel,
    /// Permissions: what is granted, in Codex's own shape.
    Grant {
        granted_permissions: Value,
        scope: GrantScope,
    },
}

/// The JSON-RPC result for `kind` answered with `answer` (Conductor's `VD5`
/// and `LD5`). An answer that does not fit the request (a grant for an
/// elicitation, content for permissions) is refused.
pub fn codex_result(kind: ConsentKind, answer: &ConsentAnswer) -> Result<Value, String> {
    match (kind, answer) {
        (ConsentKind::Elicitation, ConsentAnswer::Accept { content }) => Ok(json!({
            "action": "accept",
            "content": content.clone().unwrap_or(Value::Null),
            "_meta": null,
        })),
        (ConsentKind::Elicitation, ConsentAnswer::Decline) => {
            Ok(json!({ "action": "decline", "content": null, "_meta": null }))
        }
        (ConsentKind::Elicitation, ConsentAnswer::Cancel) => {
            Ok(json!({ "action": "cancel", "content": null, "_meta": null }))
        }
        (
            ConsentKind::Permissions,
            ConsentAnswer::Grant {
                granted_permissions,
                scope,
            },
        ) => Ok(json!({ "permissions": granted_permissions, "scope": scope })),
        // Anything but a grant grants nothing.
        (ConsentKind::Permissions, ConsentAnswer::Decline | ConsentAnswer::Cancel) => {
            Ok(json!({ "permissions": {}, "scope": "turn" }))
        }
        (kind, answer) => Err(format!("{answer:?} does not answer a {kind:?} request")),
    }
}

/// What Stop sends for a request still waiting (Conductor's
/// `cancelCodexMcpConsent`): cancel an elicitation, decline permissions.
pub fn stopped(kind: ConsentKind) -> ConsentAnswer {
    match kind {
        ConsentKind::Elicitation => ConsentAnswer::Cancel,
        ConsentKind::Permissions => ConsentAnswer::Decline,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_form_elicitation_is_read_with_its_schema() {
        let params = json!({
            "threadId": "t", "turnId": "u1", "serverName": "linear", "mode": "form",
            "message": "Which team?",
            "requestedSchema": {"type": "object", "properties": {"team": {"type": "string"}}, "required": ["team"]},
            "_meta": null,
        });
        let c = consent(&RequestId::Int(5), ELICITATION, &params).unwrap();
        assert_eq!(c.kind, ConsentKind::Elicitation);
        assert_eq!(c.server_name, "linear");
        assert_eq!(c.message.as_deref(), Some("Which team?"));
        assert_eq!(c.mode.as_deref(), Some("form"));
        assert_eq!(c.turn_id.as_deref(), Some("u1"));
        assert_eq!(c.requested_schema.unwrap()["required"], json!(["team"]));
        let v = serde_json::to_value(consent(&RequestId::Int(5), ELICITATION, &params)).unwrap();
        assert_eq!(v["requestId"], 5);
        assert_eq!(v["kind"], "elicitation");
        assert_eq!(v["serverName"], "linear");
    }

    #[test]
    fn openai_form_and_url_modes_are_kept_and_unknown_modes_are_not_consents() {
        let p =
            json!({"serverName": "s", "message": "m", "mode": "openaiForm", "requestedSchema": {}});
        assert_eq!(
            consent(&RequestId::Int(1), ELICITATION, &p)
                .unwrap()
                .mode
                .as_deref(),
            Some("openai/form")
        );
        let p = json!({"serverName": "s", "message": "m", "mode": "url", "url": "https://example.test/auth", "elicitationId": "e1"});
        let c = consent(&RequestId::Int(1), ELICITATION, &p).unwrap();
        assert_eq!(c.url.as_deref(), Some("https://example.test/auth"));
        assert!(consent(
            &RequestId::Int(1),
            ELICITATION,
            &json!({"mode": "telepathy"})
        )
        .is_none());
        assert!(consent(&RequestId::Int(1), "item/tool/requestUserInput", &json!({})).is_none());
    }

    #[test]
    fn a_permission_request_is_codex_asking() {
        let p = json!({
            "threadId": "t", "turnId": "u2", "itemId": "p1", "cwd": "/ws", "reason": "needs the cache",
            "permissions": {"network": {"enabled": true}, "fileSystem": {"read": null, "write": ["/tmp/cache"]}},
        });
        let c = consent(&RequestId::Str("p".into()), PERMISSIONS, &p).unwrap();
        assert_eq!(c.kind, ConsentKind::Permissions);
        assert_eq!(c.server_name, "codex");
        assert_eq!(c.reason.as_deref(), Some("needs the cache"));
        assert_eq!(
            c.permissions.unwrap()["fileSystem"]["write"],
            json!(["/tmp/cache"])
        );
    }

    #[test]
    fn answers_map_to_codex_results() {
        let accept: ConsentAnswer =
            serde_json::from_value(json!({"action": "accept", "content": {"team": "core"}}))
                .unwrap();
        assert_eq!(
            codex_result(ConsentKind::Elicitation, &accept).unwrap(),
            json!({"action": "accept", "content": {"team": "core"}, "_meta": null})
        );
        let url_ok: ConsentAnswer = serde_json::from_value(json!({"action": "accept"})).unwrap();
        assert_eq!(
            codex_result(ConsentKind::Elicitation, &url_ok).unwrap()["content"],
            Value::Null
        );
        assert_eq!(
            codex_result(ConsentKind::Elicitation, &ConsentAnswer::Cancel).unwrap(),
            json!({"action": "cancel", "content": null, "_meta": null})
        );
        let grant: ConsentAnswer = serde_json::from_value(json!({
            "action": "grant", "grantedPermissions": {"network": {"enabled": true}}, "scope": "turn"
        }))
        .unwrap();
        assert_eq!(
            codex_result(ConsentKind::Permissions, &grant).unwrap(),
            json!({"permissions": {"network": {"enabled": true}}, "scope": "turn"})
        );
        assert_eq!(
            codex_result(ConsentKind::Permissions, &ConsentAnswer::Decline).unwrap(),
            json!({"permissions": {}, "scope": "turn"})
        );
        assert!(codex_result(ConsentKind::Elicitation, &grant).is_err());
        assert!(codex_result(ConsentKind::Permissions, &accept).is_err());
    }

    #[test]
    fn stop_cancels_an_elicitation_and_declines_permissions() {
        assert_eq!(stopped(ConsentKind::Elicitation), ConsentAnswer::Cancel);
        assert_eq!(stopped(ConsentKind::Permissions), ConsentAnswer::Decline);
    }
}
