//! Agent binary store: Conductor's `agent-binaries/` directory.
//!
//! Claude Code and Codex are downloaded into
//! `<AppData>/agent-binaries/<agent>/<version>/<exe>`, and each executable has a
//! sidecar `<AppData>/agent-binaries/.meta/<agent>-<version>[-<exe>].json`:
//!
//! ```json
//! {"sha256":"…","size":226563088,"downloaded_at_unix_ms":…,"verified_mtime_unix_ms":…}
//! ```
//!
//! `verified_mtime_unix_ms` is the executable's mtime when its sha256 was last
//! checked. While the mtime (and size) still match, verification trusts the
//! recorded hash and skips re-hashing hundreds of megabytes.
//!
//! Reconstructed from Conductor 0.87.6 (evidence/persistence/agent-binaries/
//! README.md): the throwaway-home runtime capture (directory layout, modes,
//! meta files, `[binary_manager] <agent> ready at …` log lines), the Rust
//! module `conductor_lib::binary_manager` (commands `get_agent_binary_state`,
//! `request_agent_binary_download`, event `agent_binary_progress`) and the
//! frontend `AgentBinaryStore` that consumes them.
//!
//! The core is plain `std` (+ serde, sha2) so it builds and tests without
//! Tauri (`--cfg agent_binaries_std_only`, see
//! evidence/persistence/agent-binaries/run-tests.sh); [`commands`] is the IPC
//! layer.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Directory under the app data dir that holds the binaries.
pub const STORE_DIR_NAME: &str = "agent-binaries";
/// Directory under [`STORE_DIR_NAME`] that holds the `.json` sidecars.
pub const META_DIR_NAME: &str = ".meta";
/// Event the frontend `AgentBinaryStore` listens on.
pub const PROGRESS_EVENT: &str = "agent_binary_progress";

// ---------------------------------------------------------------------------
// Errors

#[derive(Debug)]
pub enum Error {
    /// A name, version or executable would leave its directory.
    UnsafePath(String),
    /// A `.meta/*.json` file exists but is not a valid meta record.
    CorruptMeta { path: PathBuf, reason: String },
    /// The downloaded bytes do not hash to the expected sha256.
    HashMismatch { expected: String, actual: String },
    /// The downloaded byte count differs from the expected size.
    SizeMismatch { expected: u64, actual: u64 },
    /// The download was cancelled.
    Cancelled,
    /// Fetching the bytes failed (network, unknown URL scheme, …).
    Fetch(String),
    Io {
        action: &'static str,
        path: PathBuf,
        source: io::Error,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::UnsafePath(p) => write!(f, "Unsafe agent binary path component: {p:?}"),
            Error::CorruptMeta { path, reason } => {
                write!(f, "Corrupt agent binary meta {}: {reason}", path.display())
            }
            Error::HashMismatch { expected, actual } => {
                write!(f, "sha256 mismatch (expected {expected}, got {actual})")
            }
            Error::SizeMismatch { expected, actual } => {
                write!(f, "size mismatch (expected {expected} bytes, got {actual})")
            }
            Error::Cancelled => write!(f, "download cancelled"),
            Error::Fetch(msg) => write!(f, "download failed: {msg}"),
            Error::Io {
                action,
                path,
                source,
            } => write!(f, "Failed to {action} {}: {source}", path.display()),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

pub type Result<T> = std::result::Result<T, Error>;

fn io_err<'a>(action: &'static str, path: &'a Path) -> impl FnOnce(io::Error) -> Error + 'a {
    move |source| Error::Io {
        action,
        path: path.to_path_buf(),
        source,
    }
}

/// A single, normal path component (no `/`, `..`, `.` or empty string).
fn component(s: &str) -> Result<&str> {
    let mut parts = Path::new(s).components();
    match (parts.next(), parts.next()) {
        (Some(Component::Normal(_)), None) if !s.contains('/') && !s.contains('\\') => Ok(s),
        _ => Err(Error::UnsafePath(s.to_string())),
    }
}

pub fn unix_ms(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn mtime_ms(path: &Path) -> Result<u64> {
    let modified = fs::metadata(path)
        .and_then(|m| m.modified())
        .map_err(io_err("stat", path))?;
    Ok(unix_ms(modified))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// sha256 and size of a file, streamed.
pub fn sha256_file(path: &Path) -> Result<(String, u64)> {
    let mut file = File::open(path).map_err(io_err("open", path))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    let mut size = 0u64;
    loop {
        let n = file.read(&mut buf).map_err(io_err("read", path))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        size += n as u64;
    }
    Ok((hex(&hasher.finalize()), size))
}

#[cfg(unix)]
fn set_mode(path: &Path, mode: u32) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode)).map_err(io_err("chmod", path))
}

#[cfg(not(unix))]
fn set_mode(_path: &Path, _mode: u32) -> Result<()> {
    Ok(())
}

/// `mkdir -p` with Conductor's `drwx------` on every directory it creates.
fn create_private_dir(dir: &Path) -> Result<()> {
    if dir.is_dir() {
        return Ok(());
    }
    if let Some(parent) = dir.parent() {
        create_private_dir(parent)?;
    }
    match fs::create_dir(dir) {
        Ok(()) => set_mode(dir, 0o700),
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => Ok(()),
        Err(e) => Err(io_err("create directory", dir)(e)),
    }
}

/// Writes `data` to `path` through a sibling temp file, fsync and rename.
fn write_atomic(path: &Path, data: &[u8], mode: u32) -> Result<()> {
    let tmp = path.with_extension(format!("tmp-{}", std::process::id()));
    let result = (|| {
        let mut file = File::create(&tmp).map_err(io_err("create", &tmp))?;
        set_mode(&tmp, mode)?;
        file.write_all(data).map_err(io_err("write", &tmp))?;
        file.sync_all().map_err(io_err("sync", &tmp))?;
        fs::rename(&tmp, path).map_err(io_err("rename into place", path))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

// ---------------------------------------------------------------------------
// Agents and meta

/// The agents Conductor manages (`T2a = ["claude","codex"]` in its frontend).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Agent {
    Claude,
    Codex,
}

impl Agent {
    pub const ALL: [Agent; 2] = [Agent::Claude, Agent::Codex];

    pub fn as_str(self) -> &'static str {
        match self {
            Agent::Claude => "claude",
            Agent::Codex => "codex",
        }
    }

    /// Executables one release installs (runtime capture: `claude/2.1.284/claude`,
    /// `codex/0.156.1/{codex,codex-code-mode-host}`). The first is the one the
    /// agent runs.
    pub fn executables(self) -> &'static [&'static str] {
        match self {
            Agent::Claude => &["claude"],
            Agent::Codex => &["codex", "codex-code-mode-host"],
        }
    }

    pub fn parse(s: &str) -> std::result::Result<Agent, String> {
        match s {
            "claude" => Ok(Agent::Claude),
            "codex" => Ok(Agent::Codex),
            other => Err(format!("Unknown agent: {other}")),
        }
    }
}

impl fmt::Display for Agent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// One `.meta/*.json` record, field for field as Conductor writes it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Meta {
    pub sha256: String,
    pub size: u64,
    pub downloaded_at_unix_ms: u64,
    pub verified_mtime_unix_ms: u64,
}

