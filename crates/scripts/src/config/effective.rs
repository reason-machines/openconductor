//! Effective values of the settings.toml keys outside `[scripts]` that a
//! workspace resolves through the settings layers: `[prompts]`, the `[git]`
//! flags, `preview_urls`, `environment_variable_files` and
//! `environment_variables`.
//!
//! Layers, lowest first, as the reference's settings service builds them for
//! a workspace (`TZ` in its frontend bundle, see
//! `evidence/settings/NOTES.md`, "Prompts, git flags and environment"):
//! user `settings.toml`, repository shared `<root>/.conductor/settings.toml`
//! (working tree), workspace shared `<workspace>/.conductor/settings.toml`
//! when the workspace is not the root, repository local
//! `<root>/.conductor/settings.local.toml`, then managed. JSON files are
//! read for the repository layers only and rank below every TOML file.
//! A higher layer's value replaces a lower one's; tables merge key by key.
//!
//! Environment variables are collected layer by layer in the same order:
//! each layer's `environment_variable_files` first (every layer), then its
//! `environment_variables` table (repository and workspace layers only).
//! Top-level entries apply to local and cloud, `.local` and `.cloud` to one
//! context; the value `"<none>"` unsets a variable inherited from a lower
//! layer. Managed `environment_variables.local` / `.cloud` apply last.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
use toml::{Table, Value};

use super::load::read_optional;
use super::{ConfigError, Format, Layer, LayerSource, Sourced, SETTINGS_DIR};

/// Value that unsets an inherited variable (the reference's `pN`).
pub const UNSET_VALUE: &str = "<none>";
/// Value the reference writes for a variable kept in its Keychain (`sZ`).
pub const KEYCHAIN_VALUE: &str = "conductor-keychain";

/// Where a workspace's settings files are.
#[derive(Debug, Clone)]
pub struct EffectivePaths {
    /// Directory holding the user `settings.toml` and `settings.managed.toml`.
    pub user_dir: PathBuf,
    /// Root that relative user env-file paths fall back to (the home folder).
    pub home: PathBuf,
    /// The repository's main checkout.
    pub repo_root: PathBuf,
    /// The workspace, when resolving for one.
    pub workspace: Option<PathBuf>,
}

/// One settings file and the folders relative paths in it resolve against.
#[derive(Debug, Clone)]
pub struct EffectiveLayer {
    pub source: LayerSource,
    /// Folder of the file: relative env files are looked up here first.
    pub dir: PathBuf,
    /// Fallback folder for relative env files.
    pub root: PathBuf,
    /// Repository or workspace layer: its `environment_variables` apply.
    pub repo: bool,
    /// What `~` in an env-file path means.
    pub home: PathBuf,
}

/// The custom instruction an action sends with its prompt. Keys are the
/// `[prompts]` table's (`prompts.general`, ...).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PromptKind {
    /// Appended to the first message of every new chat.
    General,
    CodeReview,
    CreatePr,
    FixErrors,
    RenameBranch,
    ResolveMergeConflicts,
}

impl PromptKind {
    pub const ALL: [PromptKind; 6] = [
        PromptKind::General,
        PromptKind::CodeReview,
        PromptKind::CreatePr,
        PromptKind::FixErrors,
        PromptKind::RenameBranch,
        PromptKind::ResolveMergeConflicts,
    ];

    /// Key inside `[prompts]`.
    pub fn key(self) -> &'static str {
        match self {
            PromptKind::General => "general",
            PromptKind::CodeReview => "code_review",
            PromptKind::CreatePr => "create_pr",
            PromptKind::FixErrors => "fix_errors",
            PromptKind::RenameBranch => "rename_branch",
            PromptKind::ResolveMergeConflicts => "resolve_merge_conflicts",
        }
    }

    pub fn parse(key: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|k| k.key() == key)
    }
}

/// Effective `[prompts]`; blank values count as unset.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Prompts {
    pub general: Option<Sourced<String>>,
    pub code_review: Option<Sourced<String>>,
    pub create_pr: Option<Sourced<String>>,
    pub fix_errors: Option<Sourced<String>>,
    pub rename_branch: Option<Sourced<String>>,
    pub resolve_merge_conflicts: Option<Sourced<String>>,
}

impl Prompts {
    pub fn get(&self, kind: PromptKind) -> Option<&str> {
        self.slot(kind).as_ref().map(|s| s.value.as_str())
    }

