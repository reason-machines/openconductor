//! Agent providers: how an agent CLI is pointed at a model backend and
//! authenticated (bring your own key, cloud credentials, or the CLI's own
//! login).
//!
//! A provider turns its options plus secrets from a [`SecretStore`] into a
//! [`LaunchEnv`] (see `env.rs`). Which provider kinds exist is grounded in
//! `evidence/providers/README.md`; concrete providers live in `claude.rs` and
//! `codex.rs`.

use std::fmt;

use super::env::{AgentKind, LaunchEnv};
use super::secret::{SecretStore, SecretStoreError, SecretString};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderError {
    /// A secret the provider needs is not in the store.
    MissingSecret {
        key: &'static str,
    },
    /// A secret is present but unusable. Never carries the value.
    InvalidSecret {
        key: &'static str,
        reason: &'static str,
    },
    /// A non-secret option is unusable.
    InvalidOption {
        field: &'static str,
        reason: String,
    },
    /// The provider belongs to a different agent than the one asked for.
    WrongAgent {
        expected: AgentKind,
        found: AgentKind,
    },
    Store(SecretStoreError),
}

impl fmt::Display for ProviderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProviderError::MissingSecret { key } => write!(f, "{key} is not set"),
            ProviderError::InvalidSecret { key, reason } => write!(f, "{key} is invalid: {reason}"),
            ProviderError::InvalidOption { field, reason } => write!(f, "{field}: {reason}"),
            ProviderError::WrongAgent { expected, found } => {
                write!(f, "provider is for {found}, not {expected}")
            }
            ProviderError::Store(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ProviderError {}

impl From<SecretStoreError> for ProviderError {
    fn from(e: SecretStoreError) -> Self {
        ProviderError::Store(e)
    }
}

/// How an agent is pointed at a backend and authenticated.
pub trait Provider {
    /// The agent CLI this provider configures.
    fn agent(&self) -> AgentKind;

    /// Stable identifier, the `kind` tag in settings.
    fn kind(&self) -> &'static str;

    /// Store keys this provider reads.
    fn secret_keys(&self) -> Vec<&'static str>;

    /// Checks non-secret options without touching the store.
    fn check_options(&self) -> Result<(), ProviderError>;

    /// Builds the agent's environment. Reads secrets from `store`.
    fn launch_env(&self, store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError>;

    /// Options and secrets are present and well formed. Says nothing about
    /// whether the backend accepts the credentials.
    fn validate(&self, store: &dyn SecretStore) -> Result<(), ProviderError> {
        self.check_options()?;
        self.launch_env(store).map(|_| ())
    }
}

/// Reads a required secret and checks it can be passed as an HTTP header.
pub fn require_secret(
    store: &dyn SecretStore,
    key: &'static str,
) -> Result<SecretString, ProviderError> {
    let secret = store
        .get(key)?
        .ok_or(ProviderError::MissingSecret { key })?;
    check_secret(key, secret.expose())?;
    Ok(secret)
}

/// Rejects values that cannot be an API key or token: empty, or containing
/// whitespace or control characters (a common paste error that otherwise
/// surfaces as an opaque auth failure inside the agent).
pub fn check_secret(key: &'static str, value: &str) -> Result<(), ProviderError> {
    if value.is_empty() {
        return Err(ProviderError::InvalidSecret {
            key,
            reason: "empty",
        });
    }
    if value.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(ProviderError::InvalidSecret {
            key,
            reason: "contains whitespace or control characters",
        });
    }
    Ok(())
}

pub fn check_url(field: &'static str, url: &str) -> Result<(), ProviderError> {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"));
    let invalid = |reason: &str| ProviderError::InvalidOption {
        field,
        reason: reason.to_owned(),
    };
    let rest = rest.ok_or_else(|| invalid("must start with https:// or http://"))?;
    if url.chars().any(char::is_whitespace) {
        return Err(invalid("must not contain whitespace"));
    }
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty() {
        return Err(invalid("is missing a host"));
    }
    Ok(())
}

pub fn check_nonempty(field: &'static str, value: &str) -> Result<(), ProviderError> {
    if value.trim().is_empty() {
        return Err(ProviderError::InvalidOption {
            field,
            reason: "is required".to_owned(),
        });
    }
    if value.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(ProviderError::InvalidOption {
            field,
            reason: "must not contain whitespace".to_owned(),
        });
    }
    Ok(())
}

pub fn check_optional_url(field: &'static str, url: &Option<String>) -> Result<(), ProviderError> {
    match url {
        Some(u) => check_url(field, u),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::super::secret::{keys, MemorySecretStore};
    use super::*;

    struct BrokenOptions;

    impl Provider for BrokenOptions {
        fn agent(&self) -> AgentKind {
            AgentKind::Claude
        }
        fn kind(&self) -> &'static str {
            "broken"
        }
        fn secret_keys(&self) -> Vec<&'static str> {
            vec![]
        }
        fn check_options(&self) -> Result<(), ProviderError> {
            Err(ProviderError::InvalidOption {
                field: "x",
                reason: "bad".into(),
            })
        }
        fn launch_env(&self, _: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
            panic!("validate must check options before building the environment")
        }
    }

    #[test]
    fn default_validate_checks_options_first() {
        let providers: Vec<Box<dyn Provider>> = vec![Box::new(BrokenOptions)];
        for p in &providers {
            assert!(matches!(
                p.validate(&MemorySecretStore::new()),
                Err(ProviderError::InvalidOption { field: "x", .. })
            ));
        }
    }

    #[test]
    fn secrets_are_checked_and_errors_never_carry_values() {
        let store = MemorySecretStore::with(&[(keys::ANTHROPIC_API_KEY, "sk-ant-abc def")]);
        let err = require_secret(&store, keys::ANTHROPIC_API_KEY).unwrap_err();
        let shown = format!("{err} {err:?}");
        assert!(!shown.contains("sk-ant-abc"), "{shown}");
        assert!(shown.contains(keys::ANTHROPIC_API_KEY));
        assert_eq!(
            require_secret(&MemorySecretStore::new(), keys::CURSOR_API_KEY),
            Err(ProviderError::MissingSecret {
                key: keys::CURSOR_API_KEY
            })
        );
        assert!(check_secret(keys::CURSOR_API_KEY, "").is_err());
        assert!(check_secret(keys::CURSOR_API_KEY, "a\u{7}b").is_err());
        assert!(check_secret(keys::CURSOR_API_KEY, "sk-ok_123").is_ok());
    }

    #[test]
    fn urls_must_be_http_with_a_host() {
        for bad in [
            "ftp://x",
            "https://",
            "https:///path",
            "example.com",
            "https://a b",
        ] {
            assert!(check_url("base_url", bad).is_err(), "{bad}");
        }
        for good in [
            "https://openrouter.ai/api/v1",
            "http://localhost:4000",
            "https://h?x=1",
        ] {
            assert!(check_url("base_url", good).is_ok(), "{good}");
        }
    }
}
