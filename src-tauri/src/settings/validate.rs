//! Rules a settings value must satisfy before it is saved or used.

use super::{BranchPrefixType, Settings, SettingsError, ZOOM_MAX, ZOOM_MIN};
use crate::agent::AgentKind;

/// Checks cross-field rules serde cannot express.
pub fn validate(s: &Settings) -> Result<(), SettingsError> {
    let invalid = |m: String| Err(SettingsError::Invalid(m));
    if s.git.branch_prefix_type == BranchPrefixType::Custom {
        match s.git.branch_prefix_custom.as_deref().map(str::trim) {
            Some(p) if !p.is_empty() => {
                if !valid_branch_prefix(p) {
                    return invalid(format!(
                        "git.branch_prefix_custom {p:?} is not a valid branch prefix"
                    ));
                }
            }
            _ => {
                return invalid(
                    "git.branch_prefix_custom is required when branch_prefix_type = \"custom\""
                        .into(),
                )
            }
        }
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
fn valid_branch_prefix(p: &str) -> bool {
    !p.starts_with(['.', '/', '-'])
        && !p.ends_with(['.', '/'])
        && !p.ends_with(".lock")
        && !p.contains("..")
        && !p.contains("//")
        && !p.contains("@{")
        && !p.chars().any(|c| c.is_control() || " ~^:?*[\\".contains(c))
}
