//! The [`SecretStore`] the app uses: the macOS login Keychain, one generic
//! password item per key under the app's service name.
//!
//! The reference app links `security-framework` and reaches its provider
//! secrets through `*_keychain_setting` commands (see
//! `evidence/providers/README.md`). Its Keychain service and account names
//! are not in the evidence, so this store uses our own bundle identifier as
//! the service and the [`super::secret::keys`] constant as the account; it
//! does not read Conductor's items.
//!
//! On other platforms [`default_store`] falls back to a [`MemorySecretStore`]:
//! secrets last as long as the process, and nothing is written to disk.

use std::sync::Arc;

#[cfg(not(target_os = "macos"))]
use super::secret::MemorySecretStore;
use super::secret::SecretStore;

/// Keychain service name for provider secrets: the app's bundle identifier.
pub const SERVICE: &str = "com.reasonmachines.openconductor";

/// The store the app should use on this platform.
pub fn default_store() -> Arc<dyn SecretStore> {
    #[cfg(target_os = "macos")]
    {
        Arc::new(macos::KeychainSecretStore::new(SERVICE))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Arc::new(MemorySecretStore::new())
    }
}

#[cfg(target_os = "macos")]
pub use macos::KeychainSecretStore;

#[cfg(target_os = "macos")]
mod macos {
    use super::super::secret::{SecretStore, SecretStoreError, SecretString};
    use security_framework::base::Error;
    use security_framework::passwords::{
        delete_generic_password, get_generic_password, set_generic_password,
    };

    /// `errSecItemNotFound`: the key was never set or was deleted.
    const ITEM_NOT_FOUND: i32 = -25300;

    /// Generic password items in the login Keychain under one service.
    pub struct KeychainSecretStore {
        service: String,
    }

    impl KeychainSecretStore {
        pub fn new(service: impl Into<String>) -> Self {
            KeychainSecretStore {
                service: service.into(),
            }
        }
    }

    /// Never includes the item's data: only the OS status and its message.
    fn backend(op: &str, key: &str, err: Error) -> SecretStoreError {
        SecretStoreError::Backend(format!("keychain {op} {key}: {err} ({})", err.code()))
    }

    impl SecretStore for KeychainSecretStore {
        fn get(&self, key: &str) -> Result<Option<SecretString>, SecretStoreError> {
            match get_generic_password(&self.service, key) {
                Ok(bytes) => String::from_utf8(bytes)
                    .map(|s| Some(SecretString::new(s)))
                    .map_err(|_| {
                        SecretStoreError::Backend(format!("keychain get {key}: not UTF-8"))
                    }),
                Err(err) if err.code() == ITEM_NOT_FOUND => Ok(None),
                Err(err) => Err(backend("get", key, err)),
            }
        }

        fn set(&self, key: &str, value: &SecretString) -> Result<(), SecretStoreError> {
            set_generic_password(&self.service, key, value.expose().as_bytes())
                .map_err(|err| backend("set", key, err))
        }

        fn delete(&self, key: &str) -> Result<(), SecretStoreError> {
            match delete_generic_password(&self.service, key) {
                Ok(()) => Ok(()),
                Err(err) if err.code() == ITEM_NOT_FOUND => Ok(()),
                Err(err) => Err(backend("delete", key, err)),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::secret::{keys, SecretString};
    use super::*;

    #[test]
    fn default_store_round_trips_off_macos() {
        // On macOS this touches the real login Keychain, so it is ignored by
        // default there and run by CI with `--ignored`; elsewhere it is the
        // in-memory store.
        if cfg!(target_os = "macos") {
            return;
        }
        let store = default_store();
        assert_eq!(store.get(keys::OPENAI_API_KEY).unwrap(), None);
        store
            .set(keys::OPENAI_API_KEY, &SecretString::new("v"))
            .unwrap();
        assert_eq!(
            store.get(keys::OPENAI_API_KEY).unwrap(),
            Some(SecretString::new("v"))
        );
    }

    /// Writes, overwrites, reads and deletes a throwaway item in the login
    /// Keychain under a test-only service. Run with `--ignored` on macOS.
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "touches the login Keychain; CI runs it on macOS with --ignored"]
    fn keychain_store_round_trip() {
        let service = format!("{SERVICE}.test.{}", std::process::id());
        let store = KeychainSecretStore::new(service);
        let key = keys::ANTHROPIC_API_KEY;
        store.delete(key).unwrap();
        assert_eq!(store.get(key).unwrap(), None);
        store.set(key, &SecretString::new("first")).unwrap();
        store.set(key, &SecretString::new("second")).unwrap();
        assert_eq!(store.get(key).unwrap(), Some(SecretString::new("second")));
        store.delete(key).unwrap();
        assert_eq!(store.get(key).unwrap(), None);
        // Deleting a missing item is not an error.
        store.delete(key).unwrap();
    }
}
