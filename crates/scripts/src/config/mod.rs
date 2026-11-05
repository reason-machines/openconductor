//! Settings layers for scripts and how they resolve.
//!
//! Layers, lowest to highest precedence (reference: bundled conductor skill,
//! "Settings files"):
//!
//! 1. built-in defaults
//! 2. user: `~/.conductor/settings.toml`
//! 3. repository shared: `<repo>/.conductor/settings.toml`, read from the
//!    remote default branch ([`SharedSource::GitRef`]), not the working tree
//! 4. repository local: `<repo>/.conductor/settings.local.toml`
//! 5. managed: `~/.conductor/settings.managed.toml`
//!
//! Any TOML file outranks any legacy JSON file regardless of layer, so the
//! order is: every JSON layer (in layer order), then every TOML layer.
//! A repository `conductor.json` is read as a legacy JSON shared layer only
//! when the shared `settings.toml` does not exist.
//!
//! Layers are deep-merged: tables merge key by key, any other value from a
//! higher layer replaces the lower one. A legacy single-string `scripts.run`
//! is normalized to one `[scripts.run.<LEGACY_RUN_ID>]` entry before merging.

use std::collections::BTreeSet;
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use toml::{Table, Value};

/// Run script id given to a legacy single-string `scripts.run`.
pub const LEGACY_RUN_ID: &str = "run";

/// Icon used when a run script has none or an invalid one.
pub const DEFAULT_ICON: &str = "play";

/// Directory (under the repository root and under the home directory) that
/// holds settings files.
pub const SETTINGS_DIR: &str = ".conductor";

/// A settings layer, in ascending precedence.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Layer {
    Defaults,
    User,
    RepoShared,
    RepoLocal,
    Managed,
}

/// File format of a layer. Every TOML layer outranks every JSON layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Format {
    Json,
    Toml,
}

/// Where a run script may be shown and run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Location {
    Local,
    Cloud,
}

impl Location {
    fn parse(s: &str) -> Option<Self> {
        match s {
            "local" => Some(Self::Local),
            "cloud" => Some(Self::Cloud),
            _ => None,
        }
    }
}

/// Whether run scripts of several workspaces of one repository may run at
/// the same time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunMode {
    /// Default (`repos.run_script_mode DEFAULT 'concurrent'` in the
    /// reference schema).
    #[default]
    Concurrent,
    Nonconcurrent,
}

impl RunMode {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "concurrent" => Some(Self::Concurrent),
            "nonconcurrent" => Some(Self::Nonconcurrent),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Concurrent => "concurrent",
            Self::Nonconcurrent => "nonconcurrent",
        }
    }
}

/// One parsed settings file.
#[derive(Debug, Clone, PartialEq)]
pub struct LayerSource {
    pub layer: Layer,
    pub format: Format,
    /// Path, or `<ref>:<path>` for a file read from git.
    pub origin: String,
    /// Contents, already normalized to the TOML settings shape.
    pub table: Table,
}

impl LayerSource {
    /// Parse a TOML settings file's text.
    pub fn from_toml(layer: Layer, origin: impl Into<String>, text: &str) -> Result<Self, ConfigError> {
        let origin = origin.into();
        let table: Table = text.parse().map_err(|e: toml::de::Error| ConfigError::Parse {
            origin: origin.clone(),
            message: e.message().to_string(),
        })?;
        Ok(Self {
            layer,
            format: Format::Toml,
            origin,
            table: normalize(table),
        })
    }

    /// Parse a legacy JSON settings file (same shape as the TOML file).
    pub fn from_json(layer: Layer, origin: impl Into<String>, text: &str) -> Result<Self, ConfigError> {
        let origin = origin.into();
        let json: serde_json::Value = serde_json::from_str(text).map_err(|e| ConfigError::Parse {
            origin: origin.clone(),
            message: e.to_string(),
        })?;
        let table = match json_to_toml(json) {
            Some(Value::Table(t)) => t,
            _ => {
                return Err(ConfigError::Parse {
                    origin,
                    message: "top level is not an object".into(),
                })
            }
        };
        Ok(Self {
            layer,
            format: Format::Json,
            origin,
            table: normalize(table),
        })
    }

