//! App preferences kept in `conductor.db`'s `settings` table, not in
//! `settings.toml`: the reference app registers these keys as
//! non-file-backed (`index-*.js` settings registry). Each key has one typed
//! field here, decoded the way the reference's hooks decode it, and one
//! typed update variant, encoded the way its setters write it (booleans as
//! `"true"` / `"false"`, numbers as decimal text).
//!
//! `commands` is the IPC layer.

pub mod commands;

#[cfg(test)]
mod tests;

use std::collections::HashMap;

use openconductor_db::app_settings::keys;
use serde::{Deserialize, Serialize};

/// Default left sidebar width (the reference's `mBe = 256`).
pub const DEFAULT_LEFT_PANEL_WIDTH: u32 = 256;

/// "Send messages with" (the reference's `mN`): unset or unknown reads as
/// `enter` (`yl("message_send_key", mN, "enter")`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MessageSendKey {
    Enter,
    CmdEnter,
}

impl MessageSendKey {
    fn as_str(self) -> &'static str {
        match self {
            MessageSendKey::Enter => "enter",
            MessageSendKey::CmdEnter => "cmd-enter",
        }
    }
}

/// "Follow-up behavior": only the exact text `queued` queues; no row (or
/// any other text) steers (the reference's `qQt`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FollowUpMode {
    Queued,
    Steering,
}

impl FollowUpMode {
    fn as_str(self) -> &'static str {
        match self {
            FollowUpMode::Queued => "queued",
            FollowUpMode::Steering => "steering",
        }
    }
}

/// Every app preference, decoded. Field names are the table keys.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AppPrefs {
    pub garry_mode: bool,
    pub experimental_show_agent_cost: bool,
    pub experimental_tab_freak_mode: bool,
    pub graphite_disabled: bool,
    /// The app "Open in" uses first: the most recent entry of
    /// `open_in_mru_order` without its `|local` / `|remote` suffix, else
    /// `default_open_in`.
    pub default_open_in: Option<String>,
    pub open_in_mru_order: Vec<String>,
    pub left_panel_visible: bool,
    pub right_panel_visible: bool,
    pub left_panel_width: u32,
    pub onboarding_step: i64,
    pub first_time_onboarding_step: i64,
    pub last_clone_directory: Option<String>,
    pub last_seen_announcement: Option<String>,
    pub roundhouse_client_user_id: Option<String>,
    /// The sidebar's "Filter by project" repository id; `None` is all
    /// projects.
    pub sidebar_repo_filter: Option<String>,
    /// Experimental "Show sidebar resource usage" (the reference's
    /// `Te("sidebar_resource_usage", !1)`): off unless the row says `"true"`.
    pub sidebar_resource_usage: bool,
    pub message_send_key: MessageSendKey,
    pub default_message_send_mode: FollowUpMode,
    /// "Use Claude Code with Chrome": Claude Code chats start with
    /// `--chrome` (the reference sidecar's `extraArgs: { chrome: null }`).
    pub chrome_mode_enabled: bool,
}

/// `"true"` / `"false"`, anything else (or no row) is `default`.
fn flag(rows: &HashMap<String, String>, key: &str, default: bool) -> bool {
    match rows.get(key).map(String::as_str) {
        Some("true") => true,
        Some("false") => false,
        _ => default,
    }
}

fn text(rows: &HashMap<String, String>, key: &str) -> Option<String> {
    rows.get(key).cloned()
}

/// JavaScript `parseInt`'s leading-integer read: optional sign, digits.
fn leading_int(s: &str) -> Option<i64> {
    let s = s.trim_start();
    let (sign, rest) = match s.as_bytes().first() {
        Some(b'-') => (-1, &s[1..]),
        Some(b'+') => (1, &s[1..]),
        _ => (1, s),
    };
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    digits.parse::<i64>().ok().map(|n| sign * n)
}

/// The MRU entry's app id: `app|local` and `app|remote` lose the suffix.
pub fn open_in_app_id(entry: &str) -> &str {
    match entry.rsplit_once('|') {
        Some((app, "local" | "remote")) => app,
        _ => entry,
    }
}

fn mru(rows: &HashMap<String, String>) -> Vec<String> {
    rows.get(keys::OPEN_IN_MRU_ORDER)
        .and_then(|raw| serde_json::from_str::<Vec<String>>(raw).ok())
        .unwrap_or_default()
}

