mod files;
mod mcp;

use std::collections::HashSet;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    McpServers,
    SlashCommands,
    Skills,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Direction {
    CcToCodex,
    CodexToCc,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Selection {
    pub category: Category,
    pub direction: Direction,
    pub name: String,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryDiff {
    pub cc_to_codex: Vec<String>,
    pub codex_to_cc: Vec<String>,
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diff {
    pub mcp_servers: CategoryDiff,
    pub slash_commands: CategoryDiff,
    pub skills: CategoryDiff,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    pub category: Category,
    pub name: String,
    pub reason: String,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub successes: usize,
    pub failures: Vec<Failure>,
    pub unsupported_mcp: Vec<String>,
}

type Checked<T> = Result<T, &'static str>;

fn category_diff(home: &Path, category: Category) -> CategoryDiff {
    let result = match category {
        Category::McpServers => mcp::diff(home),
        Category::Skills | Category::SlashCommands => files::diff(home, category),
    };
    result.unwrap_or_else(|error| CategoryDiff {
        error: Some(error.into()),
        ..CategoryDiff::default()
    })
}

pub fn diff(home: &Path) -> Diff {
    Diff {
        mcp_servers: category_diff(home, Category::McpServers),
        slash_commands: category_diff(home, Category::SlashCommands),
        skills: category_diff(home, Category::Skills),
    }
}

pub fn sync(home: &Path, selections: &[Selection]) -> SyncResult {
    let mut result = SyncResult::default();
    let mut seen = HashSet::new();
    for selection in selections {
        if !seen.insert((selection.category, selection.direction, selection.name.as_str())) {
            continue;
        }
        let outcome = if !valid_name(selection.category, &selection.name) {
            Err("Invalid selection name.")
        } else {
            let fresh = category_diff(home, selection.category);
            let offered = match selection.direction {
                Direction::CcToCodex => &fresh.cc_to_codex,
                Direction::CodexToCc => &fresh.codex_to_cc,
            };
            if fresh.error.is_some() {
                Err("Cannot read this config category.")
            } else if !offered.contains(&selection.name) {
                if selection.category == Category::McpServers
                    && mcp::unsupported_source(home, selection).unwrap_or(false)
                {
                    result.unsupported_mcp.push(selection.name.clone());
                }
                Err("Selection is no longer available. Refresh the config diff.")
            } else {
                match selection.category {
                    Category::McpServers => mcp::apply(home, selection),
                    Category::Skills | Category::SlashCommands => files::apply(home, selection),
                }
            }
        };
        match outcome {
            Ok(()) => result.successes += 1,
            Err(reason) => result.failures.push(Failure {
                category: selection.category,
                name: selection.name.clone(),
                reason: reason.into(),
            }),
        }
    }
    result.unsupported_mcp.sort();
    result.unsupported_mcp.dedup();
    result
}

fn valid_name(category: Category, name: &str) -> bool {
    let mut components = name.split('/');
    let valid_component = |part: &str| {
        !part.is_empty()
            && !part.starts_with('.')
            && !part.chars().any(|c| c.is_control() || c == '\\' || c == ':')
    };
    match category {
        Category::SlashCommands => components.all(valid_component),
        Category::Skills => valid_component(name) && !name.contains('/'),
        Category::McpServers => true,
    }
}

#[cfg(test)]
mod tests;