    /// Parse a legacy repository `conductor.json` and map its keys to the
    /// settings shape (bundled skill, "Legacy conductor.json"):
    /// `scripts.setup`, `scripts.run` (string, becomes run script
    /// [`LEGACY_RUN_ID`]), `scripts.archive`, `runScriptMode` ->
    /// `scripts.run_mode`, `enterpriseDataPrivacy` -> `enterprise_data_privacy`.
    pub fn from_conductor_json(origin: impl Into<String>, text: &str) -> Result<Self, ConfigError> {
        let origin = origin.into();
        let json: serde_json::Value = serde_json::from_str(text).map_err(|e| ConfigError::Parse {
            origin: origin.clone(),
            message: e.to_string(),
        })?;
        let mut scripts = Table::new();
        if let Some(s) = json.get("scripts").and_then(|v| v.as_object()) {
            for key in ["setup", "run", "archive"] {
                if let Some(v) = s.get(key).and_then(|v| v.as_str()) {
                    scripts.insert(key.into(), Value::String(v.into()));
                }
            }
        }
        if let Some(mode) = json.get("runScriptMode").and_then(|v| v.as_str()) {
            scripts.insert("run_mode".into(), Value::String(mode.into()));
        }
        let mut table = Table::new();
        if !scripts.is_empty() {
            table.insert("scripts".into(), Value::Table(scripts));
        }
        if let Some(b) = json.get("enterpriseDataPrivacy").and_then(|v| v.as_bool()) {
            table.insert("enterprise_data_privacy".into(), Value::Boolean(b));
        }
        Ok(Self {
            layer: Layer::RepoShared,
            format: Format::Json,
            origin,
            table: normalize(table),
        })
    }

    fn rank(&self) -> (Format, Layer) {
        (self.format, self.layer)
    }
}

/// A value together with the layer that set it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Sourced<T> {
    pub value: T,
    pub layer: Layer,
}

/// One effective run script.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RunScript {
    pub id: String,
    pub command: String,
    /// `None` means everywhere (key omitted).
    pub available_in: Option<BTreeSet<Location>>,
    pub default: bool,
    pub icon: String,
    /// Highest layer that set any key of this script.
    pub layer: Layer,
}

impl RunScript {
    pub fn is_available_in(&self, location: Location) -> bool {
        self.available_in
            .as_ref()
            .is_none_or(|set| set.contains(&location))
    }
}

/// The effective `[scripts]` section.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct ResolvedScripts {
    pub setup: Option<Sourced<String>>,
    pub archive: Option<Sourced<String>>,
    pub run_mode: RunMode,
    /// In file order of the highest layer that introduced each id.
    pub run: Vec<RunScript>,
    /// Dotted key paths set by the managed layer; the UI disables them.
    pub managed_keys: BTreeSet<String>,
    /// Values that were ignored, with the reason.
    pub warnings: Vec<String>,
}

impl ResolvedScripts {
    /// Run scripts shown at `location`.
    pub fn run_scripts_for(&self, location: Location) -> Vec<&RunScript> {
        self.run.iter().filter(|s| s.is_available_in(location)).collect()
    }

    /// The script started by a plain "Run": the first one marked default,
    /// else the first one available.
    pub fn default_run_script(&self, location: Location) -> Option<&RunScript> {
        let available = self.run_scripts_for(location);
        available
            .iter()
            .find(|s| s.default)
            .or(available.first())
            .copied()
    }

    /// True when the managed layer sets `path` or anything under or above it.
    pub fn is_managed(&self, path: &str) -> bool {
        self.managed_keys.iter().any(|k| {
            k == path
                || k.strip_prefix(path).is_some_and(|rest| rest.starts_with('.'))
                || path
                    .strip_prefix(k.as_str())
                    .is_some_and(|rest| rest.starts_with('.'))
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfigError {
    Parse { origin: String, message: String },
    Io { origin: String, message: String },
    Git { message: String },
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Parse { origin, message } => write!(f, "could not parse {origin}: {message}"),
            Self::Io { origin, message } => write!(f, "could not read {origin}: {message}"),
            Self::Git { message } => write!(f, "git: {message}"),
        }
    }
}

impl std::error::Error for ConfigError {}

/// Where the repository shared `settings.toml` (and `conductor.json`) is read from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SharedSource {
    /// The repository root's working tree.
    WorkingTree,
    /// A git revision, normally `origin/<default branch>`. Falls back to the
    /// working tree (with a warning) when the revision does not resolve.
    GitRef(String),
}

/// Where to look for settings files.
#[derive(Debug, Clone)]
pub struct SettingsPaths {
    /// Directory holding user and managed settings (`~/.conductor`).
    pub user_dir: PathBuf,
    /// Repository root (main checkout).
    pub repo_root: PathBuf,
    pub shared_from: SharedSource,
}

impl SettingsPaths {
    /// `~/.conductor` for the current user, if `HOME` is set.
    pub fn default_user_dir() -> Option<PathBuf> {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join(SETTINGS_DIR))
    }
}

