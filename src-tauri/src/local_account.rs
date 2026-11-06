//! Who the sidebar's Account menu names (`local_account`).
//!
//! Reference: Conductor 0.87.6's sidebar account switcher (`oOt` → `zna`
//! in `renderApp-D_fmY7hW.js`) labels the personal organization
//! "`<user.name>`'s Mac", or "My Mac" when the name is empty (`iEi`), and
//! heads its menu with the signed-in account's email. Those come from the
//! Conductor cloud account. OpenConductor has no Conductor account, so the
//! person is the local user: the full name of the OS account (macOS `id
//! -F`, the passwd GECOS field elsewhere), else git's `user.name`, and git's
//! `user.email`.

use std::process::Command;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAccount {
    /// Empty when no name is known; the UI then shows "My Mac".
    pub name: String,
    pub email: Option<String>,
}

fn output(program: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(program).args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// The full-name part of a passwd line's GECOS field
/// (`name:x:uid:gid:Full Name,room,phone:home:shell`).
pub fn gecos_name(passwd_line: &str) -> Option<String> {
    let gecos = passwd_line.split(':').nth(4)?;
    let name = gecos.split(',').next()?.trim();
    (!name.is_empty()).then(|| name.to_string())
}

fn os_full_name() -> Option<String> {
    if cfg!(target_os = "macos") {
        return output("id", &["-F"]);
    }
    let user = output("id", &["-un"])?;
    gecos_name(&output("getent", &["passwd", &user])?)
}

pub fn resolve() -> LocalAccount {
    let name = os_full_name()
        .or_else(|| output("git", &["config", "--global", "user.name"]))
        .unwrap_or_default();
    LocalAccount {
        name,
        email: output("git", &["config", "--global", "user.email"]),
    }
}

/// JS: `invoke("local_account")`.
#[tauri::command]
pub async fn local_account() -> Result<LocalAccount, String> {
    tauri::async_runtime::spawn_blocking(resolve)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gecos_takes_the_name_before_the_first_comma() {
        assert_eq!(
            gecos_name("ada:x:1000:1000:Ada Lovelace,,,:/home/ada:/bin/zsh").as_deref(),
            Some("Ada Lovelace")
        );
        assert_eq!(gecos_name("ada:x:1000:1000::/home/ada:/bin/zsh"), None);
        assert_eq!(gecos_name("short"), None);
    }

    #[test]
    fn serializes_camel_case() {
        let v = serde_json::to_value(LocalAccount {
            name: "Ada".into(),
            email: None,
        })
        .unwrap();
        assert_eq!(v, serde_json::json!({ "name": "Ada", "email": null }));
    }
}
