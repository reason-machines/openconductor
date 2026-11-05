//! Repository-scope settings of a workspace: `[prompts]`, the `[git]`
//! flags, `preview_urls` and the environment from `environment_variable_files`
//! and `environment_variables`, resolved through the layers in
//! `oc_scripts::config::effective` with this app's user `settings.toml`
//! (in [`super::config_dir`]) as the user layer.
//!
//! Every consumer of these keys reads them here, so a repository's
//! `.conductor/settings.toml`, a workspace's own copy and
//! `.conductor/settings.local.toml` override the user's values the way the
//! reference's `getSettingForWorkspaceV2` does. Evidence:
//! `evidence/settings/NOTES.md`, "Prompts, git flags and environment".

use std::path::{Path, PathBuf};

use oc_scripts::config::{
    load_effective, set_local_value, EffectivePaths, EffectiveSettings, EnvContext,
};

use super::{config_dir, SettingsError};

/// The layers for `repo_root`, and for `workspace` when given.
pub fn paths(repo_root: &Path, workspace: Option<&Path>) -> Result<EffectivePaths, SettingsError> {
    let home = std::env::var_os("HOME")
        .filter(|h| !h.is_empty())
        .map(PathBuf::from)
        .ok_or(SettingsError::NoHome)?;
    Ok(EffectivePaths {
        user_dir: config_dir()?,
        home,
        repo_root: repo_root.to_path_buf(),
        workspace: workspace.map(Path::to_path_buf),
    })
}

/// Effective settings of a workspace (or of the repository root).
pub fn resolve(repo_root: &Path, workspace: Option<&Path>) -> Result<EffectiveSettings, String> {
    let paths = paths(repo_root, workspace).map_err(|e| e.to_string())?;
    load_effective(&paths).map_err(|e| e.to_string())
}

/// Local-context environment variables for processes started in a
/// workspace: agents, terminals and scripts. Errors read as no variables,
/// so a broken settings file never blocks a terminal or an agent.
pub fn local_env(
    repo_root: &Path,
    workspace: Option<&Path>,
) -> std::collections::BTreeMap<String, String> {
    match resolve(repo_root, workspace) {
        Ok(e) => e.env.vars(EnvContext::Local),
        Err(err) => {
            eprintln!(
                "settings: environment for {} not applied: {err}",
                repo_root.display()
            );
            Default::default()
        }
    }
}

/// `repo_settings_effective`: what the repository settings rows show.
#[tauri::command]
pub async fn repo_settings_effective(
    repo_path: String,
    workspace_path: Option<String>,
) -> Result<EffectiveSettings, String> {
    tauri::async_runtime::spawn_blocking(move || {
        resolve(
            Path::new(&repo_path),
            workspace_path.as_deref().map(Path::new),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// `repo_settings_set_local`: set (`value`) or clear (`null`) one dotted key
/// in the repository's `.conductor/settings.local.toml`. Only the keys
/// `is_local_writable` lists are accepted.
#[tauri::command]
pub async fn repo_settings_set_local(
    repo_path: String,
    key: String,
    value: Option<serde_json::Value>,
) -> Result<EffectiveSettings, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(&repo_path);
        let path: Vec<&str> = key.split('.').collect();
        let value = value.map(json_to_toml).transpose()?;
        set_local_value(root, &path, value).map_err(|e| e.to_string())?;
        resolve(root, None)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn json_to_toml(v: serde_json::Value) -> Result<toml::Value, String> {
    Ok(match v {
        serde_json::Value::Null => return Err("null inside a value".into()),
        serde_json::Value::Bool(b) => toml::Value::Boolean(b),
        serde_json::Value::Number(n) => match n.as_i64() {
            Some(i) => toml::Value::Integer(i),
            None => toml::Value::Float(n.as_f64().ok_or("bad number")?),
        },
        serde_json::Value::String(s) => toml::Value::String(s),
        serde_json::Value::Array(a) => {
            toml::Value::Array(a.into_iter().map(json_to_toml).collect::<Result<_, _>>()?)
        }
        serde_json::Value::Object(o) => toml::Value::Table(
            o.into_iter()
                .map(|(k, v)| Ok((k, json_to_toml(v)?)))
                .collect::<Result<_, String>>()?,
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_values_map_to_toml() {
        let v = serde_json::json!([{ "name": "App", "url": "http://x" }, { "url": "y" }]);
        let t = json_to_toml(v).unwrap();
        assert_eq!(t.as_array().unwrap()[0]["name"].as_str(), Some("App"));
        assert!(json_to_toml(serde_json::json!([null])).is_err());
    }
}