/// What [`AgentBinaries::verify`] found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verification {
    /// The executable matches its meta. `rehashed` is false when the mtime
    /// short-circuit skipped hashing.
    Valid {
        rehashed: bool,
    },
    /// No executable on disk.
    MissingBinary,
    /// The executable exists but has no meta file.
    MissingMeta,
    /// The meta file exists but cannot be parsed.
    CorruptMeta(String),
    SizeMismatch {
        expected: u64,
        actual: u64,
    },
    HashMismatch {
        expected: String,
        actual: String,
    },
}

impl Verification {
    pub fn is_valid(&self) -> bool {
        matches!(self, Verification::Valid { .. })
    }
}

/// One installed version of an agent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstalledVersion {
    pub version: String,
    /// Every executable of the release verified.
    pub verified: bool,
}

/// Compares dotted versions numerically where both parts are numbers
/// (`2.1.284` > `2.1.99`), falling back to string order.
pub fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let mut ai = a.split(['.', '-']);
    let mut bi = b.split(['.', '-']);
    loop {
        match (ai.next(), bi.next()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (Some(x), Some(y)) => {
                let ord = match (x.parse::<u64>(), y.parse::<u64>()) {
                    (Ok(x), Ok(y)) => x.cmp(&y),
                    _ => x.cmp(y),
                };
                if ord != std::cmp::Ordering::Equal {
                    return ord;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// The store

/// The `agent-binaries/` store under one app data directory.
#[derive(Debug, Clone)]
pub struct AgentBinaries {
    root: PathBuf,
}

/// What a download must produce for one executable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExpectedFile {
    pub exe: String,
    /// Lowercase hex sha256.
    pub sha256: String,
    pub size: Option<u64>,
}

impl AgentBinaries {
    pub fn new(app_data_dir: &Path) -> Self {
        Self {
            root: app_data_dir.join(STORE_DIR_NAME),
        }
    }

    /// `<AppData>/agent-binaries`.
    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn meta_dir(&self) -> PathBuf {
        self.root.join(META_DIR_NAME)
    }

    /// `<root>/<name>/<version>`.
    pub fn version_dir(&self, name: &str, version: &str) -> Result<PathBuf> {
        Ok(self.root.join(component(name)?).join(component(version)?))
    }

    /// `<root>/<name>/<version>/<exe>`.
    pub fn binary_path(&self, name: &str, version: &str, exe: &str) -> Result<PathBuf> {
        Ok(self.version_dir(name, version)?.join(component(exe)?))
    }

    /// `<root>/.meta/<name>-<version>.json` for the agent's own executable,
    /// `<root>/.meta/<name>-<version>-<exe>.json` for the others (runtime
    /// capture: `codex-0.156.1.json`, `codex-0.156.1-codex-code-mode-host.json`).
    pub fn meta_path(&self, name: &str, version: &str, exe: &str) -> Result<PathBuf> {
        let (name, version, exe) = (component(name)?, component(version)?, component(exe)?);
        let file = if exe == name {
            format!("{name}-{version}.json")
        } else {
            format!("{name}-{version}-{exe}.json")
        };
        Ok(self.meta_dir().join(file))
    }

    /// `Ok(None)` when there is no meta file; `Err(CorruptMeta)` when it does
    /// not parse.
    pub fn read_meta(&self, name: &str, version: &str, exe: &str) -> Result<Option<Meta>> {
        let path = self.meta_path(name, version, exe)?;
        let text = match fs::read(&path) {
            Ok(t) => t,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(io_err("read meta", &path)(e)),
        };
        serde_json::from_slice(&text)
            .map(Some)
            .map_err(|e| Error::CorruptMeta {
                path,
                reason: e.to_string(),
            })
    }

    /// Writes a meta file atomically (mode `-rw-------`, as Conductor's).
    pub fn write_meta(&self, name: &str, version: &str, exe: &str, meta: &Meta) -> Result<()> {
        let path = self.meta_path(name, version, exe)?;
        create_private_dir(&self.meta_dir())?;
        let json = serde_json::to_vec(meta).expect("Meta serializes");
        write_atomic(&path, &json, 0o600)
    }

    /// Checks one executable against its meta. When the file's mtime equals
    /// `verified_mtime_unix_ms` and the size matches, the recorded hash is
    /// trusted. Otherwise the file is re-hashed, and on a match the meta's
    /// `verified_mtime_unix_ms` is moved to the current mtime.
    pub fn verify(&self, name: &str, version: &str, exe: &str) -> Result<Verification> {
        let binary = self.binary_path(name, version, exe)?;
        let stat = match fs::metadata(&binary) {
            Ok(m) if m.is_file() => m,
            Ok(_) => return Ok(Verification::MissingBinary),
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                return Ok(Verification::MissingBinary)
            }
            Err(e) => return Err(io_err("stat", &binary)(e)),
        };
        let meta = match self.read_meta(name, version, exe) {
            Ok(Some(meta)) => meta,
            Ok(None) => return Ok(Verification::MissingMeta),
            Err(Error::CorruptMeta { reason, .. }) => return Ok(Verification::CorruptMeta(reason)),
            Err(e) => return Err(e),
        };
        if stat.len() != meta.size {
            return Ok(Verification::SizeMismatch {
                expected: meta.size,
                actual: stat.len(),
            });
        }
        let mtime = unix_ms(stat.modified().map_err(io_err("stat", &binary))?);
        if mtime == meta.verified_mtime_unix_ms {
            return Ok(Verification::Valid { rehashed: false });
        }
        let (actual, size) = sha256_file(&binary)?;
        if size != meta.size {
            return Ok(Verification::SizeMismatch {
                expected: meta.size,
                actual: size,
            });
        }
        if !actual.eq_ignore_ascii_case(&meta.sha256) {
            return Ok(Verification::HashMismatch {
                expected: meta.sha256,
                actual,
            });
        }
        self.write_meta(
            name,
            version,
            exe,
            &Meta {
                verified_mtime_unix_ms: mtime,
                ..meta
            },
        )?;
        Ok(Verification::Valid { rehashed: true })
    }

    /// Verifies every executable of `agent` at `version`.
    pub fn verify_release(&self, agent: Agent, version: &str) -> Result<bool> {
        for exe in agent.executables() {
            if !self.verify(agent.as_str(), version, exe)?.is_valid() {
                return Ok(false);
            }
        }
        Ok(true)
    }

    /// Version directories under `<root>/<agent>`, oldest first, each with
    /// whether its whole release verifies. Entries that are not directories,
    /// and dot-directories, are skipped. A missing agent dir is empty.
    pub fn list_versions(&self, agent: Agent) -> Result<Vec<InstalledVersion>> {
        let dir = self.root.join(agent.as_str());
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(io_err("read directory", &dir)(e)),
        };
        let mut versions = Vec::new();
        for entry in entries {
            let entry = entry.map_err(io_err("read directory", &dir))?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || !entry.path().is_dir() {
                continue;
            }
            let verified = self.verify_release(agent, &name)?;
            versions.push(InstalledVersion {
                version: name,
                verified,
            });
        }
        versions.sort_by(|a, b| compare_versions(&a.version, &b.version));
        Ok(versions)
    }

    /// The newest verified version, if any.
    pub fn latest_verified(&self, agent: Agent) -> Result<Option<String>> {
        Ok(self
            .list_versions(agent)?
            .into_iter()
            .rev()
            .find(|v| v.verified)
            .map(|v| v.version))
    }

    /// Removes a version directory and its meta files. Absent is not an error.
    pub fn remove_version(&self, agent: Agent, version: &str) -> Result<()> {
        let dir = self.version_dir(agent.as_str(), version)?;
        match fs::remove_dir_all(&dir) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(io_err("remove", &dir)(e)),
        }
        for exe in agent.executables() {
            let meta = self.meta_path(agent.as_str(), version, exe)?;
            match fs::remove_file(&meta) {
                Ok(()) => {}
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(io_err("remove", &meta)(e)),
            }
        }
        Ok(())
    }

    /// Starts writing one executable. Bytes go to a hidden temp file in the
    /// version directory and only replace the executable in
    /// [`PartialDownload::finish`], after their size and sha256 check out.
    pub fn begin_download(
        &self,
        name: &str,
        version: &str,
        expected: &ExpectedFile,
    ) -> Result<PartialDownload> {
        let target = self.binary_path(name, version, &expected.exe)?;
        let dir = self.version_dir(name, version)?;
        create_private_dir(&dir)?;
        let tmp = dir.join(format!(".{}.download-{}", expected.exe, std::process::id()));
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)
            .map_err(io_err("create", &tmp))?;
        Ok(PartialDownload {
            store: self.clone(),
            name: name.to_string(),
            version: version.to_string(),
            expected: expected.clone(),
            target,
            tmp,
            file: Some(file),
            hasher: Sha256::new(),
            written: 0,
        })
    }

    /// Streams `reader` into the store as `expected.exe`, checking `cancel`
    /// between chunks and reporting the running byte count to `progress`.
    pub fn download_from_reader(
        &self,
        name: &str,
        version: &str,
        expected: &ExpectedFile,
        reader: &mut dyn Read,
        cancel: &CancelToken,
        progress: &mut dyn FnMut(u64),
    ) -> Result<Meta> {
        let mut partial = self.begin_download(name, version, expected)?;
        let mut buf = vec![0u8; 1 << 16];
        loop {
            if cancel.is_cancelled() {
                return Err(Error::Cancelled);
            }
            let n = match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => n,
                Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                Err(e) => return Err(Error::Fetch(e.to_string())),
            };
            partial.write_chunk(&buf[..n])?;
            progress(partial.written());
        }
        if cancel.is_cancelled() {
            return Err(Error::Cancelled);
        }
        partial.finish(SystemTime::now())
    }
}

