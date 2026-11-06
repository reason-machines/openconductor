//! Draft attachment staging: Conductor's `draft-attachments/` store.
//!
//! Files attached in the composer before a workspace exists (or before it is
//! ready) are staged under `<AppData>/draft-attachments/<localWorkspaceId>/`,
//! keyed by their workspace-relative path below `.context/attachments/`. Once
//! the workspace is ready they are materialized into
//! `<workspacePath>/.context/attachments/...` and the staged copies removed. At
//! startup, staging directories untouched for more than 30 days are swept.
//!
//! Reconstructed from Conductor 0.87.6 (evidence/persistence/draft-attachments/
//! README.md): the frontend constants `hvt = "draft-attachments"` and
//! `Iv = ".context/attachments"`, the staging service (`fle`), the
//! materializer (`uvt`), the orphan sweep (`cvt`, 720 h) and the Rust command
//! `materialize_local_path_attachment` (`conductor_lib::attachments`).
//!
//! The core is plain `std` so it builds and tests without Tauri
//! (`--cfg draft_attachments_std_only`, see
//! evidence/persistence/draft-attachments/run-tests.sh); [`commands`] is the
//! IPC layer.

use std::fmt;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime};

/// Directory under the app data dir that holds staged drafts (Conductor `hvt`).
pub const STAGING_DIR_NAME: &str = "draft-attachments";
/// Workspace-relative attachments directory (Conductor `Iv`).
pub const ATTACHMENTS_DIR: &str = ".context/attachments";
/// Staging directories older than this are orphans (Conductor `avt`, 720 h).
pub const ORPHAN_MAX_AGE: Duration = Duration::from_secs(720 * 60 * 60);

