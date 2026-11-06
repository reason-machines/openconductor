//! Agent keys of `settings.toml`: parsing, defaults, round trip, provider
//! precedence, repository layers and what reaches the agent command line.

use std::path::Path;

use oc_scripts::config::{Layer, LayerSource};

use super::launch::{self, claude_cli_model, model_agent, Purpose};
use super::layers::merge;
use super::*;
use crate::agent::codex_rpc::ApprovalDecision;
use crate::agent::env::vars;
use crate::agent::secret::keys;
use crate::agent::{AgentKind, MemorySecretStore, PermissionMode, ProviderConfig};

fn parse(text: &str) -> Settings {
    let s: Settings = toml::from_str(text).unwrap();
    validate(&s).unwrap();
    s
}

fn flag<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    let i = args.iter().position(|a| a == name)?;
    args.get(i + 1).map(String::as_str)
}

fn codex_config(l: &crate::agent::codex_cli::CodexLaunch, key: &str) -> Option<String> {
    l.config
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.clone())
}

const CONDUCTOR_FILE: &str = r#"
"$schema" = "https://conductor.build/schemas/settings.schema.json"
claude_provider = "custom"
codex_provider = "chatgpt_sign_in"
bedrock_region = "eu-west-1"
vertex_project_id = "my-proj"
claude_code_executable_path = "/opt/claude/bin/claude"
codex_executable_path = "/opt/codex"
opencode_executable_path = "/opt/opencode"
ssh_key_path = "~/.ssh/id_conductor"
tool_approvals_enabled = true

[models]
default = "opus-5-5-1m"
review = "gpt-5.5"
default_fast_mode = true
review_fast_mode = false
default_plan_mode = true
visible_provider_models = '{"pi":["pi:anthropic/claude-x"," openrouter/y ","pi:anthropic/claude-x"],"opencode":["z"],"nope":["z"],"codex":[1]}'

[models.claude_code]
default_effort_level = "high"
review_effort_level = "max"
personality = "explanatory"

[models.codex]
default_thinking_level = "ultra"
review_thinking_level = "none"
personality = "pragmatic"
tool_approval_policy = "always_approve"
"#;

#[test]
fn conductor_keys_parse_under_their_dotted_paths_and_round_trip() {
    let s = parse(CONDUCTOR_FILE);
    assert_eq!(s.claude_provider.as_deref(), Some("custom"));
    assert_eq!(s.codex_provider.as_deref(), Some("chatgpt_sign_in"));
    // Keys of the removed Bedrock, Vertex and OpenCode settings still load,
    // kept as unknown keys with no effect.
    for key in [
        "bedrock_region",
        "vertex_project_id",
        "opencode_executable_path",
    ] {
        assert!(s.extra.contains_key(key), "{key}");
    }
    assert_eq!(s.ssh_key(), Some("~/.ssh/id_conductor".into()));
    assert!(s.tool_approvals_enabled);
    let m = &s.models;
    assert_eq!(
        (m.default.as_str(), m.review.as_deref()),
        ("opus-5-5-1m", Some("gpt-5.5"))
    );
    assert!(m.default_fast_mode && m.default_plan_mode);
    assert_eq!(m.review_fast_mode, Some(false));
    assert_eq!(m.claude_code.default_effort_level, Some(EffortLevel::High));
    assert_eq!(m.claude_code.review_effort_level, Some(EffortLevel::Max));
    assert_eq!(m.claude_code.personality, ClaudePersonality::Explanatory);
    assert_eq!(m.codex.default_thinking_level, ThinkingLevel::Ultra);
    assert_eq!(m.codex.review_thinking_level, ThinkingLevel::None);
    assert_eq!(m.codex.personality, Some(CodexPersonality::Pragmatic));
    assert_eq!(
        m.codex.tool_approval_policy,
        CodexToolApprovalPolicy::AlwaysApprove
    );

    let text = toml::to_string_pretty(&s).unwrap();
    let again: Settings = toml::from_str(&text).unwrap();
    assert_eq!(again, s, "{text}");
    let table: toml::Table = text.parse().unwrap();
    assert_eq!(
        table["claude_code_executable_path"].as_str(),
        Some("/opt/claude/bin/claude")
    );
    assert_eq!(
        table["models"]["claude_code"]["personality"].as_str(),
        Some("explanatory")
    );
    assert_eq!(
        table["models"]["codex"]["tool_approval_policy"].as_str(),
        Some("always_approve")
    );
}

