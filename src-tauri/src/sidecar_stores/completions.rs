//! Local slash-command snapshot cache
//! (`sidecar-v2-completions/slash-command-snapshots.json`).
//!
//! Remembers the slash commands and skills an agent reported for a
//! repository so the composer can offer them before a workspace exists
//! (Conductor's "pre-workspace completions"). Port of Conductor 0.87.6's
//! sidecar store (`Hp5` in `conductor-runtime.js`):
//!
//! * File `{"version":1,"entries":{<key>:<snapshot JSON string>}}`; the key
//!   is `JSON.stringify([userId, repoFullName, agentType])` and each value is
//!   the snapshot serialized again as a string (compare-and-set compares it).
//! * Snapshot `{commands:[{name,description,argumentHint}],
//!   skills?:[{name,description,path,displayName?}], sourceSha,
//!   defaultBranch, observedAt}`.
//! * Every read and write first prunes entries whose snapshot does not parse
//!   or is older than 30 days, then keeps the newest 500 by `observedAt`.
//! * Writes go to `<file>.<pid>.<unique>.tmp` (mode 0600) and are renamed
//!   over the file; the directory is created with mode 0700; a file over
//!   5 MiB is refused. An unreadable or invalid file reads as empty.

use super::time;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const FILE_NAME: &str = "slash-command-snapshots.json";
/// Entries older than this are dropped (`I27`, 30 days).
pub const MAX_AGE_MS: i64 = 2_592_000_000;
/// At most this many entries are kept (`Y27`).
pub const MAX_ENTRIES: usize = 500;
/// The serialized file may not exceed this (`K27`, 5 MiB).
pub const MAX_FILE_BYTES: usize = 5_242_880;

/// Whose snapshot it is. Conductor fills `repo_full_name` with the
/// repository id and `organization_id` with `"local"` (`zT4`); only user,
/// repository and agent form the key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotIdentity {
    pub user_id: String,
    pub repo_full_name: String,
    pub agent_type: String,
}

impl SnapshotIdentity {
    /// The identity Conductor builds for a local repository.
    pub fn local(user_id: &str, repository_id: &str, agent_type: &str) -> Self {
        SnapshotIdentity {
            user_id: user_id.to_owned(),
            repo_full_name: repository_id.to_owned(),
            agent_type: agent_type.to_owned(),
        }
    }

    /// `JSON.stringify([userId, repoFullName, agentType])`.
    pub fn key(&self) -> String {
        serde_json::to_string(&[&self.user_id, &self.repo_full_name, &self.agent_type])
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommand {
    pub name: String,
    pub description: String,
    pub argument_hint: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub commands: Vec<SlashCommand>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skills: Option<Vec<Skill>>,
    pub source_sha: String,
    pub default_branch: String,
    pub observed_at: String,
}

impl Snapshot {
    /// Parses a stored snapshot string (`VT4`/`Pp5`); `None` when invalid.
    pub fn parse(serialized: &str) -> Option<Snapshot> {
        serde_json::from_str(serialized).ok()
    }
}

/// A snapshot with the exact string it was stored as.
#[derive(Debug, Clone, PartialEq)]
pub struct StoredSnapshot {
    pub snapshot: Snapshot,
    pub serialized: String,
}

/// What to do with a newly observed snapshot (`T27`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WriteDecision {
    Reject,
    Write,
    ReplaceInvalidated,
    Keep,
}

/// Conductor's rule for replacing a cached snapshot: only snapshots from
/// commits on the default branch are cached, a cached one off the default
/// branch is replaced, and a newer commit replaces an older one.
pub fn write_decision(
    candidate_on_default_branch: bool,
    cached_on_default_branch: bool,
    cached_source_sha: Option<&str>,
    candidate_source_sha: &str,
    cached_is_ancestor_of_candidate: bool,
) -> WriteDecision {
    if !candidate_on_default_branch {
        return WriteDecision::Reject;
    }
    let Some(cached) = cached_source_sha else {
        return WriteDecision::Write;
    };
    if !cached_on_default_branch {
        return WriteDecision::ReplaceInvalidated;
    }
    if cached == candidate_source_sha {
        return WriteDecision::Keep;
    }
    if cached_is_ancestor_of_candidate {
        WriteDecision::Write
    } else {
        WriteDecision::Reject
    }
}

/// The store. One lock serializes reads and writes, like Conductor's
/// promise chain.
pub struct SlashCommandSnapshotStore {
    dir: PathBuf,
    file: PathBuf,
    lock: Mutex<()>,
    now: Box<dyn Fn() -> i64 + Send + Sync>,
}

impl std::fmt::Debug for SlashCommandSnapshotStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SlashCommandSnapshotStore")
            .field("file", &self.file)
            .finish()
    }
}