    fn slot(&self, kind: PromptKind) -> &Option<Sourced<String>> {
        match kind {
            PromptKind::General => &self.general,
            PromptKind::CodeReview => &self.code_review,
            PromptKind::CreatePr => &self.create_pr,
            PromptKind::FixErrors => &self.fix_errors,
            PromptKind::RenameBranch => &self.rename_branch,
            PromptKind::ResolveMergeConflicts => &self.resolve_merge_conflicts,
        }
    }

    fn slot_mut(&mut self, kind: PromptKind) -> &mut Option<Sourced<String>> {
        match kind {
            PromptKind::General => &mut self.general,
            PromptKind::CodeReview => &mut self.code_review,
            PromptKind::CreatePr => &mut self.create_pr,
            PromptKind::FixErrors => &mut self.fix_errors,
            PromptKind::RenameBranch => &mut self.rename_branch,
            PromptKind::ResolveMergeConflicts => &mut self.resolve_merge_conflicts,
        }
    }
}

/// Effective `[git]` keys. `branch_prefix` also reads the rebuild's older
/// name `branch_prefix_custom` when a layer has no `branch_prefix`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GitFlags {
    pub branch_prefix_type: Option<Sourced<String>>,
    pub branch_prefix: Option<Sourced<String>>,
    /// Default off.
    pub archive_on_merge: Sourced<bool>,
    /// Default off.
    pub delete_branch_on_archive: Sourced<bool>,
    /// Default on: the reference treats anything but `false` as on.
    pub worktree_push_auto_setup_remote: Sourced<bool>,
}

impl Default for GitFlags {
    fn default() -> Self {
        let off = Sourced {
            value: false,
            layer: Layer::Defaults,
        };
        Self {
            branch_prefix_type: None,
            branch_prefix: None,
            archive_on_merge: off.clone(),
            delete_branch_on_archive: off,
            worktree_push_auto_setup_remote: Sourced {
                value: true,
                layer: Layer::Defaults,
            },
        }
    }
}

/// One entry of `preview_urls`: the terminal panel's Open URLs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, serde::Deserialize)]
pub struct PreviewUrl {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub url: String,
}

/// Local workspaces or cloud workspaces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EnvContext {
    Local,
    Cloud,
}

/// Where an environment variable's value came from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvSource {
    pub layer: Layer,
    /// The settings file that set it, or that listed the env file.
    pub origin: String,
    /// The env file it was read from, when it came from one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_file: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EnvVar {
    pub value: String,
    pub source: EnvSource,
}

/// One `environment_variable_files` entry of one layer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvFileStatus {
    pub layer: Layer,
    /// As written in the settings file.
    pub entry: String,
    /// Resolved absolute path.
    pub path: String,
    /// Variables read from it; `None` when it is missing or unreadable.
    pub loaded: Option<usize>,
}

/// The variables agents, terminals and scripts of a workspace get.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct ResolvedEnv {
    pub local: BTreeMap<String, EnvVar>,
    pub cloud: BTreeMap<String, EnvVar>,
    pub files: Vec<EnvFileStatus>,
}

impl ResolvedEnv {
    pub fn vars(&self, context: EnvContext) -> BTreeMap<String, String> {
        let map = match context {
            EnvContext::Local => &self.local,
            EnvContext::Cloud => &self.cloud,
        };
        map.iter()
            .map(|(k, v)| (k.clone(), v.value.clone()))
            .collect()
    }

    /// [`ResolvedEnv::vars`] with the variables stored on the Environment
    /// settings page (`env_vars`) applied, as Conductor's `xz` does: a stored
    /// value replaces a value from the user's own files, but never one a
    /// repository settings file sets (`oN`: a repo-scoped file), and managed
    /// values, applied after it there, still win.
    pub fn vars_with_stored<'a>(
        &self,
        context: EnvContext,
        stored: impl IntoIterator<Item = (&'a str, &'a str)>,
    ) -> BTreeMap<String, String> {
        let map = match context {
            EnvContext::Local => &self.local,
            EnvContext::Cloud => &self.cloud,
        };
        let mut out = self.vars(context);
        for (key, value) in stored {
            let pinned = map.get(key).is_some_and(|v| {
                matches!(
                    v.source.layer,
                    Layer::RepoShared | Layer::RepoLocal | Layer::Managed
                )
            });
            if !pinned {
                out.insert(key.to_string(), value.to_string());
            }
        }
        out
    }

    fn map(&mut self, context: EnvContext) -> &mut BTreeMap<String, EnvVar> {
        match context {
            EnvContext::Local => &mut self.local,
            EnvContext::Cloud => &mut self.cloud,
        }
    }
}

