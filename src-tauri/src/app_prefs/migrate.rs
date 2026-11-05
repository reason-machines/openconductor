//! The reference's one-time migrations out of `conductor.db` into settings
//! files, each guarded by a flag in the `settings` table:
//!
//! - `file_backed_settings_migration_complete` (`n$e` in `index-*.js`):
//!   every live `settings` row whose key the reference registers as
//!   file-backed (`default_model` -> `models.default`, ...) is written to the
//!   user `settings.toml` unless that file already sets the key, and the row
//!   is then marked `deprecated_at`.
//! - `repo_conductor_config_file_migration_v2_complete` (`aIt`/`cIt`): each
//!   repository's scripts and run mode (from its `conductor_config` JSON,
//!   else the `repos` columns) and `enterpriseDataPrivacy` go to
//!   `<root>/.conductor/settings.local.toml`.
//! - `repo_custom_prompt_file_migration_complete` (`iIt`/`oIt`): each
//!   repository's `custom_prompt_*` columns go to the same file as
//!   `prompts.*`, and the columns are cleared.
//!
//! A repository write (`u2`) skips a key the local file already sets. The
//! reference runs the two repository migrations before the repo-local one
//! (`V8t`: `aIt`, `iIt`, `lIt`); `spotlight::migrate` is `lIt`.

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use oc_scripts::config::SETTINGS_DIR;
use openconductor_db::{app_settings, repos, SqlitePool};
use toml::{Table, Value};

use crate::settings::{self, Settings};

pub const FILE_BACKED_FLAG: &str = "file_backed_settings_migration_complete";
pub const REPO_CONFIG_FLAG: &str = "repo_conductor_config_file_migration_v2_complete";
pub const REPO_PROMPTS_FLAG: &str = "repo_custom_prompt_file_migration_complete";

/// How a table row's text becomes a TOML value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Text,
    /// `"true"` / `"false"`; anything else is not migrated.
    Flag,
}

/// The reference's file-backed settings: table key, dotted path in the
/// settings files, value kind (its settings registry, `Me({fileKey})` is
/// text, `xe({fileKey})` boolean; evidence/settings/NOTES.md).
pub const FILE_BACKED: &[(&str, &str, Kind)] = &[
    ("default_model", "models.default", Kind::Text),
    ("review_model", "models.review", Kind::Text),
    ("default_fast_mode", "models.default_fast_mode", Kind::Flag),
    ("review_fast_mode", "models.review_fast_mode", Kind::Flag),
    ("default_plan_mode", "models.default_plan_mode", Kind::Flag),
    (
        "default_codex_thinking_level",
        "models.codex.default_thinking_level",
        Kind::Text,
    ),
    (
        "review_codex_thinking_level",
        "models.codex.review_thinking_level",
        Kind::Text,
    ),
    (
        "default_codex_personality",
        "models.codex.personality",
        Kind::Text,
    ),
    (
        "default_claude_personality",
        "models.claude_code.personality",
        Kind::Text,
    ),
    (
        "default_claude_effort_level",
        "models.claude_code.default_effort_level",
        Kind::Text,
    ),
    (
        "review_claude_effort_level",
        "models.claude_code.review_effort_level",
        Kind::Text,
    ),
    (
        "codex_tool_approval_policy",
        "models.codex.tool_approval_policy",
        Kind::Text,
    ),
    (
        "visible_provider_models",
        "models.visible_provider_models",
        Kind::Text,
    ),
    ("setup_script", "scripts.setup", Kind::Text),
    ("run_script", "scripts.run", Kind::Text),
    ("archive_script", "scripts.archive", Kind::Text),
    ("run_script_mode", "scripts.run_mode", Kind::Text),
    (
        "auto_run_after_setup",
        "scripts.auto_run_after_setup",
        Kind::Flag,
    ),
    (
        "environment_variable_files",
        "environment_variable_files",
        Kind::Text,
    ),
    (
        "enterprise_data_privacy",
        "enterprise_data_privacy",
        Kind::Flag,
    ),
    ("file_include_globs", "file_include_globs", Kind::Text),
    ("spotlight_testing", "spotlight_testing", Kind::Flag),
    (
        "custom_prompt_code_review",
        "prompts.code_review",
        Kind::Text,
    ),
    ("custom_prompt_create_pr", "prompts.create_pr", Kind::Text),
    ("custom_prompt_fix_errors", "prompts.fix_errors", Kind::Text),
    (
        "custom_prompt_resolve_merge_conflicts",
        "prompts.resolve_merge_conflicts",
        Kind::Text,
    ),
    (
        "custom_prompt_rename_branch",
        "prompts.rename_branch",
        Kind::Text,
    ),
    ("custom_prompt_general", "prompts.general", Kind::Text),
    (
        "tool_approvals_enabled",
        "tool_approvals_enabled",
        Kind::Flag,
    ),
    (
        "claude_executable_path",
        "claude_code_executable_path",
        Kind::Text,
    ),
    ("codex_executable_path", "codex_executable_path", Kind::Text),
    (
        "opencode_executable_path",
        "opencode_executable_path",
        Kind::Text,
    ),
    ("claude_provider", "claude_provider", Kind::Text),
    ("codex_provider", "codex_provider", Kind::Text),
    ("bedrock_region", "bedrock_region", Kind::Text),
    ("vertex_project_id", "vertex_project_id", Kind::Text),
    ("ssh_key_path", "ssh_key_path", Kind::Text),
    (
        "delete_branch_on_archive",
        "git.delete_branch_on_archive",
        Kind::Flag,
    ),
    ("archive_on_merge", "git.archive_on_merge", Kind::Flag),
    (
        "worktree_push_auto_setup_remote",
        "git.worktree_push_auto_setup_remote",
        Kind::Flag,
    ),
    ("branch_prefix_type", "git.branch_prefix_type", Kind::Text),
    ("branch_prefix_custom", "git.branch_prefix", Kind::Text),
    ("open_url_template", "preview_urls", Kind::Text),
];

