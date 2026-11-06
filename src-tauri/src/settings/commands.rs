//! Tauri commands for the settings pages. Thin wrappers over
//! [`SettingsService`]; errors are its `Display` text, which never contains
//! a secret value. Provider secrets go in through [`connect_provider`] and
//! come back as present / missing with their last four characters in
//! [`ProviderStatus`]; the whole value is returned only by
//! [`reveal_provider_secret`], which the UI calls when the user presses
//! "show" on that key.

use tauri::State;

use super::service::{SecretInput, SettingsService};
use super::Settings;
use crate::agent::{AgentKind, ProviderConfig, ProviderStatus};

#[tauri::command]
pub fn get_settings(service: State<'_, SettingsService>) -> Result<Settings, String> {
    service.get().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_settings(
    service: State<'_, SettingsService>,
    settings: Settings,
) -> Result<Settings, String> {
    service.update(settings).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn provider_status(
    service: State<'_, SettingsService>,
    agent: AgentKind,
) -> Result<ProviderStatus, String> {
    service.provider_status(agent).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn connect_provider(
    service: State<'_, SettingsService>,
    agent: AgentKind,
    config: ProviderConfig,
    secrets: Vec<SecretInput>,
) -> Result<ProviderStatus, String> {
    service
        .connect(agent, config, secrets)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn disconnect_provider(
    service: State<'_, SettingsService>,
    agent: AgentKind,
) -> Result<ProviderStatus, String> {
    service.disconnect(agent).map_err(|e| e.to_string())
}

/// The stored value of one of `agent`'s current provider secrets, for the
/// eye button on Settings › Agents. Other keys are refused.
#[tauri::command]
pub fn reveal_provider_secret(
    service: State<'_, SettingsService>,
    agent: AgentKind,
    key: String,
) -> Result<String, String> {
    service
        .reveal_secret(agent, &key)
        .map(|v| v.expose().to_owned())
        .map_err(|e| e.to_string())
}

/// Absolute path of the user's settings.toml ("Open settings.toml").
#[tauri::command]
pub fn settings_file_path(service: State<'_, SettingsService>) -> String {
    service.path().display().to_string()
}

/// Effective settings for one repository: the user file with its
/// `.conductor/settings.toml` (read from `origin/<default branch>`),
/// `.conductor/settings.local.toml` and the managed file applied
/// ([`super::layers::for_repo`]).
#[tauri::command]
pub async fn get_repo_settings(
    db: State<'_, crate::db::Db>,
    repo_id: String,
) -> Result<Settings, String> {
    let user_dir = super::config_dir().map_err(|e| e.to_string())?;
    let target = crate::spotlight::setting::target(&db.0, &repo_id, user_dir.clone()).await?;
    super::layers::for_repo(&user_dir, &target.root, target.paths.shared_from)
        .map_err(|e| e.to_string())
}
