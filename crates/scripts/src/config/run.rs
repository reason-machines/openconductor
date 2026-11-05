//! Run-script entries: `[scripts.run.<id>]`.
//!
//! Evidence (`evidence/run-scripts/NOTES.md`, "Settings and config"): entry
//! keys are `command`, `args`, `options.cwd`, `default`, `icon`, `hide` and
//! `available_in`; ids are normalized and compared case-insensitively; the
//! same id in several layers merges field by field; an entry without a
//! command is dropped; a legacy string `scripts.run` becomes entry `run`
//! (default, `play` icon, local only) placed first; a top-level `tasks` table
//! is a legacy alias read before `scripts.run`.

use std::collections::BTreeSet;

use serde::Serialize;
use toml::{Table, Value};

use super::{Layer, LayerSource};

/// Id given to a legacy single-string `scripts.run`.
pub const LEGACY_RUN_ID: &str = "run";
/// Icon used when an entry has none or an invalid one.
pub const DEFAULT_ICON: &str = "play";

const ENTRY_KEYS: [&str; 7] = [
    "args",
    "available_in",
    "command",
    "default",
    "hide",
    "icon",
    "options",
];

/// Where a run script may be shown and run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Location {
    Local,
    Cloud,
}

/// One effective run script.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RunScript {
    pub id: String,
    pub label: String,
    pub command: String,
    pub args: Vec<String>,
    /// `options.cwd`, unexpanded.
    pub cwd: Option<String>,
    pub default: bool,
    pub icon: String,
    pub hide: bool,
    pub available_in: BTreeSet<Location>,
    /// Last layer that set any field of this entry.
    pub layer: Layer,
}

impl RunScript {
    /// The shell command: `command`, then each arg single-quoted.
    pub fn command_line(&self) -> String {
        let mut line = self.command.clone();
        for arg in &self.args {
            line.push(' ');
            line.push_str(&shell_quote(arg));
        }
        line
    }
}

/// `'…'` quoting with `'` written as `'\''`.
pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Normalized id: drop characters other than ASCII letters, digits, spaces
/// and `-`, treat `-` as a space, collapse runs, join with `-`.
pub fn normalize_id(raw: &str) -> Option<String> {
    let cleaned: String = raw
        .chars()
        .map(|c| if c == '-' { ' ' } else { c })
        .filter(|c| c.is_ascii_alphanumeric() || *c == ' ')
        .collect();
    let words: Vec<&str> = cleaned.split(' ').filter(|w| !w.is_empty()).collect();
    (!words.is_empty()).then(|| words.join("-"))
}

/// Display label: `-` as spaces, first letter upper-cased.
pub fn label_for(id: &str) -> String {
    let spaced = id.replace('-', " ");
    let mut chars = spaced.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => spaced,
    }
}

/// Lucide names are lowercase kebab case; anything else falls back to [`DEFAULT_ICON`].
pub fn is_icon_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('-')
        && !name.ends_with('-')
        && !name.contains("--")
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Merge every layer's entries (already in precedence order).
pub(super) fn resolve_run(ordered: &[&LayerSource], warnings: &mut Vec<String>) -> Vec<RunScript> {
    // (normalized id, merged raw fields, layer), in first-seen order.
    let mut merged: Vec<(String, Table, Layer)> = Vec::new();
    for layer in ordered {
        for (raw_id, entry) in layer_entries(&layer.table, warnings) {
            let Some(id) = normalize_id(&raw_id) else {
                warnings.push(format!(
                    "scripts.run.{raw_id}: id has no letters or digits, skipped"
                ));
                continue;
            };
            match merged
                .iter_mut()
                .find(|(m, _, _)| m.eq_ignore_ascii_case(&id))
            {
                Some(slot) => {
                    super::deep_merge(&mut slot.1, &entry);
                    slot.0 = id;
                    slot.2 = layer.layer;
                }
                None if id == LEGACY_RUN_ID => merged.insert(0, (id, entry, layer.layer)),
                None => merged.push((id, entry, layer.layer)),
            }
        }
    }
    merged
        .into_iter()
        .filter_map(|(id, t, layer)| parse_entry(id, &t, layer, warnings))
        .collect()
}

