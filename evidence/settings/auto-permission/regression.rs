use crate::agent::{MemorySecretStore, PermissionMode};
use crate::settings::{launch::{claude_launch, codex_launch, Purpose}, Settings};
use std::path::Path;

fn settings(plan: bool, approvals: bool, auto: bool) -> Settings {
    let mut s = Settings::default();
    s.models.default_plan_mode = plan;
    s.tool_approvals_enabled = approvals;
    s.experimental.extra.insert("experimental_auto_permission_mode".into(), toml::Value::Boolean(auto));
    s
}
fn launch(s: &Settings, purpose: Purpose) -> PermissionMode {
    claude_launch(s, Path::new("/synthetic/workspace"), &MemorySecretStore::new(), purpose).unwrap().permission_mode
}
#[test]
fn auto_permission_launch_honors_enabled_classifier() {
    assert_eq!(launch(&settings(false, true, true), Purpose::Chat), PermissionMode::Auto);
}
#[test]
fn auto_permission_per_turn_honors_enabled_classifier() {
    assert_eq!(crate::per_turn_policy(&settings(false, true, true), false), PermissionMode::Auto);
}
#[test]
fn auto_permission_plan_precedes_both_flags() {
    for approvals in [false, true] { for auto in [false, true] {
        let s = settings(true, approvals, auto);
        assert_eq!(launch(&s, Purpose::Chat), PermissionMode::Plan);
        assert_eq!(crate::per_turn_policy(&s, true), PermissionMode::Plan);
    }}
}
#[test]
fn auto_permission_never_enables_approvals_by_itself() {
    for auto in [false, true] {
        let s = settings(false, false, auto);
        assert_eq!(launch(&s, Purpose::Chat), PermissionMode::BypassPermissions);
        assert_eq!(crate::per_turn_policy(&s, false), PermissionMode::BypassPermissions);
    }
}
#[test]
fn auto_permission_default_is_unchanged_for_absent_false_or_invalid_flag() {
    for value in [None, Some(toml::Value::Boolean(false)), Some(toml::Value::String("true".into()))] {
        let mut s = settings(false, true, false);
        s.experimental.extra.remove("experimental_auto_permission_mode");
        if let Some(value) = value { s.experimental.extra.insert("experimental_auto_permission_mode".into(), value); }
        assert_eq!(launch(&s, Purpose::Chat), PermissionMode::Default);
        assert_eq!(crate::per_turn_policy(&s, false), PermissionMode::Default);
    }
}
#[test]
fn auto_permission_persisted_opt_out_wins_over_initial_plan_default() {
    let s = settings(true, true, true);
    assert_eq!(crate::per_turn_policy(&s, false), PermissionMode::Auto);
}
#[test]
fn auto_permission_follow_up_reads_latest_approval_and_auto_flags() {
    let mut s = settings(false, true, false);
    assert_eq!(crate::per_turn_policy(&s, false), PermissionMode::Default);
    s.experimental.extra.insert("experimental_auto_permission_mode".into(), toml::Value::Boolean(true));
    assert_eq!(crate::per_turn_policy(&s, false), PermissionMode::Auto);
    s.tool_approvals_enabled = false;
    assert_eq!(crate::per_turn_policy(&s, false), PermissionMode::BypassPermissions);
}
#[test]
fn auto_permission_review_ignores_chat_plan_default_but_keeps_approval_policy() {
    assert_eq!(launch(&settings(true, true, true), Purpose::Review), PermissionMode::Auto);
}
#[test]
fn auto_permission_does_not_change_codex_launch() {
    let off = settings(false, true, false);
    let on = settings(false, true, true);
    let store = MemorySecretStore::new();
    let a = codex_launch(&off, Path::new("/synthetic/workspace"), &store, Purpose::Chat).unwrap().args();
    let b = codex_launch(&on, Path::new("/synthetic/workspace"), &store, Purpose::Chat).unwrap().args();
    assert_eq!(a, b);
}
