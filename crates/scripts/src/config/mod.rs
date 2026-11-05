//! Settings layers and the effective `[scripts]` section.
//!
//! Precedence, lowest first (bundled skill, "Settings files"): user
//! `~/.conductor/settings.toml`, repository shared
//! `<root>/.conductor/settings.toml`, repository local
//! `<root>/.conductor/settings.local.toml`, managed
//! `~/.conductor/settings.managed.toml`. Any TOML file outranks any legacy
//! JSON file whatever its layer, so layers sort by (format, layer).
//!
//! Legacy `conductor.json` files are read only when the repository has no
//! `.conductor/settings.toml`: the workspace's `conductor.json` as a shared
//! JSON layer, `~/.conductor/conductor.json` as a user JSON layer. Their keys
//! are mapped to the settings shape by [`LayerSource::from_conductor_json`].
//!
//! Tables merge key by key; any other value from a higher layer replaces the
//! lower one. Evidence: `evidence/run-scripts/NOTES.md`.

mod load;
mod run;
#[cfg(test)]
mod run_tests;
#[cfg(test)]
mod tests;

use std::collections::BTreeSet;
use std::fmt;

use serde::Serialize;
use toml::{Table, Value};

pub use load::{load, load_layers, SettingsPaths, SharedSource, SETTINGS_DIR};
pub use run::{
    available, default_script, is_icon_name, label_for, normalize_id, shell_quote, Location,
    RunScript, DEFAULT_ICON, LEGACY_RUN_ID,
};

/// A settings layer, in ascending precedence.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Layer {
    Defaults,
    User,
    RepoShared,
    RepoLocal,
    Managed,
}

/// File format of a layer. Every TOML layer outranks every JSON layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Format {
    Json,
    Toml,
}

/// Whether run scripts of several workspaces of one repository may run at
/// the same time. Default `concurrent` (`repos.run_script_mode`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RunMode {
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
}

/// One parsed settings file.
#[derive(Debug, Clone, PartialEq)]
pub struct LayerSource {
    pub layer: Layer,
    pub format: Format,
    /// Path, or `<rev>:<path>` for a file read from git.
    pub origin: String,
    pub table: Table,
}

impl LayerSource {
    pub fn from_toml(
        layer: Layer,
        origin: impl Into<String>,
        text: &str,
    ) -> Result<Self, ConfigError> {
        let origin = origin.into();
        let table = text.parse::<Table>().map_err(|e| ConfigError::Parse {
            origin: origin.clone(),
            message: e.message().to_string(),
        })?;
        Ok(Self {
            layer,
            format: Format::Toml,
            origin,
            table,
        })
    }

    /// A legacy JSON settings file (same shape as the TOML one).
    pub fn from_json(
        layer: Layer,
        origin: impl Into<String>,
        text: &str,
    ) -> Result<Self, ConfigError> {
        let origin = origin.into();
        match parse_json(&origin, text)? {
            Value::Table(table) => Ok(Self {
                layer,
                format: Format::Json,
                origin,
                table,
            }),
            _ => Err(ConfigError::Parse {
                origin,
                message: "top level is not an object".into(),
            }),
        }
    }

    /// A legacy `conductor.json`: `scripts.{setup,run,archive}` strings,
    /// `runScriptMode` and `enterpriseDataPrivacy` (a bool or `"true"`/`"false"`).
    pub fn from_conductor_json(
        layer: Layer,
        origin: impl Into<String>,
        text: &str,
    ) -> Result<Self, ConfigError> {
        let origin = origin.into();
        let json = parse_json(&origin, text)?;
        let mut scripts = Table::new();
        if let Some(s) = json.get("scripts").and_then(Value::as_table) {
            for key in ["setup", "run", "archive"] {
                if let Some(v @ Value::String(_)) = s.get(key) {
                    scripts.insert(key.into(), v.clone());
                }
            }
        }
        if let Some(Value::String(mode)) = json.get("runScriptMode") {
            if RunMode::parse(mode).is_some() {
                scripts.insert("run_mode".into(), Value::String(mode.clone()));
            }
        }
        let mut table = Table::new();
        if !scripts.is_empty() {
            table.insert("scripts".into(), Value::Table(scripts));
        }
        let privacy = match json.get("enterpriseDataPrivacy") {
            Some(Value::Boolean(b)) => Some(*b),
            Some(Value::String(s)) if s == "true" || s == "false" => Some(s == "true"),
            _ => None,
        };
        if let Some(b) = privacy {
            table.insert("enterprise_data_privacy".into(), Value::Boolean(b));
        }
        Ok(Self {
            layer,
            format: Format::Json,
            origin,
            table,
        })
    }