/// A layer's raw entries: `tasks`, then `scripts.run` (table or legacy string).
fn layer_entries(table: &Table, warnings: &mut Vec<String>) -> Vec<(String, Table)> {
    let mut out = Vec::new();
    let sources = [
        ("tasks", table.get("tasks")),
        (
            "scripts.run",
            table.get("scripts").and_then(|s| s.get("run")),
        ),
    ];
    for (key, value) in sources {
        match value {
            None => {}
            Some(Value::String(cmd)) if key == "scripts.run" && !cmd.trim().is_empty() => {
                let legacy: Table = toml::toml! {
                    default = true
                    icon = "play"
                    available_in = "local"
                };
                let mut entry = legacy;
                entry.insert("command".into(), Value::String(cmd.clone()));
                out.push((LEGACY_RUN_ID.to_string(), entry));
            }
            Some(Value::String(_)) if key == "scripts.run" => {}
            Some(Value::Table(entries)) => {
                for (id, entry) in entries {
                    match entry {
                        Value::Table(t) => out.push((id.clone(), t.clone())),
                        v => warnings.push(format!(
                            "{key}.{id}: expected a table, got {}",
                            v.type_str()
                        )),
                    }
                }
            }
            Some(v) => warnings.push(format!("{key}: expected a table, got {}", v.type_str())),
        }
    }
    out
}

fn parse_entry(
    id: String,
    t: &Table,
    layer: Layer,
    warnings: &mut Vec<String>,
) -> Option<RunScript> {
    let at = |k: &str| format!("scripts.run.{id}.{k}");
    for key in t.keys().filter(|k| !ENTRY_KEYS.contains(&k.as_str())) {
        warnings.push(format!("{}: unknown key", at(key)));
    }
    let mut bad = |k: &str, want: &str| {
        warnings.push(format!("{}: expected {want}, entry skipped", at(k)));
        None
    };
    let command = match t.get("command") {
        Some(Value::String(c)) if !c.trim().is_empty() => c.clone(),
        None | Some(Value::String(_)) => return None, // no command: not a run script yet
        Some(_) => return bad("command", "a string"),
    };
    let args = match t.get("args") {
        None => Vec::new(),
        Some(Value::Array(items)) if items.iter().all(Value::is_str) => items
            .iter()
            .filter_map(Value::as_str)
            .map(String::from)
            .collect(),
        Some(_) => return bad("args", "an array of strings"),
    };
    let cwd = match t.get("options").map(|o| (o, o.get("cwd"))) {
        None | Some((Value::Table(_), None)) => None,
        Some((Value::Table(_), Some(Value::String(c)))) => Some(c.clone()),
        Some(_) => return bad("options", "a table with a string cwd"),
    };
    let flag = |k: &str| t.get(k).map(|v| v.as_bool().ok_or(()));
    let (Ok(default), Ok(hide)) = (
        flag("default").unwrap_or(Ok(false)),
        flag("hide").unwrap_or(Ok(false)),
    ) else {
        return bad("default/hide", "booleans");
    };
    let parse_loc = |v: &Value| match v.as_str() {
        Some("local") => Some(Location::Local),
        Some("cloud") => Some(Location::Cloud),
        _ => None,
    };
    let available_in: Option<BTreeSet<Location>> = match t.get("available_in") {
        None => Some([Location::Local, Location::Cloud].into()),
        Some(Value::Array(items)) => items.iter().map(parse_loc).collect(),
        Some(v) => parse_loc(v).map(|l| [l].into()),
    };
    let Some(available_in) = available_in else {
        return bad("available_in", "\"local\", \"cloud\" or an array of them");
    };
    let icon = match t.get("icon").and_then(Value::as_str) {
        Some(i) if is_icon_name(i) => i.to_string(),
        _ => DEFAULT_ICON.to_string(),
    };
    Some(RunScript {
        label: label_for(&id),
        id,
        command,
        args,
        cwd,
        default,
        icon,
        hide,
        available_in,
        layer,
    })
}

/// Run scripts offered at `location`.
pub fn available(scripts: &[RunScript], location: Location) -> Vec<&RunScript> {
    scripts
        .iter()
        .filter(|s| s.available_in.contains(&location))
        .collect()
}

/// What a plain "Run" starts: the first default entry, else the first one.
pub fn default_script(scripts: &[RunScript], location: Location) -> Option<&RunScript> {
    let offered = available(scripts, location);
    offered
        .iter()
        .find(|s| s.default)
        .or(offered.first())
        .copied()
}
