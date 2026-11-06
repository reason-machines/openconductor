//! Skills and custom commands read from disk: `<dir>/<name>/SKILL.md`
//! folders and `<dir>/**/<name>.md` command files, each with optional YAML
//! frontmatter (`name`, `description`, `argument-hint`).
//!
//! Used when an agent's CLI cannot be asked (not installed, not signed in,
//! timed out) and for skills the agent does not list itself (the bundled
//! OpenConductor skill for Codex). The agents' own folders:
//!
//! * Claude Code: `~/.claude/skills`, `<cwd>/.claude/skills`,
//!   `~/.claude/commands`, `<cwd>/.claude/commands`, and plugin skills as
//!   `<plugin>:<skill>`.
//! * Codex: `~/.codex/skills`, `~/.agents/skills`, `<cwd>/.codex/skills`,
//!   `<cwd>/.agents/skills`.

use std::fs;
use std::path::{Path, PathBuf};

use crate::sidecar_stores::completions::{SlashCommand, Skill};

/// A command file deeper than this under its folder is ignored.
const MAX_COMMAND_DEPTH: usize = 3;

/// The frontmatter fields this module reads.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Front {
    pub name: Option<String>,
    pub description: Option<String>,
    pub argument_hint: Option<String>,
}

/// Reads `---`-fenced YAML frontmatter: plain, quoted and folded (`>`, `|`)
/// scalars of the keys in [`Front`]. The rest of the document is ignored.
pub fn frontmatter(text: &str) -> (Front, &str) {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let Some(rest) = text.strip_prefix("---\n").or_else(|| text.strip_prefix("---\r\n")) else {
        return (Front::default(), text);
    };
    let (head, body) = match rest.find("\n---") {
        Some(i) => {
            let after = &rest[i + 4..];
            (&rest[..i], after.split_once('\n').map(|(_, b)| b).unwrap_or(""))
        }
        None => return (Front::default(), text),
    };
    let lines: Vec<&str> = head.lines().collect();
    let mut front = Front::default();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        i += 1;
        if line.starts_with(char::is_whitespace) {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else { continue };
        let value = value.trim();
        let value = if matches!(value.chars().next(), Some('>' | '|')) {
            let folded = value.starts_with('>');
            let mut parts = Vec::new();
            while i < lines.len() && (lines[i].trim().is_empty() || lines[i].starts_with(char::is_whitespace)) {
                parts.push(lines[i].trim());
                i += 1;
            }
            parts.join(if folded { " " } else { "\n" }).trim().to_owned()
        } else {
            unquote(value)
        };
        let slot = match key.trim() {
            "name" => &mut front.name,
            "description" => &mut front.description,
            "argument-hint" => &mut front.argument_hint,
            _ => continue,
        };
        if !value.is_empty() {
            *slot = Some(value);
        }
    }
    (front, body)
}

fn unquote(v: &str) -> String {
    let bytes = v.as_bytes();
    if bytes.len() >= 2 && (bytes[0] == b'"' || bytes[0] == b'\'') && bytes[bytes.len() - 1] == bytes[0] {
        let inner = &v[1..v.len() - 1];
        return if bytes[0] == b'"' { inner.replace("\\\"", "\"") } else { inner.replace("''", "'") };
    }
    v.to_owned()
}

/// A skill folder's `SKILL.md`: name from the frontmatter, else the folder.
pub fn read_skill(skill_md: &Path) -> Option<Skill> {
    let text = fs::read_to_string(skill_md).ok()?;
    let (front, _) = frontmatter(&text);
    let folder = skill_md.parent()?.file_name()?.to_string_lossy().into_owned();
    Some(Skill {
        name: front.name.unwrap_or(folder),
        description: front.description.unwrap_or_default(),
        path: skill_md.display().to_string(),
        display_name: None,
    })
}

/// Every `<dir>/<name>/SKILL.md`, sorted by folder name. Folders may be
/// symlinks (skill managers link them in).
pub fn skills_in(dir: &Path) -> Vec<Skill> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut folders: Vec<PathBuf> = entries.flatten().map(|e| e.path()).filter(|p| p.join("SKILL.md").is_file()).collect();
    folders.sort();
    folders.iter().filter_map(|f| read_skill(&f.join("SKILL.md"))).collect()
}

/// Claude Code custom commands: every `*.md` under `dir`; a file in a
/// subfolder is `<sub>:<name>`. The description is the frontmatter's, else
/// the first non-empty line of the body.
pub fn commands_in(dir: &Path) -> Vec<SlashCommand> {
    let mut out = Vec::new();
    walk_commands(dir, "", 0, &mut out);
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn walk_commands(dir: &Path, prefix: &str, depth: usize, out: &mut Vec<SlashCommand>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(stem) = path.file_stem().map(|s| s.to_string_lossy().into_owned()) else { continue };
        if path.is_dir() {
            if depth < MAX_COMMAND_DEPTH {
                walk_commands(&path, &format!("{prefix}{stem}:"), depth + 1, out);
            }
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else { continue };
        let (front, body) = frontmatter(&text);
        let description = front
            .description
            .or_else(|| body.lines().map(|l| l.trim().trim_start_matches('#').trim()).find(|l| !l.is_empty()).map(str::to_owned))
            .unwrap_or_default();
        out.push(SlashCommand { name: format!("{prefix}{stem}"), description, argument_hint: front.argument_hint.unwrap_or_default() });
    }
}

/// A skill as a Claude Code slash command (Claude Code lists skills among
/// its commands and runs them as `/name`).
pub fn skill_command(skill: &Skill, prefix: &str) -> SlashCommand {
    SlashCommand { name: format!("{prefix}{}", skill.name), description: skill.description.clone(), argument_hint: String::new() }
}

/// What Claude Code would list from disk for `cwd`: project then user
/// skills, plugin skills (`<plugin>:<skill>`), then project then user
/// commands. A name seen earlier wins, as in Claude Code.
pub fn claude_commands(cwd: &Path, home: Option<&Path>, plugins: &[(String, PathBuf)]) -> Vec<SlashCommand> {
    let mut out: Vec<SlashCommand> = Vec::new();
    let mut push = |c: SlashCommand, out: &mut Vec<SlashCommand>| {
        if !out.iter().any(|o| o.name == c.name) {
            out.push(c);
        }
    };
    let user = |sub: &str| home.map(|h| h.join(".claude").join(sub));
    for dir in [Some(cwd.join(".claude/skills")), user("skills")].into_iter().flatten() {
        for s in skills_in(&dir) {
            push(skill_command(&s, ""), &mut out);
        }
    }
    for (plugin, dir) in plugins {
        for s in skills_in(&dir.join("skills")) {
            push(skill_command(&s, &format!("{plugin}:")), &mut out);
        }
    }
    for dir in [Some(cwd.join(".claude/commands")), user("commands")].into_iter().flatten() {
        for c in commands_in(&dir) {
            push(c, &mut out);
        }
    }
    out
}

/// What Codex would list from disk for `cwd`: repo skills, then user skills.
pub fn codex_skills(cwd: &Path, home: Option<&Path>) -> Vec<Skill> {
    let mut dirs = vec![cwd.join(".codex/skills"), cwd.join(".agents/skills")];
    if let Some(h) = home {
        dirs.push(h.join(".codex/skills"));
        dirs.push(h.join(".agents/skills"));
    }
    let mut out: Vec<Skill> = Vec::new();
    for dir in dirs {
        for s in skills_in(&dir) {
            if !out.iter().any(|o| o.name == s.name) {
                out.push(s);
            }
        }
    }
    out
}