/// An executable being written. Dropping it without [`finish`](Self::finish)
/// removes the temp file, so a cancelled or failed download leaves nothing.
pub struct PartialDownload {
    store: AgentBinaries,
    name: String,
    version: String,
    expected: ExpectedFile,
    target: PathBuf,
    tmp: PathBuf,
    file: Option<File>,
    hasher: Sha256,
    written: u64,
}

impl PartialDownload {
    pub fn written(&self) -> u64 {
        self.written
    }

    pub fn write_chunk(&mut self, chunk: &[u8]) -> Result<()> {
        if let Some(expected) = self.expected.size {
            let actual = self.written + chunk.len() as u64;
            if actual > expected {
                return Err(Error::SizeMismatch { expected, actual });
            }
        }
        let file = self.file.as_mut().expect("file open until finish");
        file.write_all(chunk).map_err(io_err("write", &self.tmp))?;
        self.hasher.update(chunk);
        self.written += chunk.len() as u64;
        Ok(())
    }

    /// Checks size and sha256, makes the file executable (`-rwxr-xr-x`),
    /// renames it into place, then writes its meta with the installed file's
    /// mtime as `verified_mtime_unix_ms`.
    pub fn finish(mut self, now: SystemTime) -> Result<Meta> {
        let file = self.file.take().expect("file open until finish");
        file.sync_all().map_err(io_err("sync", &self.tmp))?;
        drop(file);
        if let Some(expected) = self.expected.size {
            if expected != self.written {
                return Err(Error::SizeMismatch {
                    expected,
                    actual: self.written,
                });
            }
        }
        let actual = hex(&std::mem::take(&mut self.hasher).finalize());
        if !actual.eq_ignore_ascii_case(&self.expected.sha256) {
            return Err(Error::HashMismatch {
                expected: self.expected.sha256.to_ascii_lowercase(),
                actual,
            });
        }
        set_mode(&self.tmp, 0o755)?;
        fs::rename(&self.tmp, &self.target).map_err(io_err("rename into place", &self.target))?;
        let meta = Meta {
            sha256: actual,
            size: self.written,
            downloaded_at_unix_ms: unix_ms(now),
            verified_mtime_unix_ms: mtime_ms(&self.target)?,
        };
        self.store
            .write_meta(&self.name, &self.version, &self.expected.exe, &meta)?;
        Ok(meta)
    }
}

