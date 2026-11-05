//! Rules a settings value must satisfy before it is saved or used.

use super::{BranchPrefixType, Settings, SettingsError};
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
