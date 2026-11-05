//! Conductor's file-backed local storage, `subsystemStore` and plain
//! `entryFile` subsystems (see `evidence/persistence/local-storage/NOTES.md`).
//!
//! Conductor 0.87.6 keeps small client state (composer drafts, route state,
//! the model picker, terminal tabs, ...) in named *subsystems* under its app
//! data folder, read from its frontend bundle (`index-BGEQ8YjU.js`, bytes
//! 218700-233300):
//!
//! * Index `local-storage.metadata.json`: an object mapping each subsystem to
//!   `{subsystem, sizeLimit, totalSize, entryStorage, protection?, entries:
//!   [{id, size, lastUpdatedAt}]}`. `size` is the UTF-8 byte length of the
//!   entry's JSON text.
//! * `subsystemStore` subsystems: one file
//!   `local-storage.subsystem.<encodeURIComponent(name)>.json`, an object
//!   mapping entry id to the entry's JSON text (a string).
//! * `entryFile` subsystems: one file per entry,
//!   `local-storage.entries/<enc(name)>/<enc(id)>.json` (over 255 bytes:
//!   `%local-storage-entry-sha256-<hex>.json`), directory mode 0700.
//!   Encrypted ones are the terminal history store's
//!   (`crate::terminal::history_store`); this module refuses them.
//! * Store files are written atomically with mode 0600. An unreadable store
//!   file is discarded (read as empty), as the reference does.
//!
//! `set_entry` follows the reference's `setEntry` step for step: a value
//! larger than the limit fails `entryTooLarge` before anything is read; an
//! existing subsystem keeps its storage (`entryStorageMismatch` when the
//! caller names another); the entry moves to the end of the list; the least
//! recently updated other entries are evicted until the total fits, else
//! `subsystemFull`; the content is written before the index, and rolled back
//! if the index write fails; evicted contents are deleted last.
//!
//! Content crosses this API as JSON text, never as a parsed value, so sizes
//! and stored bytes are exactly what the frontend's `JSON.stringify` made.

use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

/// Index of every subsystem, next to the databases.
pub const METADATA_FILE: &str = "local-storage.metadata.json";
const ENTRIES_DIR: &str = "local-storage.entries";
const LONG_NAME_PREFIX: &str = "%local-storage-entry-sha256-";
const MAX_FILE_NAME_BYTES: usize = 255;
const ENCRYPTED: &str = "encrypted";

/// One lock for every store in the process: the index is one file shared by
/// all subsystems, so read-modify-write cycles must not interleave.
static INDEX_LOCK: Mutex<()> = Mutex::new(());

/// Where a subsystem keeps entry contents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EntryStorage {
    /// All entries in one `local-storage.subsystem.<name>.json` object.
    SubsystemStore,
    /// One file per entry under `local-storage.entries/<name>/`.
    EntryFile,
}

/// Why a write was refused; serialized as the reference's `reason` strings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SetFailure {
    EntryTooLarge,
    SubsystemFull,
    EntryStorageMismatch,
    NotJsonSerializable,
}

/// `{success: true}` or `{success: false, reason}`, as the reference returns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct SetResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<SetFailure>,
}

impl SetResult {
    const OK: SetResult = SetResult { success: true, reason: None };
    fn failed(reason: SetFailure) -> Self {
        SetResult { success: false, reason: Some(reason) }
    }
}

#[derive(Debug)]
pub enum StoreError {
    Io(std::io::Error),
    /// A subsystem record in the index is not the shape the format expects.
    Corrupt(String),
    /// The index lists the entry but its content is gone.
    MissingContent { subsystem: String, id: String },
    /// The subsystem is encrypted; only the terminal history store reads it.
    Encrypted(String),
}

impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StoreError::Io(e) => write!(f, "local storage I/O: {e}"),
            StoreError::Corrupt(m) => write!(f, "invalid local storage data: {m}"),
            StoreError::MissingContent { subsystem, id } => {
                write!(f, "Missing local storage entry {subsystem}:{id} content")
            }
            StoreError::Encrypted(s) => write!(f, "local storage subsystem {s} is encrypted"),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<std::io::Error> for StoreError {
    fn from(e: std::io::Error) -> Self {
        StoreError::Io(e)
    }
}

pub type StoreResult<T> = Result<T, StoreError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryMeta {
    pub id: String,
    pub size: u64,
    pub last_updated_at: String,
}

/// A subsystem's index record without its name (the reference's `getSubsystem`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsystemInfo {
    pub size_limit: u64,
    pub total_size: u64,
    pub entry_storage: EntryStorage,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protection: Option<String>,
    pub entries: Vec<EntryMeta>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubsystemRecord {
    subsystem: String,
    size_limit: u64,
    total_size: u64,
    entry_storage: EntryStorage,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    protection: Option<String>,
    entries: Vec<EntryMeta>,
}

