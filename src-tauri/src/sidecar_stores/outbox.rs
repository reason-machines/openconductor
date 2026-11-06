//! Durable session event outbox (`sidecar-v2-session-event-outbox/`).
//!
//! Agent events (`agent`, `userMessage`, `checkpointCreated`) are enqueued
//! here before they are delivered to the frontend and removed when the
//! frontend acknowledges them, so events survive a frontend reload or an app
//! restart and are replayed head-first per session. Port of Conductor
//! 0.87.6's sidecar outbox (`Lc6` in `conductor-runtime.js`):
//!
//! * One file per session: `<base64url(UTF-16LE session id)>.json` holding
//!   `{"version":1,"sessionId","nextSequence","pending":[entry...]}`; an
//!   entry is `{sessionId, eventId, eventType, event, workspaceDir?,
//!   notificationIndex?, sequence, persistedAt}`.
//! * Every change rewrites the whole file: `<file>.<unique>.tmp` created with
//!   mode 0600, fsynced, renamed over the file, then the directory fsynced.
//!   A failed directory sync after the rename still keeps the change but
//!   marks the session `durabilityUncertain` and blocks it.
//! * On open, a file that fails to parse or validate blocks its session
//!   (`corruptPersistedState`); files with non-canonical names are ignored.
//! * Acknowledgements must name the head event (`notHead` otherwise).
//! * A root can be open once per process.

use super::time;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

/// The only state file version Conductor writes.
pub const STATE_VERSION: u32 = 1;

/// Event types the sidecar backs up (`kp5`).
pub const BACKED_UP_EVENT_TYPES: [&str; 3] = ["agent", "userMessage", "checkpointCreated"];

/// Whether an event of this type goes through the outbox.
pub fn is_backed_up(event_type: &str) -> bool {
    BACKED_UP_EVENT_TYPES.contains(&event_type)
}

/// One pending event, as stored.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboxEntry {
    pub session_id: String,
    pub event_id: String,
    pub event_type: String,
    pub event: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notification_index: Option<Value>,
    pub sequence: Value,
    pub persisted_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    version: u32,
    session_id: String,
    next_sequence: Value,
    pending: Vec<OutboxEntry>,
}

#[derive(Debug, Clone)]
struct SessionState {
    session_id: String,
    next_sequence: u64,
    pending: Vec<OutboxEntry>,
}

/// Why a session is blocked; its events are no longer read or written.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BlockReason {
    CorruptPersistedState,
    DurabilityUncertain,
}

impl BlockReason {
    pub fn as_str(self) -> &'static str {
        match self {
            BlockReason::CorruptPersistedState => "corruptPersistedState",
            BlockReason::DurabilityUncertain => "durabilityUncertain",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum EnqueueOutcome {
    Enqueued(Box<OutboxEntry>),
    /// The same event (same payload, workspace and index) is already pending.
    Duplicate,
    /// Another event with this id is pending.
    Conflict,
    Blocked(BlockReason),
    /// Written, but the directory sync failed; the session is now blocked.
    DurabilityUncertain,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AcknowledgeOutcome {
    Acknowledged,
    UnknownEvent,
    NotHead { head_event_id: String },
    Blocked(BlockReason),
    DurabilityUncertain,
}

/// A session with pending events (`listHeads`).
#[derive(Debug, Clone, PartialEq)]
pub struct SessionHead {
    pub session_id: String,
    pub pending_count: usize,
    pub head: OutboxEntry,
}

#[derive(Debug)]
pub enum OutboxError {
    Io(io::Error),
    AlreadyOpen(PathBuf),
    Closed,
}

impl std::fmt::Display for OutboxError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OutboxError::Io(e) => write!(f, "{e}"),
            OutboxError::AlreadyOpen(p) => {
                write!(
                    f,
                    "Session event outbox root is already open: {}",
                    p.display()
                )
            }
            OutboxError::Closed => f.write_str("Session event outbox is closed"),
        }
    }
}

impl std::error::Error for OutboxError {}

impl From<io::Error> for OutboxError {
    fn from(e: io::Error) -> Self {
        OutboxError::Io(e)
    }
}