impl AppPrefs {
    /// Decode from the table's live rows (`app_settings::active`).
    pub fn from_rows(rows: &HashMap<String, String>) -> AppPrefs {
        let open_in_mru_order = mru(rows);
        let default_open_in = open_in_mru_order
            .first()
            .map(|e| open_in_app_id(e).to_string())
            .or_else(|| text(rows, keys::DEFAULT_OPEN_IN));
        AppPrefs {
            garry_mode: flag(rows, keys::GARRY_MODE, false),
            experimental_show_agent_cost: flag(rows, keys::EXPERIMENTAL_SHOW_AGENT_COST, false),
            experimental_tab_freak_mode: flag(rows, keys::EXPERIMENTAL_TAB_FREAK_MODE, false),
            // Only the exact text "true" turns Graphite off.
            graphite_disabled: rows.get(keys::GRAPHITE_DISABLED).map(String::as_str)
                == Some("true"),
            default_open_in,
            open_in_mru_order,
            left_panel_visible: flag(rows, keys::LEFT_PANEL_VISIBLE, true),
            right_panel_visible: flag(rows, keys::RIGHT_PANEL_VISIBLE, true),
            left_panel_width: rows
                .get(keys::LEFT_PANEL_WIDTH)
                .and_then(|v| leading_int(v))
                .and_then(|n| u32::try_from(n).ok())
                .unwrap_or(DEFAULT_LEFT_PANEL_WIDTH),
            onboarding_step: rows
                .get(keys::ONBOARDING_STEP)
                .and_then(|v| leading_int(v))
                .unwrap_or(0),
            first_time_onboarding_step: rows
                .get(keys::FIRST_TIME_ONBOARDING_STEP)
                .and_then(|v| leading_int(v))
                .unwrap_or(1),
            last_clone_directory: text(rows, keys::LAST_CLONE_DIRECTORY),
            last_seen_announcement: text(rows, keys::LAST_SEEN_ANNOUNCEMENT),
            roundhouse_client_user_id: text(rows, keys::ROUNDHOUSE_CLIENT_USER_ID),
            sidebar_repo_filter: text(rows, keys::SIDEBAR_REPO_FILTER),
            sidebar_resource_usage: flag(rows, keys::SIDEBAR_RESOURCE_USAGE, false),
            message_send_key: match rows.get(keys::MESSAGE_SEND_KEY).map(String::as_str) {
                Some("cmd-enter") => MessageSendKey::CmdEnter,
                _ => MessageSendKey::Enter,
            },
            default_message_send_mode: match rows
                .get(keys::DEFAULT_MESSAGE_SEND_MODE)
                .map(String::as_str)
            {
                Some("queued") => FollowUpMode::Queued,
                _ => FollowUpMode::Steering,
            },
            // The reference reads it as `=== "true"`.
            chrome_mode_enabled: rows.get(keys::CHROME_MODE_ENABLED).map(String::as_str)
                == Some("true"),
        }
    }
}

/// One typed change from the UI. `{"key": "garry_mode", "value": true}`.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "key", content = "value", rename_all = "snake_case")]
pub enum AppPrefUpdate {
    GarryMode(bool),
    ExperimentalShowAgentCost(bool),
    ExperimentalTabFreakMode(bool),
    GraphiteDisabled(bool),
    LeftPanelVisible(bool),
    RightPanelVisible(bool),
    /// Rounded to whole pixels, as the reference stores it.
    LeftPanelWidth(f64),
    OnboardingStep(i64),
    FirstTimeOnboardingStep(i64),
    LastCloneDirectory(String),
    LastSeenAnnouncement(String),
    /// `null` signs the cloud client out (deletes the row).
    RoundhouseClientUserId(Option<String>),
    /// A repository id narrows the sidebar; `null` ("All projects") deletes
    /// the row (the reference's `z6t`).
    SidebarRepoFilter(Option<String>),
    /// Written as `"true"` / `"false"` (the reference's `v6t`).
    SidebarResourceUsage(bool),
    /// Written as `enter` / `cmd-enter` after the send-key overrides.
    MessageSendKey(MessageSendKey),
    /// Written as `queued` / `steering` (the reference's `JUt`).
    DefaultMessageSendMode(FollowUpMode),
    ChromeModeEnabled(bool),
}