/// One listed entry with its JSON text (the reference's `listEntries` item).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListedEntry {
    pub id: String,
    pub size: u64,
    pub last_updated_at: String,
    pub content: String,
}

/// Arguments of [`LocalStorage::set_entry`] (the reference's `setEntry`).
#[derive(Debug, Clone)]
pub struct SetEntry<'a> {
    pub subsystem: &'a str,
    pub size_limit: u64,
    pub id: &'a str,
    /// The value as JSON text.
    pub content: &'a str,
    /// Defaults to now, as `new Date().toISOString()`.
    pub last_updated_at: Option<String>,
    /// Storage for a new subsystem; must match an existing one.
    pub entry_storage: Option<EntryStorage>,
    /// Keep an existing entry untouched and report success.
    pub only_if_missing: bool,
}

/// Unencrypted local storage rooted at the app data folder.
pub struct LocalStorage {
    root: PathBuf,
}

impl LocalStorage {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        LocalStorage { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The entry's JSON text, or `None` when the index does not list it.
    pub fn get_entry(&self, subsystem: &str, id: &str) -> StoreResult<Option<String>> {
        let _g = lock();
        let Some(rec) = self.record(subsystem)? else { return Ok(None) };
        if !rec.entries.iter().any(|e| e.id == id) {
            return Ok(None);
        }
        self.read_content(&rec, id)?
            .map(Some)
            .ok_or_else(|| missing(subsystem, id))
    }

    /// Every listed entry with its content, in index order.
    pub fn list_entries(&self, subsystem: &str) -> StoreResult<Vec<ListedEntry>> {
        let _g = lock();
        let Some(rec) = self.record(subsystem)? else { return Ok(Vec::new()) };
        rec.entries
            .iter()
            .map(|e| {
                let content = self.read_content(&rec, &e.id)?.ok_or_else(|| missing(subsystem, &e.id))?;
                Ok(ListedEntry {
                    id: e.id.clone(),
                    size: e.size,
                    last_updated_at: e.last_updated_at.clone(),
                    content,
                })
            })
            .collect()
    }

    pub fn get_subsystem(&self, subsystem: &str) -> StoreResult<Option<SubsystemInfo>> {
        let _g = lock();
        Ok(self.any_record(subsystem)?.map(|r| SubsystemInfo {
            size_limit: r.size_limit,
            total_size: r.total_size,
            entry_storage: r.entry_storage,
            protection: r.protection,
            entries: r.entries,
        }))
    }

    /// Names of every subsystem in the index, encrypted ones included.
    pub fn list_subsystems(&self) -> StoreResult<Vec<String>> {
        let _g = lock();
        Ok(self.read_store(&self.metadata_path()).into_keys().collect())
    }

    pub fn set_entry(&self, req: SetEntry<'_>) -> StoreResult<SetResult> {
        if serde_json::from_str::<serde::de::IgnoredAny>(req.content).is_err() {
            return Ok(SetResult::failed(SetFailure::NotJsonSerializable));
        }
        let size = req.content.len() as u64;
        let _g = lock();
        if size > req.size_limit {
            return Ok(SetResult::failed(SetFailure::EntryTooLarge));
        }
        let existing = self.record(req.subsystem)?;
        let storage = existing
            .as_ref()
            .map(|r| r.entry_storage)
            .or(req.entry_storage)
            .unwrap_or(EntryStorage::SubsystemStore);
        if let (Some(r), Some(asked)) = (&existing, req.entry_storage) {
            if r.entry_storage != asked {
                return Ok(SetResult::failed(SetFailure::EntryStorageMismatch));
            }
        }
        let previous = existing.as_ref().and_then(|r| r.entries.iter().find(|e| e.id == req.id).cloned());
        if req.only_if_missing && previous.is_some() {
            return Ok(SetResult::OK);
        }
        let mut entries: Vec<EntryMeta> = existing
            .as_ref()
            .map(|r| r.entries.iter().filter(|e| e.id != req.id).cloned().collect())
            .unwrap_or_default();
        entries.push(EntryMeta {
            id: req.id.to_string(),
            size,
            last_updated_at: req.last_updated_at.unwrap_or_else(iso_now),
        });
        let mut total = existing
            .as_ref()
            .map_or(0, |r| r.total_size)
            .saturating_sub(previous.as_ref().map_or(0, |e| e.size))
            + size;
        let mut evicted = Vec::new();
        while total > req.size_limit {
            let Some(i) = oldest_other(&entries, req.id) else { break };
            let e = entries.remove(i);
            total = total.saturating_sub(e.size);
            evicted.push(e);
        }
        if total > req.size_limit {
            return Ok(SetResult::failed(SetFailure::SubsystemFull));
        }
        let record = SubsystemRecord {
            subsystem: req.subsystem.to_string(),
            size_limit: req.size_limit,
            total_size: total,
            entry_storage: storage,
            protection: None,
            entries,
        };
        let prior_content = match &previous {
            Some(_) => self.read_content(&record, req.id)?,
            None => None,
        };
        self.write_content(&record, req.id, req.content)?;
        if let Err(e) = self.put_record(&record) {
            let rollback = match &prior_content {
                Some(old) => self.write_content(&record, req.id, old),
                None => self.delete_content(&record, req.id),
            };
            if let Err(r) = rollback {
                log(&format!("Failed to roll back local storage entry {}:{}: {r}", req.subsystem, req.id));
            }
            return Err(e);
        }
        for e in evicted {
            if let Err(err) = self.delete_content(&record, &e.id) {
                log(&format!("Failed to delete evicted local storage entry {}:{}: {err}", req.subsystem, e.id));
            }
        }
        Ok(SetResult::OK)
    }

