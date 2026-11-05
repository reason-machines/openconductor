//! Terminal history kept between launches, in the reference app's encrypted
//! local-storage format (`pty_persist_terminal_history` /
//! `pty_load_terminal_history`; see `evidence/terminal/NOTES.md`).
//!
//! The reference stores a closed terminal's `snapshotAnsi` as one entry of
//! the `terminal-history` local-storage subsystem (`entryFile` storage,
//! `encrypted` protection, 50 MiB limit) and the rest of the record in a
//! `terminal_sessions` row. This module is the file half, read from its
//! frontend bundle:
//!
//! * Entry file: `local-storage.entries/<enc(subsystem)>/<enc(id)>.json`,
//!   where `enc` is `encodeURIComponent`; a file name over 255 bytes becomes
//!   `%local-storage-entry-sha256-<hex sha256(id)>.json`. Directories are
//!   created with mode 0700 and the file is written atomically.
//! * Entry content: the stored value as JSON (a JSON string here), encrypted
//!   with AES-256-GCM, a random 12-byte IV and additional data
//!   `{"subsystem":…,"id":…,"version":1}`, saved as
//!   `{"kind":"conductor-local-storage-entry","version":1,"iv":…,"ciphertext":…}`
//!   with standard base64 (the tag is appended to the ciphertext, as WebCrypto does).
//! * Index: `local-storage.metadata.json` maps each subsystem to
//!   `{subsystem, sizeLimit, totalSize, entryStorage, protection, entries:
//!   [{id, size, lastUpdatedAt}]}`; sizes are bytes of the JSON value. A
//!   write that would pass the limit evicts the least recently updated other
//!   entries first, and fails when it still does not fit.
//!
//! The key is 32 bytes; the reference keeps it as base64 under the secret
//! `local-storage-entry-encryption-key-v1`. Getting it is the caller's job.

use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

/// Subsystem holding terminal history.
pub const SUBSYSTEM: &str = "terminal-history";
/// Size limit of the terminal history subsystem (the reference's `50*1024*1024`).
pub const SIZE_LIMIT: u64 = 50 * 1024 * 1024;
/// Secret name of the local-storage key in the reference.
pub const KEY_SECRET_NAME: &str = "local-storage-entry-encryption-key-v1";
/// Key length in bytes.
pub const KEY_LEN: usize = 32;

const METADATA_FILE: &str = "local-storage.metadata.json";
const ENTRIES_DIR: &str = "local-storage.entries";
const LONG_NAME_PREFIX: &str = "%local-storage-entry-sha256-";
const MAX_FILE_NAME_BYTES: usize = 255;
const ENTRY_KIND: &str = "conductor-local-storage-entry";
const FORMAT_VERSION: u32 = 1;
const IV_LEN: usize = 12;
const ENTRY_FILE: &str = "entryFile";
const ENCRYPTED: &str = "encrypted";

#[derive(Debug)]
pub enum StoreError {
    Io(std::io::Error),
    /// The index or an entry is not the JSON the format expects.
    Corrupt(String),
    /// Wrong key, or the entry was changed or moved to another id.
    Decrypt,
    /// The value alone is larger than the subsystem limit.
    EntryTooLarge,
    /// Evicting every other entry still leaves no room.
    SubsystemFull,
    /// The subsystem exists with another storage or protection.
    StorageMismatch,
    /// The index lists the entry but its file is gone.
    MissingContent,
}

impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StoreError::Io(e) => write!(f, "local storage I/O: {e}"),
            StoreError::Corrupt(m) => write!(f, "invalid local storage data: {m}"),
            StoreError::Decrypt => f.write_str("failed to decrypt local storage entry"),
            StoreError::EntryTooLarge => f.write_str("entryTooLarge"),
            StoreError::SubsystemFull => f.write_str("subsystemFull"),
            StoreError::StorageMismatch => f.write_str("entryStorageMismatch"),
            StoreError::MissingContent => f.write_str("missing local storage entry content"),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<std::io::Error> for StoreError {
    fn from(e: std::io::Error) -> Self {
        StoreError::Io(e)
    }
}