#[test]
fn defaults_match_conductor() {
    let s = Settings::default();
    assert!(!s.tool_approvals_enabled);
    assert!(!s.models.default_fast_mode && !s.models.default_plan_mode);
    assert_eq!(s.models.review_fast_mode, None);
    assert_eq!(s.models.claude_code.personality, ClaudePersonality::Default);
    assert_eq!(
        s.models.codex.tool_approval_policy,
        CodexToolApprovalPolicy::Default
    );
    assert_eq!(s.models.codex.personality, None);
    assert_eq!(s.executable(AgentKind::Claude), Path::new("claude"));
    assert_eq!(s.executable(AgentKind::Codex), Path::new("codex"));
    // Unset keys are not written.
    let text = toml::to_string_pretty(&s).unwrap();
    for key in [
        "claude_provider",
        "ssh_key_path",
        "review_fast_mode",
        "default_effort_level",
    ] {
        assert!(!text.contains(key), "{key} in {text}");
    }
}

#[test]
fn bad_values_are_rejected() {
    for bad in [
        "claude_code_executable_path = \"/a\\nb\"",
        "[models.claude_code]\npersonality = \"chatty\"",
        "[models.codex]\ntool_approval_policy = \"never\"",
        "[models.codex]\npersonality = \"grumpy\"",
        "[models.claude_code]\ndefault_effort_level = \"ultra\"",
        "tool_approvals_enabled = \"yes\"",
    ] {
        let ok = toml::from_str::<Settings>(bad)
            .map_err(|e| e.to_string())
            .and_then(|s| validate(&s).map_err(|e| e.to_string()));
        assert!(ok.is_err(), "{bad}");
    }
}

#[test]
fn visible_provider_models_are_read_like_conductor() {
    let s = parse(CONDUCTOR_FILE);
    let v = s.models.visible_models();
    assert_eq!(v["pi"], ["anthropic/claude-x", "openrouter/y"]);
    assert!(v["codex"].is_empty() && !v.contains_key("nope"));
    assert!(!v.contains_key("opencode") && !v.contains_key("cursor"));
    let mut s = Settings::default();
    s.models.visible_provider_models = Some("not json".into());
    assert!(s.models.visible_models().values().all(Vec::is_empty));
}

#[test]
fn provider_precedence() {
    let mut s = Settings::default();
    assert_eq!(
        s.provider_for(AgentKind::Claude),
        ProviderConfig::default_for(AgentKind::Claude)
    );
    for (value, kind) in [
        ("default", "claude_login"),
        ("openai", "claude_login"),
        ("custom", "anthropic_api"),
        // Removed backends fall back to the login.
        ("bedrock", "claude_login"),
        ("vertex", "claude_login"),
    ] {
        s.claude_provider = Some(value.into());
        assert_eq!(
            s.provider_for(AgentKind::Claude).provider().kind(),
            kind,
            "{value}"
        );
    }
    for (value, kind) in [
        ("custom", "openai_api"),
        ("chatgpt_sign_in", "codex_login"),
        ("default", "codex_login"),
    ] {
        s.codex_provider = Some(value.into());
        assert_eq!(
            s.provider_for(AgentKind::Codex).provider().kind(),
            kind,
            "{value}"
        );
    }
    // The [providers] table outranks the top-level key in the same file.
    s.claude_provider = Some("custom".into());
    s.providers.set(
        AgentKind::Claude,
        Some(ProviderConfig::default_for(AgentKind::Claude)),
    );
    assert_eq!(
        s.provider_for(AgentKind::Claude).provider().kind(),
        "claude_login"
    );
}

fn layer(layer: Layer, text: &str) -> LayerSource {
    LayerSource::from_toml(layer, format!("{layer:?}"), text).unwrap()
}

#[test]
fn repository_layers_set_only_workspace_configurable_keys() {
    let user = layer(
        Layer::User,
        "codex_executable_path = \"/u/codex\"\ntool_approvals_enabled = true\n[models]\ndefault = \"sonnet\"\n[providers.claude]\nkind = \"anthropic_api\"\n",
    );
    let shared = layer(
        Layer::RepoShared,
        "codex_executable_path = \"/shared/codex\"\nclaude_provider = \"default\"\ntool_approvals_enabled = false\n[models]\ndefault = \"haiku\"\nvisible_provider_models = '{\"pi\":[\"a\"]}'\n[scripts]\nsetup = \"x\"\n",
    );
    let local = layer(
        Layer::RepoLocal,
        "codex_executable_path = \"/local/codex\"\n",
    );
    let s = merge(&[local.clone(), shared.clone(), user.clone()]).unwrap();
    assert_eq!(s.executable(AgentKind::Codex), Path::new("/local/codex"));
    // User-only keys ignore the repository.
    assert!(s.tool_approvals_enabled);
    assert_eq!(s.models.default, "sonnet");
    assert_eq!(s.models.visible_models()["pi"], ["a"]);
    // The repository's claude_provider replaces the user's [providers.claude].
    assert_eq!(
        s.provider_for(AgentKind::Claude).provider().kind(),
        "claude_login"
    );
    assert!(!s.extra.contains_key("scripts"));
    // Managed outranks everything, user-only keys included.
    let managed = layer(
        Layer::Managed,
        "codex_executable_path = \"/m/codex\"\ntool_approvals_enabled = false\n",
    );
    let s = merge(&[user.clone(), shared, local, managed]).unwrap();
    assert_eq!(s.executable(AgentKind::Codex), Path::new("/m/codex"));
    assert!(!s.tool_approvals_enabled);
    // Without a repository layer the user's table stands.
    let s = merge(&[user]).unwrap();
    assert_eq!(
        s.provider_for(AgentKind::Claude).provider().kind(),
        "anthropic_api"
    );
}