/// File name of a session's state: base64url (no padding) of the id's
/// UTF-16LE bytes, plus `.json` (`zc6`).
pub fn state_file_name(session_id: &str) -> String {
    let bytes: Vec<u8> = session_id
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect();
    format!("{}.json", URL_SAFE_NO_PAD.encode(bytes))
}

/// Session id of a state file name, only when the name is canonical (`_v8`).
pub fn session_id_from_file_name(name: &str) -> Option<String> {
    let stem = name.strip_suffix(".json")?;
    let bytes = URL_SAFE_NO_PAD.decode(stem).ok()?;
    if bytes.len() % 2 != 0 {
        return None;
    }
    let units: Vec<u16> = bytes
        .chunks(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    let id = String::from_utf16(&units).ok()?;
    (state_file_name(&id) == name).then_some(id)
}

fn open_roots() -> &'static Mutex<HashSet<PathBuf>> {
    static ROOTS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    ROOTS.get_or_init(Default::default)
}

fn non_negative_int(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| {
        v.as_f64()
            .filter(|f| *f >= 0.0 && f.fract() == 0.0)
            .map(|f| f as u64)
    })
}

fn event_identity(event: &Value) -> Option<(&str, &str)> {
    Some((
        event.get("eventId")?.as_str()?,
        event.get("type")?.as_str()?,
    ))
}

/// Validates a stored session the way `vv8` does.
fn validate(stored: StoredSession, file_session_id: &str) -> Result<SessionState, &'static str> {
    if stored.version != STATE_VERSION {
        return Err("unsupported version");
    }
    let next = non_negative_int(&stored.next_sequence);
    let next = match next {
        Some(n) if stored.session_id == file_session_id => n,
        _ => return Err("Invalid persisted session identity or sequence"),
    };
    let mut prior: i128 = -1;
    let mut ids = HashSet::new();
    for e in &stored.pending {
        let ok = event_identity(&e.event).is_some_and(|(id, ty)| {
            e.session_id == stored.session_id && id == e.event_id && ty == e.event_type
        }) && non_negative_int(&e.sequence)
            .is_some_and(|s| i128::from(s) > prior && s < next)
            && e.notification_index
                .as_ref()
                .is_none_or(|n| non_negative_int(n).is_some())
            && time::parse_iso(&e.persisted_at).is_some()
            && ids.insert(e.event_id.clone());
        if !ok {
            return Err("Invalid persisted event");
        }
        prior = i128::from(non_negative_int(&e.sequence).unwrap_or(0));
    }
    Ok(SessionState {
        session_id: stored.session_id,
        next_sequence: next,
        pending: stored.pending,
    })
}

#[derive(Default)]
struct Inner {
    sessions: HashMap<String, SessionState>,
    blocked: HashMap<String, BlockReason>,
    closed: bool,
}

/// An open outbox root. Methods are serialized by one lock, which also
/// gives Conductor's per-session ordering.
pub struct SessionEventOutbox {
    root: PathBuf,
    inner: Mutex<Inner>,
    now: Box<dyn Fn() -> i64 + Send + Sync>,
}

impl std::fmt::Debug for SessionEventOutbox {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SessionEventOutbox")
            .field("root", &self.root)
            .finish()
    }
}

fn sync_dir(path: &Path) -> io::Result<()> {
    File::open(path)?.sync_all()
}

impl SessionEventOutbox {
    /// Creates the root if needed and loads every session in it.
    pub fn open(root: &Path) -> Result<Self, OutboxError> {
        Self::open_with_clock(root, Box::new(time::now_ms))
    }

