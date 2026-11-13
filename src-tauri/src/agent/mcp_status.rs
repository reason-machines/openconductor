//! Live Codex MCP status results. No configuration or transcript fallback.

use std::collections::BTreeMap;
use std::sync::mpsc::{Receiver, Sender};
use std::time::{Duration, Instant};

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

pub const TIMEOUT: Duration = Duration::from_secs(15);
pub const TIMED_OUT: &str = "MCP status timed out.";
pub type StatusResult = Result<Vec<McpServer>, String>;

pub struct StatusQuery {
    pub deadline: Instant,
    pub done: Sender<StatusResult>,
}

pub struct StatusReply {
    pub(crate) deadline: Instant,
    pub(crate) result: Receiver<StatusResult>,
}

impl StatusReply {
    pub fn receive(self) -> StatusResult {
        let result = self.result.recv_timeout(self.deadline.saturating_duration_since(Instant::now()));
        if Instant::now() >= self.deadline {
            return Err(TIMED_OUT.into());
        }
        result.map_err(|_| "The Codex chat closed before MCP status arrived.".to_owned())?
    }
}

fn required_nullable<'de, D, T>(d: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d)
}

fn optional_nonnull<'de, D, T>(d: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(d).map(Some)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolAnnotations {
    #[serde(default, deserialize_with = "optional_nonnull", skip_serializing_if = "Option::is_none")]
    pub read_only: Option<bool>,
    #[serde(default, deserialize_with = "optional_nonnull", skip_serializing_if = "Option::is_none")]
    pub destructive: Option<bool>,
    #[serde(default, deserialize_with = "optional_nonnull", skip_serializing_if = "Option::is_none")]
    pub open_world: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    #[serde(default, deserialize_with = "optional_nonnull", skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, deserialize_with = "optional_nonnull", skip_serializing_if = "Option::is_none")]
    pub annotations: Option<ToolAnnotations>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum McpStatus {
    Connected,
    NeedsAuth,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct McpServer {
    pub name: String,
    pub status: McpStatus,
    pub tools: Vec<McpTool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum AuthStatus {
    Unsupported,
    NotLoggedIn,
    BearerToken,
    OAuth,
    Unknown,
}

#[derive(Deserialize)]
struct ServerInfo {
    #[serde(rename = "name")]
    _name: String,
    #[serde(rename = "version")]
    _version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusRow {
    name: String,
    tools: BTreeMap<String, McpTool>,
    auth_status: AuthStatus,
    #[serde(deserialize_with = "required_nullable")]
    server_info: Option<ServerInfo>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusPage {
    data: Vec<StatusRow>,
    #[serde(deserialize_with = "required_nullable")]
    next_cursor: Option<String>,
}

pub fn decode_page(value: Value) -> Result<(Vec<McpServer>, Option<String>), String> {
    let page: StatusPage = serde_json::from_value(value)
        .map_err(|e| format!("Invalid Codex MCP status response: {e}"))?;
    let rows = page.data.into_iter().map(|row| {
        let status = if row.server_info.is_some() || !row.tools.is_empty() {
            McpStatus::Connected
        } else if matches!(row.auth_status, AuthStatus::NotLoggedIn) {
            McpStatus::NeedsAuth
        } else {
            McpStatus::Failed
        };
        McpServer { name: row.name, status, tools: row.tools.into_values().collect() }
    }).collect();
    Ok((rows, page.next_cursor.filter(|s| !s.is_empty())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::mpsc;

    fn row() -> Value {
        json!({"name":"example","tools":{},"authStatus":"notLoggedIn","serverInfo":null})
    }

    #[test]
    fn mcp_status_strict_required_nullable_and_optional_nonnullable() {
        let good = json!({"data":[row()],"nextCursor":null});
        assert!(decode_page(good.clone()).is_ok());
        for key in ["data", "nextCursor"] {
            let mut bad = good.clone();
            bad.as_object_mut().unwrap().remove(key);
            assert!(decode_page(bad).is_err(), "missing {key}");
        }
        for key in ["name", "tools", "authStatus", "serverInfo"] {
            let mut bad = good.clone();
            bad["data"][0].as_object_mut().unwrap().remove(key);
            assert!(decode_page(bad).is_err(), "missing {key}");
        }
        for tools in [json!({"x":null}), json!({"x":{"name":"x","description":null}}), json!({"x":{"name":"x","annotations":null}}), json!({"x":{"name":"x","annotations":{"readOnly":null}}}), json!({"x":{"name":"x","annotations":{"destructive":"yes"}}}), json!({"x":{"name":"x","annotations":{"openWorld":0}}})] {
            let mut bad = good.clone();
            bad["data"][0]["tools"] = tools;
            assert!(decode_page(bad).is_err());
        }
        for (key, value) in [("authStatus",json!("invented")),("serverInfo",json!({"name":"x"})),("tools",json!([]))] {
            let mut bad = good.clone();
            bad["data"][0][key] = value;
            assert!(decode_page(bad).is_err());
        }
    }

    #[test]
    fn mcp_status_normalizes_only_actual_rows_and_preserves_tools() {
        for auth in ["unsupported", "notLoggedIn", "bearerToken", "oAuth", "unknown"] {
            let mut r = row();
            r["authStatus"] = json!(auth);
            let (rows, cursor) = decode_page(json!({"data":[r.clone()],"nextCursor":""})).unwrap();
            assert_eq!(cursor, None);
            assert_eq!(rows[0].status, if auth == "notLoggedIn" { McpStatus::NeedsAuth } else { McpStatus::Failed });
            r["serverInfo"] = json!({"name":"s","version":"1"});
            assert_eq!(decode_page(json!({"data":[r],"nextCursor":null})).unwrap().0[0].status, McpStatus::Connected);
        }
        let mut r = row();
        r["tools"] = json!({"x":{"name":"inspect","description":"read","annotations":{"readOnly":true,"destructive":false,"openWorld":false}}});
        let rows = decode_page(json!({"data":[r],"nextCursor":null})).unwrap().0;
        assert_eq!(serde_json::to_value(&rows).unwrap(), json!([{"name":"example","status":"connected","tools":[{"name":"inspect","description":"read","annotations":{"readOnly":true,"destructive":false,"openWorld":false}}]}]));
        assert!(decode_page(json!({"data":[],"nextCursor":null})).unwrap().0.is_empty());
    }

    #[test]
    fn mcp_status_receiver_rejects_already_queued_success_after_deadline() {
        let (tx, result) = mpsc::channel();
        tx.send(Ok(vec![])).unwrap();
        let reply = StatusReply { deadline: Instant::now() - Duration::from_millis(1), result };
        assert_eq!(reply.receive(), Err(TIMED_OUT.into()));
    }
}