fn typed(kind: Kind, text: &str) -> Option<Value> {
    match kind {
        Kind::Text => Some(Value::String(text.to_string())),
        Kind::Flag => match text {
            "true" => Some(Value::Boolean(true)),
            "false" => Some(Value::Boolean(false)),
            _ => None,
        },
    }
}

/// The value at a dotted path such as `models.codex.default_thinking_level`.
pub fn get_dotted<'a>(table: &'a Table, path: &str) -> Option<&'a Value> {
    let (parents, leaf) = match path.rsplit_once('.') {
        Some((p, l)) => (Some(p), l),
        None => (None, path),
    };
    let mut t = table;
    for part in parents.into_iter().flat_map(|p| p.split('.')) {
        t = t.get(part)?.as_table()?;
    }
    t.get(leaf)
}

/// Set a dotted path, creating parent tables. `false` (and no change) when a
/// parent is not a table.
pub fn insert_dotted(table: &mut Table, path: &str, value: Value) -> bool {
    let mut parts: Vec<&str> = path.split('.').collect();
    let leaf = parts.pop().expect("split yields one part");
    let mut t = table;
    for part in parts {
        let entry = t
            .entry(part.to_string())
            .or_insert_with(|| Value::Table(Table::new()));
        match entry.as_table_mut() {
            Some(next) => t = next,
            None => return false,
        }
    }
    t.insert(leaf.to_string(), value);
    true
}

fn read_table(path: &Path) -> Result<Table, String> {
    match fs::read_to_string(path) {
        Ok(text) => text
            .parse::<Table>()
            .map_err(|e| format!("could not parse {}: {e}", path.display())),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Table::new()),
        Err(e) => Err(format!("could not read {}: {e}", path.display())),
    }
}

/// A user settings table the app can load (parses into [`Settings`] and
/// passes validation).
fn as_settings(table: &Table) -> Result<Settings, String> {
    let s: Settings = Table::try_into(table.clone()).map_err(|e| e.to_string())?;
    settings::validate(&s).map_err(|e| e.to_string())?;
    Ok(s)
}

#[derive(Debug, Default, PartialEq)]
pub struct FileBackedReport {
    pub already_done: bool,
    /// Table keys written to the user settings file.
    pub written: Vec<String>,
    /// Table keys the file already set, or whose value the file rejects.
    pub kept_file: Vec<String>,
    /// Rows marked deprecated.
    pub deprecated: Vec<String>,
}