impl Drop for PartialDownload {
    fn drop(&mut self) {
        // Not finished, or finish failed before the rename: leave nothing behind.
        if self.tmp.exists() {
            self.file.take();
            let _ = fs::remove_file(&self.tmp);
        }
    }
}

// ---------------------------------------------------------------------------
// Cancellation, fetching and releases

/// Shared cancellation flag for one download.
#[derive(Debug, Clone, Default)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

/// Opens a URL for reading. Returns the reader and the total length when
/// known.
pub trait Fetch: Send + Sync {
    fn open(&self, url: &str) -> std::result::Result<(Box<dyn Read + Send>, Option<u64>), String>;
}

/// Reads `file://` URLs and plain absolute paths: local mirrors and tests.
#[derive(Debug, Default, Clone, Copy)]
pub struct LocalFetch;

impl Fetch for LocalFetch {
    fn open(&self, url: &str) -> std::result::Result<(Box<dyn Read + Send>, Option<u64>), String> {
        let path = match url.strip_prefix("file://") {
            Some(p) => PathBuf::from(p),
            None if Path::new(url).is_absolute() => PathBuf::from(url),
            None => return Err(format!("Unsupported agent binary URL: {url}")),
        };
        let file = File::open(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        let len = file.metadata().ok().map(|m| m.len());
        Ok((Box::new(file), len))
    }
}

/// One downloadable executable of a release.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReleaseFile {
    pub exe: String,
    pub url: String,
    pub sha256: String,
    #[serde(default)]
    pub size: Option<u64>,
}

