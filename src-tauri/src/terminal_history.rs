//! Terminal history kept between launches: `pty_persist_terminal_history`
//! saves a terminal's or mirror's screen, `pty_load_terminal_history` gives
//! it back (see `evidence/terminal/NOTES.md`).
//!
//! As in the reference, a saved terminal is two halves under its session id:
//! the screen text (`snapshotAnsi`) as an encrypted `terminal-history`
//! local-storage entry ([`history_store`]), written first, and everything
//! else as a `terminal_sessions` row in `conductor.db`. Load returns one flat
//! [`HistoryRecord`], or nothing when either half is missing (our choice; the
//! reference's backend behaviour for a half-saved session was not recovered).
//!
//! The entry key is 32 random bytes kept as base64 under
//! [`KEY_SECRET_NAME`], created the first time history is used; this module
//! takes it from a [`KeySource`] so it has no Tauri or Keychain types and is
//! tested on its own (`tools/terminal/run-rust-tests.sh`).
//!
//! Deleting follows the reference's frontend store: closing a terminal drops
//! its saved session ([`TerminalHistory::delete`]), removing a workspace
//! drops all of that workspace's ([`TerminalHistory::delete_workspace`]), and
//! entries with no row are removed before the first other history call of a
//! launch ([`TerminalHistory::cleanup_unowned`]). Every call waits for that
//! cleanup, as every reference call awaits its `cleanupPromise`, so it never
//! sees a save's entry before its row exists.
//!
//! [`history_store`]: crate::terminal::history_store
//! [`KEY_SECRET_NAME`]: crate::terminal::history_store::KEY_SECRET_NAME

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use openconductor_db::terminal_sessions::{self, TerminalSession};
use openconductor_db::SqlitePool;
use serde::{Deserialize, Serialize};

use crate::terminal::history_store::{LocalStorage, KEY_LEN, SIZE_LIMIT, SUBSYSTEM};
use crate::terminal::{ScreenSnapshot, TerminalModes};

/// `pty_persist_terminal_history`'s `args`, as the reference's webview sends
/// them. `id` is a terminal or a mirror; times are ISO 8601 strings.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistHistoryArgs {
    pub id: String,
    pub local_workspace_id: String,
    pub session_id: String,
    pub started_at: String,
    #[serde(default)]
    pub ended_at: Option<String>,
    /// The reference passes its terminal's flag, which may be unset.
    #[serde(default)]
    pub has_received_user_input: bool,
}

/// `pty_load_terminal_history`'s and `pty_delete_terminal_history`'s `args`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoadHistoryArgs {
    pub session_id: String,
}

/// `pty_delete_workspace_terminal_history`'s `args` (our command; the
/// reference deletes from its frontend).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceHistoryArgs {
    pub local_workspace_id: String,
}

/// What `pty_load_terminal_history` returns; field names are the reference's.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    pub local_workspace_id: String,
    pub session_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub has_received_user_input: bool,
    pub snapshot_ansi: String,
    pub rehydrate_sequences: String,
    pub cwd: Option<String>,
    pub cols: u16,
    pub rows: u16,
    pub alternate_screen: bool,
    pub bracketed_paste: bool,
}

impl HistoryRecord {
    /// The record to save for `args`, from its terminal's current screen.
    pub fn new(args: PersistHistoryArgs, screen: ScreenSnapshot) -> Self {
        let ScreenSnapshot {
            snapshot_ansi,
            rehydrate_sequences,
            cwd,
            cols,
            rows,
            modes:
                TerminalModes {
                    alternate_screen,
                    bracketed_paste,
                },
        } = screen;
        HistoryRecord {
            local_workspace_id: args.local_workspace_id,
            session_id: args.session_id,
            started_at: args.started_at,
            ended_at: args.ended_at,
            has_received_user_input: args.has_received_user_input,
            snapshot_ansi,
            rehydrate_sequences,
            cwd,
            cols,
            rows,
            alternate_screen,
            bracketed_paste,
        }
    }