    /// Drops the entry from the index, then deletes its content.
    pub fn remove_entry(&self, subsystem: &str, id: &str) -> StoreResult<()> {
        let _g = lock();
        let Some(mut rec) = self.record(subsystem)? else { return Ok(()) };
        let Some(pos) = rec.entries.iter().position(|e| e.id == id) else { return Ok(()) };
        let gone = rec.entries.remove(pos);
        rec.total_size = rec.total_size.saturating_sub(gone.size);
        self.put_record(&rec)?;
        if let Err(e) = self.delete_content(&rec, id) {
            log(&format!("Failed to delete removed local storage entry {subsystem}:{id}: {e}"));
        }
        Ok(())
    }

    /// Deletes every entry's content, the index record and the store file.
    pub fn remove_subsystem(&self, subsystem: &str) -> StoreResult<()> {
        let _g = lock();
        let Some(rec) = self.record(subsystem)? else { return Ok(()) };
        for e in &rec.entries {
            if let Err(err) = self.delete_content(&rec, &e.id) {
                log(&format!("Failed to delete removed local storage entry {subsystem}:{}: {err}", e.id));
            }
        }
        let path = self.metadata_path();
        let mut index = self.read_store(&path);
        index.remove(subsystem);
        write_store(&path, &index)?;
        remove_if_exists(&self.subsystem_store_path(subsystem))
    }

    /// `local-storage.subsystem.<enc(name)>.json` under the root.
    pub fn subsystem_store_path(&self, subsystem: &str) -> PathBuf {
        self.root.join(subsystem_store_file_name(subsystem))
    }

    /// The file of one `entryFile` entry.
    pub fn entry_file_path(&self, subsystem: &str, id: &str) -> PathBuf {
        self.root
            .join(ENTRIES_DIR)
            .join(encode_uri_component(subsystem))
            .join(entry_file_name(id))
    }

    pub fn metadata_path(&self) -> PathBuf {
        self.root.join(METADATA_FILE)
    }

    /// The record of an unencrypted subsystem; encrypted ones are refused.
    fn record(&self, subsystem: &str) -> StoreResult<Option<SubsystemRecord>> {
        let rec = self.any_record(subsystem)?;
        if rec.as_ref().is_some_and(|r| r.protection.as_deref() == Some(ENCRYPTED)) {
            return Err(StoreError::Encrypted(subsystem.to_string()));
        }
        Ok(rec)
    }

    fn any_record(&self, subsystem: &str) -> StoreResult<Option<SubsystemRecord>> {
        match self.read_store(&self.metadata_path()).get(subsystem) {
            None => Ok(None),
            Some(v) => serde_json::from_value(v.clone())
                .map(Some)
                .map_err(|e| StoreError::Corrupt(format!("{subsystem} record: {e}"))),
        }
    }

    fn put_record(&self, rec: &SubsystemRecord) -> StoreResult<()> {
        let path = self.metadata_path();
        let mut index = self.read_store(&path);
        index.insert(rec.subsystem.clone(), serde_json::to_value(rec).expect("record serializes"));
        write_store(&path, &index)
    }

    fn read_content(&self, rec: &SubsystemRecord, id: &str) -> StoreResult<Option<String>> {
        match rec.entry_storage {
            EntryStorage::SubsystemStore => {
                match self.read_store(&self.subsystem_store_path(&rec.subsystem)).get(id) {
                    None => Ok(None),
                    Some(Value::String(s)) => Ok(Some(s.clone())),
                    Some(_) => Err(StoreError::Corrupt("Invalid local storage entry content".into())),
                }
            }
            EntryStorage::EntryFile => match fs::read_to_string(self.entry_file_path(&rec.subsystem, id)) {
                Ok(s) => Ok(Some(s)),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(e) => Err(e.into()),
            },
        }
    }