/// Everything this module resolves for one workspace.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveSettings {
    pub prompts: Prompts,
    pub git: GitFlags,
    pub preview_urls: Option<Sourced<Vec<PreviewUrl>>>,
    pub environment_variable_files: Option<Sourced<Vec<String>>>,
    pub env: ResolvedEnv,
    pub warnings: Vec<String>,
}

/// Read every settings file of [`EffectivePaths`] that exists, in
/// precedence order. A file that exists but does not parse is an error.
pub fn load_effective_layers(paths: &EffectivePaths) -> Result<Vec<EffectiveLayer>, ConfigError> {
    let mut out = Vec::new();
    let mut push = |layer: Layer, file: PathBuf, root: &Path, repo: bool, json: bool| {
        let dir = file.parent().map(Path::to_path_buf).unwrap_or_default();
        let with_ext = |ext: &str| {
            let mut name = file.clone().into_os_string();
            name.push(ext);
            PathBuf::from(name)
        };
        let mut candidates = vec![(Format::Toml, with_ext(".toml"))];
        if json {
            candidates.insert(0, (Format::Json, with_ext(".json")));
        }
        for (format, path) in candidates {
            let Some(text) = read_optional(&path)? else {
                continue;
            };
            let origin = path.display().to_string();
            let source = match format {
                Format::Toml => LayerSource::from_toml(layer, origin, &text)?,
                Format::Json => LayerSource::from_json(layer, origin, &text)?,
            };
            out.push(EffectiveLayer {
                source,
                dir: dir.clone(),
                root: root.to_path_buf(),
                repo,
                home: paths.home.clone(),
            });
        }
        Ok::<(), ConfigError>(())
    };
    let repo_dir = paths.repo_root.join(SETTINGS_DIR);
    push(
        Layer::User,
        paths.user_dir.join("settings"),
        &paths.home,
        false,
        false,
    )?;
    push(
        Layer::RepoShared,
        repo_dir.join("settings"),
        &paths.repo_root,
        true,
        true,
    )?;
    if let Some(ws) = paths.workspace.as_ref().filter(|w| **w != paths.repo_root) {
        push(
            Layer::RepoShared,
            ws.join(SETTINGS_DIR).join("settings"),
            ws,
            true,
            true,
        )?;
    }
    push(
        Layer::RepoLocal,
        repo_dir.join("settings.local"),
        &paths.repo_root,
        true,
        true,
    )?;
    push(
        Layer::Managed,
        paths.user_dir.join("settings.managed"),
        &paths.home,
        false,
        false,
    )?;
    Ok(out)
}

/// [`load_effective_layers`] then [`resolve_effective`].
pub fn load_effective(paths: &EffectivePaths) -> Result<EffectiveSettings, ConfigError> {
    Ok(resolve_effective(&load_effective_layers(paths)?))
}

/// Read this module's keys from the layers, env files included. Each key
/// takes the highest layer's value that has the right type; a value of the
/// wrong type is dropped with a warning, as the reference drops invalid
/// values per file.
pub fn resolve_effective(layers: &[EffectiveLayer]) -> EffectiveSettings {
    let mut ordered: Vec<&EffectiveLayer> = layers.iter().collect();
    ordered.sort_by_key(|l| (l.source.format, l.source.layer)); // stable
    let mut out = EffectiveSettings::default();
    let w = &mut out.warnings;

    for kind in PromptKind::ALL {
        *out.prompts.slot_mut(kind) =
            pick(&ordered, &["prompts", kind.key()], w, as_string).filter(not_blank);
    }
    let git = &mut out.git;
    git.branch_prefix_type =
        pick(&ordered, &["git", "branch_prefix_type"], w, as_string).filter(not_blank);
    // `branch_prefix_custom` is the rebuild's older name; `branch_prefix` wins in a layer.
    git.branch_prefix = pick_any(
        &ordered,
        &[&["git", "branch_prefix"], &["git", "branch_prefix_custom"]],
        w,
        as_string,
    )
    .filter(not_blank);
    for (name, slot) in [
        ("archive_on_merge", &mut git.archive_on_merge),
        (
            "delete_branch_on_archive",
            &mut git.delete_branch_on_archive,
        ),
        (
            "worktree_push_auto_setup_remote",
            &mut git.worktree_push_auto_setup_remote,
        ),
    ] {
        if let Some(v) = pick(&ordered, &["git", name], w, as_bool) {
            *slot = v;
        }
    }
    out.preview_urls = pick(&ordered, &["preview_urls"], w, |v| {
        let mut ignored = Vec::new();
        let urls = parse_preview_urls(v, &mut ignored)?;
        Some(urls)
    });
    out.environment_variable_files = pick(&ordered, &["environment_variable_files"], w, |v| {
        matches!(v, Value::Array(_) | Value::String(_)).then(|| env_file_entries(v))
    });

    let mut env = ResolvedEnv::default();
    for l in ordered.iter().filter(|l| l.source.layer != Layer::Managed) {
        apply_env_files(l, &mut env);
        if l.repo {
            apply_env_table(l, &mut env, &mut out.warnings, true);
        }
    }
    for l in ordered.iter().filter(|l| l.source.layer == Layer::Managed) {
        apply_env_table(l, &mut env, &mut out.warnings, false);
    }
    out.env = env;
    out
}

