//! The macOS login Keychain as the app's [`SecretStore`] for provider keys.
//!
//! One generic password per secret: service [`KEYCHAIN_SERVICE`], account =
//! the key from [`crate::agent::secret::keys`]. The reference app links
//! `security-framework` and keeps provider keys behind its
//! `*_keychain_setting` commands (`evidence/providers/README.md`), but its
//! item names are not in the evidence, so these are ours.

use crate::agent::secret::{SecretStore, SecretStoreError, SecretString};

/// Keychain service of every item this app writes (the bundle identifier).
pub const KEYCHAIN_SERVICE: &str = "com.reasonmachines.openconductor";

pub struct KeychainSecretStore {
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    service: String,
}

impl KeychainSecretStore {
    pub fn new() -> Self {
        Self::with_service(KEYCHAIN_SERVICE)
    }

    /// A store under another service name; tests use one so they never
    /// touch the user's real keys.
    pub fn with_service(service: &str) -> Self {
        KeychainSecretStore {
            service: service.to_owned(),
        }
    }
}

impl Default for KeychainSecretStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(target_os = "macos")]
impl SecretStore for KeychainSecretStore {
    fn get(&self, key: &str) -> Result<Option<SecretString>, SecretStoreError> {
        use security_framework::passwords::get_generic_password;
        match get_generic_password(&self.service, key) {
            Ok(bytes) => String::from_utf8(bytes)
                .map(|v| Some(SecretString::new(v)))
                .map_err(|_| SecretStoreError::Backend(format!("{key}: item is not UTF-8"))),
            Err(e) if e.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(None),
            Err(e) => Err(backend(key, e)),
        }
    }

    fn set(&self, key: &str, value: &SecretString) -> Result<(), SecretStoreError> {
        use security_framework::passwords::set_generic_password;
        set_generic_password(&self.service, key, value.expose().as_bytes())
            .map_err(|e| backend(key, e))
    }

    fn delete(&self, key: &str) -> Result<(), SecretStoreError> {
        use security_framework::passwords::delete_generic_password;
        match delete_generic_password(&self.service, key) {
            Ok(()) => Ok(()),
            Err(e) if e.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(()),
            Err(e) => Err(backend(key, e)),
        }
    }
}

#[cfg(target_os = "macos")]
const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

#[cfg(target_os = "macos")]
fn backend(key: &str, e: security_framework::base::Error) -> SecretStoreError {
    SecretStoreError::Backend(format!("keychain {key}: {e}"))
}

/// No Keychain off macOS: every call fails, so a missing key is never
/// mistaken for "not configured".
#[cfg(not(target_os = "macos"))]
impl SecretStore for KeychainSecretStore {
    fn get(&self, _: &str) -> Result<Option<SecretString>, SecretStoreError> {
        Err(unsupported())
    }
    fn set(&self, _: &str, _: &SecretString) -> Result<(), SecretStoreError> {
        Err(unsupported())
    }
    fn delete(&self, _: &str) -> Result<(), SecretStoreError> {
        Err(unsupported())
    }
}

#[cfg(not(target_os = "macos"))]
fn unsupported() -> SecretStoreError {
    SecretStoreError::Backend("no Keychain on this platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::secret::keys;

    /// Round trip through the real login Keychain under a throwaway service.
    /// Opt in with OPENCONDUCTOR_KEYCHAIN_TESTS=1 (CI sets it on macOS).
    #[test]
    fn keychain_round_trip() {
        if std::env::var("OPENCONDUCTOR_KEYCHAIN_TESTS").as_deref() != Ok("1") {
            eprintln!("skipped: set OPENCONDUCTOR_KEYCHAIN_TESTS=1");
            return;
        }
        let store = KeychainSecretStore::with_service(&format!(
            "{KEYCHAIN_SERVICE}.test-{}",
            std::process::id()
        ));
        let key = keys::CURSOR_API_KEY;
        store.delete(key).unwrap();
        assert_eq!(store.get(key).unwrap(), None);
        store.set(key, &SecretString::new("first-1234")).unwrap();
        store.set(key, &SecretString::new("second-5678")).unwrap();
        assert_eq!(
            store.get(key).unwrap(),
            Some(SecretString::new("second-5678"))
        );
        assert_eq!(store.get(keys::OPENAI_API_KEY).unwrap(), None);
        store.delete(key).unwrap();
        store.delete(key).unwrap();
        assert_eq!(store.get(key).unwrap(), None);
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn other_platforms_refuse_instead_of_reporting_missing() {
        let store = KeychainSecretStore::new();
        assert!(store.get(keys::ANTHROPIC_API_KEY).is_err());
        assert!(store
            .set(keys::ANTHROPIC_API_KEY, &SecretString::new("x"))
            .is_err());
        assert!(store.delete(keys::ANTHROPIC_API_KEY).is_err());
    }
}
