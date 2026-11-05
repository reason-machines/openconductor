//! Claude Code's stream-json events as the chat events the UI already
//! renders for Reason ([`crate::reason_acp::wire`]).
//!
//! Pure: one [`TurnMapper`] per chat turns each [`ClaudeEvent`] into zero or
//! more [`ProviderEvent`]s. What it relies on, from the `claude` CLI's real
//! output (recorded in `evidence/claude-code/`):
//!
//! - `system/init` arrives after the first user message, once per process;
//!   its `session_id` is what `--resume` takes.
//! - An `assistant` event carries one message's content blocks (`text`,
//!   `thinking`, `tool_use`); several events can share a message id.
//! - A `user` event carries `tool_result` blocks for earlier `tool_use` ids.
//! - An API failure (usage limit, auth) is an `assistant` event with
//!   `is_api_error_message: true` whose text is the error, then a `result`
//!   with `is_error: true`. It must fail the turn, not read as a reply.
//! - `result` ends the turn. After an interrupt it still arrives, so a turn
//!   the user stopped ends as cancelled whatever the result says.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::agent::claude_stream::{ClaudeEvent, TurnResult};
use crate::reason_acp::provider::{ProviderEvent, TurnEnd};
use crate::reason_acp::updates::{
    map_path, AgentEvent, Diff, MappedPath, ReasonError, ToolRow, ToolStatus,
};

/// Turns one chat's Claude events into chat events.
pub struct TurnMapper {
    cwd: PathBuf,
    session_id: Option<String>,
    /// Tool rows by `tool_use` id, so a result updates the row it belongs to.
    tools: HashMap<String, ToolRow>,
    /// Message id of the last text emitted in this turn.
    last_text_message: Option<String>,
    /// The last event emitted was text (no tool or thought since).
    in_text: bool,
    /// Set by [`TurnMapper::stop_requested`]; reset when a turn ends.
    stopping: bool,
    /// An API error the CLI sent as an assistant message this turn.
    api_error: Option<ReasonError>,
}

impl TurnMapper {
    /// `session_id` is the Claude session being resumed, if any: its
    /// `system/init` then announces nothing new.
    pub fn new(cwd: impl Into<PathBuf>, session_id: Option<String>) -> Self {
        Self {
            cwd: cwd.into(),
            session_id,
            tools: HashMap::new(),
            last_text_message: None,
            in_text: false,
            stopping: false,
            api_error: None,
        }
    }

    pub fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }

    /// The user pressed Stop: the turn's result ends it as cancelled.
    pub fn stop_requested(&mut self) {
        self.stopping = true;
    }

    /// A new turn starts.
    pub fn turn_started(&mut self) {
        self.last_text_message = None;
        self.in_text = false;
        self.stopping = false;
        self.api_error = None;
    }

    pub fn map(&mut self, event: &ClaudeEvent) -> Vec<ProviderEvent> {
        match event {
            ClaudeEvent::Init { session_id, .. } => {
                if self.session_id.as_deref() == Some(session_id) {
                    return Vec::new();
                }
                self.session_id = Some(session_id.clone());
                vec![ProviderEvent::SessionStarted {
                    session_id: session_id.clone(),
                }]
            }
            ClaudeEvent::Assistant {
                message,
                api_error: Some(e),
            } => {
                let error = ReasonError {
                    code: e.code.clone(),
                    status: e.status,
                    message: blocks(message)
                        .filter(|b| b["type"] == "text")
                        .filter_map(|b| b["text"].as_str())
                        .collect::<Vec<_>>()
                        .join("\n"),
                };
                self.api_error = Some(error.clone());
                vec![ProviderEvent::Agent(AgentEvent::Error(error))]
            }
            ClaudeEvent::Assistant {
                message,
                api_error: None,
            } => self.assistant(message),
            ClaudeEvent::ToolResults { message } => self.tool_results(message),
            ClaudeEvent::Result(result) => vec![ProviderEvent::TurnEnded(self.turn_end(result))],
            _ => Vec::new(),
        }
    }

    fn turn_end(&mut self, r: &TurnResult) -> TurnEnd {
        let end = if self.stopping {
            TurnEnd::Cancelled
        } else if r.is_error || r.subtype != "success" {
            let message = r
                .text
                .clone()
                .filter(|t| !t.trim().is_empty())
                .or_else(|| self.api_error.as_ref().map(|e| e.message.clone()))
                .unwrap_or_else(|| format!("Claude Code ended the turn: {}", r.subtype));
            TurnEnd::Failed(message)
        } else {
            TurnEnd::Completed
        };
        self.turn_started();
        end
    }

    fn assistant(&mut self, message: &Value) -> Vec<ProviderEvent> {
        let id = message["id"].as_str().map(str::to_owned);
        let mut out = Vec::new();
        for block in blocks(message) {
            match block["type"].as_str() {
                Some("text") => {
                    let Some(text) = block["text"].as_str().filter(|t| !t.is_empty()) else {
                        continue;
                    };
                    // A new message's text after earlier text starts a new paragraph.
                    let sep = self.in_text && self.last_text_message != id;
                    let text = if sep {
                        format!("\n\n{text}")
                    } else {
                        text.to_owned()
                    };
                    self.in_text = true;
                    self.last_text_message = id.clone();
                    out.push(ProviderEvent::Agent(AgentEvent::Text(text)));
                }
                Some("thinking") => {
                    let Some(text) = block["thinking"].as_str().filter(|t| !t.is_empty()) else {
                        continue;
                    };
                    self.in_text = false;
                    out.push(ProviderEvent::Agent(AgentEvent::Thought(text.to_owned())));
                }
                Some("tool_use") => {
                    let Some(tool_id) = block["id"].as_str() else {
                        continue;
                    };
                    self.in_text = false;
                    let name = block["name"].as_str().unwrap_or("tool");
                    let row = tool_row(tool_id, name, &block["input"], &self.cwd);
                    self.tools.insert(tool_id.to_owned(), row.clone());
                    out.push(ProviderEvent::Agent(AgentEvent::Tool(row)));
                }
                _ => {}
            }
        }
        out
    }

    fn tool_results(&mut self, message: &Value) -> Vec<ProviderEvent> {
        let mut out = Vec::new();
        for block in blocks(message).filter(|b| b["type"] == "tool_result") {
            let Some(id) = block["tool_use_id"].as_str() else {
                continue;
            };
            let Some(row) = self.tools.get_mut(id) else {
                continue;
            };
            let failed = block["is_error"].as_bool().unwrap_or(false);
            row.status = if failed {
                ToolStatus::Failed
            } else {
                ToolStatus::Completed
            };
            row.output = Some(result_text(&block["content"]));
            out.push(ProviderEvent::Agent(AgentEvent::Tool(row.clone())));
        }
        out
    }
}