fn as_string(v: &Value) -> Option<String> {
    v.as_str().map(str::to_string)
}

/// A boolean, or the strings `"true"` / `"false"` the reference also accepts.
fn as_bool(v: &Value) -> Option<bool> {
    match v {
        Value::Boolean(b) => Some(*b),
        Value::String(s) if s == "true" || s == "false" => Some(s == "true"),
        _ => None,
    }
}

fn not_blank(s: &Sourced<String>) -> bool {
    !s.value.trim().is_empty()
}

fn pick<T>(
    ordered: &[&EffectiveLayer],
    path: &[&str],
    warnings: &mut Vec<String>,
    parse: impl Fn(&Value) -> Option<T>,
) -> Option<Sourced<T>> {
    pick_any(ordered, &[path], warnings, parse)
}

/// Highest layer with a valid value at one of `paths` (earlier paths win
/// within a layer).
fn pick_any<T>(
    ordered: &[&EffectiveLayer],
    paths: &[&[&str]],
    warnings: &mut Vec<String>,
    parse: impl Fn(&Value) -> Option<T>,
) -> Option<Sourced<T>> {
    for l in ordered.iter().rev() {
        for path in paths {
            let Some(v) = lookup(&l.source.table, path) else {
                continue;
            };
            match parse(v) {
                Some(value) => {
                    return Some(Sourced {
                        value,
                        layer: l.source.layer,
                    })
                }
                None => warnings.push(format!(
                    "{}: ignored {} value {v} in {}",
                    path.join("."),
                    v.type_str(),
                    l.source.origin
                )),
            }
        }
    }
    None
}

fn lookup<'a>(table: &'a Table, path: &[&str]) -> Option<&'a Value> {
    let (last, parents) = path.split_last()?;
    let mut t = table;
    for p in parents {
        t = t.get(*p)?.as_table()?;
    }
    t.get(*last)
}

/// `preview_urls`: an array of `{ name?, url }` tables. A string is read the
/// way the reference reads its stored value: a JSON array of the same
/// entries, or else one URL.
pub fn parse_preview_urls(v: &Value, warnings: &mut Vec<String>) -> Option<Vec<PreviewUrl>> {
    let items: Vec<Value> = match v {
        Value::Array(a) => a.clone(),
        Value::String(s) if s.trim().is_empty() => return Some(Vec::new()),
        Value::String(s) => match serde_json::from_str::<Vec<PreviewUrl>>(s.trim()) {
            Ok(list) => return Some(list),
            Err(_) => {
                return Some(vec![PreviewUrl {
                    name: None,
                    url: s.trim().to_string(),
                }])
            }
        },
        other => {
            warnings.push(format!(
                "preview_urls: expected an array, got {}",
                other.type_str()
            ));
            return None;
        }
    };
    let mut out = Vec::new();
    for item in items {
        let entry = item.as_table().and_then(|t| {
            if t.keys().any(|k| k != "name" && k != "url") {
                return None;
            }
            let url = t.get("url")?.as_str()?.to_string();
            let name = match t.get("name") {
                None => None,
                Some(Value::String(n)) => Some(n.clone()),
                Some(_) => return None,
            };
            Some(PreviewUrl { name, url })
        });
        match entry {
            Some(e) => out.push(e),
            None => warnings.push(format!("preview_urls: ignored entry {item}")),
        }
    }
    Some(out)
}

