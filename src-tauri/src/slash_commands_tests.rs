use super::*;
use serde_json::json;

#[test]
fn claude_initialize_answer_lists_its_commands_in_order() {
    // Shape recorded from Claude Code 2.1.318 on sven m5 max (user skill,
    // plugin skill with an alias, built-in with an argument hint).
    let line = json!({
        "type": "control_response",
        "response": {"subtype": "success", "request_id": CLAUDE_INIT_ID, "response": {
            "commands": [
                {"name": "anki", "description": "Creates Anki cards (user)", "argumentHint": ""},
                {"name": "ocfix:oc-fixture", "description": "(ocfix) Fixture skill", "argumentHint": "", "aliases": ["oc-fixture"]},
                {"name": "review", "description": "Review a pull request", "argumentHint": "[pr]"},
                {"name": "", "description": "nameless", "argumentHint": ""},
                {"description": "no name"}
            ],
            "models": []
        }}
    })
    .to_string();
    let names: Vec<_> = claude_init_answer(&line)
        .expect("the answer")
        .expect("commands")
        .into_iter()
        .map(|c| (c.name, c.argument_hint))
        .collect();
    assert_eq!(
        names,
        [
            ("anki".to_string(), String::new()),
            ("ocfix:oc-fixture".to_string(), String::new()),
            ("review".to_string(), "[pr]".to_string())
        ]
    );
}