fn empty_file() -> Map<String, Value> {
    Map::new()
}

fn stale(serialized: &str, now: i64) -> bool {
    match Snapshot::parse(serialized).and_then(|s| time::parse_iso(&s.observed_at)) {
        Some(at) => now - at > MAX_AGE_MS,
        None => true,
    }
}

/// Drops invalid and expired entries, then all but the newest
/// [`MAX_ENTRIES`]. Returns whether anything was dropped (`AB6`).
fn prune(entries: &mut Map<String, Value>, now: i64) -> bool {
    let before = entries.len();
    entries.retain(|_, v| v.as_str().is_some_and(|s| !stale(s, now)));
    if entries.len() > MAX_ENTRIES {
        let mut by_age: Vec<(String, i64)> = entries
            .iter()
            .map(|(k, v)| {
                let at = v
                    .as_str()
                    .and_then(Snapshot::parse)
                    .and_then(|s| time::parse_iso(&s.observed_at))
                    .unwrap_or(i64::MIN);
                (k.clone(), at)
            })
            .collect();
        // Newest first; a stable sort keeps insertion order among equals.
        by_age.sort_by_key(|a| std::cmp::Reverse(a.1));
        for (key, _) in by_age.into_iter().skip(MAX_ENTRIES) {
            entries.remove(&key);
        }
    }
    entries.len() != before
}

impl SlashCommandSnapshotStore {
    /// A store in `dir` (created on first write).
    pub fn new(dir: &Path) -> Self {
        Self::with_clock(dir, Box::new(time::now_ms))
    }

    pub fn with_clock(dir: &Path, now: Box<dyn Fn() -> i64 + Send + Sync>) -> Self {
        SlashCommandSnapshotStore {
            dir: dir.to_owned(),
            file: dir.join(FILE_NAME),
            lock: Mutex::new(()),
            now,
        }
    }

    pub fn file_path(&self) -> &Path {
        &self.file
    }

    fn read_file(&self) -> io::Result<Map<String, Value>> {
        let text = match fs::read_to_string(&self.file) {
            Ok(text) => text,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(empty_file()),
            Err(e) => return Err(e),
        };
        let Ok(v) = serde_json::from_str::<Value>(&text) else {
            return Ok(empty_file());
        };
        let valid = v.get("version") == Some(&Value::from(1))
            && v.get("entries")
                .and_then(Value::as_object)
                .is_some_and(|e| e.values().all(Value::is_string));
        Ok(match v.get("entries") {
            Some(Value::Object(entries)) if valid => entries.clone(),
            _ => empty_file(),
        })
    }

    fn write_file(&self, entries: &Map<String, Value>) -> io::Result<()> {
        let data = serde_json::to_string(&serde_json::json!({ "version": 1, "entries": entries }))
            .map_err(io::Error::other)?;
        if data.len() > MAX_FILE_BYTES {
            return Err(io::Error::other(
                "Local slash-command snapshot cache exceeded its size limit",
            ));
        }
        let mut builder = fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
        builder.create(&self.dir)?;
        let tmp = PathBuf::from(format!(
            "{}.{}.tmp",
            self.file.display(),
            super::temp_suffix()
        ));
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        let result = options
            .open(&tmp)
            .and_then(|mut f| f.write_all(data.as_bytes()))
            .and_then(|()| fs::rename(&tmp, &self.file));
        if result.is_err() {
            let _ = fs::remove_file(&tmp);
        }
        result
    }

