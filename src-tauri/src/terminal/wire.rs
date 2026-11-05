//! IPC payloads for the `pty_*` commands, kept free of Tauri types so the
//! harness tests them.
//!
//! The webview sends a [`SpawnArgs`] to `pty_spawn` and listens on
//! [`EVENT`] for [`WireEvent`]s. Output bytes travel base64-encoded so a
//! UTF-8 sequence split across two reads reaches the renderer intact; the
//! renderer decodes to bytes and acks their decoded length.

use std::collections::BTreeMap;
use std::path::PathBuf;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::{Deserialize, Serialize};

use super::spawn::{Program, PtyEvent, SpawnRequest};

/// Event name every terminal event is emitted on; payloads carry the id.
pub const EVENT: &str = "pty-event";

/// Arguments of `pty_spawn`, camelCase on the JS side.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpawnArgs {
    /// Caller-chosen id (the tab id). Generated when absent.
    pub id: Option<String>,
    pub cwd: PathBuf,
    /// argv to run instead of the login shell.
    pub command: Option<Vec<String>>,
    pub env: Option<BTreeMap<String, String>>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    /// Typed into a new tab after spawn; blank means none.
    pub initial_command: Option<String>,
    /// Approximate bytes of history to keep.
    pub scrollback_limit: Option<usize>,
}

impl SpawnArgs {
    pub fn into_request(self) -> SpawnRequest {
        let mut req = match self.command {
            Some(argv) => SpawnRequest {
                program: Program::Argv(argv),
                ..SpawnRequest::shell(self.cwd)
            },
            None => SpawnRequest::shell(self.cwd),
        };
        req.id = self.id;
        req.env = self.env.unwrap_or_default().into_iter().collect();
        req.cols = self.cols.unwrap_or(req.cols);
        req.rows = self.rows.unwrap_or(req.rows);
        req.initial_command = self.initial_command.filter(|c| !c.trim().is_empty());
        req.scrollback_limit = self.scrollback_limit.unwrap_or(req.scrollback_limit);
        req
    }
}

// Screen and mirror commands take one `args` object, as the reference's
// webview sends them (`invoke("pty_screen_text", { args: { id, maxLines } })`).

/// `pty_screen_snapshot` and `pty_delete_mirror`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdArgs {
    pub id: String,
}

/// `pty_screen_text`. The reference's callers pass
/// `Number.MAX_SAFE_INTEGER` for everything; `null` also means everything.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScreenTextArgs {
    pub id: String,
    pub max_lines: Option<u64>,
}

impl ScreenTextArgs {
    pub fn max_lines(&self) -> usize {
        self.max_lines
            .map_or(usize::MAX, |n| usize::try_from(n).unwrap_or(usize::MAX))
    }
}

/// `pty_create_mirror`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateMirrorArgs {
    pub id: String,
    pub cols: u16,
    pub rows: u16,
    pub max_buffered_bytes: Option<u64>,
}

impl CreateMirrorArgs {
    pub fn max_buffered_bytes(&self) -> Option<usize> {
        self.max_buffered_bytes
            .map(|n| usize::try_from(n).unwrap_or(usize::MAX))
    }
}

/// `pty_resize_mirror`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResizeMirrorArgs {
    pub id: String,
    pub cols: u16,
    pub rows: u16,
}

/// `pty_write_mirror`: output text to feed the screen.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WriteMirrorArgs {
    pub id: String,
    pub data: String,
}

/// A [`PtyEvent`] as the webview receives it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum WireEvent {
    Ready {
        id: String,
        pid: Option<u32>,
    },
    Data {
        id: String,
        /// Base64 of the raw output bytes.
        data: String,
    },
    Exit {
        id: String,
        exit_code: u32,
        signal: Option<String>,
    },
}

impl From<PtyEvent> for WireEvent {
    fn from(e: PtyEvent) -> Self {
        match e {
            PtyEvent::Ready { id, pid } => Self::Ready { id, pid },
            PtyEvent::Data { id, data } => Self::Data {
                id,
                data: encode(&data),
            },
            PtyEvent::Exit {
                id,
                exit_code,
                signal,
            } => Self::Exit {
                id,
                exit_code,
                signal,
            },
        }
    }
}

