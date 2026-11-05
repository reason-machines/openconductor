//! Turning `session/update` notifications from `reason acp` into provider
//! events, and Reason's quirks into something a chat can show.
//!
//! What `reason acp` sends (CLI 0.2.665 bundle, verified live on 0.2.678):
//!
//! * Text and reasoning stream as `agent_message_chunk` /
//!   `agent_thought_chunk`; a chunk can split mid-word.
//! * An error Reason hits while starting or following a turn is sent as an
//!   ordinary `agent_message_chunk` holding the whole notice, then the turn
//!   ends with `end_turn`. A failed API call reads `Reason request failed
//!   (404 device_not_found)` or `<detail> (<code>)`. [`classify_notice`]
//!   picks these out so they show as errors, not as a reply.
//! * A `user_message_chunk` during a live turn is someone else's message
//!   (a child Session's report), not the user's input: [`AgentEvent::Report`].
//! * Tool rows are `tool_call` then `tool_call_update` with the same
//!   `toolCallId`; each update carries the whole row.
//! * Paths in diffs and locations are absolute: under the chat's folder for
//!   work on this computer, or under a cloud computer's
//!   `/home/runner/.reason/workspace/sessions/<session id>/repo` (the id is
//!   the Session doing the work, often a child). [`map_path`] relates both to
//!   the workspace.
//! * After the Session moves to Reason cloud, `reason acp` (0.2.683, seen in
//!   a signed-in run) reports the cloud checkout's files under the chat's
//!   folder too: a cloud write of `/home/runner/.../sessions/<id>/repo/a.txt`
//!   arrives as `<cwd>/a.txt`. Only `session_info_update`'s
//!   `_meta["com.reasonmachines/computer"].kind` says where the Session runs
//!   (`cloud`, `headless`, ...); [`computer_is_cloud`] reads it, and paths
//!   under the folder are then the cloud Session's checkout.

use serde_json::Value;
use std::path::Path;

/// Root of a Reason cloud computer's per-Session checkouts.
pub const CLOUD_SESSIONS_ROOT: &str = "/home/runner/.reason/workspace/sessions/";