/// The version of an agent to install and where its executables come from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Release {
    pub version: String,
    pub files: Vec<ReleaseFile>,
}

/// A release manifest: `{"claude": Release, "codex": Release}`.
pub type Manifest = HashMap<Agent, Release>;

/// Where the current release of each agent is looked up.
pub trait ReleaseSource: Send + Sync {
    fn current(&self, agent: Agent) -> std::result::Result<Release, String>;
}

/// A fixed manifest (parsed from JSON or built in tests).
#[derive(Debug, Clone, Default)]
pub struct StaticReleases(pub Manifest);

impl StaticReleases {
    pub fn from_json(json: &[u8]) -> std::result::Result<Self, String> {
        serde_json::from_slice(json)
            .map(StaticReleases)
            .map_err(|e| format!("Invalid agent binary manifest: {e}"))
    }
}

impl ReleaseSource for StaticReleases {
    fn current(&self, agent: Agent) -> std::result::Result<Release, String> {
        self.0
            .get(&agent)
            .cloned()
            .ok_or_else(|| format!("No {agent} release in the agent binary manifest"))
    }
}

// ---------------------------------------------------------------------------
// Manager: per-agent state, downloads with retry and cancellation

/// `state` values the frontend renders (`I2a` in Conductor's renderApp).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BinaryState {
    Pending,
    Started,
    Downloading,
    Retrying,
    Failed,
    Ready,
}

/// `kind` of a status: the frontend keys statuses by `<agent>:<kind>` and
/// only ever reads `current`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BinaryKind {
    Current,
}

/// One `agent_binary_progress` payload / `get_agent_binary_state` entry
/// (fields from the frontend's `XV` mapper).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentBinaryStatus {
    pub agent: Agent,
    pub kind: BinaryKind,
    pub state: BinaryState,
    pub version: String,
    pub bytes_downloaded: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes_total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_attempt_unix_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt: Option<u32>,
}