#[test]
fn claude_lines_that_are_not_the_answer_are_skipped() {
    assert_eq!(claude_init_answer("not json"), None);
    assert_eq!(
        claude_init_answer(r#"{"type":"system","subtype":"hook_started"}"#),
        None
    );
    let other = json!({"type": "control_response", "response": {"request_id": "req_1", "subtype": "success", "response": {}}});
    assert_eq!(claude_init_answer(&other.to_string()), None);
    let refused = json!({"type": "control_response", "response": {"request_id": CLAUDE_INIT_ID, "subtype": "error", "error": "not signed in"}});
    assert_eq!(
        claude_init_answer(&refused.to_string()),
        Some(Err("not signed in".into()))
    );
}

#[test]
fn codex_skills_are_the_enabled_ones_for_the_folder() {
    let result = json!({"data": [
        {"cwd": "/other", "skills": [{"name": "elsewhere", "description": "", "path": "/x/SKILL.md", "enabled": true}], "errors": []},
        {"cwd": "/w", "skills": [
            {"name": "oc-fixture", "description": "Fixture skill", "path": "/h/.codex/skills/oc-fixture/SKILL.md", "scope": "user", "enabled": true, "pluginId": null},
            {"name": "off", "description": "Disabled", "path": "/h/.codex/skills/off/SKILL.md", "scope": "user", "enabled": false, "pluginId": null},
            {"name": "pretty", "description": "Has a display name", "path": "/w/.agents/skills/pretty/SKILL.md", "scope": "repo", "enabled": true, "interface": {"displayName": "Pretty Skill"}, "pluginId": null}
        ], "errors": []}
    ]});
    let skills = codex_skills_from(&result, "/w");
    assert_eq!(
        skills,
        [
            Skill {
                name: "oc-fixture".into(),
                description: "Fixture skill".into(),
                path: "/h/.codex/skills/oc-fixture/SKILL.md".into(),
                display_name: None
            },
            Skill {
                name: "pretty".into(),
                description: "Has a display name".into(),
                path: "/w/.agents/skills/pretty/SKILL.md".into(),
                display_name: Some("Pretty Skill".into())
            }
        ]
    );
    // Codex may report the folder canonicalized: one entry is taken as is.
    let one = json!({"data": [{"cwd": "/private/w", "skills": [{"name": "a", "description": "", "path": "/a/SKILL.md", "enabled": true}]}]});
    assert_eq!(codex_skills_from(&one, "/w").len(), 1);
    assert!(codex_skills_from(&json!({"data": []}), "/w").is_empty());
}

#[test]
fn reason_skills_are_the_enabled_ones_with_a_reason_path() {
    let out = json!({"schema_version": 1, "ok": true, "data": {"items": [
        {"skill_id": "s1", "name": "bro", "description": "Restate the last message", "is_enabled": true, "installation_scope": "organization"},
        {"skill_id": "s2", "name": "off", "description": "Disabled", "is_enabled": false},
        {"skill_id": "s3", "name": " ", "description": "blank"}
    ]}})
    .to_string();
    assert_eq!(
        reason_skills_from(&out).unwrap(),
        [Skill {
            name: "bro".into(),
            description: "Restate the last message".into(),
            path: "reason-skill:s1".into(),
            display_name: None
        }]
    );
    let refused = json!({"schema_version": 1, "ok": false, "error": {"message": "Not signed in"}})
        .to_string();
    assert_eq!(reason_skills_from(&refused), Err("Not signed in".into()));
    assert!(reason_skills_from("garbage").is_err());
}

#[test]
fn output_serializes_like_conductors_fetch_slash_commands_output() {
    let out = SlashCommandsOutput {
        slash_commands: codex_commands(),
        skills: vec![Skill {
            name: "a".into(),
            description: "d".into(),
            path: "/a/SKILL.md".into(),
            display_name: Some("A".into()),
        }],
        error: None,
    };
    assert_eq!(
        serde_json::to_value(&out).unwrap(),
        json!({
            "slashCommands": [{"name": "review", "description": "Review uncommitted changes, or describe what to review", "argumentHint": "instructions"}],
            "skills": [{"name": "a", "description": "d", "path": "/a/SKILL.md", "displayName": "A"}]
        })
    );
    assert_eq!(
        serde_json::to_value(SlashCommandsOutput::failed("boom")).unwrap(),
        json!({"slashCommands": [], "skills": [], "error": "boom"})
    );
}

#[test]
fn front_matter_gives_name_and_description() {
    assert_eq!(
        skill_front_matter(
            "---\nname: oc-fixture\ndescription: \"Fixture: says hi\"\nother: x\n---\nBody"
        ),
        Some(("oc-fixture".into(), "Fixture: says hi".into()))
    );
    assert_eq!(skill_front_matter("no front matter"), None);
    assert_eq!(
        skill_front_matter("---\nname: x\n---\n"),
        None,
        "no description"
    );
}

#[test]
fn the_shipped_conductor_skill_is_listed_with_its_path() {
    let plugin = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/conductor-skill");
    let skill = bundled_skill(&plugin).expect("the bundled skill");
    assert_eq!(skill.name, "conductor");
    assert!(skill
        .description
        .starts_with("How OpenConductor workspaces"));
    assert!(skill
        .path
        .ends_with("conductor-skill/skills/conductor/SKILL.md"));
    assert!(Path::new(&skill.path).is_file());
}

#[cfg(unix)]
mod processes {
    use super::*;
    use crate::agent::LaunchEnv;
    use crate::test_exe::write_executable;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oc-slash-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A stand-in `claude` that checks it was started for stream-json and
    /// answers `initialize` after a hook line, as Claude Code 2.1.318 does.
    #[test]
    fn claude_lookup_asks_the_cli_and_stops_it() {
        let dir = temp("claude");
        let exe = dir.join("claude");
        write_executable(
            &exe,
            r#"#!/bin/sh
case "$*" in *"--input-format stream-json"*) ;; *) echo "bad args: $*" >&2; exit 2 ;; esac
read -r line
case "$line" in *'"subtype":"initialize"'*) ;; *) exit 3 ;; esac
echo '{"type":"system","subtype":"hook_started"}'
echo '{"type":"control_response","response":{"subtype":"success","request_id":"oc_slash_init","response":{"commands":[{"name":"oc-fixture","description":"Fixture skill (user)","argumentHint":""}]}}}'
sleep 30
"#,
            0o755,
        );
        let mut launch = ClaudeLaunch::new(&dir, LaunchEnv::default());
        launch.executable = exe;
        let started = Instant::now();
        let commands = claude_lookup(&launch, Duration::from_secs(10)).unwrap();
        assert_eq!(commands[0].name, "oc-fixture");
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "the CLI was not stopped"
        );
    }

    #[test]
    fn claude_lookup_reports_a_cli_that_exits() {
        let dir = temp("claude-exit");
        let exe = dir.join("claude");
        write_executable(&exe, "#!/bin/sh\nexit 1\n", 0o755);
        let mut launch = ClaudeLaunch::new(&dir, LaunchEnv::default());
        launch.executable = exe;
        let err = claude_lookup(&launch, Duration::from_secs(10)).unwrap_err();
        assert!(err.contains("exited"), "{err}");
    }

    #[test]
    fn reason_lookup_runs_skills_list_with_an_empty_input() {
        let dir = temp("reason");
        let exe = dir.join("reason");
        write_executable(
            &exe,
            r#"#!/bin/sh
[ "$*" = "skills list --input-file -" ] || { echo "bad args: $*" >&2; exit 2; }
input=$(cat)
[ "$input" = "{}" ] || { echo "bad input: $input" >&2; exit 3; }
echo '{"schema_version":1,"ok":true,"data":{"items":[{"skill_id":"k1","name":"oc-fixture","description":"Fixture skill","is_enabled":true}]}}'
"#,
            0o755,
        );
        let skills = reason_lookup(&exe, &dir, Duration::from_secs(10)).unwrap();
        assert_eq!(skills[0].name, "oc-fixture");
        assert_eq!(skills[0].path, "reason-skill:k1");

        write_executable(&exe, "#!/bin/sh\necho 'Not signed in' >&2\nexit 1\n", 0o755);
        let err = reason_lookup(&exe, &dir, Duration::from_secs(10)).unwrap_err();
        assert!(err.contains("Not signed in"), "{err}");

        write_executable(&exe, "#!/bin/sh\nsleep 30\n", 0o755);
        let err = reason_lookup(&exe, &dir, Duration::from_millis(300)).unwrap_err();
        assert!(err.contains("in time"), "{err}");
    }
}