    /// The identity's snapshot, after pruning (and saving the pruned file if
    /// anything was dropped).
    pub fn read(&self, identity: &SnapshotIdentity) -> io::Result<Option<StoredSnapshot>> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut entries = self.read_file()?;
        if prune(&mut entries, (self.now)()) {
            self.write_file(&entries)?;
        }
        Ok(entries
            .get(&identity.key())
            .and_then(Value::as_str)
            .and_then(|serialized| {
                Snapshot::parse(serialized).map(|snapshot| StoredSnapshot {
                    snapshot,
                    serialized: serialized.to_owned(),
                })
            }))
    }

    /// Replaces the identity's entry (or removes it, with `snapshot: None`)
    /// only if its current serialized value is `expected_serialized` (`None`
    /// meaning absent). Returns whether it was written.
    pub fn compare_and_set(
        &self,
        identity: &SnapshotIdentity,
        expected_serialized: Option<&str>,
        snapshot: Option<&Snapshot>,
    ) -> io::Result<bool> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let now = (self.now)();
        let mut entries = self.read_file()?;
        prune(&mut entries, now);
        let key = identity.key();
        if entries.get(&key).and_then(Value::as_str) != expected_serialized {
            return Ok(false);
        }
        match snapshot {
            None => {
                entries.remove(&key);
            }
            Some(s) => {
                entries.insert(
                    key,
                    Value::String(serde_json::to_string(s).map_err(io::Error::other)?),
                );
            }
        }
        prune(&mut entries, now);
        self.write_file(&entries)?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const NOW: i64 = 1_793_891_465_228; // 2026-11-05T15:11:05.228Z

    fn temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir()
            .join(format!(
                "oc-completions-{name}-{}",
                super::super::temp_suffix()
            ))
            .join("sidecar-v2-completions")
    }

    fn store(dir: &Path) -> SlashCommandSnapshotStore {
        SlashCommandSnapshotStore::with_clock(dir, Box::new(|| NOW))
    }

    fn snapshot(sha: &str, observed_ms: i64) -> Snapshot {
        Snapshot {
            commands: vec![SlashCommand {
                name: "review".into(),
                description: "Review the diff".into(),
                argument_hint: "[path]".into(),
            }],
            skills: Some(vec![Skill {
                name: "deploy".into(),
                description: "Ship it".into(),
                path: ".claude/skills/deploy/SKILL.md".into(),
                display_name: None,
            }]),
            source_sha: sha.into(),
            default_branch: "main".into(),
            observed_at: time::iso(observed_ms),
        }
    }

    #[test]
    fn key_is_conductors_json_array() {
        let id = SnapshotIdentity::local("u1", "repo-7", "claude");
        assert_eq!(id.key(), r#"["u1","repo-7","claude"]"#);
    }

    #[test]
    fn compare_and_set_then_read_in_conductors_format() {
        let dir = temp_dir("cas");
        let s = store(&dir);
        let id = SnapshotIdentity::local("u", "r", "codex");
        assert_eq!(s.read(&id).unwrap(), None);
        let snap = snapshot("abc", NOW - 1000);
        assert!(s.compare_and_set(&id, None, Some(&snap)).unwrap());
        // A stale expectation does not overwrite.
        assert!(!s
            .compare_and_set(&id, None, Some(&snapshot("def", NOW)))
            .unwrap());

        let stored = s.read(&id).unwrap().unwrap();
        assert_eq!(stored.snapshot, snap);
        let file: Value =
            serde_json::from_str(&fs::read_to_string(s.file_path()).unwrap()).unwrap();
        assert_eq!(file["version"], json!(1));
        let raw = file["entries"][id.key()].as_str().unwrap();
        assert_eq!(raw, stored.serialized);
        assert_eq!(
            serde_json::from_str::<Value>(raw).unwrap(),
            json!({
                "commands": [{ "name": "review", "description": "Review the diff", "argumentHint": "[path]" }],
                "skills": [{ "name": "deploy", "description": "Ship it", "path": ".claude/skills/deploy/SKILL.md" }],
                "sourceSha": "abc", "defaultBranch": "main", "observedAt": "2026-11-05T15:11:04.228Z"
            })
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&dir).unwrap().permissions().mode() & 0o777,
                0o700
            );
            assert_eq!(
                fs::metadata(s.file_path()).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }

        assert!(s
            .compare_and_set(&id, Some(&stored.serialized), None)
            .unwrap());
        assert_eq!(s.read(&id).unwrap(), None);
    }

    #[test]
    fn read_prunes_expired_invalid_and_overflowing_entries() {
        let dir = temp_dir("prune");
        fs::create_dir_all(&dir).unwrap();
        let mut entries = Map::new();
        let fresh = SnapshotIdentity::local("u", "fresh", "claude");
        entries.insert(
            fresh.key(),
            json!(serde_json::to_string(&snapshot("a", NOW - MAX_AGE_MS)).unwrap()),
        );
        entries.insert(
            "old".into(),
            json!(serde_json::to_string(&snapshot("b", NOW - MAX_AGE_MS - 1)).unwrap()),
        );
        entries.insert("junk".into(), json!("{\"commands\":1}"));
        for i in 0..MAX_ENTRIES {
            entries.insert(
                format!("n{i}"),
                json!(serde_json::to_string(&snapshot("c", NOW - 10_000 - i as i64)).unwrap()),
            );
        }
        fs::write(
            dir.join(FILE_NAME),
            json!({ "version": 1, "entries": entries }).to_string(),
        )
        .unwrap();

        let s = store(&dir);
        assert_eq!(
            s.read(&fresh).unwrap(),
            None,
            "the oldest valid entry is cut at 500"
        );
        let file: Value =
            serde_json::from_str(&fs::read_to_string(dir.join(FILE_NAME)).unwrap()).unwrap();
        let kept = file["entries"].as_object().unwrap();
        assert_eq!(kept.len(), MAX_ENTRIES);
        assert!(
            !kept.contains_key("old")
                && !kept.contains_key("junk")
                && !kept.contains_key(&fresh.key())
        );
        assert!(kept.contains_key("n0") && kept.contains_key(&format!("n{}", MAX_ENTRIES - 1)));
    }

    #[test]
    fn invalid_files_read_as_empty() {
        for body in [
            "not json",
            r#"{"version":2,"entries":{}}"#,
            r#"{"version":1,"entries":{"k":1}}"#,
        ] {
            let dir = temp_dir("invalid");
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join(FILE_NAME), body).unwrap();
            let s = store(&dir);
            let id = SnapshotIdentity::local("u", "r", "claude");
            assert_eq!(s.read(&id).unwrap(), None);
            assert!(
                s.compare_and_set(&id, None, Some(&snapshot("a", NOW)))
                    .unwrap(),
                "{body}"
            );
        }
    }

    #[test]
    fn oversized_file_is_refused() {
        let dir = temp_dir("big");
        let s = store(&dir);
        let mut snap = snapshot("a", NOW);
        snap.commands[0].description = "x".repeat(MAX_FILE_BYTES);
        let err = s
            .compare_and_set(
                &SnapshotIdentity::local("u", "r", "claude"),
                None,
                Some(&snap),
            )
            .unwrap_err();
        assert!(err.to_string().contains("exceeded its size limit"));
        assert!(!s.file_path().exists());
    }

    #[test]
    fn write_decisions_match_conductor() {
        use WriteDecision::*;
        assert_eq!(write_decision(false, true, Some("a"), "b", true), Reject);
        assert_eq!(write_decision(true, true, None, "b", false), Write);
        assert_eq!(
            write_decision(true, false, Some("a"), "b", false),
            ReplaceInvalidated
        );
        assert_eq!(write_decision(true, true, Some("b"), "b", false), Keep);
        assert_eq!(write_decision(true, true, Some("a"), "b", true), Write);
        assert_eq!(write_decision(true, true, Some("a"), "b", false), Reject);
    }
}