#[derive(Debug)]
pub enum Error {
    /// The relative path is not below `.context/attachments/` (Conductor's message).
    NotStaged(String),
    /// The relative path or workspace id would leave its directory.
    UnsafePath(String),
    Io {
        action: &'static str,
        path: PathBuf,
        source: io::Error,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::NotStaged(path) => write!(
                f,
                "Staged attachment relativePath must start with \"{ATTACHMENTS_DIR}/\": {path}"
            ),
            Error::UnsafePath(path) => write!(f, "Unsafe draft attachment path: {path}"),
            Error::Io {
                action,
                path,
                source,
            } => {
                write!(f, "Failed to {action} {}: {source}", path.display())
            }
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

/// Copies `source` to `destination`, creating the destination's parent
/// directories (Conductor `materialize_local_path_attachment` for a local
/// workspace without `resizeImage`).
pub fn materialize_local_path_attachment(source: &Path, destination: &Path) -> Result<()> {
    if !source.is_file() {
        return Err(Error::Io {
            action: "read attachment source",
            path: source.to_path_buf(),
            source: io::Error::new(io::ErrorKind::NotFound, "not a regular file"),
        });
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(io_err("create directory", parent))?;
    }
    fs::copy(source, destination).map_err(io_err("copy attachment to", destination))?;
    Ok(())
}

/// What one sweep removed or failed to remove.
#[derive(Debug, Default, PartialEq, Eq)]
#[cfg_attr(
    not(draft_attachments_std_only),
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct SweepReport {
    pub removed: Vec<PathBuf>,
    pub failed: Vec<(PathBuf, String)>,
}

/// One staged file that was (or failed to be) materialized.
#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(
    not(draft_attachments_std_only),
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct Materialized {
    /// Workspace-relative path, `.context/attachments/<dir>/<file>`.
    pub relative_path: String,
    /// `None` when it was copied into the workspace.
    pub error: Option<String>,
}

#[derive(Debug, Default, PartialEq, Eq)]
#[cfg_attr(
    not(draft_attachments_std_only),
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct MaterializeReport {
    pub attachments: Vec<Materialized>,
    /// The workspace's staging directory was removed (every copy succeeded).
    pub staging_removed: bool,
}

/// The `draft-attachments/` store under one app data directory.
#[derive(Debug, Clone)]
pub struct DraftAttachments {
    root: PathBuf,
}

impl DraftAttachments {
    pub fn new(app_data_dir: &Path) -> Self {
        Self {
            root: app_data_dir.join(STAGING_DIR_NAME),
        }
    }

    /// `<AppData>/draft-attachments` (Conductor `vle`).
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// `<root>/<localWorkspaceId>` (Conductor `yle`).
    pub fn staging_directory(&self, local_workspace_id: &str) -> Result<PathBuf> {
        let mut parts = Path::new(local_workspace_id).components();
        match (parts.next(), parts.next()) {
            (Some(Component::Normal(_)), None) => Ok(self.root.join(local_workspace_id)),
            _ => Err(Error::UnsafePath(local_workspace_id.to_string())),
        }
    }

    /// Where a workspace-relative attachment path is staged (Conductor
    /// `resolveStagedAttachmentLocation`): `.context/attachments/<rest>` maps to
    /// `<root>/<localWorkspaceId>/<rest>`.
    pub fn resolve(&self, local_workspace_id: &str, relative_path: &str) -> Result<PathBuf> {
        let rest = relative_path
            .strip_prefix(ATTACHMENTS_DIR)
            .and_then(|rest| rest.strip_prefix('/'))
            .ok_or_else(|| Error::NotStaged(relative_path.to_string()))?;
        let rest_path = Path::new(rest);
        let safe = rest_path.components().next().is_some()
            && rest_path
                .components()
                .all(|c| matches!(c, Component::Normal(_) | Component::CurDir));
        if !safe {
            return Err(Error::UnsafePath(relative_path.to_string()));
        }
        Ok(self.staging_directory(local_workspace_id)?.join(rest_path))
    }

    /// Stages `data` (Conductor `writeDraftAttachment`): creates the parent
    /// directories and writes the file. Returns the stored path.
    pub fn write(
        &self,
        local_workspace_id: &str,
        relative_path: &str,
        data: &[u8],
    ) -> Result<PathBuf> {
        let stored = self.resolve(local_workspace_id, relative_path)?;
        if let Some(parent) = stored.parent() {
            fs::create_dir_all(parent).map_err(io_err("create directory", parent))?;
        }
        fs::write(&stored, data).map_err(io_err("write staged draft attachment", &stored))?;
        Ok(stored)
    }

    /// Removes one staged file (Conductor `removeStagedAttachment`). Absent is
    /// not an error; returns whether a file was removed.
    pub fn remove(&self, local_workspace_id: &str, relative_path: &str) -> Result<bool> {
        let stored = self.resolve(local_workspace_id, relative_path)?;
        match fs::remove_file(&stored) {
            Ok(()) => Ok(true),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(io_err("remove staged draft attachment", &stored)(e)),
        }
    }

    /// Materializes one staged file into the workspace and removes the staged
    /// copy (Conductor `uploadStagedAttachmentToWorkspace`). Failing to remove
    /// the staged copy is only logged, as in Conductor.
    pub fn upload_to_workspace(
        &self,
        local_workspace_id: &str,
        relative_path: &str,
        workspace_path: &Path,
    ) -> Result<PathBuf> {
        let stored = self.resolve(local_workspace_id, relative_path)?;
        let destination = workspace_path.join(relative_path);
        materialize_local_path_attachment(&stored, &destination)?;
        if let Err(e) = fs::remove_file(&stored) {
            eprintln!(
                "[draftAttachments] Failed to remove staged attachment after upload: workspace={local_workspace_id} relativePath={relative_path} error={e}"
            );
        }
        Ok(destination)
    }

    /// Materializes every staged file of a workspace (Conductor
    /// `materializeDraftAttachments`). Only `<staging>/<dir>/<file>` entries are
    /// considered. The staging directory is removed only when every copy
    /// succeeded; a missing staging directory is a no-op.
    pub fn materialize_all(
        &self,
        local_workspace_id: &str,
        workspace_path: &Path,
    ) -> Result<MaterializeReport> {
        let staging = self.staging_directory(local_workspace_id)?;
        if !staging.exists() {
            return Ok(MaterializeReport::default());
        }
        let mut staged = Vec::new();
        for dir in read_dir_sorted(&staging)? {
            if !dir.is_dir {
                continue;
            }
            for file in read_dir_sorted(&dir.path)? {
                if file.is_file {
                    staged.push((
                        file.path,
                        format!("{ATTACHMENTS_DIR}/{}/{}", dir.name, file.name),
                    ));
                }
            }
        }
        let mut report = MaterializeReport::default();
        for (source, relative_path) in staged {
            let destination = workspace_path.join(&relative_path);
            let error = materialize_local_path_attachment(&source, &destination).err().map(|e| {
                eprintln!(
                    "[draftAttachments] Failed to materialize draft attachment: workspace={local_workspace_id} relativePath={relative_path} error={e}"
                );
                e.to_string()
            });
            report.attachments.push(Materialized {
                relative_path,
                error,
            });
        }
        if report.attachments.iter().all(|a| a.error.is_none()) {
            match fs::remove_dir_all(&staging) {
                Ok(()) => report.staging_removed = true,
                Err(e) => eprintln!(
                    "[draftAttachments] Failed to remove draft attachments dir after upload: workspace={local_workspace_id} error={e}"
                ),
            }
        }
        Ok(report)
    }

    /// Removes staging directories whose mtime is more than [`ORPHAN_MAX_AGE`]
    /// before `now` (Conductor `cvt`). Non-directories and entries without an
    /// mtime are skipped; per-directory failures are reported, not fatal; a
    /// missing root is a no-op.
    pub fn sweep_orphans(&self, now: SystemTime) -> Result<SweepReport> {
        let mut report = SweepReport::default();
        if !self.root.exists() {
            return Ok(report);
        }
        for entry in read_dir_sorted(&self.root)? {
            if !entry.is_dir {
                continue;
            }
            let Ok(modified) = fs::metadata(&entry.path).and_then(|m| m.modified()) else {
                continue;
            };
            // A future mtime counts as fresh.
            let age = now.duration_since(modified).unwrap_or_default();
            if age <= ORPHAN_MAX_AGE {
                continue;
            }
            match fs::remove_dir_all(&entry.path) {
                Ok(()) => report.removed.push(entry.path),
                Err(e) => {
                    eprintln!(
                        "[draftAttachments] Failed to sweep orphaned draft attachments dir: dir={} error={e}",
                        entry.path.display()
                    );
                    report.failed.push((entry.path, e.to_string()));
                }
            }
        }
        Ok(report)
    }
}

struct Entry {
    name: String,
    path: PathBuf,
    is_dir: bool,
    is_file: bool,
}

/// `readDir` as Conductor's fs plugin reports it: names plus whether each entry
/// is a directory or file (symlinks are followed, as `stat` does).
fn read_dir_sorted(dir: &Path) -> Result<Vec<Entry>> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(dir).map_err(io_err("read directory", dir))? {
        let entry = entry.map_err(io_err("read directory", dir))?;
        let path = entry.path();
        let meta = fs::metadata(&path).ok();
        entries.push(Entry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: meta.as_ref().is_some_and(|m| m.is_dir()),
            is_file: meta.as_ref().is_some_and(|m| m.is_file()),
            path,
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

/// Runs the orphan sweep once, off the main thread (Conductor runs it at app
/// start).
pub fn sweep_at_startup(app_data_dir: &Path) {
    let store = DraftAttachments::new(app_data_dir);
    std::thread::spawn(move || {
        if let Err(e) = store.sweep_orphans(SystemTime::now()) {
            eprintln!("[draftAttachments] Failed to sweep orphaned draft attachments: {e}");
        }
    });
}

/// Tauri IPC layer. Excluded from the standalone harness build
/// (`--cfg draft_attachments_std_only`).
#[cfg(not(draft_attachments_std_only))]
pub mod commands {
    use super::{DraftAttachments, MaterializeReport};
    use std::path::{Path, PathBuf};
    use tauri::Manager;

    fn store(app: &tauri::AppHandle) -> Result<DraftAttachments, String> {
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        Ok(DraftAttachments::new(&data_dir))
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct StagedLocation {
        pub stored_path: PathBuf,
    }

    /// Conductor `writeDraftAttachment({draftWorkspaceId, relativePath, data})`.
    #[tauri::command]
    pub async fn draft_attachment_write(
        app: tauri::AppHandle,
        draft_workspace_id: String,
        relative_path: String,
        data: Vec<u8>,
    ) -> Result<StagedLocation, String> {
        let store = store(&app)?;
        tauri::async_runtime::spawn_blocking(move || {
            store.write(&draft_workspace_id, &relative_path, &data)
        })
        .await
        .map_err(|e| e.to_string())?
        .map(|stored_path| StagedLocation { stored_path })
        .map_err(|e| e.to_string())
    }

    /// Conductor `resolveStagedAttachmentLocation({localWorkspaceId, relativePath})`.
    #[tauri::command]
    pub fn draft_attachment_resolve(
        app: tauri::AppHandle,
        local_workspace_id: String,
        relative_path: String,
    ) -> Result<StagedLocation, String> {
        store(&app)?
            .resolve(&local_workspace_id, &relative_path)
            .map(|stored_path| StagedLocation { stored_path })
            .map_err(|e| e.to_string())
    }

    /// Conductor `removeStagedAttachment`; resolves to whether a file was removed.
    #[tauri::command]
    pub fn draft_attachment_remove(
        app: tauri::AppHandle,
        local_workspace_id: String,
        relative_path: String,
    ) -> Result<bool, String> {
        store(&app)?
            .remove(&local_workspace_id, &relative_path)
            .map_err(|e| e.to_string())
    }

    /// Conductor `uploadStagedAttachmentToWorkspace`.
    #[tauri::command]
    pub async fn draft_attachment_upload(
        app: tauri::AppHandle,
        local_workspace_id: String,
        relative_path: String,
        workspace_path: String,
    ) -> Result<PathBuf, String> {
        let store = store(&app)?;
        tauri::async_runtime::spawn_blocking(move || {
            store.upload_to_workspace(
                &local_workspace_id,
                &relative_path,
                Path::new(&workspace_path),
            )
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
    }

    /// Conductor `materializeDraftAttachments({localWorkspaceId})`.
    #[tauri::command]
    pub async fn draft_attachments_materialize(
        app: tauri::AppHandle,
        local_workspace_id: String,
        workspace_path: String,
    ) -> Result<MaterializeReport, String> {
        let store = store(&app)?;
        tauri::async_runtime::spawn_blocking(move || {
            store.materialize_all(&local_workspace_id, Path::new(&workspace_path))
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
    }

    /// Conductor's command of the same name, for a local workspace without
    /// `resizeImage` (the only form the draft path uses).
    #[tauri::command]
    pub async fn materialize_local_path_attachment(
        source_path: String,
        destination_path: String,
    ) -> Result<(), String> {
        tauri::async_runtime::spawn_blocking(move || {
            super::materialize_local_path_attachment(
                Path::new(&source_path),
                Path::new(&destination_path),
            )
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
#[path = "draft_attachments_tests.rs"]
mod tests;
