//! Secrets for agent providers (API keys, auth tokens) and where they live.
//!
//! Provider secrets never sit in the settings file: settings name the
//! provider and its non-secret options, and the secret itself is read from a
//! [`SecretStore`] by a fixed key (see [`keys`]). The reference app keeps
//! these behind `get_keychain_setting` / `set_keychain_setting` /
//! `delete_keychain_setting` commands (see `evidence/providers/README.md`);
//! the macOS implementation of the store is the login Keychain.

use std::collections::BTreeMap;
use std::fmt;
use std::sync::Mutex;

/// Keys under which provider secrets are stored.
pub mod keys {
    pub const ANTHROPIC_API_KEY: &str = "anthropic_api_key";
    pub const ANTHROPIC_AUTH_TOKEN: &str = "anthropic_auth_token";
    pub const BEDROCK_API_KEY: &str = "bedrock_api_key";
    pub const OPENAI_API_KEY: &str = "openai_api_key";
    pub const CURSOR_API_KEY: &str = "cursor_api_key";
    pub const FOUNDRY_API_KEY: &str = "foundry_api_key";
    pub const OPENROUTER_API_KEY: &str = "openrouter_api_key";
    pub const VERCEL_AI_GATEWAY_API_KEY: &str = "vercel_ai_gateway_api_key";
    /// A Claude subscription token from `claude setup-token`. Conductor's
    /// legacy secret name for the same value (`claude_code_oauth_token`).
    pub const CLAUDE_CODE_OAUTH_TOKEN: &str = "claude_code_oauth_token";

    /// Every key a provider may read; a store implementation may use it to
    /// list or wipe provider secrets.
    pub const ALL: &[&str] = &[
        ANTHROPIC_API_KEY,
        ANTHROPIC_AUTH_TOKEN,
        BEDROCK_API_KEY,
        OPENAI_API_KEY,
        CURSOR_API_KEY,
        FOUNDRY_API_KEY,
        OPENROUTER_API_KEY,
        VERCEL_AI_GATEWAY_API_KEY,
        CLAUDE_CODE_OAUTH_TOKEN,
    ];
}

/// A secret value. `Debug` and `Display` never show it; read it with
/// [`SecretString::expose`] only where it is handed to a child process or
/// the store.
#[derive(Clone, PartialEq, Eq)]
pub struct SecretString(String);

impl SecretString {
    pub fn new(value: impl Into<String>) -> Self {
        SecretString(value.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("SecretString(<redacted>)")
    }
}

impl fmt::Display for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("<redacted>")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SecretStoreError {
    /// The backing store refused or failed (Keychain locked, access denied).
    Backend(String),
}

impl fmt::Display for SecretStoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SecretStoreError::Backend(msg) => write!(f, "secret store error: {msg}"),
        }
    }
}

impl std::error::Error for SecretStoreError {}

/// Where provider secrets are kept. `get` returns `Ok(None)` for a key that
/// was never set or was deleted; deleting a missing key is not an error.
pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<Option<SecretString>, SecretStoreError>;
    fn set(&self, key: &str, value: &SecretString) -> Result<(), SecretStoreError>;
    fn delete(&self, key: &str) -> Result<(), SecretStoreError>;
}

/// In-process store for tests and for platforms without a keychain backend.
#[derive(Default)]
pub struct MemorySecretStore {
    values: Mutex<BTreeMap<String, SecretString>>,
}

impl MemorySecretStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with(entries: &[(&str, &str)]) -> Self {
        let store = Self::new();
        {
            let mut values = store.values.lock().expect("fresh mutex");
            for (k, v) in entries {
                values.insert((*k).to_owned(), SecretString::new(*v));
            }
        }
        store
    }
}

impl SecretStore for MemorySecretStore {
    fn get(&self, key: &str) -> Result<Option<SecretString>, SecretStoreError> {
        let values = self
            .values
            .lock()
            .map_err(|_| SecretStoreError::Backend("poisoned".into()))?;
        Ok(values.get(key).cloned())
    }

    fn set(&self, key: &str, value: &SecretString) -> Result<(), SecretStoreError> {
        let mut values = self
            .values
            .lock()
            .map_err(|_| SecretStoreError::Backend("poisoned".into()))?;
        values.insert(key.to_owned(), value.clone());
        Ok(())
    }

    fn delete(&self, key: &str) -> Result<(), SecretStoreError> {
        let mut values = self
            .values
            .lock()
            .map_err(|_| SecretStoreError::Backend("poisoned".into()))?;
        values.remove(key);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_string_never_prints_its_value() {
        let s = SecretString::new("sk-ant-very-secret");
        assert_eq!(s.to_string(), "<redacted>");
        assert_eq!(format!("{s:?}"), "SecretString(<redacted>)");
        assert_eq!(s.expose(), "sk-ant-very-secret");
        let nested = format!("{:?}", Some(vec![s]));
        assert!(!nested.contains("very-secret"), "{nested}");
    }

    #[test]
    fn memory_store_get_set_delete() {
        let store = MemorySecretStore::new();
        assert_eq!(store.get(keys::ANTHROPIC_API_KEY).unwrap(), None);
        store
            .set(keys::ANTHROPIC_API_KEY, &SecretString::new("a"))
            .unwrap();
        store
            .set(keys::ANTHROPIC_API_KEY, &SecretString::new("b"))
            .unwrap();
        assert_eq!(
            store.get(keys::ANTHROPIC_API_KEY).unwrap(),
            Some(SecretString::new("b"))
        );
        store.delete(keys::ANTHROPIC_API_KEY).unwrap();
        assert_eq!(store.get(keys::ANTHROPIC_API_KEY).unwrap(), None);
        // Deleting a missing key is not an error.
        store.delete(keys::ANTHROPIC_API_KEY).unwrap();
    }

    #[test]
    fn store_is_usable_as_a_shared_trait_object() {
        let store: std::sync::Arc<dyn SecretStore> =
            std::sync::Arc::new(MemorySecretStore::with(&[(keys::OPENAI_API_KEY, "k")]));
        let worker = {
            let store = store.clone();
            std::thread::spawn(move || store.get(keys::OPENAI_API_KEY).unwrap())
        };
        assert_eq!(worker.join().unwrap(), Some(SecretString::new("k")));
    }

    #[test]
    fn keys_are_unique_snake_case() {
        let mut seen = std::collections::BTreeSet::new();
        for key in keys::ALL {
            assert!(seen.insert(*key), "duplicate {key}");
            assert!(
                key.chars().all(|c| c.is_ascii_lowercase() || c == '_'),
                "{key}"
            );
        }
    }
}
