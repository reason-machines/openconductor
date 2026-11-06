use std::fs;
use std::path::{Path, PathBuf};

use serde_json::json;

use super::query;
use super::scan;
use super::*;

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("oc-agent-commands-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

#[test]
fn frontmatter_reads_plain_quoted_and_folded_values() {
    let (f, body) = scan::frontmatter("---\nname: deploy\ndescription: \"Ship it: now\"\nargument-hint: [env]\nmetadata:\n  version: 1\n---\n# Body\n");
    assert_eq!(f.name.as_deref(), Some("deploy"));
    assert_eq!(f.description.as_deref(), Some("Ship it: now"));
    assert_eq!(f.argument_hint.as_deref(), Some("[env]"));
    assert_eq!(body, "# Body\n");
    let (f, _) = scan::frontmatter("---\nname: yc\ndescription: >-\n  Uses YC's Bookface\n  from the terminal.\n---\n");
    assert_eq!(f.description.as_deref(), Some("Uses YC's Bookface from the terminal."));
    let (f, body) = scan::frontmatter("no frontmatter");
    assert_eq!(f, scan::Front::default());
    assert_eq!(body, "no frontmatter");
}

#[test]
fn claude_folders_list_skills_plugins_and_commands_project_first() {
    let root = tmp("claude");
    let (home, cwd, plugin) = (root.join("home"), root.join("ws"), root.join("plugin"));
    write(&home.join(".claude/skills/deploy/SKILL.md"), "---\nname: deploy\ndescription: user deploy\n---\n");
    write(&home.join(".claude/skills/notes/SKILL.md"), "---\ndescription: take notes\n---\n");
    write(&cwd.join(".claude/skills/deploy/SKILL.md"), "---\nname: deploy\ndescription: project deploy\n---\n");
    write(&cwd.join(".claude/commands/fix-issue.md"), "---\ndescription: Fix an issue\nargument-hint: <number>\n---\nFix $ARGUMENTS\n");
    write(&home.join(".claude/commands/frontend/lint.md"), "# Lint the frontend\n");
    write(&plugin.join("skills/conductor/SKILL.md"), "---\nname: conductor\ndescription: OpenConductor workspace\n---\n");
    let got = scan::claude_commands(&cwd, Some(&home), &[("openconductor".into(), plugin)]);
    let names: Vec<(&str, &str, &str)> = got.iter().map(|c| (c.name.as_str(), c.description.as_str(), c.argument_hint.as_str())).collect();
    assert_eq!(
        names,
        vec![
            ("deploy", "project deploy", ""),
            ("notes", "take notes", ""),
            ("openconductor:conductor", "OpenConductor workspace", ""),
            ("fix-issue", "Fix an issue", "<number>"),
            ("frontend:lint", "Lint the frontend", ""),
        ]
    );
}

#[test]
fn codex_folders_list_repo_then_user_skills() {
    let root = tmp("codex");
    let (home, cwd) = (root.join("home"), root.join("ws"));
    write(&home.join(".codex/skills/a/SKILL.md"), "---\nname: alpha\ndescription: from codex home\n---\n");
    write(&home.join(".agents/skills/b/SKILL.md"), "---\nname: beta\ndescription: from agents\n---\n");
    write(&cwd.join(".agents/skills/b/SKILL.md"), "---\nname: beta\ndescription: repo beta\n---\n");
    let got = scan::codex_skills(&cwd, Some(&home));
    let names: Vec<(&str, &str)> = got.iter().map(|s| (s.name.as_str(), s.description.as_str())).collect();
    assert_eq!(names, vec![("beta", "repo beta"), ("alpha", "from codex home")]);
    assert!(got[0].path.ends_with(".agents/skills/b/SKILL.md"), "{}", got[0].path);
}

#[test]
fn claude_initialize_response_gives_its_commands() {
    // Shape recorded from Claude Code 2.1.318 on macOS (names shortened).
    let line = json!({"type": "control_response", "response": {"subtype": "success", "request_id": "oc-commands", "response": {
        "commands": [
            {"name": "deploy", "description": "Ship it", "argumentHint": ""},
            {"name": "openconductor:conductor", "description": "OpenConductor", "argumentHint": "[task]"},
            {"name": "old", "description": "Older builds", "argumentHint": ["a", "b"]},
            {"name": "", "description": "dropped"}
        ],
        "models": [], "account": {}
    }}});
    let got = query::claude_commands(&line).unwrap().unwrap();
    let names: Vec<(&str, &str)> = got.iter().map(|c| (c.name.as_str(), c.argument_hint.as_str())).collect();
    assert_eq!(names, vec![("deploy", ""), ("openconductor:conductor", "[task]"), ("old", "a b")]);
    assert!(query::claude_commands(&json!({"type": "system", "subtype": "init"})).is_none());
    assert!(query::claude_commands(&json!({"type": "control_response", "response": {"request_id": "other", "subtype": "success"}})).is_none());
    let err = json!({"type": "control_response", "response": {"subtype": "error", "request_id": "oc-commands", "error": "not signed in"}});
    assert_eq!(query::claude_commands(&err).unwrap().unwrap_err(), "not signed in");
    let sent: serde_json::Value = serde_json::from_str(query::claude_initialize_line().trim()).unwrap();
    assert_eq!(sent, json!({"type": "control_request", "request_id": "oc-commands", "request": {"subtype": "initialize"}}));
}

#[test]
fn codex_skills_list_keeps_the_folders_enabled_skills() {
    // Shape recorded from codex-cli 0.166.0 `skills/list`.
    let line = json!({"id": 2, "result": {"data": [
        {"cwd": "/ws", "skills": [
            {"name": "deploy", "description": "Ship", "path": "/u/.codex/skills/deploy/SKILL.md", "scope": "user", "enabled": true, "interface": {"displayName": "Deploy"}},
            {"name": "off", "description": "", "path": "/u/off/SKILL.md", "scope": "user", "enabled": false}
        ]},
        {"cwd": "/other", "skills": [{"name": "x", "path": "/x/SKILL.md", "enabled": true}]}
    ]}});
    let got = query::codex_skills(&line, "/ws").unwrap().unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].name, "deploy");
    assert_eq!(got[0].display_name.as_deref(), Some("Deploy"));
    // One entry under another spelling of the folder (a symlink) is still the folder's.
    let one = json!({"id": 2, "result": {"data": [{"cwd": "/private/ws", "skills": [{"name": "y", "path": "/y/SKILL.md", "enabled": true}]}]}});
    assert_eq!(query::codex_skills(&one, "/ws").unwrap().unwrap()[0].name, "y");
    assert!(query::codex_skills(&json!({"id": 1, "result": {}}), "/ws").is_none());
    let lines = query::codex_lines("/ws");
    let list: serde_json::Value = serde_json::from_str(lines[2].trim()).unwrap();
    assert_eq!(list, json!({"id": 2, "method": "skills/list", "params": {"cwds": ["/ws"]}}));
}