/// Base64 for output bytes (data events and history).
pub fn encode(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn spawn_args_fill_defaults_and_drop_blank_initial_command() {
        let args: SpawnArgs = serde_json::from_value(json!({
            "id": "tab-1",
            "cwd": "/tmp",
            "rows": 40,
            "env": { "B": "2", "A": "1" },
            "initialCommand": "   ",
        }))
        .unwrap();
        let req = args.into_request();
        assert_eq!(req.id.as_deref(), Some("tab-1"));
        assert_eq!(req.cwd, PathBuf::from("/tmp"));
        assert_eq!(req.program, Program::LoginShell);
        assert_eq!((req.cols, req.rows), (80, 40));
        assert_eq!(
            req.env,
            vec![("A".into(), "1".into()), ("B".into(), "2".into())]
        );
        assert_eq!(req.initial_command, None);
        assert_eq!(
            req.scrollback_limit,
            SpawnRequest::shell("/").scrollback_limit
        );
    }

    #[test]
    fn spawn_args_take_a_command_and_reject_unknown_fields() {
        let args: SpawnArgs = serde_json::from_value(json!({
            "cwd": "/tmp",
            "command": ["npm", "run", "dev"],
            "initialCommand": "ls",
            "scrollbackLimit": 4096,
        }))
        .unwrap();
        let req = args.into_request();
        assert_eq!(
            req.program,
            Program::Argv(vec!["npm".into(), "run".into(), "dev".into()])
        );
        assert_eq!(req.initial_command.as_deref(), Some("ls"));
        assert_eq!(req.scrollback_limit, 4096);

        let bad = serde_json::from_value::<SpawnArgs>(json!({ "cwd": "/", "shell": "zsh" }));
        assert!(bad.is_err());
    }

    #[test]
    fn screen_and_mirror_args_take_the_reference_shapes() {
        let text: ScreenTextArgs = serde_json::from_value(json!({
            "id": "t",
            "maxLines": 9_007_199_254_740_991u64,
        }))
        .unwrap();
        assert_eq!(text.max_lines(), 9_007_199_254_740_991);
        let all: ScreenTextArgs =
            serde_json::from_value(json!({ "id": "t", "maxLines": null })).unwrap();
        assert_eq!(all.max_lines(), usize::MAX);

        let create: CreateMirrorArgs = serde_json::from_value(json!({
            "id": "remote-terminal-mirror:s1",
            "cols": 100,
            "rows": 30,
            "maxBufferedBytes": 1_048_576,
        }))
        .unwrap();
        assert_eq!((create.cols, create.rows), (100, 30));
        assert_eq!(create.max_buffered_bytes(), Some(1_048_576));
        let create: CreateMirrorArgs =
            serde_json::from_value(json!({ "id": "m", "cols": 80, "rows": 24 })).unwrap();
        assert_eq!(create.max_buffered_bytes(), None);

        let write: WriteMirrorArgs =
            serde_json::from_value(json!({ "id": "m", "data": "hi\r\n" })).unwrap();
        assert_eq!(write.data, "hi\r\n");
        let resize: ResizeMirrorArgs =
            serde_json::from_value(json!({ "id": "m", "cols": 1, "rows": 2 })).unwrap();
        assert_eq!((resize.cols, resize.rows), (1, 2));
        let id: IdArgs = serde_json::from_value(json!({ "id": "m" })).unwrap();
        assert_eq!(id.id, "m");

        assert!(serde_json::from_value::<IdArgs>(json!({ "id": "m", "x": 1 })).is_err());
        assert!(serde_json::from_value::<ScreenTextArgs>(json!({ "maxLines": 5 })).is_err());
    }

    #[test]
    fn events_serialize_tagged_camel_case_with_base64_data() {
        let ready = WireEvent::from(PtyEvent::Ready {
            id: "t".into(),
            pid: Some(7),
        });
        assert_eq!(
            serde_json::to_value(ready).unwrap(),
            json!({ "kind": "ready", "id": "t", "pid": 7 })
        );

        // A split UTF-8 sequence survives: the bytes, not lossy text, are sent.
        let data = WireEvent::from(PtyEvent::Data {
            id: "t".into(),
            data: vec![b'h', 0xC3],
        });
        assert_eq!(
            serde_json::to_value(data).unwrap(),
            json!({ "kind": "data", "id": "t", "data": "aMM=" })
        );

        let exit = WireEvent::from(PtyEvent::Exit {
            id: "t".into(),
            exit_code: 130,
            signal: Some("SIGINT".into()),
        });
        assert_eq!(
            serde_json::to_value(exit).unwrap(),
            json!({ "kind": "exit", "id": "t", "exitCode": 130, "signal": "SIGINT" })
        );
    }
}