/// `file_backed_settings_migration_complete`: move file-backed `settings`
/// rows into the user settings file at `user_file`.
pub async fn file_backed_settings(
    pool: &SqlitePool,
    user_file: &Path,
) -> Result<FileBackedReport, String> {
    let err = |e: openconductor_db::Error| e.to_string();
    if app_settings::get(pool, FILE_BACKED_FLAG)
        .await
        .map_err(err)?
        .as_deref()
        == Some("true")
    {
        return Ok(FileBackedReport {
            already_done: true,
            ..FileBackedReport::default()
        });
    }
    let rows = app_settings::active(pool).await.map_err(err)?;
    let mut table = read_table(user_file)?;
    let mut report = FileBackedReport::default();
    for (key, text) in &rows {
        let Some(&(_, path, kind)) = FILE_BACKED.iter().find(|(k, _, _)| k == key) else {
            continue;
        };
        report.deprecated.push(key.clone());
        let value = match typed(kind, text) {
            Some(v) if get_dotted(&table, path).is_none() => v,
            _ => {
                report.kept_file.push(key.clone());
                continue;
            }
        };
        let before = table.clone();
        if insert_dotted(&mut table, path, value) && as_settings(&table).is_ok() {
            report.written.push(key.clone());
        } else {
            table = before;
            report.kept_file.push(key.clone());
        }
    }
    if !report.written.is_empty() {
        // Only the migrated keys are added; the rest of the file is kept as is.
        as_settings(&table)?;
        let dir = user_file.parent().unwrap_or_else(|| Path::new("."));
        let text = toml::to_string(&table).map_err(|e| e.to_string())?;
        write_atomic(dir, user_file, &text)?;
    }
    for key in &report.deprecated {
        app_settings::deprecate(pool, key).await.map_err(err)?;
    }
    app_settings::set(pool, FILE_BACKED_FLAG, "true")
        .await
        .map_err(err)?;
    Ok(report)
}

/// The parts of a repository's legacy `conductor.json` (`conductor_config`
/// column) the reference reads (`U_`).
#[derive(Debug, Default, PartialEq)]
pub struct LegacyConfig {
    pub setup: Option<String>,
    pub run: Option<String>,
    pub archive: Option<String>,
    pub run_mode: Option<String>,
    pub enterprise_data_privacy: Option<bool>,
}

fn run_mode(s: Option<&str>) -> Option<String> {
    s.filter(|m| *m == "concurrent" || *m == "nonconcurrent")
        .map(str::to_string)
}

/// `None` for a missing, blank or unparseable value, as the reference.
pub fn legacy_config(raw: Option<&str>) -> Option<LegacyConfig> {
    let raw = raw.filter(|r| !r.trim().is_empty())?;
    let json: serde_json::Value = serde_json::from_str(raw).ok()?;
    let obj = json.as_object()?;
    let scripts = obj.get("scripts").and_then(|s| s.as_object());
    let script = |name: &str| {
        scripts
            .and_then(|s| s.get(name))
            .and_then(|v| v.as_str())
            .map(str::to_string)
    };
    Some(LegacyConfig {
        setup: script("setup"),
        run: script("run"),
        archive: script("archive"),
        run_mode: run_mode(obj.get("runScriptMode").and_then(|v| v.as_str())),
        enterprise_data_privacy: match obj.get("enterpriseDataPrivacy") {
            Some(serde_json::Value::Bool(b)) => Some(*b),
            Some(serde_json::Value::String(s)) if s == "true" => Some(true),
            Some(serde_json::Value::String(s)) if s == "false" => Some(false),
            _ => None,
        },
    })
}

/// Write each `(path, value)` the repository's local settings file does not
/// set yet. `Ok(false)` when there was nothing to migrate (`u2`).
pub fn write_local_missing(root: &Path, entries: &[(&str, Value)]) -> Result<bool, String> {
    if entries.is_empty() {
        return Ok(false);
    }
    if !root.is_dir() {
        return Err(format!("root {} does not exist", root.display()));
    }
    let dir = root.join(SETTINGS_DIR);
    let path = dir.join(crate::spotlight::setting::LOCAL_FILE);
    let mut table = read_table(&path)?;
    let mut changed = false;
    for (key, value) in entries {
        if get_dotted(&table, key).is_none() && insert_dotted(&mut table, key, value.clone()) {
            changed = true;
        }
    }
    if changed {
        write_atomic(
            &dir,
            &path,
            &toml::to_string(&table).map_err(|e| e.to_string())?,
        )?;
    }
    Ok(true)
}

fn write_atomic(dir: &Path, path: &Path, text: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let tmp: PathBuf = dir.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("settings"),
        std::process::id()
    ));
    let write = || -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(text.as_bytes())?;
        f.sync_all()?;
        fs::rename(&tmp, path)
    };
    write().map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("{}: {e}", path.display())
    })
}

fn text_entry<'a>(path: &'a str, v: &Option<String>) -> Option<(&'a str, Value)> {
    v.as_ref().map(|s| (path, Value::String(s.clone())))
}

#[derive(Debug, Default, PartialEq)]
pub struct RepoReport {
    pub already_done: bool,
    /// Repositories that had values to migrate.
    pub migrated: Vec<String>,
    pub failed: Vec<(String, String)>,
}