pub type StoreResult<T> = std::result::Result<T, StoreError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryMeta {
    pub id: String,
    pub size: u64,
    pub last_updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubsystemRecord {
    subsystem: String,
    size_limit: u64,
    total_size: u64,
    entry_storage: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    protection: Option<String>,
    entries: Vec<EntryMeta>,
}

#[derive(Serialize, Deserialize)]
struct Envelope {
    kind: String,
    version: u32,
    iv: String,
    ciphertext: String,
}

#[derive(Serialize)]
struct Aad<'a> {
    subsystem: &'a str,
    id: &'a str,
    version: u32,
}

/// Encrypted `entryFile` local storage rooted at the app data folder.
/// Operations on one store are serialized, like the reference's queue.
pub struct LocalStorage {
    root: PathBuf,
    cipher: Aes256Gcm,
    lock: Mutex<()>,
}

impl LocalStorage {
    pub fn new(root: impl Into<PathBuf>, key: &[u8; KEY_LEN]) -> Self {
        LocalStorage {
            root: root.into(),
            cipher: Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key)),
            lock: Mutex::new(()),
        }
    }

    /// A fresh random key.
    pub fn generate_key() -> [u8; KEY_LEN] {
        Aes256Gcm::generate_key(&mut OsRng).into()
    }

    /// Store `value` (any string) under `id`, evicting older entries when the
    /// subsystem would pass `size_limit`.
    pub fn set_entry(
        &self,
        subsystem: &str,
        size_limit: u64,
        id: &str,
        value: &str,
    ) -> StoreResult<()> {
        let plaintext = json_string(value);
        let size = plaintext.len() as u64;
        if size > size_limit {
            return Err(StoreError::EntryTooLarge);
        }
        let _guard = self.lock.lock().unwrap_or_else(|p| p.into_inner());
        let mut index = self.read_index()?;
        let existing = match index.get(subsystem) {
            Some(v) => Some(parse_record(v)?),
            None => None,
        };
        if let Some(r) = &existing {
            if r.entry_storage != ENTRY_FILE || r.protection.as_deref() != Some(ENCRYPTED) {
                return Err(StoreError::StorageMismatch);
            }
        }
        let previous_size = existing
            .as_ref()
            .and_then(|r| r.entries.iter().find(|e| e.id == id))
            .map_or(0, |e| e.size);
        let mut entries: Vec<EntryMeta> = existing
            .as_ref()
            .map(|r| r.entries.iter().filter(|e| e.id != id).cloned().collect())
            .unwrap_or_default();
        entries.push(EntryMeta {
            id: id.to_owned(),
            size,
            last_updated_at: iso_now(),
        });
        let mut total = existing
            .as_ref()
            .map_or(0, |r| r.total_size)
            .saturating_sub(previous_size)
            + size;
        let mut evicted = Vec::new();
        while total > size_limit {
            let Some(pos) = oldest_other(&entries, id) else {
                break;
            };
            let gone = entries.remove(pos);
            total = total.saturating_sub(gone.size);
            evicted.push(gone.id);
        }
        if total > size_limit {
            return Err(StoreError::SubsystemFull);
        }

        let path = self.entry_path(subsystem, id);
        let previous = fs::read(&path).ok();
        create_private_dir(path.parent().expect("entry path has a parent"))?;
        write_atomic(
            &path,
            self.encrypt(subsystem, id, &plaintext, &random_iv())?
                .as_bytes(),
        )?;

        let record = SubsystemRecord {
            subsystem: subsystem.to_owned(),
            size_limit,
            total_size: total,
            entry_storage: ENTRY_FILE.to_owned(),
            protection: Some(ENCRYPTED.to_owned()),
            entries,
        };
        index.insert(
            subsystem.to_owned(),
            serde_json::to_value(&record).expect("record serializes"),
        );
        if let Err(e) = self.write_index(&index) {
            // Roll the entry back so the file and the index agree.
            match previous {
                Some(bytes) => drop(write_atomic(&path, &bytes)),
                None => drop(fs::remove_file(&path)),
            }
            return Err(e);
        }
        for gone in evicted {
            let _ = fs::remove_file(self.entry_path(subsystem, &gone));
        }
        Ok(())
    }

    /// The value stored under `id`, or `None` when the index has no such entry.
    pub fn get_entry(&self, subsystem: &str, id: &str) -> StoreResult<Option<String>> {
        let _guard = self.lock.lock().unwrap_or_else(|p| p.into_inner());
        let index = self.read_index()?;
        let Some(record) = index.get(subsystem).map(parse_record).transpose()? else {
            return Ok(None);
        };
        if !record.entries.iter().any(|e| e.id == id) {
            return Ok(None);
        }
        let text = match fs::read_to_string(self.entry_path(subsystem, id)) {
            Ok(t) => t,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(StoreError::MissingContent)
            }
            Err(e) => return Err(e.into()),
        };
        let plaintext = if record.protection.as_deref() == Some(ENCRYPTED) {
            self.decrypt(subsystem, id, &text)?
        } else {
            text
        };
        match serde_json::from_str::<Value>(&plaintext) {
            Ok(Value::String(s)) => Ok(Some(s)),
            Ok(_) => Err(StoreError::Corrupt("entry is not a string".into())),
            Err(e) => Err(StoreError::Corrupt(e.to_string())),
        }
    }

    /// Remove `id` from the index and delete its file. Missing entries are fine.
    pub fn remove_entry(&self, subsystem: &str, id: &str) -> StoreResult<()> {
        let _guard = self.lock.lock().unwrap_or_else(|p| p.into_inner());
        let mut index = self.read_index()?;
        let Some(mut record) = index.get(subsystem).map(parse_record).transpose()? else {
            return Ok(());
        };
        let Some(pos) = record.entries.iter().position(|e| e.id == id) else {
            return Ok(());
        };
        let gone = record.entries.remove(pos);
        record.total_size = record.total_size.saturating_sub(gone.size);
        index.insert(
            subsystem.to_owned(),
            serde_json::to_value(&record).expect("record serializes"),
        );
        self.write_index(&index)?;
        match fs::remove_file(self.entry_path(subsystem, id)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        }
    }

    /// Ids the index lists for `subsystem`.
    pub fn entry_ids(&self, subsystem: &str) -> StoreResult<Vec<String>> {
        let _guard = self.lock.lock().unwrap_or_else(|p| p.into_inner());
        let index = self.read_index()?;
        Ok(match index.get(subsystem).map(parse_record).transpose()? {
            Some(r) => r.entries.into_iter().map(|e| e.id).collect(),
            None => Vec::new(),
        })
    }

    /// Where the entry for `id` lives.
    pub fn entry_path(&self, subsystem: &str, id: &str) -> PathBuf {
        self.root
            .join(ENTRIES_DIR)
            .join(encode_uri_component(subsystem))
            .join(entry_file_name(id))
    }

    fn encrypt(
        &self,
        subsystem: &str,
        id: &str,
        plaintext: &str,
        iv: &[u8; IV_LEN],
    ) -> StoreResult<String> {
        let aad = aad(subsystem, id);
        let ciphertext = self
            .cipher
            .encrypt(
                Nonce::from_slice(iv),
                Payload {
                    msg: plaintext.as_bytes(),
                    aad: &aad,
                },
            )
            .map_err(|_| StoreError::Corrupt("encryption failed".into()))?;
        let envelope = Envelope {
            kind: ENTRY_KIND.to_owned(),
            version: FORMAT_VERSION,
            iv: B64.encode(iv),
            ciphertext: B64.encode(ciphertext),
        };
        Ok(serde_json::to_string(&envelope).expect("envelope serializes"))
    }

    fn decrypt(&self, subsystem: &str, id: &str, text: &str) -> StoreResult<String> {
        let envelope: Envelope = serde_json::from_str(text)
            .ok()
            .filter(|e: &Envelope| e.kind == ENTRY_KIND && e.version == FORMAT_VERSION)
            .ok_or_else(|| StoreError::Corrupt("not an encrypted entry".into()))?;
        let iv = B64
            .decode(&envelope.iv)
            .map_err(|e| StoreError::Corrupt(e.to_string()))?;
        let ciphertext = B64
            .decode(&envelope.ciphertext)
            .map_err(|e| StoreError::Corrupt(e.to_string()))?;
        if iv.len() != IV_LEN {
            return Err(StoreError::Corrupt("bad IV length".into()));
        }
        let aad = aad(subsystem, id);
        let plain = self
            .cipher
            .decrypt(
                Nonce::from_slice(&iv),
                Payload {
                    msg: &ciphertext,
                    aad: &aad,
                },
            )
            .map_err(|_| StoreError::Decrypt)?;
        String::from_utf8(plain).map_err(|_| StoreError::Corrupt("entry is not UTF-8".into()))
    }

    fn read_index(&self) -> StoreResult<BTreeMap<String, Value>> {
        match fs::read_to_string(self.root.join(METADATA_FILE)) {
            Ok(text) => serde_json::from_str(&text)
                .map_err(|e| StoreError::Corrupt(format!("{METADATA_FILE}: {e}"))),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
            Err(e) => Err(e.into()),
        }
    }

    fn write_index(&self, index: &BTreeMap<String, Value>) -> StoreResult<()> {
        fs::create_dir_all(&self.root)?;
        let text = serde_json::to_string(index).expect("index serializes");
        write_atomic(&self.root.join(METADATA_FILE), text.as_bytes())
    }
}