fn blocks(message: &Value) -> impl Iterator<Item = &Value> {
    message["content"].as_array().into_iter().flatten()
}

/// A tool result's content: a string, or text blocks.
fn result_text(content: &Value) -> String {
    match content {
        Value::String(s) => s.clone(),
        Value::Array(items) => items
            .iter()
            .filter_map(|b| b["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// ACP-style tool kind for a Claude Code tool name.
pub fn tool_kind(name: &str) -> &'static str {
    match name {
        "Bash" | "BashOutput" | "KillShell" | "KillBash" => "execute",
        "Read" | "NotebookRead" => "read",
        "Write" | "Edit" | "MultiEdit" | "NotebookEdit" => "edit",
        "Grep" | "Glob" | "LS" => "search",
        "WebFetch" | "WebSearch" => "fetch",
        "Task" | "Agent" => "think",
        _ => "other",
    }
}

const PATH_KEYS: [&str; 3] = ["file_path", "notebook_path", "path"];

fn tool_row(id: &str, name: &str, input: &Value, cwd: &Path) -> ToolRow {
    let str_of = |k: &str| input.get(k).and_then(Value::as_str);
    let locations: Vec<MappedPath> = PATH_KEYS
        .iter()
        .filter_map(|k| str_of(k))
        .map(|p| map_path(&absolute(p, cwd), cwd))
        .collect();
    let shown_path = locations.first().map(|p| {
        p.relative
            .clone()
            .filter(|r| !r.is_empty())
            .unwrap_or_else(|| p.raw.clone())
    });
    let detail = str_of("command")
        .map(str::to_owned)
        .or(shown_path)
        .or_else(|| str_of("pattern").map(str::to_owned))
        .or_else(|| str_of("url").map(str::to_owned))
        .or_else(|| str_of("query").map(str::to_owned))
        .or_else(|| str_of("description").map(str::to_owned));
    let title = match detail {
        Some(d) => format!("{name}: {}", first_line(&d)),
        None => name.to_owned(),
    };
    let diffs = match (name, locations.first()) {
        ("Write", Some(path)) => vec![Diff {
            path: path.clone(),
            old_text: None,
            new_text: str_of("content").unwrap_or_default().to_owned(),
        }],
        ("Edit", Some(path)) => vec![Diff {
            path: path.clone(),
            old_text: str_of("old_string").map(str::to_owned),
            new_text: str_of("new_string").unwrap_or_default().to_owned(),
        }],
        _ => Vec::new(),
    };
    ToolRow {
        id: id.to_owned(),
        title,
        kind: tool_kind(name).to_owned(),
        status: ToolStatus::Running,
        output: None,
        diffs,
        locations,
    }
}

fn absolute(p: &str, cwd: &Path) -> String {
    if Path::new(p).is_absolute() {
        p.to_owned()
    } else {
        cwd.join(p).display().to_string()
    }
}

fn first_line(s: &str) -> &str {
    s.lines().next().unwrap_or("")
}
