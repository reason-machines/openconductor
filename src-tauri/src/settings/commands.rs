//! Tauri commands for the settings pages. Thin wrappers over
//! [`SettingsService`]; errors are its `Display` text, which never contains
//! a secret value. Provider secrets are write-only from the UI: they go in
//! through [`connect_provider`] and come back only as present / missing in
//! [`ProviderStatus`].

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
