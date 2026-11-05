//! What the settings commands do, without Tauri: read and write
//! `settings.toml` and connect providers through [`byok`], so it can be
//! tested against a temp dir and a [`MemorySecretStore`].
//!
//! Every write goes load, change, validate, save under one lock, so two
//! commands never interleave and an invalid change leaves the file as it was.
//! Provider secrets go to the [`SecretStore`] only; nothing here returns one.
//!
//! With a database ([`SettingsService::with_db`]), the appearance keys
//! Conductor keeps in `conductor.db`'s `settings` table ([`db_backed`]) are
//! read from and written to that table and left out of the file.
//!
//! [`MemorySecretStore`]: crate::agent::MemorySecretStore

use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::Deserialize;

use openconductor_db::{app_settings, SqlitePool};

use super::{db_backed, load, save, save_table, validate, Settings, SettingsError};
use crate::agent::byok::{self, ByokError};
use crate::agent::{AgentKind, ProviderConfig, ProviderStatus, SecretStore, SecretString};

#[derive(Debug)]
pub enum ServiceError {
    Settings(SettingsError),
    Byok(ByokError),
    /// The provider belongs to another agent.
    WrongAgent {
        agent: AgentKind,
        kind: &'static str,
    },
    /// Reading or writing `conductor.db`'s settings table failed.
    Db(String),
}

impl fmt::Display for ServiceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ServiceError::Settings(e) => write!(f, "{e}"),
            ServiceError::Byok(e) => write!(f, "{e}"),
            ServiceError::WrongAgent { agent, kind } => {
                write!(f, "{kind} is not a provider for {agent}")
            }
            ServiceError::Db(e) => write!(f, "settings table: {e}"),
        }
    }
}

impl std::error::Error for ServiceError {}

impl From<SettingsError> for ServiceError {
    fn from(e: SettingsError) -> Self {
        ServiceError::Settings(e)
    }
}

impl From<ByokError> for ServiceError {
    fn from(e: ByokError) -> Self {
        ServiceError::Byok(e)
    }
}

/// One secret pasted into the providers page. `Debug` hides the value.
#[derive(Clone, Deserialize)]
pub struct SecretInput {
    pub key: String,
    pub value: String,
}

impl fmt::Debug for SecretInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "SecretInput({}: <redacted>)", self.key)
    }
}

pub struct SettingsService {
    path: PathBuf,
    store: Arc<dyn SecretStore>,
    lock: Mutex<()>,
    db: Option<SqlitePool>,
}

/// Run a database future to completion from synchronous code, on a helper
/// thread so it also works when the caller is inside the async runtime.
fn run_db<T: Send>(f: impl std::future::Future<Output = T> + Send) -> T {
    std::thread::scope(|s| {
        s.spawn(|| tauri::async_runtime::block_on(f))
            .join()
            .expect("settings table thread panicked")
    })
}

fn db_err(e: openconductor_db::Error) -> ServiceError {
    ServiceError::Db(e.to_string())
}

impl SettingsService {
    pub fn new(path: PathBuf, store: Arc<dyn SecretStore>) -> Self {
        SettingsService {
            path,
            store,
            lock: Mutex::new(()),
            db: None,
        }
    }

    /// Keep the table-backed appearance keys in `pool`'s `settings` table.
    pub fn with_db(mut self, pool: SqlitePool) -> Self {
        self.db = Some(pool);
        self
    }

    fn table_rows(pool: &SqlitePool) -> Result<HashMap<String, String>, ServiceError> {
        Ok(run_db(app_settings::active(pool))
            .map_err(db_err)?
            .into_iter()
            .collect())
    }

    /// The file's settings with the table's appearance values on top.
    fn read(&self) -> Result<Settings, ServiceError> {
        let mut settings = load(&self.path)?;
        if let Some(pool) = &self.db {
            db_backed::overlay(&mut settings.appearance, &Self::table_rows(pool)?);
        }
        Ok(settings)
    }