impl AgentBinaryStatus {
    fn new(agent: Agent, state: BinaryState, version: &str) -> Self {
        Self {
            agent,
            kind: BinaryKind::Current,
            state,
            version: version.to_string(),
            bytes_downloaded: 0,
            bytes_total: None,
            error: None,
            next_attempt_unix_ms: None,
            attempt: None,
        }
    }
}

/// How often and how long to retry a failed download.
#[derive(Debug, Clone, Copy)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub base_delay: Duration,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay: Duration::from_secs(2),
        }
    }
}

type Emit = Arc<dyn Fn(&AgentBinaryStatus) + Send + Sync>;

/// Emit progress at most this often (bytes), plus at start and end.
const PROGRESS_STEP: u64 = 1 << 20;

/// Owns the store, the per-agent statuses and the in-flight downloads
/// (Conductor `binary_manager`).
#[derive(Clone)]
pub struct BinaryManager {
    store: AgentBinaries,
    fetch: Arc<dyn Fetch>,
    releases: Arc<dyn ReleaseSource>,
    retry: RetryPolicy,
    emit: Emit,
    statuses: Arc<Mutex<HashMap<Agent, AgentBinaryStatus>>>,
    inflight: Arc<Mutex<HashMap<Agent, CancelToken>>>,
}

impl BinaryManager {
    pub fn new(
        store: AgentBinaries,
        fetch: Arc<dyn Fetch>,
        releases: Arc<dyn ReleaseSource>,
        retry: RetryPolicy,
        emit: Emit,
    ) -> Self {
        Self {
            store,
            fetch,
            releases,
            retry,
            emit,
            statuses: Arc::default(),
            inflight: Arc::default(),
        }
    }

    pub fn store(&self) -> &AgentBinaries {
        &self.store
    }

    fn set(&self, status: AgentBinaryStatus) {
        (self.emit)(&status);
        self.statuses.lock().unwrap().insert(status.agent, status);
    }

    /// `get_agent_binary_state`: the known status of each agent. Agents with no
    /// status yet are hydrated from disk (newest verified version is `ready`);
    /// agents with nothing installed and no download are left out.
    pub fn state(&self) -> Vec<AgentBinaryStatus> {
        let mut out = Vec::new();
        for agent in Agent::ALL {
            if let Some(status) = self.statuses.lock().unwrap().get(&agent).cloned() {
                out.push(status);
                continue;
            }
            match self.store.latest_verified(agent) {
                Ok(Some(version)) => {
                    let status = AgentBinaryStatus::new(agent, BinaryState::Ready, &version);
                    self.statuses.lock().unwrap().insert(agent, status.clone());
                    out.push(status);
                }
                Ok(None) => {}
                Err(e) => eprintln!("[binary_manager] failed to read {agent} binaries: {e}"),
            }
        }
        out
    }

    /// Path of the agent's runnable executable when it is installed and
    /// verified.
    pub fn ready_path(&self, agent: Agent) -> Option<PathBuf> {
        let version = self.store.latest_verified(agent).ok()??;
        self.store
            .binary_path(agent.as_str(), &version, agent.executables()[0])
            .ok()
    }

    /// Cancels the agent's in-flight download, if any. Returns whether one
    /// was running.
    pub fn cancel(&self, agent: Agent) -> bool {
        match self.inflight.lock().unwrap().get(&agent) {
            Some(token) => {
                token.cancel();
                true
            }
            None => false,
        }
    }

    /// `request_agent_binary_download`: starts a background download of the
    /// agent's current release unless one is already running. Returns the
    /// join handle when it started one.
    pub fn request_download(
        &self,
        agent: Agent,
    ) -> Option<std::thread::JoinHandle<AgentBinaryStatus>> {
        let token = {
            let mut inflight = self.inflight.lock().unwrap();
            if inflight.contains_key(&agent) {
                return None;
            }
            let token = CancelToken::new();
            inflight.insert(agent, token.clone());
            token
        };
        let this = self.clone();
        Some(std::thread::spawn(move || {
            let status = this.run_download(agent, &token);
            this.inflight.lock().unwrap().remove(&agent);
            status
        }))
    }