    /// The `terminal_sessions` row and the local-storage entry.
    fn into_parts(self) -> (TerminalSession, String) {
        let row = TerminalSession {
            session_id: self.session_id,
            workspace_id: self.local_workspace_id,
            started_at: self.started_at,
            ended_at: self.ended_at,
            cwd: self.cwd,
            cols: self.cols.into(),
            rows: self.rows.into(),
            rehydrate_sequences: self.rehydrate_sequences,
            alternate_screen: self.alternate_screen,
            bracketed_paste: self.bracketed_paste,
            has_received_user_input: self.has_received_user_input,
        };
        (row, self.snapshot_ansi)
    }

    fn from_parts(row: TerminalSession, snapshot_ansi: String) -> Self {
        HistoryRecord {
            local_workspace_id: row.workspace_id,
            session_id: row.session_id,
            started_at: row.started_at,
            ended_at: row.ended_at,
            has_received_user_input: row.has_received_user_input,
            snapshot_ansi,
            rehydrate_sequences: row.rehydrate_sequences,
            cwd: row.cwd,
            cols: clamp_u16(row.cols),
            rows: clamp_u16(row.rows),
            alternate_screen: row.alternate_screen,
            bracketed_paste: row.bracketed_paste,
        }
    }
}

/// Remove the `terminal-history` entries no `terminal_sessions` row owns;
/// returns how many went.
async fn remove_unowned(pool: &SqlitePool, storage: Arc<LocalStorage>) -> Result<usize, String> {
    let owned: HashSet<String> = terminal_sessions::session_ids(pool)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .collect();
    tokio::task::spawn_blocking(move || {
        let mut removed = 0;
        for id in storage.entry_ids(SUBSYSTEM).map_err(|e| e.to_string())? {
            if !owned.contains(&id) {
                storage
                    .remove_entry(SUBSYSTEM, &id)
                    .map_err(|e| e.to_string())?;
                removed += 1;
            }
        }
        Ok(removed)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn clamp_u16(n: i64) -> u16 {
    u16::try_from(n.max(0)).unwrap_or(u16::MAX)
}

/// The stored key, or a new one passed to `save` (as base64) when nothing is
/// stored. A stored value that is not a base64 32-byte key is an error, not
/// replaced: replacing it would make every saved entry unreadable.
pub fn key_or_create(
    stored: Option<String>,
    save: impl FnOnce(&str) -> Result<(), String>,
) -> Result<[u8; KEY_LEN], String> {
    if let Some(text) = stored {
        let bytes = B64
            .decode(text.trim())
            .map_err(|_| "local storage key is not base64".to_owned())?;
        let len = bytes.len();
        return <[u8; KEY_LEN]>::try_from(bytes)
            .map_err(|_| format!("local storage key is {len} bytes, expected {KEY_LEN}"));
    }
    let key = LocalStorage::generate_key();
    save(&B64.encode(key))?;
    Ok(key)
}

/// Gets (or creates) the local-storage key; may block on the Keychain.
pub type KeySource = Box<dyn Fn() -> Result<[u8; KEY_LEN], String> + Send + Sync>;

/// Managed state: terminal history in the app data folder.
pub struct TerminalHistory {
    root: PathBuf,
    key: KeySource,
    /// Opened on first use, so the Keychain is not touched at startup. A
    /// failed key read is retried on the next call.
    storage: Mutex<Option<Arc<LocalStorage>>>,
    /// Set once this launch's cleanup of entries with no row succeeded; a
    /// failed one is retried by the next call.
    cleaned: tokio::sync::OnceCell<()>,
}

impl TerminalHistory {
    pub fn new(root: impl Into<PathBuf>, key: KeySource) -> Self {
        TerminalHistory {
            root: root.into(),
            key,
            storage: Mutex::new(None),
            cleaned: tokio::sync::OnceCell::new(),
        }
    }

    fn storage(&self) -> Result<Arc<LocalStorage>, String> {
        let mut slot = self.storage.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(s) = slot.as_ref() {
            return Ok(s.clone());
        }
        let key = (self.key)()?;
        let s = Arc::new(LocalStorage::new(&self.root, &key));
        *slot = Some(s.clone());
        Ok(s)
    }

    /// The opened store, after this launch's cleanup (unless that already
    /// succeeded). The key is read once per call, here; a cleanup failure is
    /// logged, not returned, and the call goes on, as in the reference.
    async fn ready(&self, pool: &SqlitePool) -> Result<Arc<LocalStorage>, String> {
        let storage = self.storage()?;
        if let Err(e) = self.cleanup_with(pool, &storage).await {
            eprintln!("Failed to clean unowned terminal history entries: {e}");
        }
        Ok(storage)
    }

    /// Remove every `terminal-history` entry with no `terminal_sessions`
    /// row (a save cut off between its two halves, or a delete whose entry
    /// removal failed). Succeeds at most once per launch, before any other
    /// history call goes on; calling it again after that is a no-op.
    pub async fn cleanup_unowned(&self, pool: &SqlitePool) -> Result<(), String> {
        let storage = self.storage()?;
        self.cleanup_with(pool, &storage).await
    }

    async fn cleanup_with(
        &self,
        pool: &SqlitePool,
        storage: &Arc<LocalStorage>,
    ) -> Result<(), String> {
        self.cleaned
            .get_or_try_init(|| async { remove_unowned(pool, storage.clone()).await.map(|_| ()) })
            .await
            .map(|_| ())
    }

    /// Save `record`: the encrypted screen entry first, then the row.
    pub async fn persist(&self, pool: &SqlitePool, record: HistoryRecord) -> Result<(), String> {
        let storage = self.ready(pool).await?;
        let (row, snapshot_ansi) = record.into_parts();
        let id = row.session_id.clone();
        tokio::task::spawn_blocking(move || {
            storage
                .set_entry(SUBSYSTEM, SIZE_LIMIT, &id, &snapshot_ansi)
                .map_err(|e| format!("Failed to persist terminal history {id}: {e}"))
        })
        .await
        .map_err(|e| e.to_string())??;
        terminal_sessions::upsert(pool, &row)
            .await
            .map_err(|e| e.to_string())
    }

    /// The saved record for `session_id`, or `None` when it was never saved
    /// (or only half of it was).
    pub async fn load(
        &self,
        pool: &SqlitePool,
        session_id: &str,
    ) -> Result<Option<HistoryRecord>, String> {
        let storage = self.ready(pool).await?;
        let Some(row) = terminal_sessions::get(pool, session_id)
            .await
            .map_err(|e| e.to_string())?
        else {
            return Ok(None);
        };
        let id = session_id.to_owned();
        let entry = tokio::task::spawn_blocking(move || storage.get_entry(SUBSYSTEM, &id))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
        Ok(entry.map(|ansi| HistoryRecord::from_parts(row, ansi)))
    }

    /// Forget `session_id`'s saved session: its row, then its entry. Either
    /// may already be gone. The reference removes both at once; the row goes
    /// first here so that an entry left by a failed removal has no row and
    /// the next launch's cleanup removes it.
    pub async fn delete(&self, pool: &SqlitePool, session_id: &str) -> Result<(), String> {
        let storage = self.ready(pool).await?;
        terminal_sessions::delete(pool, session_id)
            .await
            .map_err(|e| e.to_string())?;
        let id = session_id.to_owned();
        tokio::task::spawn_blocking(move || storage.remove_entry(SUBSYSTEM, &id))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())
    }

    /// Forget every saved session of `workspace_id`; returns how many.
    pub async fn delete_workspace(
        &self,
        pool: &SqlitePool,
        workspace_id: &str,
    ) -> Result<usize, String> {
        self.ready(pool).await?;
        let ids = terminal_sessions::session_ids_for_workspace(pool, workspace_id)
            .await
            .map_err(|e| e.to_string())?;
        for id in &ids {
            self.delete(pool, id).await?;
        }
        Ok(ids.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terminal::history_store::KEY_SECRET_NAME;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn temp_root(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("oc-term-history-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn fixed_key() -> KeySource {
        Box::new(|| Ok([7u8; KEY_LEN]))
    }

    fn args(session: &str) -> PersistHistoryArgs {
        PersistHistoryArgs {
            id: "term-1".into(),
            local_workspace_id: "w1".into(),
            session_id: session.into(),
            started_at: "2026-11-05T12:00:00.000Z".into(),
            ended_at: Some("2026-11-05T12:30:00.000Z".into()),
            has_received_user_input: true,
        }
    }

    fn snapshot() -> ScreenSnapshot {
        ScreenSnapshot {
            snapshot_ansi: "\x1b[31mred\x1b[0m\r\n$ ".into(),
            rehydrate_sequences: "\x1b[?2004h".into(),
            cwd: Some("/tmp/project".into()),
            cols: 100,
            rows: 30,
            modes: TerminalModes {
                alternate_screen: false,
                bracketed_paste: true,
            },
        }
    }

    #[test]
    fn persist_args_parse_the_reference_call() {
        // `pty_persist_terminal_history` as the reference's mirror sends it
        // (bundle offset 2784082), with `endedAt ?? null`.
        let json = r#"{"id":"m1","localWorkspaceId":"w","sessionId":"s","startedAt":"2026-11-05T12:00:00.000Z","endedAt":null,"hasReceivedUserInput":true}"#;
        let a: PersistHistoryArgs = serde_json::from_str(json).unwrap();
        assert_eq!(a.ended_at, None);
        assert!(a.has_received_user_input);
        // An unset flag is dropped by JSON.stringify.
        let json =
            r#"{"id":"m1","localWorkspaceId":"w","sessionId":"s","startedAt":"t","endedAt":"u"}"#;
        let a: PersistHistoryArgs = serde_json::from_str(json).unwrap();
        assert!(!a.has_received_user_input);
        assert_eq!(a.ended_at.as_deref(), Some("u"));
    }

    #[test]
    fn record_serializes_with_the_reference_field_names() {
        let v = serde_json::to_value(HistoryRecord::new(args("s"), snapshot())).unwrap();
        let mut keys: Vec<&str> = v.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            [
                "alternateScreen",
                "bracketedPaste",
                "cols",
                "cwd",
                "endedAt",
                "hasReceivedUserInput",
                "localWorkspaceId",
                "rehydrateSequences",
                "rows",
                "sessionId",
                "snapshotAnsi",
                "startedAt",
            ]
        );
    }

    fn entry_ids(root: &std::path::Path) -> Vec<String> {
        let mut ids = LocalStorage::new(root, &[7u8; KEY_LEN])
            .entry_ids(SUBSYSTEM)
            .unwrap();
        ids.sort();
        ids
    }

    #[tokio::test]
    async fn delete_forgets_the_row_and_the_entry() {
        let root = temp_root("delete");
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let history = TerminalHistory::new(&root, fixed_key());
        for s in ["s1", "s2"] {
            let r = HistoryRecord::new(args(s), snapshot());
            history.persist(&pool, r).await.unwrap();
        }
        history.delete(&pool, "s1").await.unwrap();
        assert_eq!(history.load(&pool, "s1").await.unwrap(), None);
        assert_eq!(terminal_sessions::get(&pool, "s1").await.unwrap(), None);
        assert_eq!(entry_ids(&root), ["s2"]);
        assert!(history.load(&pool, "s2").await.unwrap().is_some());
        // Already gone, or never saved: not an error.
        history.delete(&pool, "s1").await.unwrap();
        history.delete(&pool, "never").await.unwrap();
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn delete_workspace_forgets_only_that_workspace() {
        let root = temp_root("delete-workspace");
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let history = TerminalHistory::new(&root, fixed_key());
        for (s, w) in [("s1", "w1"), ("s2", "w1"), ("s3", "w2")] {
            let a = PersistHistoryArgs {
                local_workspace_id: w.into(),
                ..args(s)
            };
            history
                .persist(&pool, HistoryRecord::new(a, snapshot()))
                .await
                .unwrap();
        }
        assert_eq!(history.delete_workspace(&pool, "w1").await.unwrap(), 2);
        assert_eq!(entry_ids(&root), ["s3"]);
        assert_eq!(terminal_sessions::session_ids(&pool).await.unwrap(), ["s3"]);
        assert!(history.load(&pool, "s3").await.unwrap().is_some());
        assert_eq!(history.delete_workspace(&pool, "w1").await.unwrap(), 0);
        let _ = std::fs::remove_dir_all(root);
    }

    /// Entries a save left without a row (or a delete without removing) are
    /// gone before the first call of a launch returns; owned ones stay.
    #[tokio::test]
    async fn the_first_call_removes_entries_with_no_row() {
        let root = temp_root("cleanup");
        let pool = openconductor_db::open_in_memory().await.unwrap();
        // Left by an earlier launch: "owned" has its row, "orphan" none.
        let earlier = TerminalHistory::new(&root, fixed_key());
        earlier
            .persist(&pool, HistoryRecord::new(args("owned"), snapshot()))
            .await
            .unwrap();
        LocalStorage::new(&root, &[7u8; KEY_LEN])
            .set_entry(SUBSYSTEM, SIZE_LIMIT, "orphan", "left over")
            .unwrap();
        assert_eq!(entry_ids(&root), ["orphan", "owned"]);

        let history = TerminalHistory::new(&root, fixed_key());
        assert!(history.load(&pool, "owned").await.unwrap().is_some());
        assert_eq!(entry_ids(&root), ["owned"]);
        let _ = std::fs::remove_dir_all(root);
    }

    /// A call that could not run the cleanup (here: the key could not be
    /// read) leaves it to the next call rather than skipping it for the launch.
    #[tokio::test]
    async fn a_failed_cleanup_is_retried() {
        let root = temp_root("cleanup-retry");
        let pool = openconductor_db::open_in_memory().await.unwrap();
        LocalStorage::new(&root, &[7u8; KEY_LEN])
            .set_entry(SUBSYSTEM, SIZE_LIMIT, "orphan", "left over")
            .unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let c = calls.clone();
        let history = TerminalHistory::new(
            &root,
            Box::new(move || {
                if c.fetch_add(1, Ordering::SeqCst) == 0 {
                    Err("keychain locked".into())
                } else {
                    Ok([7u8; KEY_LEN])
                }
            }),
        );
        // The key read fails, so neither the cleanup nor the delete runs.
        assert_eq!(
            history.delete(&pool, "x").await.unwrap_err(),
            "keychain locked"
        );
        assert_eq!(entry_ids(&root), ["orphan"]);
        history.delete(&pool, "x").await.unwrap();
        assert!(entry_ids(&root).is_empty());
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn persist_then_load_round_trips() {
        let root = temp_root("round-trip");
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let history = TerminalHistory::new(&root, fixed_key());
        let record = HistoryRecord::new(args("s1"), snapshot());
        history.persist(&pool, record.clone()).await.unwrap();
        assert_eq!(history.load(&pool, "s1").await.unwrap(), Some(record));
        assert_eq!(history.load(&pool, "never").await.unwrap(), None);
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn screen_text_is_only_in_the_encrypted_entry() {
        let root = temp_root("split");
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let history = TerminalHistory::new(&root, fixed_key());
        history
            .persist(&pool, HistoryRecord::new(args("s1"), snapshot()))
            .await
            .unwrap();

        let row = terminal_sessions::get(&pool, "s1").await.unwrap().unwrap();
        assert_eq!(row.workspace_id, "w1");
        assert_eq!((row.cols, row.rows), (100, 30));
        let file = LocalStorage::new(&root, &[7u8; KEY_LEN]).entry_path(SUBSYSTEM, "s1");
        let on_disk = std::fs::read_to_string(file).unwrap();
        assert!(on_disk.contains("conductor-local-storage-entry"));
        assert!(!on_disk.contains("red"), "screen text must be encrypted");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn a_session_with_no_entry_loads_as_nothing() {
        let root = temp_root("half");
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let history = TerminalHistory::new(&root, fixed_key());
        history
            .persist(&pool, HistoryRecord::new(args("s1"), snapshot()))
            .await
            .unwrap();
        LocalStorage::new(&root, &[7u8; KEY_LEN])
            .remove_entry(SUBSYSTEM, "s1")
            .unwrap();
        assert_eq!(history.load(&pool, "s1").await.unwrap(), None);
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn persisting_again_replaces_the_saved_session() {
        let root = temp_root("replace");
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let history = TerminalHistory::new(&root, fixed_key());
        history
            .persist(&pool, HistoryRecord::new(args("s1"), snapshot()))
            .await
            .unwrap();
        let mut later = snapshot();
        later.snapshot_ansi = "after".into();
        later.modes.alternate_screen = true;
        let mut a = args("s1");
        a.ended_at = None;
        let record = HistoryRecord::new(a, later);
        history.persist(&pool, record.clone()).await.unwrap();
        assert_eq!(history.load(&pool, "s1").await.unwrap(), Some(record));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn the_key_is_read_once_and_retried_after_a_failure() {
        let root = temp_root("key");
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let c = calls.clone();
        let history = TerminalHistory::new(
            &root,
            Box::new(move || match c.fetch_add(1, Ordering::SeqCst) {
                0 => Err("keychain locked".into()),
                _ => Ok([7u8; KEY_LEN]),
            }),
        );
        let record = HistoryRecord::new(args("s1"), snapshot());
        assert_eq!(
            history.persist(&pool, record.clone()).await.unwrap_err(),
            "keychain locked"
        );
        history.persist(&pool, record.clone()).await.unwrap();
        history.load(&pool, "s1").await.unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn another_key_cannot_read_the_history() {
        let root = temp_root("wrong-key");
        let pool = openconductor_db::open_in_memory().await.unwrap();
        TerminalHistory::new(&root, fixed_key())
            .persist(&pool, HistoryRecord::new(args("s1"), snapshot()))
            .await
            .unwrap();
        let other = TerminalHistory::new(&root, Box::new(|| Ok([8u8; KEY_LEN])));
        assert!(other.load(&pool, "s1").await.is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn a_missing_key_is_created_and_saved_as_base64() {
        let mut saved = None;
        let key = key_or_create(None, |b64| {
            saved = Some(b64.to_owned());
            Ok(())
        })
        .unwrap();
        let saved = saved.expect("new key saved");
        assert_eq!(B64.decode(&saved).unwrap(), key);
        // The saved text reads back as the same key, without saving again.
        let again = key_or_create(Some(saved), |_| panic!("must not save")).unwrap();
        assert_eq!(again, key);
        assert_eq!(KEY_SECRET_NAME, "local-storage-entry-encryption-key-v1");
    }

    #[test]
    fn a_bad_stored_key_is_an_error_not_replaced() {
        let never = |_: &str| -> Result<(), String> { panic!("must not replace") };
        assert!(key_or_create(Some("not base64!".into()), never).is_err());
        let short = B64.encode([1u8; 16]);
        assert_eq!(
            key_or_create(Some(short), never).unwrap_err(),
            "local storage key is 16 bytes, expected 32"
        );
    }

    #[test]
    fn a_failed_save_is_an_error() {
        assert_eq!(
            key_or_create(None, |_| Err("denied".into())).unwrap_err(),
            "denied"
        );
    }
}
