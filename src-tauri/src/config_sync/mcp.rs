use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use serde_json::{Map as JsonMap, Value as Json};
use toml::{map::Map as TomlMap, Value as Toml};

use super::{files, valid_name, Category, CategoryDiff, Checked, Direction, Selection};

const CLAUDE_PATH: &str = ".claude.json";
const CODEX_PATH: &str = ".codex/config.toml";

#[derive(Default)]
struct Entry {
    url: Option<String>,
    command: Option<String>,
    args: Option<Vec<String>>,
    env: Option<BTreeMap<String, String>>,
    headers: Option<BTreeMap<String, String>>,
}

impl Entry {
    fn has_transport(&self) -> bool {
        self.url.is_some() || self.command.is_some()
    }

    fn claude_value(&self) -> Json {
        let mut value = JsonMap::new();
        if let Some(url) = &self.url {
            value.insert("url".into(), Json::String(url.clone()));
            if self.command.is_none() {
                value.insert("type".into(), Json::String("http".into()));
            }
        }
        if let Some(command) = &self.command {
            value.insert("command".into(), Json::String(command.clone()));
        }
        if let Some(args) = &self.args {
            value.insert("args".into(), Json::Array(args.iter().cloned().map(Json::String).collect()));
        }
        for (key, strings) in [("env", &self.env), ("headers", &self.headers)] {
            if let Some(strings) = strings {
                value.insert(key.into(), Json::Object(strings.iter().map(|(key, value)| (key.clone(), Json::String(value.clone()))).collect()));
            }
        }
        Json::Object(value)
    }

    fn codex_value(&self) -> Toml {
        let mut value = TomlMap::new();
        if let Some(url) = &self.url {
            value.insert("url".into(), Toml::String(url.clone()));
        }
        if let Some(command) = &self.command {
            value.insert("command".into(), Toml::String(command.clone()));
        }
        if let Some(args) = &self.args {
            value.insert("args".into(), Toml::Array(args.iter().cloned().map(Toml::String).collect()));
        }
        for (key, strings) in [("env", &self.env), ("http_headers", &self.headers)] {
            if let Some(strings) = strings {
                value.insert(key.into(), Toml::Table(strings.iter().map(|(key, value)| (key.clone(), Toml::String(value.clone()))).collect()));
            }
        }
        Toml::Table(value)
    }
}

fn claude_entry(value: &Json) -> Option<Entry> {
    let fields = value.as_object()?;
    let mut entry = Entry::default();
    for (key, value) in fields {
        match key.as_str() {
            "type" => match value.as_str()? {
                "stdio" | "http" => {}
                _ => return None,
            },
            "url" => entry.url = Some(value.as_str()?.into()),
            "command" => entry.command = Some(value.as_str()?.into()),
            "args" => entry.args = Some(value.as_array()?.iter().map(|value| value.as_str().map(String::from)).collect::<Option<_>>()?),
            "env" | "headers" => {
                let strings = value.as_object()?.iter().map(|(key, value)| Some((key.clone(), value.as_str()?.into()))).collect::<Option<_>>()?;
                if key == "env" { entry.env = Some(strings) } else { entry.headers = Some(strings) }
            }
            _ => return None,
        }
    }
    entry.has_transport().then_some(entry)
}

fn codex_entry(value: &Toml) -> Option<Entry> {
    let fields = value.as_table()?;
    let mut entry = Entry::default();
    for (key, value) in fields {
        match key.as_str() {
            "url" => entry.url = Some(value.as_str()?.into()),
            "command" => entry.command = Some(value.as_str()?.into()),
            "args" => entry.args = Some(value.as_array()?.iter().map(|value| value.as_str().map(String::from)).collect::<Option<_>>()?),
            "env" | "http_headers" => {
                let strings = value.as_table()?.iter().map(|(key, value)| Some((key.clone(), value.as_str()?.into()))).collect::<Option<_>>()?;
                if key == "env" { entry.env = Some(strings) } else { entry.headers = Some(strings) }
            }
            "enabled" if value.as_bool() == Some(true) => {}
            "startup_timeout_sec" | "startup_timeout_ms" | "tool_timeout_sec"
            | "request_timeout_sec" | "description" | "name" => {}
            _ => return None,
        }
    }
    entry.has_transport().then_some(entry)
}

struct Claude {
    text: Option<String>,
    raw: JsonMap<String, Json>,
    occupied: JsonMap<String, Json>,
}

