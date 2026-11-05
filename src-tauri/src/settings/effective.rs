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

/// The repository checkout `dir` belongs to: the main worktree for a
/// workspace (`git rev-parse --git-common-dir`), or `None` outside git.
pub fn repo_root_of(dir: &Path) -> Option<PathBuf> {
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["rev-parse", "--path-format=absolute", "--git-common-dir"])
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .output()
        .ok()
        .filter(|o| o.status.success())?;
    let common = PathBuf::from(String::from_utf8(out.stdout).ok()?.trim());
    match common.file_name() {
        Some(name) if name == ".git" => common.parent().map(Path::to_path_buf),
        _ => None, // a bare repository has no checkout to read settings from
    }
}

/// [`local_env`] for a process started in `dir` (a terminal), when `dir` is
/// inside a repository checkout; nothing otherwise.
pub fn local_env_for_dir(dir: &Path) -> std::collections::BTreeMap<String, String> {
    match repo_root_of(dir) {
        Some(root) => local_env(&root, Some(dir)),
        None => Default::default(),
    }
}

/// The settings environment hook for `oc_scripts`' script service.
pub fn script_env_hook() -> oc_scripts::service::SettingsEnv {
    std::sync::Arc::new(|ws: &oc_scripts::service::WorkspaceRef| {
        local_env(&ws.repo_root, Some(&ws.workspace_path))
    })
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

    fn git(dir: &Path, args: &[&str]) {
        let ok = std::process::Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .status()
            .unwrap()
            .success();
        assert!(ok, "git {args:?}");
    }

    #[test]
    fn repo_root_of_a_worktree_is_the_main_checkout() {
        let tmp = std::env::temp_dir().join(format!("oc-effective-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let (main, ws) = (tmp.join("main"), tmp.join("ws"));
        std::fs::create_dir_all(&main).unwrap();
        git(&main, &["init", "-q", "-b", "main"]);
        git(
            &main,
            &[
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "x",
            ],
        );
        git(
            &main,
            &["worktree", "add", "-q", ws.to_str().unwrap(), "-b", "w"],
        );
        let canon = |p: &Path| p.canonicalize().unwrap();
        assert_eq!(repo_root_of(&ws).map(|p| canon(&p)), Some(canon(&main)));
        assert_eq!(
            repo_root_of(&main.join(".git")).map(|p| canon(&p)),
            Some(canon(&main))
        );
        assert_eq!(repo_root_of(&tmp), None);

        std::fs::create_dir_all(main.join(".conductor")).unwrap();
        std::fs::write(
            main.join(".conductor/settings.local.toml"),
            "[environment_variables.local]\nTERM_VAR = \"from-settings\"\n",
        )
        .unwrap();
        let env = local_env_for_dir(&ws);
        assert_eq!(
            env.get("TERM_VAR").map(String::as_str),
            Some("from-settings")
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn create_pr_prompt_appends_the_effective_create_pr_instructions() {
        let root = std::env::temp_dir().join(format!("oc-create-pr-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join(".conductor")).unwrap();
        std::fs::write(
            root.join(".conductor/settings.local.toml"),
            "[prompts]\ncreate_pr = \"Link the Linear issue.\"\n",
        )
        .unwrap();
        let request = |custom: Option<&str>| crate::pr::api::CreatePrPrompt {
            branch: "sven/x".into(),
            remote: "origin".into(),
            target_branch: "main".into(),
            custom_instructions: custom.map(str::to_string),
            repo_path: Some(root.display().to_string()),
            ..Default::default()
        };
        let p = crate::pr::commands::pr_create_prompt(request(None));
        assert!(p.ends_with("steps above:\n\nLink the Linear issue."), "{p}");
        let p = crate::pr::commands::pr_create_prompt(request(Some("Explicit.")));
        assert!(p.ends_with("Explicit.") && !p.contains("Linear"), "{p}");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn json_values_map_to_toml() {
        let v = serde_json::json!([{ "name": "App", "url": "http://x" }, { "url": "y" }]);
        let t = json_to_toml(v).unwrap();
        assert_eq!(t.as_array().unwrap()[0]["name"].as_str(), Some("App"));
        assert!(json_to_toml(serde_json::json!([null])).is_err());
    }
}