#[test]
fn repository_files_are_read_through_the_layered_loader() {
    let root = std::env::temp_dir().join(format!("oc-layers-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let (home, repo) = (root.join("home"), root.join("repo"));
    std::fs::create_dir_all(home.clone()).unwrap();
    std::fs::create_dir_all(repo.join(".conductor")).unwrap();
    std::fs::write(
        home.join(FILE_NAME),
        "claude_code_executable_path = \"/u/claude\"\n",
    )
    .unwrap();
    std::fs::write(
        repo.join(".conductor/settings.toml"),
        "ssh_key_path = \"/shared/key\"\n",
    )
    .unwrap();
    std::fs::write(
        repo.join(".conductor/settings.local.toml"),
        "claude_code_executable_path = \"/local/claude\"\n",
    )
    .unwrap();
    let s = layers::for_repo(&home, &repo, oc_scripts::config::SharedSource::WorkingTree).unwrap();
    assert_eq!(s.executable(AgentKind::Claude), Path::new("/local/claude"));
    assert_eq!(s.ssh_key(), Some("/shared/key".into()));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn claude_launch_uses_the_settings() {
    let store = MemorySecretStore::with(&[(keys::ANTHROPIC_API_KEY, "sk-ant-test")]);
    let s = parse(CONDUCTOR_FILE);
    let chat = launch::claude_launch(&s, Path::new("/w"), &store, Purpose::Chat).unwrap();
    assert_eq!(chat.executable, Path::new("/opt/claude/bin/claude"));
    assert_eq!(
        chat.env
            .get(vars::ANTHROPIC_API_KEY)
            .map(|v| v.expose().to_string()),
        Some("sk-ant-test".into())
    );
    let args = chat.args();
    assert_eq!(flag(&args, "--model"), Some("claude-opus-5-5[1m]"));
    assert_eq!(flag(&args, "--permission-mode"), Some("plan"));
    assert_eq!(flag(&args, "--effort"), Some("high"));
    let settings: serde_json::Value =
        serde_json::from_str(flag(&args, "--settings").unwrap()).unwrap();
    assert_eq!(
        settings,
        serde_json::json!({"outputStyle": "Explanatory", "fastMode": true})
    );

    // Review: review model is Codex's, so Claude keeps its default model; review effort, no plan,
    // no output style, review fast mode off; approvals on means Claude Code asks.
    let review = launch::claude_launch(&s, Path::new("/w"), &store, Purpose::Review).unwrap();
    let args = review.args();
    assert_eq!(flag(&args, "--model"), None);
    assert_eq!(flag(&args, "--effort"), Some("max"));
    assert_eq!(review.permission_mode, PermissionMode::Default);
    assert_eq!(flag(&args, "--settings"), None);

    // Defaults: login, `claude` on PATH, no approvals means bypassPermissions.
    let d = launch::claude_launch(
        &Settings::default(),
        Path::new("/w"),
        &MemorySecretStore::new(),
        Purpose::Chat,
    )
    .unwrap();
    assert_eq!(d.executable, Path::new("claude"));
    assert_eq!(d.permission_mode, PermissionMode::BypassPermissions);
    assert_eq!(d.model.as_deref(), Some("opus"));
    assert_eq!(d.effort, None);
    // A missing key for the configured provider is an error, not a silent login.
    assert!(launch::claude_launch(
        &s,
        Path::new("/w"),
        &MemorySecretStore::new(),
        Purpose::Chat
    )
    .is_err());
}

#[test]
fn codex_launch_uses_the_settings() {
    let s = parse(CONDUCTOR_FILE);
    let store = MemorySecretStore::new();
    let review = launch::codex_launch(&s, Path::new("/w"), &store, Purpose::Review).unwrap();
    assert_eq!(review.executable, Path::new("/opt/codex"));
    assert_eq!(
        codex_config(&review, "model").as_deref(),
        Some("\"gpt-5.5\"")
    );
    assert_eq!(
        codex_config(&review, "model_reasoning_effort").as_deref(),
        Some("\"none\"")
    );
    assert_eq!(
        codex_config(&review, "personality").as_deref(),
        Some("\"pragmatic\"")
    );
    assert_eq!(codex_config(&review, "service_tier"), None);
    let chat = launch::codex_launch(&s, Path::new("/w"), &store, Purpose::Chat).unwrap();
    assert_eq!(
        codex_config(&chat, "model"),
        None,
        "the default model is Claude's"
    );
    assert_eq!(
        codex_config(&chat, "model_reasoning_effort").as_deref(),
        Some("\"xhigh\"")
    );
    assert_eq!(
        codex_config(&chat, "service_tier").as_deref(),
        Some("\"fast\"")
    );
    assert!(chat.args().contains(&"service_tier=\"fast\"".to_string()));
    assert_eq!(s.codex_auto_approval(), Some(ApprovalDecision::Accept));
    assert_eq!(Settings::default().codex_auto_approval(), None);
}

#[test]
fn codex_personality_reaches_every_launch_and_none_is_passed() {
    // Unset is Conductor's default `pragmatic`; "None" is Codex's own `none`.
    let store = MemorySecretStore::new();
    for (file, want) in [
        ("", "\"pragmatic\""),
        ("[models.codex]\npersonality = \"none\"", "\"none\""),
        ("[models.codex]\npersonality = \"friendly\"", "\"friendly\""),
    ] {
        let s = parse(file);
        let chat = launch::codex_launch(&s, Path::new("/w"), &store, Purpose::Chat).unwrap();
        assert_eq!(
            codex_config(&chat, "personality").as_deref(),
            Some(want),
            "{file}"
        );
        assert!(chat.args().contains(&format!("personality={want}")));
    }
}

#[test]
fn model_ids_map_to_agents_and_claude_cli_names() {
    assert_eq!(model_agent("gpt-5.6-sol"), AgentKind::Codex);
    assert_eq!(model_agent("composer-2.5"), AgentKind::Claude);
    for removed in ["auto", "composer-2.5", "grok-4"] {
        assert!(launch::is_removed_model(removed), "{removed}");
        let mut s = Settings::default();
        s.models.default = removed.into();
        s.models.review = Some(removed.into());
        assert_eq!(s.model_for(Purpose::Chat), crate::settings::DEFAULT_MODEL);
        assert_eq!(s.model_for(Purpose::Review), crate::settings::DEFAULT_MODEL);
    }
    assert!(!launch::is_removed_model("opus"));
    assert_eq!(model_agent("opus"), AgentKind::Claude);
    assert_eq!(claude_cli_model("opus-4-8"), "claude-opus-4-8");
    assert_eq!(claude_cli_model("sonnet-5-1m"), "claude-sonnet-5[1m]");
    assert_eq!(claude_cli_model("opus-1m"), "opus[1m]");
    assert_eq!(claude_cli_model("haiku"), "haiku");
}

#[test]
fn ultracode_parses_round_trips_and_launches_as_xhigh() {
    let s = parse("[models.claude_code]\ndefault_effort_level = \"ultracode\"\n");
    assert_eq!(
        s.models.claude_code.default_effort_level,
        Some(EffortLevel::Ultracode)
    );
    let back: Settings = toml::from_str(&toml::to_string(&s).unwrap()).unwrap();
    assert_eq!(
        back.models.claude_code.default_effort_level,
        Some(EffortLevel::Ultracode)
    );
    let chat = launch::claude_launch(
        &s,
        Path::new("/w"),
        &MemorySecretStore::new(),
        Purpose::Chat,
    )
    .unwrap();
    let args = chat.args();
    assert_eq!(flag(&args, "--effort"), Some("xhigh"));
    let extra: serde_json::Value =
        serde_json::from_str(flag(&args, "--settings").unwrap()).unwrap();
    assert_eq!(extra["ultracode"], serde_json::json!(true));

    let plain = parse("[models.claude_code]\ndefault_effort_level = \"xhigh\"\n");
    let args = launch::claude_launch(
        &plain,
        Path::new("/w"),
        &MemorySecretStore::new(),
        Purpose::Chat,
    )
    .unwrap()
    .args();
    assert_eq!(flag(&args, "--effort"), Some("xhigh"));
    assert_eq!(flag(&args, "--settings"), None);
}

#[test]
fn review_without_a_review_model_uses_conductors_claude_fallback() {
    let s = parse("[models]\ndefault = \"gpt-5.5\"\n");
    assert_eq!(s.model_for(Purpose::Chat), "gpt-5.5");
    assert_eq!(s.model_for(Purpose::Review), launch::REVIEW_FALLBACK_MODEL);
}
