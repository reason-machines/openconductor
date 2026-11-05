//! File-backed local storage for the app's eleven client subsystems.
//!
//! Each subsystem is one JSON object (key to value) in its own file under the
//! app data directory, named `local-storage.subsystem.<name>.json`. Writes go
//! to a temporary file that is renamed over the old one, so a crash never
//! leaves a half-written file behind.

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// One file-backed client subsystem.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Subsystem {
    BrowserLocalStorage,
    ClaudeContextWindows,
    ComposerDrafts,
    DispatcherState,
    ModelPickerConfigsV1,
    OpencodeModelDiscoveryV1,
    PreWorkspaceCompletionsV1,
    RouteUserState,
    RunScriptHistory,
    Terminal,
    TurnChangesCache,
}

impl Subsystem {
    /// Every subsystem, in a stable order.
    pub const ALL: [Subsystem; 11] = [
        Subsystem::BrowserLocalStorage,
        Subsystem::ClaudeContextWindows,
        Subsystem::ComposerDrafts,
        Subsystem::DispatcherState,
        Subsystem::ModelPickerConfigsV1,
        Subsystem::OpencodeModelDiscoveryV1,
        Subsystem::PreWorkspaceCompletionsV1,
        Subsystem::RouteUserState,
        Subsystem::RunScriptHistory,
        Subsystem::Terminal,
        Subsystem::TurnChangesCache,
    ];

    /// The name used in the file name.
    pub fn name(self) -> &'static str {
        match self {
            Subsystem::BrowserLocalStorage => "browser-local-storage",
            Subsystem::ClaudeContextWindows => "claude-context-windows",
            Subsystem::ComposerDrafts => "composer-drafts",
            Subsystem::DispatcherState => "dispatcher-state",
            Subsystem::ModelPickerConfigsV1 => "model-picker-configs-v1",
            Subsystem::OpencodeModelDiscoveryV1 => "opencode-model-discovery-v1",
            Subsystem::PreWorkspaceCompletionsV1 => "pre-workspace-completions-v1",
            Subsystem::RouteUserState => "route-user-state",
            Subsystem::RunScriptHistory => "run-script-history",
            Subsystem::Terminal => "terminal",
            Subsystem::TurnChangesCache => "turn-changes-cache",
        }
    }

    /// File name of this subsystem inside the storage directory.
    pub fn file_name(self) -> String {
        format!("local-storage.subsystem.{}.json", self.name())
    }
}

/// A key-value store per subsystem, rooted at one directory.
#[derive(Debug, Clone)]
pub struct LocalStorage {
    dir: PathBuf,
}

/// The contents of one subsystem: string keys to JSON values.
pub type Entries = BTreeMap<String, serde_json::Value>;

impl LocalStorage {
    /// A store rooted at `dir`. The directory is created on first write.
    pub fn new(dir: impl AsRef<Path>) -> Self {
        Self {
            dir: dir.as_ref().to_path_buf(),
        }
    }

    fn path(&self, subsystem: Subsystem) -> PathBuf {
        self.dir.join(subsystem.file_name())
    }

    /// Every entry of `subsystem`; an absent file is an empty subsystem.
    pub fn entries(&self, subsystem: Subsystem) -> io::Result<Entries> {
        match fs::read(self.path(subsystem)) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Entries::new()),
            Err(e) => Err(e),
        }
    }

    /// One value, or `None` when the key is absent.
    pub fn get(&self, subsystem: Subsystem, key: &str) -> io::Result<Option<serde_json::Value>> {
        Ok(self.entries(subsystem)?.remove(key))
    }

    /// Set `key` to `value`, replacing any earlier value.
    pub fn set(
        &self,
        subsystem: Subsystem,
        key: &str,
        value: serde_json::Value,
    ) -> io::Result<()> {
        let mut entries = self.entries(subsystem)?;
        entries.insert(key.to_string(), value);
        self.write(subsystem, &entries)
    }

    /// Remove `key`; returns whether it was present.
    pub fn remove(&self, subsystem: Subsystem, key: &str) -> io::Result<bool> {
        let mut entries = self.entries(subsystem)?;
        let existed = entries.remove(key).is_some();
        if existed {
            self.write(subsystem, &entries)?;
        }
        Ok(existed)
    }

    fn write(&self, subsystem: Subsystem, entries: &Entries) -> io::Result<()> {
        fs::create_dir_all(&self.dir)?;
        let path = self.path(subsystem);
        let tmp = path.with_extension("json.tmp");
        let bytes = serde_json::to_vec_pretty(entries)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(&tmp, bytes)?;
        fs::rename(&tmp, &path)
    }
}