#[derive(Debug, Clone, PartialEq)]
pub enum AgentEvent {
    /// Assistant reply text to append.
    Text(String),
    /// Reasoning text to append.
    Thought(String),
    /// A tool row to insert or replace by `id`.
    Tool(ToolRow),
    /// The Session's title changed.
    Title(String),
    /// A message from another Session (e.g. a child's report), mid-turn.
    Report(String),
    /// The user's own earlier message, replayed by `session/load`.
    UserReplay(String),
    /// An error Reason sent as a message.
    Error(ReasonError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReasonError {
    /// Reason's error code, e.g. `device_not_found`, when it gave one.
    pub code: Option<String>,
    /// HTTP status, when the text carried one.
    pub status: Option<u16>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolRow {
    pub id: String,
    pub title: String,
    /// ACP tool kind: read, edit, search, execute, fetch, other.
    pub kind: String,
    pub status: ToolStatus,
    /// Output text (Reason wraps it in a code fence).
    pub output: Option<String>,
    pub diffs: Vec<Diff>,
    pub locations: Vec<MappedPath>,
    /// The provider's own tool name (`Grep`, `Read`, ...), when it says.
    pub tool_name: Option<String>,
    /// The tool's input as the provider sent it, when it did.
    pub raw_input: Option<Value>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Diff {
    pub path: MappedPath,
    /// `None` for a new file.
    pub old_text: Option<String>,
    pub new_text: String,
}

/// Where a path reported by the agent lives.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Place {
    /// Inside the chat's folder on this computer.
    Local,
    /// In a cloud Session's checkout of the repository.
    Cloud { session_id: String },
    /// Anywhere else.
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MappedPath {
    /// The path as the agent sent it.
    pub raw: String,
    pub place: Place,
    /// Repository-relative path for `Local` and `Cloud` (`""` for the
    /// root), so the same file lines up in either place.
    pub relative: Option<String>,
}

/// Relates an agent path to the workspace folder `cwd`.
pub fn map_path(raw: &str, cwd: &Path) -> MappedPath {
    let relative_to = |root: &str| -> Option<String> {
        let rest = raw.strip_prefix(root)?;
        match rest.strip_prefix('/') {
            Some(rel) => Some(rel.trim_end_matches('/').to_string()),
            None if rest.is_empty() => Some(String::new()),
            None => None,
        }
    };
    let cwd = cwd.to_string_lossy();
    if let Some(rel) = relative_to(cwd.trim_end_matches('/')) {
        return MappedPath {
            raw: raw.into(),
            place: Place::Local,
            relative: Some(rel),
        };
    }
    let cloud_id = raw
        .strip_prefix(CLOUD_SESSIONS_ROOT)
        .and_then(|r| r.split_once('/'))
        .map(|(id, _)| id)
        .filter(|id| !id.is_empty());
    if let Some(id) = cloud_id {
        if let Some(rel) = relative_to(&format!("{CLOUD_SESSIONS_ROOT}{id}/repo")) {
            return MappedPath {
                raw: raw.into(),
                place: Place::Cloud {
                    session_id: id.into(),
                },
                relative: Some(rel),
            };
        }
    }
    MappedPath {
        raw: raw.into(),
        place: Place::Other,
        relative: None,
    }
}

/// Recognises an error notice sent as message text. Only a whole notice
/// matches: one line ending in `(snake_code)`, or Reason's `Reason request
/// failed (STATUS code)` form.
pub fn classify_notice(text: &str) -> Option<ReasonError> {
    let line = text.trim();
    if line.is_empty() || line.contains('\n') || line.len() > 1000 {
        return None;
    }
    if let Some(inner) = line
        .strip_prefix("Reason request failed (")
        .and_then(|r| r.split(')').next())
    {
        let mut parts = inner.split_whitespace();
        let status = parts.next().and_then(|s| s.parse().ok());
        return Some(ReasonError {
            code: parts.next().map(str::to_string),
            status,
            message: line.into(),
        });
    }
    let (message, code) = line.strip_suffix(')')?.rsplit_once(" (")?;
    let snake = code.split('_').count() >= 2
        && code.split('_').all(|w| {
            !w.is_empty()
                && w.bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        });
    snake.then(|| ReasonError {
        code: Some(code.into()),
        status: None,
        message: message.into(),
    })
}

/// What [`parse_update`] needs to know about the chat.
#[derive(Debug, Clone, Copy)]
pub struct UpdateContext<'a> {
    /// The workspace folder the Session was opened with.
    pub cwd: &'a Path,
    /// A prompt is in flight (so a user chunk is a report, not a replay).
    pub turn_running: bool,
    /// The last event was reply text. A notice always starts a new block:
    /// it is the turn's first text, follows a tool row, or Reason prefixes
    /// it with a newline.
    pub in_text: bool,
    /// The Session's id while it runs on Reason cloud: paths under `cwd`
    /// are then that Session's cloud checkout, not this computer's folder.
    pub cloud_session: Option<&'a str>,
}

/// Where a `session_info_update` says the Session now runs: `Some(true)` on
/// Reason cloud, `Some(false)` on a computer, `None` when it does not say.
pub fn computer_is_cloud(update: &Value) -> Option<bool> {
    if update["sessionUpdate"].as_str()? != "session_info_update" {
        return None;
    }
    let kind = update["_meta"]["com.reasonmachines/computer"]["kind"].as_str()?;
    Some(kind == "cloud")
}

/// Parses one `session/update` `update` object. Kinds a chat does not show
/// (plans, usage, commands, config) give `None`.
pub fn parse_update(update: &Value, ctx: UpdateContext) -> Option<AgentEvent> {
    let text = || update["content"]["text"].as_str().map(str::to_string);
    match update["sessionUpdate"].as_str()? {
        "agent_message_chunk" => {
            let t = text()?;
            let starts_block = !ctx.in_text || t.starts_with('\n');
            Some(match classify_notice(&t).filter(|_| starts_block) {
                Some(err) => AgentEvent::Error(err),
                None => AgentEvent::Text(t),
            })
        }
        "agent_thought_chunk" => text().map(AgentEvent::Thought),
        "user_message_chunk" if ctx.turn_running => text().map(AgentEvent::Report),
        "user_message_chunk" => text().map(AgentEvent::UserReplay),
        "session_info_update" => update["title"]
            .as_str()
            .map(|t| AgentEvent::Title(t.into())),
        "tool_call" | "tool_call_update" => Some(AgentEvent::Tool(tool_row(update, ctx)?)),
        _ => None,
    }
}

fn tool_row(u: &Value, ctx: UpdateContext) -> Option<ToolRow> {
    let map = |raw: &str| {
        let mut p = map_path(raw, ctx.cwd);
        if let (Place::Local, Some(id)) = (&p.place, ctx.cloud_session) {
            p.place = Place::Cloud {
                session_id: id.into(),
            };
        }
        p
    };
    let status = match u["status"].as_str() {
        Some("in_progress") => ToolStatus::Running,
        Some("completed") => ToolStatus::Completed,
        Some("failed") => ToolStatus::Failed,
        _ => ToolStatus::Pending,
    };
    let mut row = ToolRow {
        id: u["toolCallId"].as_str()?.into(),
        title: u["title"].as_str().unwrap_or_default().into(),
        kind: u["kind"].as_str().unwrap_or("other").into(),
        status,
        output: None,
        diffs: Vec::new(),
        locations: Vec::new(),
        tool_name: [
            &u["_meta"]["claudeCode"]["toolName"],
            &u["_meta"]["toolName"],
        ]
        .into_iter()
        .find_map(Value::as_str)
        .map(str::to_string),
        raw_input: Some(u["rawInput"].clone()).filter(|v| !v.is_null()),
    };
    for item in u["content"].as_array().into_iter().flatten() {
        match item["type"].as_str() {
            Some("diff") => row.diffs.push(Diff {
                path: map(item["path"].as_str().unwrap_or_default()),
                old_text: item["oldText"].as_str().map(str::to_string),
                new_text: item["newText"].as_str().unwrap_or_default().into(),
            }),
            Some("content") => {
                if let Some(t) = item["content"]["text"].as_str() {
                    row.output.get_or_insert_with(String::new).push_str(t);
                }
            }
            _ => {}
        }
    }
    for loc in u["locations"].as_array().into_iter().flatten() {
        if let Some(p) = loc["path"].as_str() {
            row.locations.push(map(p));
        }
    }
    Some(row)
}
