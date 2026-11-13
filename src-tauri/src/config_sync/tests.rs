use super::*;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
static NEXT: AtomicU64 = AtomicU64::new(0);

struct Home(PathBuf);
impl Home {
    fn new() -> Self {
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("oc-config-sync-{}-{id}", std::process::id()));
        fs::create_dir(&dir).unwrap();
        Self(dir)
    }
    fn write(&self, path: &str, value: &str) {
        let dest = self.0.join(path);
        fs::create_dir_all(dest.parent().unwrap()).unwrap();
        fs::write(dest, value).unwrap();
    }
    fn read(&self, path: &str) -> String { fs::read_to_string(self.0.join(path)).unwrap() }
    fn exists(&self, path: &str) -> bool { self.0.join(path).exists() }
}
impl Drop for Home { fn drop(&mut self) { fs::remove_dir_all(&self.0).unwrap(); } }
fn selection(category: Category, direction: Direction, name: &str) -> Selection {
    Selection { category, direction, name: name.into() }
}

#[test]
fn listing_is_read_only_and_existing_names_are_not_offered() {
    let home = Home::new();
    home.write(".claude/skills/claude-only/SKILL.md", "Claude-only synthetic skill\n");
    home.write(".codex/skills/codex-only/SKILL.md", "---\nname: codex-only\n---\nCodex-only synthetic skill\n");
    home.write(".claude/skills/shared/SKILL.md", "source different\n");
    home.write(".codex/skills/shared/SKILL.md", "destination preserved\n");
    let view = diff(&home.0);
    assert_eq!(view.skills.cc_to_codex, ["claude-only"]);
    assert_eq!(view.skills.codex_to_cc, ["codex-only"]);
    assert!(!home.exists(".codex/skills/claude-only"));
    assert_eq!(home.read(".codex/skills/shared/SKILL.md"), "destination preserved\n");
    assert!(view.skills.error.is_none());
}

#[test]
fn only_selected_skill_copies_and_codex_root_gets_frontmatter() {
    let home = Home::new();
    home.write(".claude/skills/selected/SKILL.md", "Synthetic skill\n");
    home.write(".claude/skills/selected/assets/info.txt", "Synthetic asset\n");
    home.write(".claude/skills/selected/node_modules/ignored", "excluded\n");
    home.write(".claude/skills/selected/.git/config", "excluded\n");
    home.write(".claude/skills/selected/.DS_Store", "excluded\n");
    home.write(".claude/skills/not-selected/SKILL.md", "Do not copy\n");
    let result = sync(&home.0, &[selection(Category::Skills, Direction::CcToCodex, "selected")]);
    assert_eq!(result.successes, 1);
    assert!(result.failures.is_empty());
    assert_eq!(home.read(".codex/skills/selected/SKILL.md"), "---\nname: 'selected'\ndescription: Imported from Claude Code\n---\n\nSynthetic skill\n");
    assert_eq!(home.read(".codex/skills/selected/assets/info.txt"), "Synthetic asset\n");
    assert!(!home.exists(".codex/skills/not-selected"));
    for excluded in ["node_modules", ".git", ".DS_Store"] { assert!(!home.exists(&format!(".codex/skills/selected/{excluded}"))); }
    let again = sync(&home.0, &[selection(Category::Skills, Direction::CcToCodex, "selected")]);
    assert_eq!(again.successes, 0);
    assert_eq!(home.read(".codex/skills/selected/assets/info.txt"), "Synthetic asset\n");
}

#[test]
fn commands_are_recursive_nonhidden_markdown_and_copy_both_directions() {
    let home = Home::new();
    home.write(".claude/commands/nested/one.md", "Synthetic prompt one\n");
    home.write(".claude/commands/.hidden.md", "Ignore\n");
    home.write(".claude/commands/not-markdown.txt", "Ignore\n");
    home.write(".codex/prompts/two.md", "Synthetic prompt two\n");
    let view = diff(&home.0);
    assert_eq!(view.slash_commands.cc_to_codex, ["nested/one"]);
    assert_eq!(view.slash_commands.codex_to_cc, ["two"]);
    let result = sync(&home.0, &[
        selection(Category::SlashCommands, Direction::CcToCodex, "nested/one"),
        selection(Category::SlashCommands, Direction::CodexToCc, "two"),
    ]);
    assert_eq!(result.successes, 2);
    assert!(result.failures.is_empty());
    assert_eq!(home.read(".codex/prompts/nested/one.md"), "Synthetic prompt one\n");
    assert_eq!(home.read(".claude/commands/two.md"), "Synthetic prompt two\n");
}