    fn write_content(&self, rec: &SubsystemRecord, id: &str, content: &str) -> StoreResult<()> {
        match rec.entry_storage {
            EntryStorage::SubsystemStore => {
                let path = self.subsystem_store_path(&rec.subsystem);
                let mut store = self.read_store(&path);
                store.insert(id.to_string(), Value::String(content.to_string()));
                write_store(&path, &store)
            }
            EntryStorage::EntryFile => {
                let path = self.entry_file_path(&rec.subsystem, id);
                create_private_dir(path.parent().expect("entry file has a directory"))?;
                write_atomic(&path, content.as_bytes())
            }
        }
    }

    fn delete_content(&self, rec: &SubsystemRecord, id: &str) -> StoreResult<()> {
        match rec.entry_storage {
            EntryStorage::SubsystemStore => {
                let path = self.subsystem_store_path(&rec.subsystem);
                let mut store = self.read_store(&path);
                if store.remove(id).is_some() {
                    write_store(&path, &store)?;
                }
                Ok(())
            }
            EntryStorage::EntryFile => remove_if_exists(&self.entry_file_path(&rec.subsystem, id)),
        }
    }

    /// A store file as an object; a missing file is empty and an unreadable
    /// one is discarded, as the reference's `parseStoreOrDiscard` does.
    fn read_store(&self, path: &Path) -> BTreeMap<String, Value> {
        let raw = match fs::read_to_string(path) {
            Ok(raw) => raw,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return BTreeMap::new(),
            Err(e) => {
                log(&format!("Discarding unreadable local storage store {}: {e}", path.display()));
                return BTreeMap::new();
            }
        };
        match serde_json::from_str::<Value>(&raw) {
            Ok(Value::Object(map)) => map.into_iter().collect(),
            _ => {
                log(&format!(
                    "Discarding unreadable local storage store {} ({} bytes)",
                    path.display(),
                    raw.len()
                ));
                BTreeMap::new()
            }
        }
    }
}

fn lock() -> std::sync::MutexGuard<'static, ()> {
    INDEX_LOCK.lock().unwrap_or_else(|p| p.into_inner())
}

fn missing(subsystem: &str, id: &str) -> StoreError {
    StoreError::MissingContent { subsystem: subsystem.to_string(), id: id.to_string() }
}

fn log(msg: &str) {
    eprintln!("[local-storage] {msg}");
}

/// The least recently updated entry other than `keep`; the first one on ties.
fn oldest_other(entries: &[EntryMeta], keep: &str) -> Option<usize> {
    let mut best: Option<usize> = None;
    for (i, e) in entries.iter().enumerate() {
        if e.id == keep {
            continue;
        }
        match best {
            Some(b) if entries[b].last_updated_at <= e.last_updated_at => {}
            _ => best = Some(i),
        }
    }
    best
}

/// `local-storage.subsystem.<encodeURIComponent(name)>.json`.
pub fn subsystem_store_file_name(subsystem: &str) -> String {
    format!("local-storage.subsystem.{}.json", encode_uri_component(subsystem))
}

fn entry_file_name(id: &str) -> String {
    let name = format!("{}.json", encode_uri_component(id));
    if name.len() <= MAX_FILE_NAME_BYTES {
        return name;
    }
    let hex: String = Sha256::digest(id.as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
    format!("{LONG_NAME_PREFIX}{hex}.json")
}

/// JavaScript's `encodeURIComponent`.
pub fn encode_uri_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn write_store(path: &Path, store: &BTreeMap<String, Value>) -> StoreResult<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let text = serde_json::to_string(store).expect("store serializes");
    write_atomic(path, text.as_bytes())
}

fn remove_if_exists(path: &Path) -> StoreResult<()> {
    match fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

fn create_private_dir(dir: &Path) -> StoreResult<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(dir)?;
    Ok(())
}

/// Write to a sibling temp file with mode 0600, then rename over `path`.
fn write_atomic(path: &Path, bytes: &[u8]) -> StoreResult<()> {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("store");
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.subsec_nanos());
    let tmp = path.with_file_name(format!("{name}.tmp-{}-{nanos}", std::process::id()));
    let result = (|| {
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut f = opts.open(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    Ok(result?)
}

/// Now as `YYYY-MM-DDTHH:MM:SS.mmmZ`, the form `Date.toISOString` gives.
pub fn iso_now() -> String {
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64);
    iso_from_millis(ms)
}

fn iso_from_millis(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    // Howard Hinnant's civil_from_days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z",
        sod / 3600,
        sod % 3600 / 60,
        sod % 60,
        ms.rem_euclid(1000)
    )
}

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;