/// Read every settings file that exists. Missing files are skipped; a file
/// that exists but does not parse is an error. Returns the layers and any
/// warnings (such as a shared ref that did not resolve).
pub fn load_layers(paths: &SettingsPaths) -> Result<(Vec<LayerSource>, Vec<String>), ConfigError> {
    let mut layers = Vec::new();
    let mut warnings = Vec::new();
    let user = &paths.user_dir;
    let repo_dir = paths.repo_root.join(SETTINGS_DIR);

    push_file(
        &mut layers,
        Layer::User,
        Format::Json,
        &user.join("settings.json"),
    )?;
    push_file(
        &mut layers,
        Layer::User,
        Format::Toml,
        &user.join("settings.toml"),
    )?;
    push_file(
        &mut layers,
        Layer::Managed,
        Format::Json,
        &user.join("settings.managed.json"),
    )?;
    push_file(
        &mut layers,
        Layer::Managed,
        Format::Toml,
        &user.join("settings.managed.toml"),
    )?;
    push_file(
        &mut layers,
        Layer::RepoLocal,
        Format::Json,
        &repo_dir.join("settings.local.json"),
    )?;
    push_file(
        &mut layers,
        Layer::RepoLocal,
        Format::Toml,
        &repo_dir.join("settings.local.toml"),
    )?;

    let shared_toml = read_shared(paths, ".conductor/settings.toml", &mut warnings)?;
    let shared_json = read_shared(paths, ".conductor/settings.json", &mut warnings)?;
    if let Some((origin, text)) = &shared_json {
        layers.push(LayerSource::from_json(Layer::RepoShared, origin.clone(), text)?);
    }
    match shared_toml {
        Some((origin, text)) => layers.push(LayerSource::from_toml(Layer::RepoShared, origin, &text)?),
        None => {
            if let Some((origin, text)) = read_shared(paths, "conductor.json", &mut warnings)? {
                layers.push(LayerSource::from_conductor_json(origin, &text)?);
            }
        }
    }
    warnings.dedup();
    Ok((layers, warnings))
}

/// [`load_layers`] then [`resolve`].
pub fn load(paths: &SettingsPaths) -> Result<ResolvedScripts, ConfigError> {
    let (layers, warnings) = load_layers(paths)?;
    let mut resolved = resolve(&layers);
    resolved.warnings.splice(0..0, warnings);
    Ok(resolved)
}