impl Claude {
    fn load(home: &Path) -> Checked<Self> {
        let text = files::read_optional(home, Path::new(CLAUDE_PATH))?;
        let raw = match text.as_deref().filter(|text| !text.trim().is_empty()) {
            Some(text) => serde_json::from_str::<Json>(text)
                .map_err(|_| "Claude MCP config is not valid JSON.")?
                .as_object().cloned().ok_or("Claude MCP config must be an object.")?,
            None => JsonMap::new(),
        };
        let occupied = match raw.get("mcpServers") {
            Some(value) => value.as_object().cloned().ok_or("Claude mcpServers must be an object.")?,
            None => JsonMap::new(),
        };
        Ok(Self { text, raw, occupied })
    }
}

struct Codex {
    text: Option<String>,
    occupied: TomlMap<String, Toml>,
}

impl Codex {
    fn load(home: &Path) -> Checked<Self> {
        let text = files::read_optional(home, Path::new(CODEX_PATH))?;
        let raw = toml::from_str::<Toml>(text.as_deref().unwrap_or(""))
            .map_err(|_| "Codex MCP config is not valid TOML.")?;
        let occupied = match raw.get("mcp_servers") {
            Some(value) => value.as_table().cloned().ok_or("Codex mcp_servers must be a table.")?,
            None => TomlMap::new(),
        };
        Ok(Self { text, occupied })
    }

    fn append(&self, name: &str, entry: &Entry) -> Checked<String> {
        let mut servers = TomlMap::new();
        servers.insert(name.into(), entry.codex_value());
        let mut root = TomlMap::new();
        root.insert("mcp_servers".into(), Toml::Table(servers));
        let section = toml::to_string(&Toml::Table(root)).map_err(|_| "Cannot encode MCP definition.")?;
        let mut text = self.text.clone().unwrap_or_default();
        if !text.is_empty() && !text.ends_with("\n\n") {
            if !text.ends_with('\n') {
                text.push('\n');
            }
            text.push('\n');
        }
        text.push_str(&section);
        toml::from_str::<Toml>(&text).map_err(|_| "Cannot append a new MCP section to this Codex config.")?;
        Ok(text)
    }
}

pub(super) fn diff(home: &Path) -> Checked<CategoryDiff> {
    let cc = Claude::load(home)?;
    let codex = Codex::load(home)?;
    let cc_to_codex: BTreeSet<_> = cc.occupied.iter().filter_map(|(name, value)| {
        (valid_name(Category::McpServers, name)
            && !codex.occupied.contains_key(name)
            && claude_entry(value).is_some()).then_some(name.clone())
    }).collect();
    let codex_to_cc: BTreeSet<_> = codex.occupied.iter().filter_map(|(name, value)| {
        (valid_name(Category::McpServers, name)
            && !cc.occupied.contains_key(name)
            && codex_entry(value).is_some()).then_some(name.clone())
    }).collect();
    Ok(CategoryDiff {
        cc_to_codex: cc_to_codex.into_iter().collect(),
        codex_to_cc: codex_to_cc.into_iter().collect(),
        error: None,
    })
}

pub(super) fn unsupported_source(home: &Path, selection: &Selection) -> Checked<bool> {
    Ok(match selection.direction {
        Direction::CcToCodex => Claude::load(home)?.occupied.get(&selection.name).is_some_and(|value| claude_entry(value).is_none()),
        Direction::CodexToCc => Codex::load(home)?.occupied.get(&selection.name).is_some_and(|value| codex_entry(value).is_none()),
    })
}

pub(super) fn apply(home: &Path, selection: &Selection) -> Checked<()> {
    let mut cc = Claude::load(home)?;
    let codex = Codex::load(home)?;
    match selection.direction {
        Direction::CcToCodex => {
            if codex.occupied.contains_key(&selection.name) {
                return Err("MCP destination name is already occupied.");
            }
            let entry = cc.occupied.get(&selection.name).and_then(claude_entry).ok_or("MCP source is no longer supported.")?;
            let text = codex.append(&selection.name, &entry)?;
            files::replace_config(home, Path::new(CODEX_PATH), codex.text.as_deref(), &text)
        }
        Direction::CodexToCc => {
            if cc.occupied.contains_key(&selection.name) {
                return Err("MCP destination name is already occupied.");
            }
            let entry = codex.occupied.get(&selection.name).and_then(codex_entry).ok_or("MCP source is no longer supported.")?;
            cc.occupied.insert(selection.name.clone(), entry.claude_value());
            cc.raw.insert("mcpServers".into(), Json::Object(cc.occupied));
            let mut text = serde_json::to_string_pretty(&Json::Object(cc.raw)).map_err(|_| "Cannot encode Claude MCP config.")?;
            text.push('\n');
            files::replace_config(home, Path::new(CLAUDE_PATH), cc.text.as_deref(), &text)
        }
    }
}