    /// Downloads (or confirms) the agent's current release on this thread,
    /// retrying failures per the policy. Returns the final status, which is
    /// also emitted and stored.
    pub fn run_download(&self, agent: Agent, cancel: &CancelToken) -> AgentBinaryStatus {
        let release = match self.releases.current(agent) {
            Ok(r) => r,
            Err(e) => {
                let mut status = AgentBinaryStatus::new(agent, BinaryState::Failed, "");
                status.error = Some(e);
                self.set(status.clone());
                return status;
            }
        };
        if matches!(self.store.verify_release(agent, &release.version), Ok(true)) {
            return self.ready(agent, &release.version);
        }
        let mut attempt = 1;
        loop {
            match self.try_install(agent, &release, cancel, attempt) {
                Ok(()) => return self.ready(agent, &release.version),
                Err(Error::Cancelled) => {
                    let mut status =
                        AgentBinaryStatus::new(agent, BinaryState::Failed, &release.version);
                    status.error = Some(Error::Cancelled.to_string());
                    status.attempt = Some(attempt);
                    self.set(status.clone());
                    return status;
                }
                Err(e) if attempt < self.retry.max_attempts => {
                    let delay = self.retry.base_delay * 2u32.pow(attempt - 1);
                    let mut status =
                        AgentBinaryStatus::new(agent, BinaryState::Retrying, &release.version);
                    status.error = Some(e.to_string());
                    status.attempt = Some(attempt + 1);
                    status.next_attempt_unix_ms = Some(unix_ms(SystemTime::now() + delay));
                    self.set(status);
                    if !sleep_unless_cancelled(delay, cancel) {
                        continue; // the next try reports the cancellation
                    }
                    attempt += 1;
                }
                Err(e) => {
                    let mut status =
                        AgentBinaryStatus::new(agent, BinaryState::Failed, &release.version);
                    status.error = Some(e.to_string());
                    status.attempt = Some(attempt);
                    self.set(status.clone());
                    return status;
                }
            }
        }
    }

    fn ready(&self, agent: Agent, version: &str) -> AgentBinaryStatus {
        let status = AgentBinaryStatus::new(agent, BinaryState::Ready, version);
        if let Ok(path) = self
            .store
            .binary_path(agent.as_str(), version, agent.executables()[0])
        {
            eprintln!("[binary_manager] {agent} ready at {path:?}");
        }
        self.set(status.clone());
        status
    }

    fn try_install(
        &self,
        agent: Agent,
        release: &Release,
        cancel: &CancelToken,
        attempt: u32,
    ) -> Result<()> {
        let mut status = AgentBinaryStatus::new(agent, BinaryState::Started, &release.version);
        status.attempt = Some(attempt);
        self.set(status.clone());
        let mut done_before = 0u64;
        let mut total: Option<u64> = release.files.iter().map(|f| f.size).sum();
        for file in &release.files {
            if cancel.is_cancelled() {
                return Err(Error::Cancelled);
            }
            if self
                .store
                .verify(agent.as_str(), &release.version, &file.exe)?
                .is_valid()
            {
                continue;
            }
            let (mut reader, len) = self.fetch.open(&file.url).map_err(Error::Fetch)?;
            if total.is_none() && release.files.len() == 1 {
                total = len;
            }
            let expected = ExpectedFile {
                exe: file.exe.clone(),
                sha256: file.sha256.clone(),
                size: file.size.or(len),
            };
            status.state = BinaryState::Downloading;
            status.bytes_total = total;
            status.bytes_downloaded = done_before;
            self.set(status.clone());
            let mut last_emit = 0u64;
            let mut progress = |n: u64| {
                if n - last_emit >= PROGRESS_STEP {
                    last_emit = n;
                    let mut s = status.clone();
                    s.bytes_downloaded = done_before + n;
                    self.set(s);
                }
            };
            let meta = self.store.download_from_reader(
                agent.as_str(),
                &release.version,
                &expected,
                &mut reader,
                cancel,
                &mut progress,
            )?;
            done_before += meta.size;
        }
        if !self.store.verify_release(agent, &release.version)? {
            return Err(Error::Fetch(format!(
                "{agent} {} did not verify after download",
                release.version
            )));
        }
        Ok(())
    }
}

/// Sleeps up to `delay`; returns false early when cancelled.
fn sleep_unless_cancelled(delay: Duration, cancel: &CancelToken) -> bool {
    let step = Duration::from_millis(20);
    let mut left = delay;
    while !left.is_zero() {
        if cancel.is_cancelled() {
            return false;
        }
        let d = left.min(step);
        std::thread::sleep(d);
        left -= d;
    }
    !cancel.is_cancelled()
}

/// Tauri IPC layer. Excluded from the standalone harness build
/// (`--cfg agent_binaries_std_only`).
#[cfg(not(agent_binaries_std_only))]
pub mod commands {
    use super::{
        Agent, AgentBinaries, AgentBinaryStatus, BinaryManager, Fetch, LocalFetch, Release,
        ReleaseSource, RetryPolicy, StaticReleases, PROGRESS_EVENT,
    };
    use std::io::{self, Read};
    use std::path::Path;
    use std::sync::Arc;
    use tauri::{Emitter, Manager};
    use tauri_plugin_http::reqwest;