/// Merge layers by precedence and extract the `[scripts]` section.
pub fn resolve(layers: &[LayerSource]) -> ResolvedScripts {
    let mut ordered: Vec<&LayerSource> = layers.iter().collect();
    ordered.sort_by_key(|l| l.rank()); // stable: equal ranks keep input order

    let mut merged = Table::new();
    for l in &ordered {
        deep_merge(&mut merged, &l.table);
    }

    let mut out = ResolvedScripts::default();
    for l in ordered.iter().filter(|l| l.layer == Layer::Managed) {
        collect_leaf_paths(&l.table, "", &mut out.managed_keys);
    }

    let highest_setting = |path: &[&str]| -> Layer {
        ordered
            .iter()
            .rev()
            .find(|l| lookup(&l.table, path).is_some())
            .map_or(Layer::Defaults, |l| l.layer)
    };

    let scripts = merged.get("scripts").and_then(Value::as_table);
    let Some(scripts) = scripts else { return out };

    for (key, slot) in [("setup", &mut out.setup), ("archive", &mut out.archive)] {
        match scripts.get(key) {
            None => {}
            Some(Value::String(s)) if s.trim().is_empty() => {}
            Some(Value::String(s)) => {
                *slot = Some(Sourced {
                    value: s.clone(),
                    layer: highest_setting(&["scripts", key]),
                })
            }
            Some(other) => out.warnings.push(format!(
                "scripts.{key}: expected a string, got {}",
                other.type_str()
            )),
        }
    }

    match scripts.get("run_mode") {
        None => {}
        Some(Value::String(s)) => match RunMode::parse(s) {
            Some(m) => out.run_mode = m,
            None => out
                .warnings
                .push(format!("scripts.run_mode: unknown mode {s:?}, using concurrent")),
        },
        Some(other) => out.warnings.push(format!(
            "scripts.run_mode: expected a string, got {}",
            other.type_str()
        )),
    }

    if let Some(run) = scripts.get("run") {
        match run {
            Value::Table(t) => {
                for (id, v) in t {
                    match parse_run_script(id, v, highest_setting(&["scripts", "run", id])) {
                        Ok(Some(s)) => out.run.push(s),
                        Ok(None) => {}
                        Err(w) => out.warnings.push(w),
                    }
                }
            }
            other => out
                .warnings
                .push(format!("scripts.run: expected a table, got {}", other.type_str())),
        }
    }
    out
}

fn parse_run_script(id: &str, v: &Value, layer: Layer) -> Result<Option<RunScript>, String> {
    let t = v
        .as_table()
        .ok_or_else(|| format!("scripts.run.{id}: expected a table"))?;
    let command = match t.get("command") {
        Some(Value::String(c)) if !c.trim().is_empty() => c.clone(),
        Some(Value::String(_)) | None => return Err(format!("scripts.run.{id}: missing command, skipped")),
        Some(other) => {
            return Err(format!(
                "scripts.run.{id}.command: expected a string, got {}",
                other.type_str()
            ))
        }
    };
    let available_in = match t.get("available_in") {
        None => None,
        Some(Value::Array(items)) => {
            let mut set = BTreeSet::new();
            for item in items {
                match item.as_str().and_then(Location::parse) {
                    Some(loc) => {
                        set.insert(loc);
                    }
                    None => {
                        return Err(format!(
                            "scripts.run.{id}.available_in: unknown location {item}, skipped"
                        ))
                    }
                }
            }
            Some(set)
        }
        Some(other) => {
            return Err(format!(
                "scripts.run.{id}.available_in: expected an array, got {}",
                other.type_str()
            ))
        }
    };
    let default = t.get("default").and_then(Value::as_bool).unwrap_or(false);
    let icon = match t.get("icon").and_then(Value::as_str) {
        Some(i) if is_kebab_icon_name(i) => i.to_string(),
        _ => DEFAULT_ICON.to_string(),
    };
    Ok(Some(RunScript {
        id: id.to_string(),
        command,
        available_in,
        default,
        icon,
        layer,
    }))
}

/// Lucide icon names are lowercase kebab case (`play`, `test-tube`,
/// `circle-dot-2`). Anything else falls back to [`DEFAULT_ICON`].
pub fn is_kebab_icon_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('-')
        && !name.ends_with('-')
        && !name.contains("--")
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Rewrite a legacy single-string `scripts.run` as one table entry.
fn normalize(mut table: Table) -> Table {
    if let Some(Value::Table(scripts)) = table.get_mut("scripts") {
        if let Some(Value::String(cmd)) = scripts.get("run") {
            let mut entry = Table::new();
            entry.insert("command".into(), Value::String(cmd.clone()));
            let mut run = Table::new();
            run.insert(LEGACY_RUN_ID.into(), Value::Table(entry));
            scripts.insert("run".into(), Value::Table(run));
        }
    }
    table
}

/// Merge `upper` into `base`: tables merge recursively, other values replace.
pub fn deep_merge(base: &mut Table, upper: &Table) {
    for (k, v) in upper {
        match (base.get_mut(k), v) {
            (Some(Value::Table(b)), Value::Table(u)) => deep_merge(b, u),
            _ => {
                base.insert(k.clone(), v.clone());
            }
        }
    }
}