#[test]
fn synthetic_mcp_values_convert_locally_and_unrelated_data_is_preserved() {
    let home = Home::new();
    home.write(".claude.json", r#"{"syntheticUnrelated":{"keep":true},"mcpServers":{"from-claude":{"command":"synthetic-tool","args":["--synthetic"],"env":{"SYNTHETIC_VALUE":"inert-env"}},"http":{"type":"http","url":"https://example.invalid/mcp","headers":{"X-Synthetic":"inert-header"}}}}"#);
    let codex = "# Preserve this comment\nmodel = \"synthetic-model\"\n\n[mcp_servers.from-codex]\nurl = \"https://example.invalid/codex\"\nhttp_headers = { \"X-Synthetic\" = \"inert-codex-header\" }\n";
    home.write(".codex/config.toml", codex);
    let view = diff(&home.0);
    assert_eq!(view.mcp_servers.cc_to_codex, ["from-claude", "http"]);
    assert_eq!(view.mcp_servers.codex_to_cc, ["from-codex"]);
    let result = sync(&home.0, &[
        selection(Category::McpServers, Direction::CcToCodex, "from-claude"),
        selection(Category::McpServers, Direction::CcToCodex, "http"),
        selection(Category::McpServers, Direction::CodexToCc, "from-codex"),
    ]);
    assert_eq!(result.successes, 3);
    assert!(result.failures.is_empty());
    assert!(home.read(".codex/config.toml").starts_with(codex));
    let parsed: toml::Value = toml::from_str(&home.read(".codex/config.toml")).unwrap();
    assert_eq!(parsed["mcp_servers"]["from-claude"]["env"]["SYNTHETIC_VALUE"].as_str(), Some("inert-env"));
    assert_eq!(parsed["mcp_servers"]["http"]["http_headers"]["X-Synthetic"].as_str(), Some("inert-header"));
    let parsed: serde_json::Value = serde_json::from_str(&home.read(".claude.json")).unwrap();
    assert_eq!(parsed["syntheticUnrelated"]["keep"], true);
    assert_eq!(parsed["mcpServers"]["from-codex"]["headers"]["X-Synthetic"], "inert-codex-header");
    assert_eq!(parsed["mcpServers"]["from-codex"]["type"], "http");
}

#[test]
fn occupied_unsupported_names_and_unsupported_reverse_fields_are_not_offered() {
    let home = Home::new();
    home.write(".claude.json", r#"{"mcpServers":{"occupied":{"command":"synthetic-tool"},"from-claude":{"command":"synthetic-tool"}}}"#);
    home.write(".codex/config.toml", "[mcp_servers.occupied]\nunsupported_field = true\n\n[mcp_servers.bearer]\nurl = \"https://example.invalid\"\nbearer_token_env_var = \"SYNTHETIC_UNSET\"\n\n[mcp_servers.header-env]\nurl = \"https://example.invalid\"\nenv_http_headers = { X = \"SYNTHETIC_UNSET\" }\n");
    let view = diff(&home.0);
    assert_eq!(view.mcp_servers.cc_to_codex, ["from-claude"]);
    assert!(view.mcp_servers.codex_to_cc.is_empty());
    assert!(view.mcp_servers.error.is_none());
}

#[test]
fn malformed_mcp_is_isolated_and_parse_errors_do_not_return_file_values() {
    let home = Home::new();
    home.write(".claude.json", "INVALID-INERT-SYNTHETIC-CONTENT");
    home.write(".claude/skills/available/SKILL.md", "Synthetic\n");
    let view = diff(&home.0);
    assert!(view.mcp_servers.error.is_some());
    assert!(!view.mcp_servers.error.unwrap().contains("INVALID-INERT"));
    assert_eq!(view.skills.cc_to_codex, ["available"]);
    let result = sync(&home.0, &[selection(Category::Skills, Direction::CcToCodex, "available")]);
    assert_eq!(result.successes, 1);
}

#[test]
fn traversal_and_newly_occupied_destinations_never_write() {
    let home = Home::new();
    home.write(".claude/commands/available.md", "Synthetic source\n");
    let view = diff(&home.0);
    assert_eq!(view.slash_commands.cc_to_codex, ["available"]);
    home.write(".codex/prompts/available.md", "New occupant\n");
    let result = sync(&home.0, &[
        selection(Category::SlashCommands, Direction::CcToCodex, "available"),
        selection(Category::SlashCommands, Direction::CcToCodex, "../../escape"),
    ]);
    assert_eq!(result.successes, 0);
    assert_eq!(result.failures.len(), 2);
    assert_eq!(home.read(".codex/prompts/available.md"), "New occupant\n");
    assert!(!home.exists("escape.md"));
}

#[cfg(unix)]
#[test]
fn symlink_source_and_destination_roots_do_not_escape_the_home_fixture() {
    use std::os::unix::fs::symlink;
    let home = Home::new();
    let outside = Home::new();
    home.write(".claude/skills/linked/SKILL.md", "Synthetic\n");
    fs::create_dir_all(home.0.join(".codex")).unwrap();
    symlink(&outside.0, home.0.join(".codex/skills")).unwrap();
    let result = sync(&home.0, &[selection(Category::Skills, Direction::CcToCodex, "linked")]);
    assert_eq!(result.successes, 0);
    assert!(!outside.exists("linked"));
    home.write(".claude/commands/visible.md", "Synthetic\n");
    symlink(outside.0.join("not-read.md"), home.0.join(".claude/commands/symlink.md")).unwrap();
    assert!(!diff(&home.0).slash_commands.cc_to_codex.contains(&"symlink".into()));
}

#[test]
fn ipc_schema_is_strictly_camel_case_and_contains_no_config_values() {
    let home = Home::new();
    let empty = serde_json::json!({ "ccToCodex": [], "codexToCc": [], "error": null });
    assert_eq!(serde_json::to_value(diff(&home.0)).unwrap(), serde_json::json!({
        "mcpServers": empty.clone(), "slashCommands": empty.clone(), "skills": empty,
    }));
    assert_eq!(serde_json::to_value(sync(&home.0, &[])).unwrap(), serde_json::json!({
        "successes": 0, "failures": [], "unsupportedMcp": [],
    }));
    let request = serde_json::json!({ "category": "mcpServers", "direction": "ccToCodex", "name": "synthetic" });
    let parsed: Selection = serde_json::from_value(request.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), request);
    assert!(serde_json::from_value::<Selection>(serde_json::json!({
        "category": "skills", "direction": "codexToCc", "name": "synthetic", "path": "/not-allowed",
    })).is_err());
    let failure = Failure { category: Category::SlashCommands, name: "synthetic".into(), reason: "Not available.".into() };
    assert_eq!(serde_json::to_value(failure).unwrap(), serde_json::json!({
        "category": "slashCommands", "name": "synthetic", "reason": "Not available.",
    }));
    home.write(".claude.json", r#"{"mcpServers":{"synthetic":{"command":"synthetic-tool","env":{"SYNTHETIC":"INERT-PRIVATE-VALUE"},"headers":{"X-Synthetic":"INERT-PRIVATE-HEADER"}}}}"#);
    let response = serde_json::to_string(&diff(&home.0)).unwrap();
    assert!(!response.contains("INERT-PRIVATE"));
    let result = sync(&home.0, &[selection(Category::McpServers, Direction::CcToCodex, "synthetic")]);
    assert!(!serde_json::to_string(&result).unwrap().contains("INERT-PRIVATE"));
}

#[test]
fn empty_and_duplicate_requests_do_not_add_extra_writes() {
    let home = Home::new();
    assert_eq!(sync(&home.0, &[]).successes, 0);
    assert!(!home.exists(".claude"));
    assert!(!home.exists(".codex"));
    home.write(".claude/commands/one.md", "Synthetic\n");
    let result = sync(&home.0, &[
        selection(Category::SlashCommands, Direction::CcToCodex, "one"),
        selection(Category::SlashCommands, Direction::CcToCodex, "one"),
    ]);
    assert_eq!(result.successes, 1);
    assert!(result.failures.is_empty());
    assert_eq!(home.read(".codex/prompts/one.md"), "Synthetic\n");
}

#[test]
fn malformed_json_shapes_and_toml_errors_are_redacted_and_isolated() {
    let home = Home::new();
    home.write(".claude/skills/available/SKILL.md", "Synthetic\n");
    for invalid in ["[\"INERT-PARSER-MARKER\"]", r#"{"mcpServers":"INERT-PARSER-MARKER"}"#, "INERT-PARSER-MARKER"] {
        home.write(".claude.json", invalid);
        let view = diff(&home.0);
        assert!(view.mcp_servers.error.is_some());
        assert!(!serde_json::to_string(&view).unwrap().contains("INERT-PARSER-MARKER"));
        assert_eq!(view.skills.cc_to_codex, ["available"]);
    }
    home.write(".claude.json", "{}");
    home.write(".codex/config.toml", "INERT-PARSER-MARKER = [\n");
    let view = diff(&home.0);
    assert!(view.mcp_servers.error.is_some());
    assert!(!serde_json::to_string(&view).unwrap().contains("INERT-PARSER-MARKER"));
    assert_eq!(view.skills.cc_to_codex, ["available"]);
    let result = sync(&home.0, &[selection(Category::McpServers, Direction::CcToCodex, "missing")]);
    assert_eq!(result.failures.len(), 1);
    assert!(!serde_json::to_string(&result).unwrap().contains("INERT-PARSER-MARKER"));
}

#[test]
fn occupied_non_skill_entries_and_command_ancestors_block_copy() {
    let home = Home::new();
    home.write(".claude/skills/occupied/SKILL.md", "Synthetic\n");
    home.write(".codex/skills/occupied", "Not a skill directory\n");
    home.write(".claude/commands/nested/one.md", "Synthetic\n");
    home.write(".codex/prompts/nested", "Not a directory\n");
    let view = diff(&home.0);
    assert!(view.skills.cc_to_codex.is_empty());
    assert!(view.slash_commands.cc_to_codex.is_empty());
    let result = sync(&home.0, &[
        selection(Category::Skills, Direction::CcToCodex, "occupied"),
        selection(Category::SlashCommands, Direction::CcToCodex, "nested/one"),
    ]);
    assert_eq!(result.successes, 0);
    assert_eq!(result.failures.len(), 2);
    assert_eq!(home.read(".codex/skills/occupied"), "Not a skill directory\n");
    assert_eq!(home.read(".codex/prompts/nested"), "Not a directory\n");
}

#[test]
fn reverse_skills_keep_bytes_and_only_forward_root_frontmatter_is_added() {
    let home = Home::new();
    let existing = "\u{feff}  ---\nname: retained\n---\nSynthetic\n";
    home.write(".claude/skills/frontmatter/SKILL.md", existing);
    home.write(".claude/skills/quote'name/SKILL.md", "Synthetic\n");
    home.write(".claude/skills/quote'name/nested/SKILL.md", "Nested stays unchanged\n");
    home.write(".codex/skills/reverse/SKILL.md", "Reverse stays unchanged\n");
    let result = sync(&home.0, &[
        selection(Category::Skills, Direction::CcToCodex, "frontmatter"),
        selection(Category::Skills, Direction::CcToCodex, "quote'name"),
        selection(Category::Skills, Direction::CodexToCc, "reverse"),
    ]);
    assert_eq!(result.successes, 3);
    assert_eq!(home.read(".codex/skills/frontmatter/SKILL.md"), existing);
    assert_eq!(home.read(".codex/skills/quote'name/SKILL.md"), "---\nname: 'quote''name'\ndescription: Imported from Claude Code\n---\n\nSynthetic\n");
    assert_eq!(home.read(".codex/skills/quote'name/nested/SKILL.md"), "Nested stays unchanged\n");
    assert_eq!(home.read(".claude/skills/reverse/SKILL.md"), "Reverse stays unchanged\n");
}

#[test]
fn recursive_commands_skip_hidden_components_and_resolve_uppercase_extensions() {
    let home = Home::new();
    home.write(".claude/commands/nested/upper.MD", "Synthetic uppercase\n");
    home.write(".claude/commands/.hidden/ignored.md", "Hidden\n");
    home.write(".claude/commands/nested/.ignored.md", "Hidden\n");
    assert_eq!(diff(&home.0).slash_commands.cc_to_codex, ["nested/upper"]);
    let result = sync(&home.0, &[selection(Category::SlashCommands, Direction::CcToCodex, "nested/upper")]);
    assert_eq!(result.successes, 1);
    assert_eq!(home.read(".codex/prompts/nested/upper.md"), "Synthetic uppercase\n");
}

#[test]
fn unoffered_file_and_mcp_names_do_not_create_config_roots() {
    let home = Home::new();
    let mut requests = Vec::new();
    for category in [Category::Skills, Category::SlashCommands, Category::McpServers] {
        for name in ["", ".", "..", "../escape", "/absolute", "a//b", "a/../b", "a\\b", "a\nb", "C:escape", ".hidden"] {
            requests.push(selection(category, Direction::CcToCodex, name));
        }
    }
    let result = sync(&home.0, &requests);
    assert_eq!(result.successes, 0);
    assert_eq!(result.failures.len(), requests.len());
    assert!(!home.exists(".claude"));
    assert!(!home.exists(".codex"));
    assert!(!home.exists(".claude.json"));
}

#[test]
fn quoted_mcp_map_keys_round_trip_without_becoming_paths() {
    let boundary = Home::new();
    let forward = Home(boundary.0.join("forward"));
    let reverse = Home(boundary.0.join("reverse"));
    fs::create_dir(&forward.0).unwrap();
    fs::create_dir(&reverse.0).unwrap();
    let absolute_name = boundary.0.join("absolute-target").to_str().unwrap().to_owned();
    let names = [
        "@fixture/service:v1", ".leading", "back\\slash\"quote", "line\nreturn\rtab\t",
        "../escape", "", absolute_name.as_str(),
    ];
    let mut expected: Vec<String> = names.iter().map(|name| (*name).into()).collect();
    expected.sort();
    let servers: serde_json::Map<String, serde_json::Value> = names.iter().map(|name| {
        ((*name).into(), serde_json::json!({ "command": "synthetic-tool" }))
    }).collect();
    let original = serde_json::json!({ "mcpServers": servers });
    forward.write(".claude.json", &serde_json::to_string(&original).unwrap());
    let view = diff(&forward.0);
    assert!(view.mcp_servers.error.is_none());
    assert_eq!(view.mcp_servers.cc_to_codex, expected);
    assert!(view.mcp_servers.codex_to_cc.is_empty());
    let selections: Vec<_> = names.iter().map(|name| {
        selection(Category::McpServers, Direction::CcToCodex, name)
    }).collect();
    let result = sync(&forward.0, &selections);
    assert_eq!(result.successes, names.len());
    assert!(result.failures.is_empty());
    assert!(result.unsupported_mcp.is_empty());
    let codex_text = forward.read(".codex/config.toml");
    let codex: toml::Value = toml::from_str(&codex_text).unwrap();
    let mut actual: Vec<_> = codex["mcp_servers"].as_table().unwrap().keys().cloned().collect();
    actual.sort();
    assert_eq!(actual, expected);
    for name in names {
        assert_eq!(codex["mcp_servers"][name]["command"].as_str(), Some("synthetic-tool"));
    }
    reverse.write(".codex/config.toml", &codex_text);
    let view = diff(&reverse.0);
    assert!(view.mcp_servers.error.is_none());
    assert_eq!(view.mcp_servers.codex_to_cc, expected);
    assert!(view.mcp_servers.cc_to_codex.is_empty());
    let selections: Vec<_> = names.iter().map(|name| {
        selection(Category::McpServers, Direction::CodexToCc, name)
    }).collect();
    let result = sync(&reverse.0, &selections);
    assert_eq!(result.successes, names.len());
    assert!(result.failures.is_empty());
    assert!(result.unsupported_mcp.is_empty());
    let restored: serde_json::Value = serde_json::from_str(&reverse.read(".claude.json")).unwrap();
    assert_eq!(restored, original);
    for home in [&forward, &reverse] {
        let view = diff(&home.0);
        assert!(view.mcp_servers.error.is_none());
        assert!(view.mcp_servers.cc_to_codex.is_empty());
        assert!(view.mcp_servers.codex_to_cc.is_empty());
        let mut entries: Vec<_> = fs::read_dir(&home.0).unwrap().map(|entry| entry.unwrap().file_name()).collect();
        entries.sort();
        assert_eq!(entries, [std::ffi::OsString::from(".claude.json"), std::ffi::OsString::from(".codex")]);
        let entries: Vec<_> = fs::read_dir(home.0.join(".codex")).unwrap().map(|entry| entry.unwrap().file_name()).collect();
        assert_eq!(entries, [std::ffi::OsString::from("config.toml")]);
    }
    let mut entries: Vec<_> = fs::read_dir(&boundary.0).unwrap().map(|entry| entry.unwrap().file_name()).collect();
    entries.sort();
    assert_eq!(entries, [std::ffi::OsString::from("forward"), std::ffi::OsString::from("reverse")]);
}

#[test]
fn unsupported_mcp_definitions_stay_occupied_and_are_reported_by_name_only() {
    let home = Home::new();
    let original = r#"{"mcpServers":{"disabled":{"command":"synthetic"},"unknown":{"command":"synthetic","unknown":"INERT-UNSUPPORTED-VALUE"},"null-env":{"command":"synthetic","env":null},"sse":{"type":"sse","url":"https://example.invalid"}}}"#;
    home.write(".claude.json", original);
    let codex = "[mcp_servers.disabled]\ncommand = \"synthetic\"\nenabled = false\n\n[mcp_servers.unknown]\ncommand = \"synthetic\"\n";
    home.write(".codex/config.toml", codex);
    let view = diff(&home.0);
    assert!(view.mcp_servers.cc_to_codex.is_empty());
    assert!(view.mcp_servers.codex_to_cc.is_empty());
    let result = sync(&home.0, &[
        selection(Category::McpServers, Direction::CcToCodex, "unknown"),
        selection(Category::McpServers, Direction::CodexToCc, "disabled"),
    ]);
    assert_eq!(result.successes, 0);
    assert_eq!(result.failures.len(), 2);
    assert_eq!(result.unsupported_mcp, ["disabled", "unknown"]);
    assert!(!serde_json::to_string(&result).unwrap().contains("INERT-UNSUPPORTED-VALUE"));
    assert_eq!(home.read(".claude.json"), original);
    assert_eq!(home.read(".codex/config.toml"), codex);
}

#[test]
fn codex_known_metadata_is_ignored_and_existing_unsupported_json_is_preserved() {
    let home = Home::new();
    home.write(".claude.json", r#"{"unrelated":[1,true],"mcpServers":{"occupied":{"unknown":true}}}"#);
    home.write(".codex/config.toml", "[mcp_servers.synthetic]\ncommand = \"synthetic-tool\"\nargs = [\"--synthetic\"]\nenv = { SYNTHETIC = \"inert\" }\nenabled = true\nstartup_timeout_sec = 10\nstartup_timeout_ms = 100\ntool_timeout_sec = 20\nrequest_timeout_sec = 30\ndescription = \"Synthetic metadata\"\nname = \"Synthetic metadata\"\n");
    assert_eq!(diff(&home.0).mcp_servers.codex_to_cc, ["synthetic"]);
    let result = sync(&home.0, &[selection(Category::McpServers, Direction::CodexToCc, "synthetic")]);
    assert_eq!(result.successes, 1);
    let raw: serde_json::Value = serde_json::from_str(&home.read(".claude.json")).unwrap();
    assert_eq!(raw["unrelated"], serde_json::json!([1, true]));
    assert_eq!(raw["mcpServers"]["occupied"], serde_json::json!({ "unknown": true }));
    assert_eq!(raw["mcpServers"]["synthetic"], serde_json::json!({
        "command": "synthetic-tool", "args": ["--synthetic"], "env": { "SYNTHETIC": "inert" },
    }));
}

#[test]
fn stale_config_snapshot_does_not_replace_current_content() {
    let home = Home::new();
    home.write(".claude.json", "{\"unrelated\":true}\n");
    let result = files::replace_config(&home.0, Path::new(".claude.json"), Some("{}"), "{\"unrelated\":false}\n");
    assert!(result.is_err());
    assert_eq!(home.read(".claude.json"), "{\"unrelated\":true}\n");
    assert!(fs::read_dir(&home.0).unwrap().all(|entry| !entry.unwrap().file_name().to_string_lossy().starts_with(".openconductor-config-sync-")));
}

#[test]
fn mcp_target_occupation_after_diff_is_revalidated_without_overwrite() {
    let home = Home::new();
    home.write(".claude.json", r#"{"mcpServers":{"one":{"command":"synthetic"}}}"#);
    assert_eq!(diff(&home.0).mcp_servers.cc_to_codex, ["one"]);
    let occupied = "# Keep current text\n[mcp_servers.one]\nunknown = true\n";
    home.write(".codex/config.toml", occupied);
    let result = sync(&home.0, &[selection(Category::McpServers, Direction::CcToCodex, "one")]);
    assert_eq!(result.successes, 0);
    assert_eq!(result.failures.len(), 1);
    assert_eq!(home.read(".codex/config.toml"), occupied);
}

#[test]
fn invalid_root_skill_utf8_removes_only_its_partial_destination() {
    let home = Home::new();
    home.write(".claude/skills/invalid/SKILL.md", "placeholder");
    fs::write(home.0.join(".claude/skills/invalid/SKILL.md"), [0xff, 0xfe]).unwrap();
    home.write(".codex/skills/keep/SKILL.md", "Existing target\n");
    let result = sync(&home.0, &[selection(Category::Skills, Direction::CcToCodex, "invalid")]);
    assert_eq!(result.successes, 0);
    assert_eq!(result.failures.len(), 1);
    assert!(!home.exists(".codex/skills/invalid"));
    assert_eq!(home.read(".codex/skills/keep/SKILL.md"), "Existing target\n");
}

#[test]
fn malformed_skill_root_does_not_block_command_diff_or_copy() {
    let home = Home::new();
    home.write(".claude/skills", "Not a directory\n");
    home.write(".claude/commands/one.md", "Synthetic\n");
    let view = diff(&home.0);
    assert!(view.skills.error.is_some());
    assert_eq!(view.slash_commands.cc_to_codex, ["one"]);
    let result = sync(&home.0, &[selection(Category::SlashCommands, Direction::CcToCodex, "one")]);
    assert_eq!(result.successes, 1);
}

#[cfg(unix)]
#[test]
fn nested_symlinks_abort_skills_and_roll_back_only_the_new_destination() {
    use std::os::unix::fs::symlink;
    let home = Home::new();
    let outside = Home::new();
    home.write(".claude/skills/linked/SKILL.md", "Synthetic\n");
    home.write(".claude/skills/linked/asset.txt", "Synthetic\n");
    home.write(".codex/skills/keep/SKILL.md", "Existing target\n");
    symlink(&outside.0, home.0.join(".claude/skills/linked/nested-link")).unwrap();
    let result = sync(&home.0, &[selection(Category::Skills, Direction::CcToCodex, "linked")]);
    assert_eq!(result.successes, 0);
    assert_eq!(result.failures.len(), 1);
    assert!(!home.exists(".codex/skills/linked"));
    assert_eq!(home.read(".codex/skills/keep/SKILL.md"), "Existing target\n");
    assert_eq!(fs::read_dir(&outside.0).unwrap().count(), 0);
}

#[cfg(unix)]
#[test]
fn home_owned_symlink_ancestors_and_mcp_entries_are_rejected() {
    use std::os::unix::fs::symlink;
    let home = Home::new();
    let outside = Home::new();
    home.write(".claude/commands/one.md", "Synthetic\n");
    outside.write("config.toml", "# Synthetic outside content\n");
    symlink(&outside.0, home.0.join(".codex")).unwrap();
    assert!(diff(&home.0).slash_commands.error.is_some());
    assert_eq!(sync(&home.0, &[selection(Category::SlashCommands, Direction::CcToCodex, "one")]).successes, 0);
    assert!(!outside.exists("prompts/one.md"));
    symlink(outside.0.join("config.toml"), home.0.join(".claude.json")).unwrap();
    assert!(diff(&home.0).mcp_servers.error.is_some());
    assert_eq!(outside.read("config.toml"), "# Synthetic outside content\n");
}

#[cfg(unix)]
#[test]
fn symlinks_above_the_explicit_home_are_not_rejected() {
    use std::os::unix::fs::symlink;
    let outer = Home::new();
    outer.write("real/home/.claude/commands/one.md", "Synthetic\n");
    symlink(outer.0.join("real"), outer.0.join("alias")).unwrap();
    let home = outer.0.join("alias/home");
    assert_eq!(diff(&home).slash_commands.cc_to_codex, ["one"]);
    let result = sync(&home, &[selection(Category::SlashCommands, Direction::CcToCodex, "one")]);
    assert_eq!(result.successes, 1);
    assert_eq!(outer.read("real/home/.codex/prompts/one.md"), "Synthetic\n");
}
