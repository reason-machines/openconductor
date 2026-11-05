//! Rules a settings value must satisfy before it is saved or used.

use super::{BranchPrefixType, Settings, SettingsError};

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
    for (key, url) in [
        (
            "providers.anthropic_base_url",
            &s.providers.anthropic_base_url,
        ),
        ("providers.openai_base_url", &s.providers.openai_base_url),
    ] {
        if let Some(u) = url {
            if !(u.starts_with("https://") || u.starts_with("http://"))
                || u.contains(char::is_whitespace)
            {
                return invalid(format!("{key} must be an http(s) URL"));
            }
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