fn lookup<'a>(table: &'a Table, path: &[&str]) -> Option<&'a Value> {
    let (first, rest) = path.split_first()?;
    let v = table.get(*first)?;
    if rest.is_empty() {
        Some(v)
    } else {
        lookup(v.as_table()?, rest)
    }
}

fn collect_leaf_paths(table: &Table, prefix: &str, out: &mut BTreeSet<String>) {
    for (k, v) in table {
        let path = if prefix.is_empty() {
            k.clone()
        } else {
            format!("{prefix}.{k}")
        };
        match v {
            Value::Table(t) if !t.is_empty() => collect_leaf_paths(t, &path, out),
            _ => {
                out.insert(path);
            }
        }
    }
}

fn json_to_toml(v: serde_json::Value) -> Option<Value> {
    Some(match v {
        serde_json::Value::Null => return None,
        serde_json::Value::Bool(b) => Value::Boolean(b),
        serde_json::Value::Number(n) => match n.as_i64() {
            Some(i) => Value::Integer(i),
            None => Value::Float(n.as_f64()?),
        },
        serde_json::Value::String(s) => Value::String(s),
        serde_json::Value::Array(a) => Value::Array(a.into_iter().filter_map(json_to_toml).collect()),
        serde_json::Value::Object(o) => Value::Table(
            o.into_iter()
                .filter_map(|(k, v)| Some((k, json_to_toml(v)?)))
                .collect(),
        ),
    })
}

fn push_file(
    layers: &mut Vec<LayerSource>,
    layer: Layer,
    format: Format,
    path: &Path,
) -> Result<(), ConfigError> {
    let Some(text) = read_optional(path)? else {
        return Ok(());
    };
    let origin = path.display().to_string();
    layers.push(match format {
        Format::Toml => LayerSource::from_toml(layer, origin, &text)?,
        Format::Json => LayerSource::from_json(layer, origin, &text)?,
    });
    Ok(())
}

fn read_optional(path: &Path) -> Result<Option<String>, ConfigError> {
    match fs::read_to_string(path) {
        Ok(t) => Ok(Some(t)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(ConfigError::Io {
            origin: path.display().to_string(),
            message: e.to_string(),
        }),
    }
}

/// Read a repository-relative file from the shared source.
fn read_shared(
    paths: &SettingsPaths,
    rel: &str,
    warnings: &mut Vec<String>,
) -> Result<Option<(String, String)>, ConfigError> {
    if let SharedSource::GitRef(rev) = &paths.shared_from {
        if git_rev_exists(&paths.repo_root, rev)? {
            let spec = format!("{rev}:{rel}");
            let out = git(&paths.repo_root).args(["cat-file", "-e", &spec]).output();
            let exists = out
                .map_err(|e| ConfigError::Git {
                    message: e.to_string(),
                })?
                .status
                .success();
            if !exists {
                return Ok(None);
            }
            let out = git(&paths.repo_root)
                .args(["cat-file", "blob", &spec])
                .output()
                .map_err(|e| ConfigError::Git {
                    message: e.to_string(),
                })?;
            if !out.status.success() {
                return Err(ConfigError::Git {
                    message: String::from_utf8_lossy(&out.stderr).trim().to_string(),
                });
            }
            let text = String::from_utf8(out.stdout).map_err(|_| ConfigError::Parse {
                origin: spec.clone(),
                message: "not UTF-8".into(),
            })?;
            return Ok(Some((spec, text)));
        }
        warnings.push(format!(
            "shared settings: {rev} does not resolve, read the working tree instead"
        ));
    }
    let path = paths.repo_root.join(rel);
    Ok(read_optional(&path)?.map(|t| (path.display().to_string(), t)))
}

fn git_rev_exists(repo: &Path, rev: &str) -> Result<bool, ConfigError> {
    let out = git(repo)
        .args(["rev-parse", "--verify", "--quiet", &format!("{rev}^{{commit}}")])
        .output()
        .map_err(|e| ConfigError::Git {
            message: e.to_string(),
        })?;
    Ok(out.status.success())
}

fn git(repo: &Path) -> Command {
    let mut c = Command::new("git");
    c.arg("-C").arg(repo);
    for var in ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"] {
        c.env_remove(var);
    }
    c
}

#[cfg(test)]
mod tests;