fn parse_record(v: &Value) -> StoreResult<SubsystemRecord> {
    serde_json::from_value(v.clone())
        .map_err(|e| StoreError::Corrupt(format!("subsystem record: {e}")))
}

/// The least recently updated entry other than `keep` (first one on ties).
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

fn aad(subsystem: &str, id: &str) -> Vec<u8> {
    serde_json::to_vec(&Aad {
        subsystem,
        id,
        version: FORMAT_VERSION,
    })
    .expect("aad serializes")
}

fn json_string(s: &str) -> String {
    serde_json::to_string(s).expect("string serializes")
}

fn random_iv() -> [u8; IV_LEN] {
    Aes256Gcm::generate_nonce(&mut OsRng).into()
}

fn entry_file_name(id: &str) -> String {
    let name = format!("{}.json", encode_uri_component(id));
    if name.len() <= MAX_FILE_NAME_BYTES {
        return name;
    }
    let digest = Sha256::digest(id.as_bytes());
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
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

fn write_atomic(path: &Path, bytes: &[u8]) -> StoreResult<()> {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("entry");
    let nonce: [u8; 8] = rand_bytes();
    let tmp = path.with_file_name(format!(
        "{name}.tmp-{}",
        B64.encode(nonce).replace(['/', '+', '='], "_")
    ));
    let result = (|| {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    Ok(result?)
}

fn rand_bytes<const N: usize>() -> [u8; N] {
    use aes_gcm::aead::rand_core::RngCore;
    let mut out = [0u8; N];
    OsRng.fill_bytes(&mut out);
    out
}

/// Now as `YYYY-MM-DDTHH:MM:SS.mmmZ`, the form `Date.toISOString` gives.
pub fn iso_now() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64);
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
mod tests {
    use super::*;

    fn key() -> [u8; KEY_LEN] {
        std::array::from_fn(|i| i as u8)
    }

    fn temp_root(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oc-history-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    // Produced with WebCrypto exactly as the reference's frontend does it
    // (importKey raw AES-GCM, 12-byte IV, AAD = JSON.stringify({subsystem, id, version: 1})).
    const VECTOR_ID: &str = "sess-1 ü/é";
    const VECTOR_VALUE: &str = "\x1b[1mhi\x1b[0m\r\nwörld\t\"q\"";
    const VECTOR_ENTRY: &str = r#"{"kind":"conductor-local-storage-entry","version":1,"iv":"oKGio6Slpqeoqaqr","ciphertext":"xEQJHXX6YORTCO+6Ww/w7kHOAiD/6zAw8nnlMA3HEV2mKmWO8wBxdpdg2to9D+zlXANoIYFHXQ=="}"#;

    #[test]
    fn encrypts_exactly_like_webcrypto() {
        let store = LocalStorage::new(temp_root("vector-enc"), &key());
        let iv: [u8; IV_LEN] = std::array::from_fn(|i| 0xa0 + i as u8);
        let entry = store
            .encrypt(SUBSYSTEM, VECTOR_ID, &json_string(VECTOR_VALUE), &iv)
            .unwrap();
        assert_eq!(entry, VECTOR_ENTRY);
    }

    #[test]
    fn decrypts_an_entry_webcrypto_wrote() {
        let store = LocalStorage::new(temp_root("vector-dec"), &key());
        let plain = store.decrypt(SUBSYSTEM, VECTOR_ID, VECTOR_ENTRY).unwrap();
        assert_eq!(
            serde_json::from_str::<String>(&plain).unwrap(),
            VECTOR_VALUE
        );
        // The entry is bound to its subsystem and id.
        assert!(matches!(
            store.decrypt(SUBSYSTEM, "other", VECTOR_ENTRY),
            Err(StoreError::Decrypt)
        ));
        let wrong = LocalStorage::new(temp_root("vector-wrong"), &[7; KEY_LEN]);
        assert!(matches!(
            wrong.decrypt(SUBSYSTEM, VECTOR_ID, VECTOR_ENTRY),
            Err(StoreError::Decrypt)
        ));
    }

    #[test]
    fn file_names_match_encode_uri_component() {
        assert_eq!(
            encode_uri_component("a b!~*'()-_.é/%"),
            "a%20b!~*'()-_.%C3%A9%2F%25"
        );
        let store = LocalStorage::new("/r", &key());
        assert_eq!(
            store.entry_path(SUBSYSTEM, VECTOR_ID),
            PathBuf::from(
                "/r/local-storage.entries/terminal-history/sess-1%20%C3%BC%2F%C3%A9.json"
            )
        );
        let long = "x".repeat(251);
        let name = entry_file_name(&long);
        assert!(
            name.starts_with(LONG_NAME_PREFIX) && name.ends_with(".json"),
            "{name}"
        );
        assert_eq!(name.len(), LONG_NAME_PREFIX.len() + 64 + 5);
        assert_eq!(
            entry_file_name(&"x".repeat(250)),
            format!("{}.json", "x".repeat(250))
        );
    }

    #[test]
    fn round_trips_and_keeps_other_subsystems() {
        let root = temp_root("roundtrip");
        fs::create_dir_all(&root).unwrap();
        let other = r#"{"terminal":{"subsystem":"terminal","sizeLimit":10,"totalSize":0,"entryStorage":"subsystemStore","entries":[]}}"#;
        fs::write(root.join(METADATA_FILE), other).unwrap();
        let store = LocalStorage::new(&root, &key());

        assert_eq!(store.get_entry(SUBSYSTEM, "a").unwrap(), None);
        store
            .set_entry(SUBSYSTEM, SIZE_LIMIT, "a", "\x1b[31mred\x1b[0m")
            .unwrap();
        assert_eq!(
            store.get_entry(SUBSYSTEM, "a").unwrap().as_deref(),
            Some("\x1b[31mred\x1b[0m")
        );

        let raw = fs::read_to_string(store.entry_path(SUBSYSTEM, "a")).unwrap();
        assert!(!raw.contains("red"), "entry must be encrypted: {raw}");

        let index: Value =
            serde_json::from_str(&fs::read_to_string(root.join(METADATA_FILE)).unwrap()).unwrap();
        assert_eq!(index["terminal"]["entryStorage"], "subsystemStore");
        let rec = &index[SUBSYSTEM];
        assert_eq!(rec["entryStorage"], "entryFile");
        assert_eq!(rec["protection"], "encrypted");
        assert_eq!(rec["sizeLimit"], SIZE_LIMIT);
        let size = json_string("\x1b[31mred\x1b[0m").len() as u64;
        assert_eq!(rec["totalSize"], size);
        assert_eq!(rec["entries"][0]["size"], size);

        // Overwriting replaces the size instead of adding to it.
        store.set_entry(SUBSYSTEM, SIZE_LIMIT, "a", "x").unwrap();
        assert_eq!(
            store.get_entry(SUBSYSTEM, "a").unwrap().as_deref(),
            Some("x")
        );
        let index: Value =
            serde_json::from_str(&fs::read_to_string(root.join(METADATA_FILE)).unwrap()).unwrap();
        assert_eq!(index[SUBSYSTEM]["totalSize"], 3);

        store.remove_entry(SUBSYSTEM, "a").unwrap();
        assert_eq!(store.get_entry(SUBSYSTEM, "a").unwrap(), None);
        assert!(!store.entry_path(SUBSYSTEM, "a").exists());
        store.remove_entry(SUBSYSTEM, "a").unwrap();
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn evicts_least_recently_updated_and_rejects_what_cannot_fit() {
        let root = temp_root("evict");
        let store = LocalStorage::new(&root, &key());
        // Each value "nn" is 4 bytes as JSON; the limit fits two.
        store.set_entry(SUBSYSTEM, 8, "a", "aa").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        store.set_entry(SUBSYSTEM, 8, "b", "bb").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        store.set_entry(SUBSYSTEM, 8, "c", "cc").unwrap();
        assert_eq!(store.entry_ids(SUBSYSTEM).unwrap(), vec!["b", "c"]);
        assert!(!store.entry_path(SUBSYSTEM, "a").exists());
        assert_eq!(
            store.get_entry(SUBSYSTEM, "b").unwrap().as_deref(),
            Some("bb")
        );

        assert!(matches!(
            store.set_entry(SUBSYSTEM, 8, "d", "ddddddd"),
            Err(StoreError::EntryTooLarge)
        ));
        assert_eq!(store.entry_ids(SUBSYSTEM).unwrap(), vec!["b", "c"]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_a_subsystem_kept_another_way_and_reports_missing_files() {
        let root = temp_root("mismatch");
        fs::create_dir_all(&root).unwrap();
        let plain = r#"{"terminal-history":{"subsystem":"terminal-history","sizeLimit":100,"totalSize":0,"entryStorage":"subsystemStore","entries":[]}}"#;
        fs::write(root.join(METADATA_FILE), plain).unwrap();
        let store = LocalStorage::new(&root, &key());
        assert!(matches!(
            store.set_entry(SUBSYSTEM, 100, "a", "x"),
            Err(StoreError::StorageMismatch)
        ));

        fs::remove_file(root.join(METADATA_FILE)).unwrap();
        store.set_entry(SUBSYSTEM, 100, "a", "x").unwrap();
        fs::remove_file(store.entry_path(SUBSYSTEM, "a")).unwrap();
        assert!(matches!(
            store.get_entry(SUBSYSTEM, "a"),
            Err(StoreError::MissingContent)
        ));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn iso_timestamps_match_to_iso_string() {
        assert_eq!(iso_from_millis(0), "1970-01-01T00:00:00.000Z");
        // new Date(1793963400123).toISOString()
        assert_eq!(
            iso_from_millis(1_793_963_400_123),
            "2026-11-06T11:10:00.123Z"
        );
        assert_eq!(iso_from_millis(951_782_400_000), "2000-02-29T00:00:00.000Z");
        assert_eq!(iso_now().len(), 24);
    }
}