    /// [`open`](Self::open) with a clock for `persistedAt`.
    pub fn open_with_clock(
        root: &Path,
        now: Box<dyn Fn() -> i64 + Send + Sync>,
    ) -> Result<Self, OutboxError> {
        fs::create_dir_all(root)?;
        if let Some(parent) = root.parent().filter(|p| !p.as_os_str().is_empty()) {
            sync_dir(parent)?;
        }
        let real = fs::canonicalize(root)?;
        if !open_roots()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(real.clone())
        {
            return Err(OutboxError::AlreadyOpen(real));
        }
        let mut inner = Inner::default();
        let entries = match fs::read_dir(&real) {
            Ok(entries) => entries,
            Err(e) => {
                open_roots()
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(&real);
                return Err(e.into());
            }
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.ends_with(".json") {
                continue;
            }
            let Some(id) = session_id_from_file_name(&name) else {
                eprintln!("[sessionEventOutbox] Ignoring non-canonical state filename {name}");
                continue;
            };
            let loaded = fs::read_to_string(entry.path())
                .map_err(|e| e.to_string())
                .and_then(|text| {
                    serde_json::from_str::<StoredSession>(&text).map_err(|e| e.to_string())
                })
                .and_then(|stored| validate(stored, &id).map_err(str::to_owned));
            match loaded {
                Ok(state) => {
                    inner.sessions.insert(id, state);
                }
                Err(error) => {
                    eprintln!("[sessionEventOutbox] Blocking corrupt persisted session {id} ({name}): {error}");
                    inner.blocked.insert(id, BlockReason::CorruptPersistedState);
                }
            }
        }
        Ok(SessionEventOutbox {
            root: real,
            inner: Mutex::new(inner),
            now,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Inner>, OutboxError> {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if inner.closed {
            return Err(OutboxError::Closed);
        }
        Ok(inner)
    }

    /// Writes a session's state; `Ok(false)` when the directory sync after
    /// the rename failed (durability uncertain).
    fn persist(&self, state: &SessionState) -> io::Result<bool> {
        let file = self.root.join(state_file_name(&state.session_id));
        let tmp = PathBuf::from(format!("{}.{}.tmp", file.display(), super::temp_suffix()));
        let stored = StoredSession {
            version: STATE_VERSION,
            session_id: state.session_id.clone(),
            next_sequence: Value::from(state.next_sequence),
            pending: state.pending.clone(),
        };
        let data = serde_json::to_string(&stored).map_err(io::Error::other)?;
        let write = || -> io::Result<()> {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
            let mut f = options.open(&tmp)?;
            f.write_all(data.as_bytes())?;
            f.sync_all()?;
            drop(f);
            fs::rename(&tmp, &file)
        };
        if let Err(e) = write() {
            if let Err(clean) = fs::remove_file(&tmp) {
                if clean.kind() != io::ErrorKind::NotFound {
                    eprintln!(
                        "[sessionEventOutbox] Failed to clean temporary file {}: {clean}",
                        tmp.display()
                    );
                }
            }
            eprintln!(
                "[sessionEventOutbox] Persistence failed before commit for {}: {e}",
                state.session_id
            );
            return Err(e);
        }
        match sync_dir(&self.root) {
            Ok(()) => Ok(true),
            Err(e) => {
                eprintln!(
                    "[sessionEventOutbox] Directory sync failed after commit for {}: {e}",
                    state.session_id
                );
                Ok(false)
            }
        }
    }

    /// Adds an event to the end of its session's queue.
    pub fn enqueue(
        &self,
        session_id: &str,
        event: Value,
        workspace_dir: Option<&str>,
        notification_index: Option<u64>,
    ) -> Result<EnqueueOutcome, OutboxError> {
        let mut inner = self.lock()?;
        if let Some(reason) = inner.blocked.get(session_id) {
            return Ok(EnqueueOutcome::Blocked(*reason));
        }
        let (event_id, event_type) = match event_identity(&event) {
            Some((id, ty)) => (id.to_owned(), ty.to_owned()),
            None => {
                return Err(OutboxError::Io(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "session event needs string eventId and type",
                )))
            }
        };
        let current = inner
            .sessions
            .get(session_id)
            .cloned()
            .unwrap_or(SessionState {
                session_id: session_id.to_owned(),
                next_sequence: 0,
                pending: Vec::new(),
            });
        let index = notification_index.map(Value::from);
        if let Some(existing) = current.pending.iter().find(|e| e.event_id == event_id) {
            if existing.event == event
                && existing.workspace_dir.as_deref() == workspace_dir
                && existing.notification_index == index
            {
                return Ok(EnqueueOutcome::Duplicate);
            }
            eprintln!(
                "[sessionEventOutbox] Rejecting conflicting duplicate {session_id} {event_id}"
            );
            return Ok(EnqueueOutcome::Conflict);
        }
        let entry = OutboxEntry {
            session_id: session_id.to_owned(),
            event_id,
            event_type,
            event,
            workspace_dir: workspace_dir.map(str::to_owned),
            notification_index: index,
            sequence: Value::from(current.next_sequence),
            persisted_at: time::iso((self.now)()),
        };
        let mut next = current;
        next.next_sequence += 1;
        next.pending.push(entry.clone());
        let durable = self.persist(&next)?;
        inner.sessions.insert(session_id.to_owned(), next);
        if !durable {
            inner
                .blocked
                .insert(session_id.to_owned(), BlockReason::DurabilityUncertain);
            return Ok(EnqueueOutcome::DurabilityUncertain);
        }
        Ok(EnqueueOutcome::Enqueued(Box::new(entry)))
    }

    /// Removes the session's head event once the frontend acknowledged it.
    pub fn acknowledge(
        &self,
        session_id: &str,
        event_id: &str,
    ) -> Result<AcknowledgeOutcome, OutboxError> {
        let mut inner = self.lock()?;
        if let Some(reason) = inner.blocked.get(session_id) {
            return Ok(AcknowledgeOutcome::Blocked(*reason));
        }
        let Some(state) = inner.sessions.get(session_id).cloned() else {
            return Ok(AcknowledgeOutcome::UnknownEvent);
        };
        let Some(head) = state.pending.first() else {
            return Ok(AcknowledgeOutcome::UnknownEvent);
        };
        if head.event_id != event_id {
            return Ok(if state.pending.iter().any(|e| e.event_id == event_id) {
                AcknowledgeOutcome::NotHead {
                    head_event_id: head.event_id.clone(),
                }
            } else {
                AcknowledgeOutcome::UnknownEvent
            });
        }
        let mut next = state;
        next.pending.remove(0);
        let durable = self.persist(&next)?;
        inner.sessions.insert(session_id.to_owned(), next);
        if !durable {
            inner
                .blocked
                .insert(session_id.to_owned(), BlockReason::DurabilityUncertain);
            return Ok(AcknowledgeOutcome::DurabilityUncertain);
        }
        Ok(AcknowledgeOutcome::Acknowledged)
    }

    /// The oldest pending event; `None` when there is none or the session is
    /// blocked.
    pub fn head(&self, session_id: &str) -> Result<Option<OutboxEntry>, OutboxError> {
        let inner = self.lock()?;
        if inner.blocked.contains_key(session_id) {
            return Ok(None);
        }
        Ok(inner
            .sessions
            .get(session_id)
            .and_then(|s| s.pending.first().cloned()))
    }

    pub fn pending_count(&self, session_id: &str) -> Result<usize, OutboxError> {
        Ok(self
            .lock()?
            .sessions
            .get(session_id)
            .map_or(0, |s| s.pending.len()))
    }

    /// `"ready"` or the block reason.
    pub fn session_status(&self, session_id: &str) -> Result<&'static str, OutboxError> {
        Ok(self
            .lock()?
            .blocked
            .get(session_id)
            .map_or("ready", |r| r.as_str()))
    }

    /// Every unblocked session with pending events, sorted by session id:
    /// what is replayed when the frontend connects.
    pub fn list_heads(&self) -> Result<Vec<SessionHead>, OutboxError> {
        let inner = self.lock()?;
        let mut heads: Vec<SessionHead> = inner
            .sessions
            .values()
            .filter(|s| !inner.blocked.contains_key(&s.session_id))
            .filter_map(|s| {
                Some(SessionHead {
                    session_id: s.session_id.clone(),
                    pending_count: s.pending.len(),
                    head: s.pending.first()?.clone(),
                })
            })
            .collect();
        heads.sort_by(|a, b| a.session_id.cmp(&b.session_id));
        Ok(heads)
    }

    /// Closes the outbox; the root can be opened again afterwards.
    pub fn close(&self) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if !inner.closed {
            inner.closed = true;
            open_roots()
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&self.root);
        }
    }
}