    /// Env var naming the release manifest (a path, `file://` or `https://`
    /// URL to JSON shaped as [`super::Manifest`]). Conductor's own updater
    /// endpoint is not yet known (see evidence/persistence/agent-binaries).
    pub const MANIFEST_ENV: &str = "OPENCONDUCTOR_AGENT_BINARY_MANIFEST";

    /// `file://`, absolute paths and `http(s)://`.
    struct AnyFetch;

    struct HttpReader {
        response: reqwest::Response,
        chunk: Vec<u8>,
        pos: usize,
    }

    impl Read for HttpReader {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            if self.pos == self.chunk.len() {
                // Runs on a download thread, never inside the async runtime.
                match tauri::async_runtime::block_on(self.response.chunk()) {
                    Ok(Some(bytes)) => {
                        self.chunk = bytes.to_vec();
                        self.pos = 0;
                    }
                    Ok(None) => return Ok(0),
                    Err(e) => return Err(io::Error::other(e)),
                }
            }
            let n = buf.len().min(self.chunk.len() - self.pos);
            buf[..n].copy_from_slice(&self.chunk[self.pos..self.pos + n]);
            self.pos += n;
            Ok(n)
        }
    }

    impl Fetch for AnyFetch {
        fn open(&self, url: &str) -> Result<(Box<dyn Read + Send>, Option<u64>), String> {
            if !(url.starts_with("https://") || url.starts_with("http://")) {
                return LocalFetch.open(url);
            }
            let response = tauri::async_runtime::block_on(async {
                reqwest::get(url).await?.error_for_status()
            })
            .map_err(|e| e.to_string())?;
            let len = response.content_length();
            Ok((
                Box::new(HttpReader {
                    response,
                    chunk: Vec::new(),
                    pos: 0,
                }),
                len,
            ))
        }
    }

    /// Reads the manifest named by [`MANIFEST_ENV`] on every lookup.
    struct EnvManifest;

    impl ReleaseSource for EnvManifest {
        fn current(&self, agent: Agent) -> Result<Release, String> {
            let location = std::env::var(MANIFEST_ENV).map_err(|_| {
                format!("No agent binary release manifest configured (set {MANIFEST_ENV})")
            })?;
            let (mut reader, _) = AnyFetch.open(&location)?;
            let mut json = Vec::new();
            reader
                .read_to_end(&mut json)
                .map_err(|e| format!("{location}: {e}"))?;
            StaticReleases::from_json(&json)?.current(agent)
        }
    }

    pub fn manager(app: &tauri::AppHandle, app_data_dir: &Path) -> BinaryManager {
        let handle = app.clone();
        BinaryManager::new(
            AgentBinaries::new(app_data_dir),
            Arc::new(AnyFetch),
            Arc::new(EnvManifest),
            RetryPolicy::default(),
            Arc::new(move |status: &AgentBinaryStatus| {
                if let Err(e) = handle.emit(PROGRESS_EVENT, status) {
                    eprintln!("[binary_manager] failed to emit {PROGRESS_EVENT}: {e}");
                }
            }),
        )
    }

    /// Conductor `get_agent_binary_state()`: `[{agent, kind, state, version,
    /// bytesDownloaded, bytesTotal?, error?, nextAttemptUnixMs?, attempt?}]`.
    #[tauri::command]
    pub async fn get_agent_binary_state(
        app: tauri::AppHandle,
    ) -> Result<Vec<AgentBinaryStatus>, String> {
        let manager = app.state::<BinaryManager>().inner().clone();
        tauri::async_runtime::spawn_blocking(move || manager.state())
            .await
            .map_err(|e| e.to_string())
    }

    /// Conductor `request_agent_binary_download({agent})`: starts the download
    /// in the background; progress arrives on `agent_binary_progress`.
    #[tauri::command]
    pub fn request_agent_binary_download(
        app: tauri::AppHandle,
        agent: String,
    ) -> Result<(), String> {
        let agent = Agent::parse(&agent)?;
        app.state::<BinaryManager>().request_download(agent);
        Ok(())
    }

    /// Cancels an in-flight download (no Conductor counterpart found yet;
    /// resolves to whether one was running).
    #[tauri::command]
    pub fn cancel_agent_binary_download(
        app: tauri::AppHandle,
        agent: String,
    ) -> Result<bool, String> {
        let agent = Agent::parse(&agent)?;
        Ok(app.state::<BinaryManager>().cancel(agent))
    }
}

#[cfg(test)]
#[path = "agent_binaries_tests.rs"]
mod tests;