    /// Validate, write changed table-backed values to the table, and the rest
    /// to the file.
    fn persist(&self, settings: &Settings) -> Result<(), ServiceError> {
        let Some(pool) = &self.db else {
            return Ok(save(&self.path, settings)?);
        };
        validate(settings)?;
        let current = Self::table_rows(pool)?;
        for (key, value) in db_backed::changes(&settings.appearance, &current) {
            run_db(async {
                match &value {
                    Some(v) => app_settings::set(pool, key, v).await,
                    None => app_settings::delete(pool, key).await,
                }
            })
            .map_err(db_err)?;
        }
        let mut table =
            toml::Table::try_from(settings).map_err(|e| SettingsError::Invalid(e.to_string()))?;
        db_backed::strip(&mut table);
        Ok(save_table(&self.path, &table)?)
    }

    /// Once, at startup: move table-backed appearance keys an older build
    /// wrote to the file into the table (a row the table already has wins),
    /// then drop them from the file. Returns the keys moved.
    pub fn move_appearance_to_db(&self) -> Result<Vec<&'static str>, ServiceError> {
        let Some(pool) = &self.db else {
            return Ok(Vec::new());
        };
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let raw = match std::fs::read_to_string(&self.path) {
            Ok(text) => text
                .parse::<toml::Table>()
                .map_err(|e| SettingsError::Parse(self.path.clone(), e.to_string()))?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(SettingsError::Io(self.path.clone(), e).into()),
        };
        let in_file = db_backed::in_file(&raw);
        if in_file.is_empty() {
            return Ok(Vec::new());
        }
        let from_file = load(&self.path)?;
        let current = Self::table_rows(pool)?;
        let mut moved = Vec::new();
        for (key, value) in db_backed::rows(&from_file.appearance) {
            if !in_file.contains(&key) || current.contains_key(key) {
                continue;
            }
            if let Some(v) = value {
                run_db(app_settings::set(pool, key, &v)).map_err(db_err)?;
                moved.push(key);
            }
        }
        let mut stripped = raw;
        db_backed::strip(&mut stripped);
        save_table(&self.path, &stripped)?;
        Ok(moved)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn get(&self) -> Result<Settings, ServiceError> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        self.read()
    }

    /// Replaces the whole file with `settings` and returns what was saved.
    pub fn update(&self, settings: Settings) -> Result<Settings, ServiceError> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        self.persist(&settings)?;
        Ok(settings)
    }

    /// Status of the provider `agent` uses now (its CLI login if unset).
    pub fn provider_status(&self, agent: AgentKind) -> Result<ProviderStatus, ServiceError> {
        let settings = self.get()?;
        Ok(byok::status(
            &settings.providers.effective(agent),
            self.store.as_ref(),
        ))
    }

    /// Switches `agent` to `config`, storing `secrets` for it. The settings
    /// change is validated before any secret is written, and secrets are
    /// checked before the file is saved, so a bad request changes neither.
    pub fn connect(
        &self,
        agent: AgentKind,
        config: ProviderConfig,
        secrets: Vec<SecretInput>,
    ) -> Result<ProviderStatus, ServiceError> {
        let kind = config.provider().kind();
        if config.provider().agent() != agent {
            return Err(ServiceError::WrongAgent { agent, kind });
        }
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut settings = self.read()?;
        settings.providers.set(agent, Some(config.clone()));
        validate(&settings)?;
        let secrets: Vec<(&str, SecretString)> = secrets
            .iter()
            .map(|s| (s.key.as_str(), SecretString::new(s.value.clone())))
            .collect();
        let status = byok::connect(&config, &secrets, self.store.as_ref())?;
        self.persist(&settings)?;
        Ok(status)
    }

    /// Deletes the secrets of `agent`'s provider and returns it to its CLI
    /// login.
    pub fn disconnect(&self, agent: AgentKind) -> Result<ProviderStatus, ServiceError> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut settings = self.read()?;
        byok::disconnect(&settings.providers.effective(agent), self.store.as_ref())?;
        settings.providers.set(agent, None);
        self.persist(&settings)?;
        Ok(byok::status(
            &settings.providers.effective(agent),
            self.store.as_ref(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::secret::keys;
    use crate::agent::MemorySecretStore;
    use std::fs;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn service() -> (SettingsService, Arc<MemorySecretStore>) {
        static N: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "oc-settings-svc-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        let store = Arc::new(MemorySecretStore::new());
        let svc = SettingsService::new(dir.join(super::super::FILE_NAME), store.clone());
        (svc, store)
    }

    fn config(json: &str) -> ProviderConfig {
        serde_json::from_str(json).expect(json)
    }

    fn secret(key: &str, value: &str) -> Vec<SecretInput> {
        vec![SecretInput {
            key: key.into(),
            value: value.into(),
        }]
    }

    #[test]
    fn get_defaults_then_update_persists() {
        let (svc, _) = service();
        assert_eq!(svc.get().unwrap(), Settings::default());
        let mut s = Settings::default();
        s.models.review = Some("opus".into());
        assert_eq!(svc.update(s.clone()).unwrap(), s);
        assert_eq!(svc.get().unwrap(), s);
    }

    #[test]
    fn invalid_update_keeps_the_file() {
        let (svc, _) = service();
        let mut good = Settings::default();
        good.models.review = Some("opus".into());
        svc.update(good.clone()).unwrap();
        let mut bad = good.clone();
        bad.models.default = String::new();
        assert!(svc.update(bad).is_err());
        assert_eq!(svc.get().unwrap(), good);
    }

    #[test]
    fn connect_saves_config_and_secret_then_disconnect_resets() {
        let (svc, store) = service();
        assert_eq!(
            svc.provider_status(AgentKind::Claude).unwrap().kind,
            "claude_login"
        );
        let status = svc
            .connect(
                AgentKind::Claude,
                config(r#"{"kind":"anthropic_api"}"#),
                secret(keys::ANTHROPIC_API_KEY, "sk-ant-abc"),
            )
            .unwrap();
        assert!(status.ready, "{status:?}");
        assert_eq!(status.kind, "anthropic_api");
        assert_eq!(
            svc.get().unwrap().providers.get(AgentKind::Claude),
            Some(&config(r#"{"kind":"anthropic_api"}"#))
        );
        let text = fs::read_to_string(svc.path()).unwrap();
        assert!(!text.contains("sk-ant-abc"), "{text}");
        assert_eq!(
            svc.provider_status(AgentKind::Claude).unwrap().kind,
            "anthropic_api"
        );

        let after = svc.disconnect(AgentKind::Claude).unwrap();
        assert_eq!(after.kind, "claude_login");
        assert_eq!(store.get(keys::ANTHROPIC_API_KEY).unwrap(), None);
        assert_eq!(svc.get().unwrap().providers.get(AgentKind::Claude), None);
    }

    #[test]
    fn rejected_connect_changes_neither_file_nor_store() {
        let (svc, store) = service();
        let wrong_agent = svc.connect(
            AgentKind::Codex,
            config(r#"{"kind":"anthropic_api"}"#),
            secret(keys::ANTHROPIC_API_KEY, "sk-ant-abc"),
        );
        assert!(matches!(wrong_agent, Err(ServiceError::WrongAgent { .. })));

        let bad_secret = svc
            .connect(
                AgentKind::Claude,
                config(r#"{"kind":"anthropic_api"}"#),
                secret(keys::ANTHROPIC_API_KEY, "sk-ant-has space"),
            )
            .unwrap_err();
        assert!(
            !bad_secret.to_string().contains("has space"),
            "{bad_secret}"
        );

        let bad_option = svc.connect(
            AgentKind::Claude,
            config(r#"{"kind":"bedrock","region":" "}"#),
            secret(keys::BEDROCK_API_KEY, "abc"),
        );
        assert!(bad_option.is_err());

        assert_eq!(store.get(keys::ANTHROPIC_API_KEY).unwrap(), None);
        assert_eq!(store.get(keys::BEDROCK_API_KEY).unwrap(), None);
        assert!(!svc.path().exists());
    }

    /// The UI sends settings back as JSON; unknown keys and provider
    /// options must survive that trip as well as the TOML one.
    #[test]
    fn settings_round_trip_through_ipc_json() {
        let mut s: Settings = toml::from_str(
            "future = 1\n[git]\nfuture_git = [\"a\"]\n[providers.claude]\nkind = \"bedrock\"\nregion = \"us-east-1\"\n",
        )
        .unwrap();
        s.models.review = Some("opus".into());
        let json = serde_json::to_string(&s).unwrap();
        assert_eq!(
            serde_json::from_str::<Settings>(&json).unwrap(),
            s,
            "{json}"
        );
    }

    #[test]
    fn secret_input_debug_hides_the_value() {
        let s = &secret(keys::OPENAI_API_KEY, "sk-hidden")[0];
        let shown = format!("{s:?}");
        assert!(shown.contains(keys::OPENAI_API_KEY) && !shown.contains("sk-hidden"));
    }
}