    fn rank(&self) -> (Format, Layer) {
        (self.format, self.layer)
    }
}

/// A value and the layer that set it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Sourced<T> {
    pub value: T,
    pub layer: Layer,
}

/// The effective `[scripts]` section, before run-script entries are parsed.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ResolvedScripts {
    pub setup: Option<Sourced<String>>,
    pub archive: Option<Sourced<String>>,
    pub run_mode: RunMode,
    pub auto_run_after_setup: bool,
    /// Run scripts, legacy `run` first, then in first-seen order.
    pub run: Vec<RunScript>,
    /// Dotted key paths the managed layer sets; the UI locks them.
    pub managed_keys: BTreeSet<String>,
    /// Values that were ignored, with the reason.
    pub warnings: Vec<String>,
}

impl ResolvedScripts {
    /// True when the managed layer sets `path`, a key under it or above it.
    pub fn is_managed(&self, path: &str) -> bool {
        let nested = |outer: &str, inner: &str| {
            inner
                .strip_prefix(outer)
                .is_some_and(|r| r.starts_with('.'))
        };
        self.managed_keys
            .iter()
            .any(|k| k == path || nested(path, k) || nested(k, path))
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

/// Merge layers by precedence and read the `[scripts]` keys.
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
    out.run = run::resolve_run(&ordered, &mut out.warnings);
    let Some(scripts) = merged.get("scripts").and_then(Value::as_table) else {
        return out;
    };
    let layer_of = |key: &str| {
        ordered
            .iter()
            .rev()
            .find(|l| l.table.get("scripts").and_then(|s| s.get(key)).is_some())
            .map_or(Layer::Defaults, |l| l.layer)
    };
    for (key, slot) in [("setup", &mut out.setup), ("archive", &mut out.archive)] {
        match scripts.get(key) {
            None => {}
            Some(Value::String(s)) if s.trim().is_empty() => {}
            Some(Value::String(s)) => {
                *slot = Some(Sourced {
                    value: s.clone(),
                    layer: layer_of(key),
                })
            }
            Some(v) => out.warnings.push(format!(
                "scripts.{key}: expected a string, got {}",
                v.type_str()
            )),
        }
    }
    match scripts.get("run_mode") {
        None => {}
        Some(Value::String(s)) if RunMode::parse(s).is_some() => {
            out.run_mode = RunMode::parse(s).unwrap_or_default()
        }
        Some(v) => out.warnings.push(format!(
            "scripts.run_mode: unsupported value {v}, using concurrent"
        )),
    }
    match scripts.get("auto_run_after_setup") {
        None => {}
        Some(Value::Boolean(b)) => out.auto_run_after_setup = *b,
        Some(v) => out.warnings.push(format!(
            "scripts.auto_run_after_setup: expected a boolean, got {}",
            v.type_str()
        )),
    }
    out
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

fn parse_json(origin: &str, text: &str) -> Result<Value, ConfigError> {
    let json: serde_json::Value = serde_json::from_str(text).map_err(|e| ConfigError::Parse {
        origin: origin.to_string(),
        message: e.to_string(),
    })?;
    Ok(json_to_toml(json).unwrap_or(Value::Table(Table::new())))
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
        serde_json::Value::Array(a) => {
            Value::Array(a.into_iter().filter_map(json_to_toml).collect())
        }
        serde_json::Value::Object(o) => Value::Table(
            o.into_iter()
                .filter_map(|(k, v)| Some((k, json_to_toml(v)?)))
                .collect(),
        ),
    })
}
