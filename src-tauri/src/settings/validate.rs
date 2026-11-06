//! Rules a settings value must satisfy before it is saved or used.

use super::{
    BranchPrefixType, Settings, SettingsError, TERMINAL_FONT_SIZE_MAX, TERMINAL_FONT_SIZE_MIN,
    ZOOM_MAX, ZOOM_MIN,
};
use crate::agent::AgentKind;

/// Checks cross-field rules serde cannot express.
pub fn validate(s: &Settings) -> Result<(), SettingsError> {
    let invalid = |m: String| Err(SettingsError::Invalid(m));
    if s.git.branch_prefix_type == BranchPrefixType::Custom {
        match s.git.branch_prefix.as_deref().map(str::trim) {
            Some(p) if !p.is_empty() => {
                if !valid_branch_prefix(p) {
                    return invalid(format!(
                        "git.branch_prefix {p:?} is not a valid branch prefix"
                    ));
                }
            }
            _ => {
                return invalid(
                    "git.branch_prefix is required when branch_prefix_type = \"custom\"".into(),
                )
            }
        }
    }
    if let Some(i) = s.preview_urls.iter().position(|u| u.url.trim().is_empty()) {
        return invalid(format!("preview_urls[{i}].url must not be empty"));
    }
    if let Some(i) = s
        .environment_variable_files
        .iter()
        .position(|f| f.trim().is_empty())
    {
        return invalid(format!("environment_variable_files[{i}] must not be empty"));
    }
    let zoom = s.appearance.zoom_level_v2;
    let percent = zoom * 100.0;
    if !(ZOOM_MIN..=ZOOM_MAX).contains(&zoom)
        || (percent - (percent / 10.0).round() * 10.0).abs() > 1e-6
    {
        return invalid(format!(
            "appearance.zoom_level_v2 {zoom} must be 0.5 to 3.0 in 0.1 steps"
        ));
    }
    if let Some(font) = s.appearance.mono_font.as_deref() {
        if !valid_font_family(font) {
            return invalid(format!(
                "appearance.mono_font {font:?} is not a usable font name"
            ));
        }
    }
    if let Some(font) = s.appearance.terminal_font_family.as_deref() {
        if !valid_font_family(font) {
            return invalid(format!(
                "appearance.terminal_font_family {font:?} is not a usable font name"
            ));
        }
    }
    let size = s.appearance.terminal_font_size;
    if !(TERMINAL_FONT_SIZE_MIN..=TERMINAL_FONT_SIZE_MAX).contains(&size) {
        return invalid(format!(
            "appearance.terminal_font_size {size} must be {TERMINAL_FONT_SIZE_MIN} to {TERMINAL_FONT_SIZE_MAX}"
        ));
    }
    if s.models.default.trim().is_empty() {
        return invalid("models.default must not be empty".into());
    }
    if s.models
        .review
        .as_deref()
        .is_some_and(|r| r.trim().is_empty())
    {
        return invalid("models.review must not be empty when set".into());
    }
    for (key, value) in [
        (
            "claude_code_executable_path",
            &s.claude_code_executable_path,
        ),
        ("codex_executable_path", &s.codex_executable_path),
        ("ssh_key_path", &s.ssh_key_path),
    ] {
        if let Some(v) = value.as_deref().filter(|v| !v.trim().is_empty()) {
            if v.chars().any(char::is_control) {
                return invalid(format!("{key} must be a single-line path"));
            }
        }
    }
    for (key, value) in [
        ("claude_provider", &s.claude_provider),
        ("codex_provider", &s.codex_provider),
    ] {
        if let Some(v) = value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            if v.chars().any(|c| c.is_whitespace() || c.is_control()) {
                return invalid(format!("{key} {v:?} must not contain whitespace"));
            }
        }
    }
    for agent in AgentKind::ALL {
        let Some(config) = s.providers.get(agent) else {
            continue;
        };
        let provider = config.provider();
        let key = format!("providers.{}", agent.as_str());
        if provider.agent() != agent {
            return invalid(format!(
                "{key}: {} is a {} provider",
                provider.kind(),
                provider.agent().as_str()
            ));
        }
        if let Err(e) = provider.check_options() {
            return invalid(format!("{key}: {e}"));
        }
    }
    Ok(())
}

/// A font family name the UI can quote into CSS: not blank, at most 100
/// characters, and none of the characters that would end the CSS string.
fn valid_font_family(f: &str) -> bool {
    !f.trim().is_empty()
        && f.chars().count() <= 100
        && !f
            .chars()
            .any(|c| c.is_control() || "\"'\\;{}<>".contains(c))
}

/// A conservative subset of `git check-ref-format` for one path component.
/// One trailing `/` is allowed: Conductor's own example is `feature/`.
fn valid_branch_prefix(p: &str) -> bool {
    let p = p.strip_suffix('/').unwrap_or(p);
    !p.is_empty()
        && !p.starts_with(['.', '/', '-'])
        && !p.ends_with(['.', '/'])
        && !p.ends_with(".lock")
        && !p.contains("..")
        && !p.contains("//")
        && !p.contains("@{")
        && !p.chars().any(|c| c.is_control() || " ~^:?*[\\".contains(c))
}
