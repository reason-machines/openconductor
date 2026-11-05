//! The `spotlight_testing` setting: "Use spotlight testing" on a
//! repository's Actions settings page (reference: `evidence/spotlight/NOTES.md`).
//!
//! It is a top-level boolean in the settings files, read through every layer
//! like any other setting (user, repository shared, repository local,
//! managed). The UI writes it to the repository local layer,
//! `<root>/.conductor/settings.local.toml`, as the reference does. After a
//! write the reference stops every run process of the repository's
//! workspaces (`killProcessesForRepository`), Spotlight included, so the next
//! Run starts in the new mode; [`apply`] does the same through the callers'
//! stop functions.

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use oc_scripts::config::{
    load_layers, Layer, LayerSource, SettingsPaths, SharedSource, SETTINGS_DIR,
};
use openconductor_db::{repos, workspaces, SqlitePool};
use serde::Serialize;
use toml::{Table, Value};

/// Key in the settings files.
pub const KEY: &str = "spotlight_testing";

/// File the UI writes, under `<root>/.conductor/`.
pub const LOCAL_FILE: &str = "settings.local.toml";

/// The effective value and where it comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotlightTesting {
    pub enabled: bool,
    /// Layer that sets the effective value; `None` when no file sets it, which
    /// means off.
    pub layer: Option<Layer>,
    /// The managed layer sets it, so the UI shows it locked.
    pub managed: bool,
}

/// The reference stores the value through a typed setting (boolean); a
/// `"true"` / `"false"` string is accepted too, as its UI hands the value
/// over as a string.
fn as_bool(value: &Value) -> Option<bool> {
    match value {
        Value::Boolean(b) => Some(*b),
        Value::String(s) if s == "true" => Some(true),
        Value::String(s) if s == "false" => Some(false),
        _ => None,
    }
}

/// The highest-precedence layer's value wins; layers order by (format,
/// layer), as everywhere else in the settings files.
pub fn effective(layers: &[LayerSource]) -> SpotlightTesting {
    let mut ordered: Vec<&LayerSource> = layers.iter().collect();
    ordered.sort_by_key(|l| (l.format, l.layer));
    let set = |l: &&LayerSource| l.table.get(KEY).and_then(as_bool);
    let top = ordered
        .iter()
        .rev()
        .find_map(|l| set(l).map(|v| (v, l.layer)));
    SpotlightTesting {
        enabled: top.is_some_and(|(v, _)| v),
        layer: top.map(|(_, layer)| layer),
        managed: ordered
            .iter()
            .any(|l| l.layer == Layer::Managed && set(l).is_some()),
    }
}

/// Read the setting through every layer.
pub fn read(paths: &SettingsPaths) -> Result<SpotlightTesting, String> {
    let (layers, _warnings) = load_layers(paths).map_err(|e| e.to_string())?;
    Ok(effective(&layers))
}

/// Set the key in `<root>/.conductor/settings.local.toml`, keeping every
/// other key. A file that does not parse is left alone and reported.
/// Comments in the file are not kept.
pub fn write_local(repo_root: &Path, enabled: bool) -> Result<(), String> {
    let dir = repo_root.join(SETTINGS_DIR);
    let path = dir.join(LOCAL_FILE);
    let mut table = match fs::read_to_string(&path) {
        Ok(text) => text
            .parse::<Table>()
            .map_err(|e| format!("could not parse {}: {e}", path.display()))?,
        Err(e) if e.kind() == ErrorKind::NotFound => Table::new(),
        Err(e) => return Err(format!("could not read {}: {e}", path.display())),
    };
    table.insert(KEY.to_string(), Value::Boolean(enabled));
    let text = toml::to_string(&table).map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let tmp = dir.join(format!(".{LOCAL_FILE}.{}.tmp", std::process::id()));
    let write = || -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(text.as_bytes())?;
        f.sync_all()?;
        fs::rename(&tmp, &path)
    };
    write().map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("{}: {e}", path.display())
    })
}

/// A repository's root, where its settings are read from, and its
/// workspaces.
#[derive(Debug, Clone)]
pub struct RepoTarget {
    pub root: PathBuf,
    pub paths: SettingsPaths,
    pub workspace_ids: Vec<String>,
}

/// Look up `repo_id`. Shared settings come from `origin/<default branch>`,
/// as for scripts.
pub async fn target(
    pool: &SqlitePool,
    repo_id: &str,
    user_dir: PathBuf,
) -> Result<RepoTarget, String> {
    let repo = repos::get(pool, repo_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("repository {repo_id} not found"))?;
    let root = repo
        .root_path
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .ok_or_else(|| format!("repository {repo_id} has no root path"))?;
    let default_branch = repo.default_branch.unwrap_or_else(|| "main".into());
    let workspace_ids = workspaces::list(pool)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|w| w.workspace.repository_id == repo_id)
        .map(|w| w.workspace.local_id)
        .collect();
    Ok(RepoTarget {
        paths: SettingsPaths {
            user_dir,
            repo_root: root.clone(),
            workspace: None,
            shared_from: SharedSource::GitRef(format!("origin/{default_branch}")),
        },
        root,
        workspace_ids,
    })
}

/// What [`apply`] did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotlightTestingChange {
    pub setting: SpotlightTesting,
    /// Workspaces that had a run process stopped.
    pub stopped_workspaces: Vec<String>,
    /// A Spotlight session on the root was ended and the root restored.
    pub spotlight_stopped: bool,
}

/// Write the setting, then stop the repository's run processes and its
/// Spotlight session, like the reference's toggle. Refused when the managed
/// layer sets the key (the reference disables the toggle then).
pub fn apply(
    target: &RepoTarget,
    enabled: bool,
    mut stop_runs: impl FnMut(&str) -> bool,
    stop_spotlight: impl FnOnce(&Path) -> bool,
) -> Result<SpotlightTestingChange, String> {
    if read(&target.paths)?.managed {
        return Err("Spotlight testing is set by managed settings".into());
    }
    write_local(&target.root, enabled)?;
    let stopped_workspaces = target
        .workspace_ids
        .iter()
        .filter(|id| stop_runs(id))
        .cloned()
        .collect();
    let spotlight_stopped = stop_spotlight(&target.root);
    Ok(SpotlightTestingChange {
        setting: read(&target.paths)?,
        stopped_workspaces,
        spotlight_stopped,
    })
}