/// What an update does to the table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Write {
    Set(&'static str, String),
    Delete(&'static str),
}

impl AppPrefUpdate {
    /// The row write, or an error for a value the reference would never
    /// store (a non-finite or negative width, an empty path).
    pub fn encode(&self) -> Result<Write, String> {
        use AppPrefUpdate::*;
        let b = |k: &'static str, v: bool| Ok(Write::Set(k, v.to_string()));
        match self {
            GarryMode(v) => b(keys::GARRY_MODE, *v),
            ExperimentalShowAgentCost(v) => b(keys::EXPERIMENTAL_SHOW_AGENT_COST, *v),
            ExperimentalTabFreakMode(v) => b(keys::EXPERIMENTAL_TAB_FREAK_MODE, *v),
            GraphiteDisabled(v) => b(keys::GRAPHITE_DISABLED, *v),
            LeftPanelVisible(v) => b(keys::LEFT_PANEL_VISIBLE, *v),
            RightPanelVisible(v) => b(keys::RIGHT_PANEL_VISIBLE, *v),
            LeftPanelWidth(w) if w.is_finite() && *w >= 0.0 => Ok(Write::Set(
                keys::LEFT_PANEL_WIDTH,
                (w.round() as u32).to_string(),
            )),
            LeftPanelWidth(w) => Err(format!("left_panel_width {w} is not a width")),
            OnboardingStep(n) => Ok(Write::Set(keys::ONBOARDING_STEP, n.to_string())),
            FirstTimeOnboardingStep(n) => {
                Ok(Write::Set(keys::FIRST_TIME_ONBOARDING_STEP, n.to_string()))
            }
            LastCloneDirectory(p) if p.trim().is_empty() => {
                Err("last_clone_directory must be a folder path".into())
            }
            LastCloneDirectory(p) => Ok(Write::Set(keys::LAST_CLONE_DIRECTORY, p.clone())),
            LastSeenAnnouncement(id) => Ok(Write::Set(keys::LAST_SEEN_ANNOUNCEMENT, id.clone())),
            RoundhouseClientUserId(Some(id)) => {
                Ok(Write::Set(keys::ROUNDHOUSE_CLIENT_USER_ID, id.clone()))
            }
            RoundhouseClientUserId(None) => Ok(Write::Delete(keys::ROUNDHOUSE_CLIENT_USER_ID)),
            SidebarRepoFilter(Some(id)) if id.trim().is_empty() => {
                Err("sidebar_repo_filter must be a repository id".into())
            }
            SidebarRepoFilter(Some(id)) => Ok(Write::Set(keys::SIDEBAR_REPO_FILTER, id.clone())),
            SidebarRepoFilter(None) => Ok(Write::Delete(keys::SIDEBAR_REPO_FILTER)),
            SidebarResourceUsage(v) => b(keys::SIDEBAR_RESOURCE_USAGE, *v),
            MessageSendKey(k) => Ok(Write::Set(keys::MESSAGE_SEND_KEY, k.as_str().into())),
            DefaultMessageSendMode(m) => Ok(Write::Set(
                keys::DEFAULT_MESSAGE_SEND_MODE,
                m.as_str().into(),
            )),
            ChromeModeEnabled(v) => b(keys::CHROME_MODE_ENABLED, *v),
        }
    }
}

/// The two writes "Open in <app>" makes (the reference's `qzt`, or `Hzt`
/// when `is_remote` is unknown): `default_open_in` becomes `app_id`, and
/// its MRU entry moves to the front, replacing a bare `app_id` entry.
pub fn record_open_in(
    rows: &HashMap<String, String>,
    app_id: &str,
    is_remote: Option<bool>,
) -> [Write; 2] {
    let entry = match is_remote {
        Some(remote) => format!("{app_id}|{}", if remote { "remote" } else { "local" }),
        None => app_id.to_string(),
    };
    let mut order = vec![entry.clone()];
    order.extend(mru(rows).into_iter().filter(|e| e != &entry && e != app_id));
    [
        Write::Set(keys::DEFAULT_OPEN_IN, app_id.to_string()),
        Write::Set(
            keys::OPEN_IN_MRU_ORDER,
            serde_json::to_string(&order).expect("strings serialize"),
        ),
    ]
}