async fn flag_set(pool: &SqlitePool, key: &str) -> Result<bool, String> {
    Ok(app_settings::get(pool, key)
        .await
        .map_err(|e| e.to_string())?
        .as_deref()
        == Some("true"))
}

fn root_of(repo: &repos::Repo) -> PathBuf {
    PathBuf::from(repo.root_path.clone().unwrap_or_default())
}

/// `repo_conductor_config_file_migration_v2_complete`. The flag is set once
/// every repository is done; a failed one is retried next launch.
pub async fn repo_config_files(pool: &SqlitePool) -> Result<RepoReport, String> {
    if flag_set(pool, REPO_CONFIG_FLAG).await? {
        return Ok(RepoReport {
            already_done: true,
            ..RepoReport::default()
        });
    }
    let mut report = RepoReport::default();
    for repo in repos::list(pool).await.map_err(|e| e.to_string())? {
        let cols = repos::settings(pool, &repo.id)
            .await
            .map_err(|e| e.to_string())?;
        let json = legacy_config(repo.conductor_config.as_deref()).unwrap_or_default();
        let entries: Vec<(&str, Value)> = [
            text_entry("scripts.setup", &json.setup.or(cols.setup_script)),
            text_entry("scripts.run", &json.run.or(cols.run_script)),
            text_entry("scripts.archive", &json.archive.or(cols.archive_script)),
            text_entry(
                "scripts.run_mode",
                &json
                    .run_mode
                    .or_else(|| run_mode(cols.run_script_mode.as_deref())),
            ),
            json.enterprise_data_privacy
                .map(|b| ("enterprise_data_privacy", Value::Boolean(b))),
        ]
        .into_iter()
        .flatten()
        .collect();
        match write_local_missing(&root_of(&repo), &entries) {
            Ok(true) => report.migrated.push(repo.id),
            Ok(false) => {}
            Err(e) => report.failed.push((repo.id, e)),
        }
    }
    if report.failed.is_empty() {
        app_settings::set(pool, REPO_CONFIG_FLAG, "true")
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(report)
}

/// `repo_custom_prompt_file_migration_complete`: prompts move to the local
/// settings file and the columns are cleared.
pub async fn repo_prompt_files(pool: &SqlitePool) -> Result<RepoReport, String> {
    if flag_set(pool, REPO_PROMPTS_FLAG).await? {
        return Ok(RepoReport {
            already_done: true,
            ..RepoReport::default()
        });
    }
    let mut report = RepoReport::default();
    for repo in repos::list(pool).await.map_err(|e| e.to_string())? {
        let cols = repos::settings(pool, &repo.id)
            .await
            .map_err(|e| e.to_string())?;
        let entries: Vec<(&str, Value)> = [
            text_entry("prompts.code_review", &cols.custom_prompt_code_review),
            text_entry("prompts.create_pr", &cols.custom_prompt_create_pr),
            text_entry("prompts.fix_errors", &cols.custom_prompt_fix_errors),
            text_entry(
                "prompts.resolve_merge_conflicts",
                &cols.custom_prompt_resolve_merge_conflicts,
            ),
            text_entry("prompts.rename_branch", &cols.custom_prompt_rename_branch),
            text_entry("prompts.general", &cols.custom_prompt_general),
        ]
        .into_iter()
        .flatten()
        .collect();
        match write_local_missing(&root_of(&repo), &entries) {
            Ok(true) => {
                repos::clear_custom_prompts(pool, &repo.id)
                    .await
                    .map_err(|e| e.to_string())?;
                report.migrated.push(repo.id);
            }
            Ok(false) => {}
            Err(e) => report.failed.push((repo.id, e)),
        }
    }
    if report.failed.is_empty() {
        app_settings::set(pool, REPO_PROMPTS_FLAG, "true")
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(report)
}

/// Run all three at startup, before the settings service reads the user
/// file. Failures are logged and retried next launch.
pub fn at_startup(pool: &SqlitePool, user_file: &Path) {
    tauri::async_runtime::block_on(async {
        if let Err(e) = file_backed_settings(pool, user_file).await {
            eprintln!("file-backed settings migration left for next launch: {e}");
        }
        for (name, result) in [
            ("repository config", repo_config_files(pool).await),
            ("repository prompt", repo_prompt_files(pool).await),
        ] {
            match result {
                Ok(r) => {
                    for (repo, e) in r.failed {
                        eprintln!(
                            "{name} file migration: repository {repo} left for next launch: {e}"
                        );
                    }
                }
                Err(e) => eprintln!("{name} file migration failed: {e}"),
            }
        }
    });
}