#[test]
fn reason_skills_list_gives_enabled_workspace_skills() {
    let out = json!({"schema_version": 1, "ok": true, "data": {"items": [
        {"skill_id": "s1", "name": "yc-cli", "description": "YC", "is_enabled": true},
        {"skill_id": "s2", "name": "off", "description": "", "is_enabled": false}
    ], "total": 2}});
    let got = query::reason_skills(&out).unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].name, "yc-cli");
    assert_eq!(got[0].path, "reason-skill:s1");
    assert!(query::reason_skills(&json!({"ok": false, "error": {"message": "sign in"}})).is_err());
}

#[test]
fn the_bundled_skill_joins_codex_skills_once() {
    let root = tmp("bundled");
    write(&root.join(".claude-plugin/plugin.json"), r#"{"name": "openconductor"}"#);
    write(&root.join("skills/conductor/SKILL.md"), "---\nname: conductor\ndescription: OpenConductor\n---\n");
    assert_eq!(plugin_of(&root).map(|p| p.0), Some("openconductor".into()));
    let bundled = bundled_skills(std::slice::from_ref(&root));
    assert_eq!(bundled.len(), 1);
    let listed = vec![Skill { name: "deploy".into(), description: String::new(), path: "/d/SKILL.md".into(), display_name: None }];
    let both = with_skills(listed.clone(), bundled.clone());
    assert_eq!(both.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(), vec!["deploy", "conductor"]);
    assert_eq!(with_skills(both.clone(), bundled).len(), 2);
}

#[test]
fn the_shipped_plugin_is_found_as_a_skill() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/conductor-skill");
    let skills = bundled_skills(&[dir]);
    assert_eq!(skills.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(), vec!["conductor"]);
    assert!(!skills[0].description.is_empty());
}

#[cfg(unix)]
#[test]
fn converse_reads_until_the_answer_and_kills_the_child() {
    // A stand-in agent: answers the second request only after the first.
    let mut cmd = std::process::Command::new("/bin/sh");
    cmd.args(["-c", r#"read a; echo '{"id":1}'; read b; echo 'noise'; echo '{"id":2,"ok":true}'; sleep 30"#]);
    let started = std::time::Instant::now();
    let got = query::converse(
        cmd,
        &["first\n".to_owned()],
        std::time::Duration::from_secs(10),
        |line, stdin| {
            if line["id"] == 1 {
                let _ = stdin.write_all(b"second\n");
                let _ = stdin.flush();
            }
        },
        |line| (line["id"] == 2).then(|| Ok(line["ok"].as_bool().unwrap())),
    );
    assert_eq!(got, Ok(true));
    assert!(started.elapsed() < std::time::Duration::from_secs(10), "the child was killed, not waited for");
    let silent = query::converse::<()>(std::process::Command::new("/bin/cat"), &[], std::time::Duration::from_millis(300), |_, _| {}, |_| None);
    assert!(silent.unwrap_err().contains("no answer"));
}