impl Drop for SessionEventOutbox {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_root(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("oc-outbox-{name}-{}", super::super::temp_suffix()));
        dir.join("sidecar-v2-session-event-outbox")
    }

    fn fixed_clock() -> Box<dyn Fn() -> i64 + Send + Sync> {
        Box::new(|| 1_793_891_465_228)
    }

    fn event(id: &str) -> Value {
        json!({ "type": "agent", "eventId": id, "payload": { "text": id } })
    }

    #[test]
    fn file_names_are_base64url_utf16le() {
        // "ab" -> 61 00 62 00 -> YQBiAA
        assert_eq!(state_file_name("ab"), "YQBiAA.json");
        let id = "session-ü/1";
        assert_eq!(
            session_id_from_file_name(&state_file_name(id)).as_deref(),
            Some(id)
        );
        assert_eq!(
            session_id_from_file_name("YQBiAA==.json"),
            None,
            "padded name is not canonical"
        );
        assert_eq!(session_id_from_file_name("YQBiAA.txt"), None);
        assert_eq!(
            session_id_from_file_name("YQB.json"),
            None,
            "odd byte count"
        );
    }

    #[test]
    fn enqueue_writes_conductors_format_and_survives_reopen() {
        let root = temp_root("format");
        let outbox = SessionEventOutbox::open_with_clock(&root, fixed_clock()).unwrap();
        let out = outbox
            .enqueue("s1", event("e1"), Some("/w"), Some(3))
            .unwrap();
        assert!(matches!(out, EnqueueOutcome::Enqueued(_)));
        outbox.enqueue("s1", event("e2"), None, None).unwrap();

        let text = fs::read_to_string(root.join(state_file_name("s1"))).unwrap();
        let v: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(
            v,
            json!({
                "version": 1, "sessionId": "s1", "nextSequence": 2,
                "pending": [
                    { "sessionId": "s1", "eventId": "e1", "eventType": "agent", "event": event("e1"),
                      "workspaceDir": "/w", "notificationIndex": 3, "sequence": 0,
                      "persistedAt": "2026-11-05T15:11:05.228Z" },
                    { "sessionId": "s1", "eventId": "e2", "eventType": "agent", "event": event("e2"),
                      "sequence": 1, "persistedAt": "2026-11-05T15:11:05.228Z" }
                ]
            })
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(root.join(state_file_name("s1")))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        let leftovers: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty());

        drop(outbox);
        let reopened = SessionEventOutbox::open(&root).unwrap();
        assert_eq!(reopened.pending_count("s1").unwrap(), 2);
        assert_eq!(reopened.head("s1").unwrap().unwrap().event_id, "e1");
        assert_eq!(reopened.session_status("s1").unwrap(), "ready");
    }

    #[test]
    fn duplicates_and_conflicts() {
        let root = temp_root("dup");
        let outbox = SessionEventOutbox::open(&root).unwrap();
        outbox
            .enqueue("s", event("e"), Some("/w"), Some(1))
            .unwrap();
        assert_eq!(
            outbox
                .enqueue("s", event("e"), Some("/w"), Some(1))
                .unwrap(),
            EnqueueOutcome::Duplicate
        );
        assert_eq!(
            outbox
                .enqueue("s", event("e"), Some("/x"), Some(1))
                .unwrap(),
            EnqueueOutcome::Conflict
        );
        let other = json!({ "type": "agent", "eventId": "e", "payload": 2 });
        assert_eq!(
            outbox.enqueue("s", other, Some("/w"), Some(1)).unwrap(),
            EnqueueOutcome::Conflict
        );
        assert_eq!(outbox.pending_count("s").unwrap(), 1);
    }

    #[test]
    fn acknowledge_only_the_head() {
        let root = temp_root("ack");
        let outbox = SessionEventOutbox::open(&root).unwrap();
        outbox.enqueue("s", event("a"), None, None).unwrap();
        outbox.enqueue("s", event("b"), None, None).unwrap();
        assert_eq!(
            outbox.acknowledge("s", "b").unwrap(),
            AcknowledgeOutcome::NotHead {
                head_event_id: "a".into()
            }
        );
        assert_eq!(
            outbox.acknowledge("s", "zzz").unwrap(),
            AcknowledgeOutcome::UnknownEvent
        );
        assert_eq!(
            outbox.acknowledge("nope", "a").unwrap(),
            AcknowledgeOutcome::UnknownEvent
        );
        assert_eq!(
            outbox.acknowledge("s", "a").unwrap(),
            AcknowledgeOutcome::Acknowledged
        );
        assert_eq!(
            outbox.acknowledge("s", "b").unwrap(),
            AcknowledgeOutcome::Acknowledged
        );
        assert_eq!(
            outbox.acknowledge("s", "b").unwrap(),
            AcknowledgeOutcome::UnknownEvent
        );
        // The sequence keeps counting after the queue empties.
        outbox.enqueue("s", event("c"), None, None).unwrap();
        assert_eq!(outbox.head("s").unwrap().unwrap().sequence, json!(2));
        assert!(outbox
            .list_heads()
            .unwrap()
            .iter()
            .all(|h| h.session_id == "s"));
    }

    #[test]
    fn corrupt_files_block_their_session_and_odd_names_are_ignored() {
        let root = temp_root("corrupt");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join(state_file_name("bad")), "{not json").unwrap();
        // Sequence not below nextSequence.
        let invalid = json!({ "version": 1, "sessionId": "inv", "nextSequence": 0, "pending": [
            { "sessionId": "inv", "eventId": "e", "eventType": "agent", "event": event("e"),
              "sequence": 0, "persistedAt": "2026-11-05T15:11:05.228Z" } ] });
        fs::write(root.join(state_file_name("inv")), invalid.to_string()).unwrap();
        // File name does not match the stored session id.
        let moved = json!({ "version": 1, "sessionId": "other", "nextSequence": 0, "pending": [] });
        fs::write(root.join(state_file_name("moved")), moved.to_string()).unwrap();
        fs::write(root.join("YQBiAA==.json"), "{}").unwrap();
        fs::write(root.join("notes.txt"), "x").unwrap();
        let good = json!({ "version": 1, "sessionId": "good", "nextSequence": 5, "pending": [
            { "sessionId": "good", "eventId": "g", "eventType": "agent", "event": event("g"),
              "sequence": 4, "notificationIndex": 0, "persistedAt": "2026-11-05T15:11:05Z" } ] });
        fs::write(root.join(state_file_name("good")), good.to_string()).unwrap();

        let outbox = SessionEventOutbox::open(&root).unwrap();
        for id in ["bad", "inv", "moved"] {
            assert_eq!(
                outbox.session_status(id).unwrap(),
                "corruptPersistedState",
                "{id}"
            );
            assert_eq!(
                outbox.enqueue(id, event("n"), None, None).unwrap(),
                EnqueueOutcome::Blocked(BlockReason::CorruptPersistedState)
            );
            assert_eq!(outbox.head(id).unwrap(), None);
        }
        // The corrupt file is left as it was.
        assert_eq!(
            fs::read_to_string(root.join(state_file_name("bad"))).unwrap(),
            "{not json"
        );
        let heads = outbox.list_heads().unwrap();
        assert_eq!(heads.len(), 1);
        assert_eq!(
            (heads[0].session_id.as_str(), heads[0].pending_count),
            ("good", 1)
        );
        outbox.enqueue("good", event("h"), None, None).unwrap();
        assert_eq!(outbox.pending_count("good").unwrap(), 2);
    }

    #[test]
    fn a_root_opens_once_until_closed() {
        let root = temp_root("once");
        let first = SessionEventOutbox::open(&root).unwrap();
        assert!(matches!(
            SessionEventOutbox::open(&root),
            Err(OutboxError::AlreadyOpen(_))
        ));
        first.close();
        assert!(matches!(first.pending_count("s"), Err(OutboxError::Closed)));
        let second = SessionEventOutbox::open(&root).unwrap();
        drop(second);
        SessionEventOutbox::open(&root).unwrap();
    }

    #[test]
    fn list_heads_is_sorted_and_skips_empty_sessions() {
        let root = temp_root("heads");
        let outbox = SessionEventOutbox::open(&root).unwrap();
        outbox.enqueue("b", event("1"), None, None).unwrap();
        outbox.enqueue("a", event("2"), None, None).unwrap();
        outbox.enqueue("c", event("3"), None, None).unwrap();
        outbox.acknowledge("c", "3").unwrap();
        let ids: Vec<_> = outbox
            .list_heads()
            .unwrap()
            .into_iter()
            .map(|h| h.session_id)
            .collect();
        assert_eq!(ids, ["a", "b"]);
        assert!(is_backed_up("checkpointCreated") && !is_backed_up("status"));
    }
}