/// `environment_variable_files`: an array of paths, or one path per line.
pub fn env_file_entries(v: &Value) -> Vec<String> {
    let lines: Vec<String> = match v {
        Value::Array(a) if a.iter().all(Value::is_str) => a
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect(),
        Value::String(s) => s.lines().map(str::to_string).collect(),
        _ => Vec::new(),
    };
    lines
        .into_iter()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

/// Absolute paths and `~` as written; a relative path resolves against the
/// settings file's folder when that file exists, else against `root`.
pub fn resolve_env_file(entry: &str, dir: &Path, root: &Path, home: &Path) -> PathBuf {
    if entry.starts_with('/') {
        return normalize(Path::new(entry));
    }
    if entry == "~" {
        return home.to_path_buf();
    }
    if let Some(rest) = entry.strip_prefix("~/") {
        return normalize(&home.join(rest));
    }
    let near = normalize(&dir.join(entry));
    if near.exists() {
        near
    } else {
        normalize(&root.join(entry))
    }
}

fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                if !out.pop() {
                    out.push("..");
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn valid_name(k: &str) -> bool {
    let mut chars = k.chars();
    chars
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Parse a dotenv file the way the reference does (`RLe`): blank lines and
/// `#` lines skipped, an optional `export `, `NAME=value` with a valid
/// name; double quotes take `\n`, `\r`, `\t` and `\x` escapes, single quotes
/// are literal, and an unquoted value ends at ` #`.
pub fn parse_dotenv(text: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").map_or(line, str::trim_start);
        let Some(eq) = line.find('=').filter(|i| *i > 0) else {
            continue;
        };
        let name = line[..eq].trim();
        if !valid_name(name) {
            continue;
        }
        out.insert(name.to_string(), dotenv_value(line[eq + 1..].trim()));
    }
    out
}

fn dotenv_value(v: &str) -> String {
    let Some(quote) = v.chars().next().filter(|c| *c == '"' || *c == '\'') else {
        let end = v
            .char_indices()
            .find(|(i, c)| *c == '#' && v[..*i].ends_with(char::is_whitespace))
            .map_or(v.len(), |(i, _)| i);
        return v[..end].trim().to_string();
    };
    let mut out = String::new();
    let mut escaped = false;
    for c in v[1..].chars() {
        if escaped {
            out.push(match c {
                'n' => '\n',
                'r' => '\r',
                't' => '\t',
                other => other,
            });
            escaped = false;
        } else if quote == '"' && c == '\\' {
            escaped = true;
        } else if c == quote {
            return out;
        } else {
            out.push(c);
        }
    }
    out
}

fn apply_env_files(l: &EffectiveLayer, env: &mut ResolvedEnv) {
    let Some(v) = l.source.table.get("environment_variable_files") else {
        return;
    };
    for entry in env_file_entries(v) {
        let path = resolve_env_file(&entry, &l.dir, &l.root, &l.home);
        let text = std::fs::read_to_string(&path).ok();
        let vars = text.as_deref().map(parse_dotenv);
        env.files.push(EnvFileStatus {
            layer: l.source.layer,
            entry: entry.clone(),
            path: path.display().to_string(),
            loaded: vars.as_ref().map(BTreeMap::len),
        });
        for (name, value) in vars.unwrap_or_default() {
            let source = EnvSource {
                layer: l.source.layer,
                origin: l.source.origin.clone(),
                env_file: Some(path.display().to_string()),
            };
            for ctx in [EnvContext::Local, EnvContext::Cloud] {
                env.map(ctx).insert(
                    name.clone(),
                    EnvVar {
                        value: value.clone(),
                        source: source.clone(),
                    },
                );
            }
        }
    }
}

/// `environment_variables` (or the legacy `environmentVariables`). With
/// `shared_entries` false (managed), only `.local` and `.cloud` count.
fn apply_env_table(
    l: &EffectiveLayer,
    env: &mut ResolvedEnv,
    warnings: &mut Vec<String>,
    shared_entries: bool,
) {
    let Some(table) = l
        .source
        .table
        .get("environment_variables")
        .or_else(|| l.source.table.get("environmentVariables"))
        .and_then(Value::as_table)
    else {
        return;
    };
    let both = [EnvContext::Local, EnvContext::Cloud];
    let mut set = |name: &str, value: &Value, contexts: &[EnvContext]| {
        let name = name.trim();
        if name.is_empty() {
            return;
        }
        if !valid_name(name) {
            warnings.push(format!(
                "environment_variables: ignored invalid name {name:?}"
            ));
            return;
        }
        let Value::String(value) = value else {
            warnings.push(format!(
                "environment_variables.{name}: expected a string, got {}",
                value.type_str()
            ));
            return;
        };
        if value == KEYCHAIN_VALUE {
            warnings.push(format!(
                "environment_variables.{name}: Keychain-stored values are not supported; ignored"
            ));
            return;
        }
        for ctx in contexts {
            if value == UNSET_VALUE {
                env.map(*ctx).remove(name);
            } else {
                env.map(*ctx).insert(
                    name.to_string(),
                    EnvVar {
                        value: value.clone(),
                        source: EnvSource {
                            layer: l.source.layer,
                            origin: l.source.origin.clone(),
                            env_file: None,
                        },
                    },
                );
            }
        }
    };
    if shared_entries {
        for (k, v) in table {
            if k != "local" && k != "cloud" && !v.is_table() {
                set(k, v, &both);
            }
        }
    }
    for (key, ctx) in [("local", EnvContext::Local), ("cloud", EnvContext::Cloud)] {
        if let Some(sub) = table.get(key).and_then(Value::as_table) {
            for (k, v) in sub {
                set(k, v, &[ctx]);
            }
        }
    }
}

/// Keys the app may write to the repository local layer: this module's
/// keys, with Conductor's dotted paths.
pub fn is_local_writable(path: &[&str]) -> bool {
    match path {
        ["prompts", key] => PromptKind::parse(key).is_some(),
        ["git", key] => matches!(
            *key,
            "branch_prefix_type"
                | "branch_prefix"
                | "archive_on_merge"
                | "delete_branch_on_archive"
                | "worktree_push_auto_setup_remote"
        ),
        ["preview_urls"] | ["environment_variable_files"] => true,
        ["environment_variables", name] => valid_name(name),
        ["environment_variables", "local" | "cloud", name] => valid_name(name),
        _ => false,
    }
}

/// Set (`Some`) or remove (`None`) `path` in
/// `<root>/.conductor/settings.local.toml`, keeping every other key and
/// dropping tables the removal leaves empty, as the reference does (`tZ`).
/// Shared settings are never written: the reference treats them as
/// read-only ("Edit the settings file directly"). Comments are not kept.
pub fn set_local_value(
    repo_root: &Path,
    path: &[&str],
    value: Option<Value>,
) -> Result<(), ConfigError> {
    let dir = repo_root.join(SETTINGS_DIR);
    let file = dir.join("settings.local.toml");
    let origin = file.display().to_string();
    if !is_local_writable(path) {
        return Err(ConfigError::Parse {
            origin,
            message: format!("{} is not a repository setting", path.join(".")),
        });
    }
    let mut table = match read_optional(&file)? {
        Some(text) => LayerSource::from_toml(Layer::RepoLocal, origin.clone(), &text)?.table,
        None => Table::new(),
    };
    match value {
        Some(v) => {
            let (last, parents) = path.split_last().expect("non-empty path");
            let mut t = &mut table;
            for p in parents {
                let entry = t
                    .entry(p.to_string())
                    .or_insert_with(|| Value::Table(Table::new()));
                if !entry.is_table() {
                    *entry = Value::Table(Table::new());
                }
                t = entry.as_table_mut().expect("table");
            }
            t.insert(last.to_string(), v);
        }
        None => {
            remove_path(&mut table, path);
        }
    }
    let io = |e: std::io::Error| ConfigError::Io {
        origin: origin.clone(),
        message: e.to_string(),
    };
    let text = toml::to_string(&table).map_err(|e| ConfigError::Parse {
        origin: origin.clone(),
        message: e.to_string(),
    })?;
    std::fs::create_dir_all(&dir).map_err(io)?;
    let tmp = dir.join(format!(".settings.local.toml.{}.tmp", std::process::id()));
    std::fs::write(&tmp, text)
        .and_then(|()| std::fs::rename(&tmp, &file))
        .map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            io(e)
        })
}

/// Remove `path`; true when `table` is left empty.
fn remove_path(table: &mut Table, path: &[&str]) -> bool {
    match path {
        [] => {}
        [last] => {
            table.remove(*last);
        }
        [first, rest @ ..] => {
            if let Some(Value::Table(t)) = table.get_mut(*first) {
                if remove_path(t, rest) {
                    table.remove(*first);
                }
            }
        }
    }
    table.is_empty()
}
