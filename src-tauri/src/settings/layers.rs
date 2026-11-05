//! Effective settings for one repository: the user `settings.toml`, then
//! the repository's shared `.conductor/settings.toml`, its local
//! `.conductor/settings.local.toml`, then the managed file, read with the
//! layered loader of `oc_scripts::config` (same precedence and git-ref
//! handling as scripts and spotlight).
//!
//! Repository layers may set only the keys Conductor marks workspace
//! configurable ([`REPO_KEYS`]); Conductor's `models.*` keys other than
//! `models.visible_provider_models` and `tool_approvals_enabled` are user
//! only, so a repository file setting them is ignored. The managed layer
//! may set anything.
//!
//! Provider precedence across layers: when a layer above the user file
//! sets `claude_provider` (or `codex_provider`), it replaces the user's
//! `[providers.claude]` (`[providers.codex]`) table, so a repository that
//! says `claude_provider = "default"` runs on the login whatever the user
//! configured. Within one file `[providers.<agent>]` outranks the top-level
//! key ([`Settings::provider_for`]).

use std::path::Path;

use oc_scripts::config::{
    deep_merge, load_layers, Layer, LayerSource, SettingsPaths, SharedSource,
};
use serde::Deserialize;
use toml::{Table, Value};

use super::{validate, Settings, SettingsError};

/// Dotted keys a repository's settings files may set (Conductor's
/// `workspaceConfigurable` keys of this group).
pub const REPO_KEYS: [&str; 9] = [
    "claude_provider",
    "codex_provider",
    "bedrock_region",
    "vertex_project_id",
    "claude_code_executable_path",
    "codex_executable_path",
    "opencode_executable_path",
    "ssh_key_path",
    "models.visible_provider_models",
];

/// Top-level provider key and the `[providers]` entry it replaces.
const PROVIDER_KEYS: [(&str, &str); 2] =
    [("claude_provider", "claude"), ("codex_provider", "codex")];

fn get_path<'a>(table: &'a Table, path: &str) -> Option<&'a Value> {
    let mut parts = path.split('.');
    let mut value = table.get(parts.next()?)?;
    for part in parts {
        value = value.as_table()?.get(part)?;
    }
    Some(value)
}

fn set_path(table: &mut Table, path: &str, value: Value) {
    let mut parts: Vec<&str> = path.split('.').collect();
    let leaf = parts.pop().unwrap_or(path);
    let mut cur = table;
    for part in parts {
        let entry = cur
            .entry(part.to_string())
            .or_insert_with(|| Value::Table(Table::new()));
        if !entry.is_table() {
            *entry = Value::Table(Table::new());
        }
        cur = entry.as_table_mut().expect("just made a table");
    }
    cur.insert(leaf.to_string(), value);
}

/// The part of a repository layer it may set.
fn repo_part(table: &Table) -> Table {
    let mut out = Table::new();
    for key in REPO_KEYS {
        if let Some(v) = get_path(table, key) {
            set_path(&mut out, key, v.clone());
        }
    }
    out
}

/// Merge `layers` by precedence into one validated [`Settings`].
pub fn merge(layers: &[LayerSource]) -> Result<Settings, SettingsError> {
    let mut ordered: Vec<&LayerSource> = layers.iter().collect();
    ordered.sort_by_key(|l| (l.format, l.layer));
    let mut merged = Table::new();
    for l in ordered {
        let table = match l.layer {
            Layer::RepoShared | Layer::RepoLocal => repo_part(&l.table),
            _ => l.table.clone(),
        };
        if l.layer > Layer::User {
            for (key, agent) in PROVIDER_KEYS {
                if table.contains_key(key) {
                    if let Some(Value::Table(p)) = merged.get_mut("providers") {
                        p.remove(agent);
                    }
                }
            }
        }
        deep_merge(&mut merged, &table);
    }
    let settings = Settings::deserialize(Value::Table(merged))
        .map_err(|e| SettingsError::Invalid(e.to_string()))?;
    validate(&settings)?;
    Ok(settings)
}

/// Effective settings for the repository at `repo_root`, with the user and
/// managed files under `user_dir` (`super::config_dir`).
pub fn for_repo(
    user_dir: &Path,
    repo_root: &Path,
    shared_from: SharedSource,
) -> Result<Settings, SettingsError> {
    let paths = SettingsPaths {
        user_dir: user_dir.to_path_buf(),
        repo_root: repo_root.to_path_buf(),
        workspace: None,
        shared_from,
    };
    let (layers, _warnings) =
        load_layers(&paths).map_err(|e| SettingsError::Invalid(e.to_string()))?;
    merge(&layers)
}
