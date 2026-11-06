//! What an agent process is launched with: which agent it is, and which
//! environment variables to set and clear on it.
//!
//! Clearing matters as much as setting: a stale `ANTHROPIC_API_KEY`
//! inherited from the user's shell would otherwise override the provider the
//! user picked in settings, so every launch clears all of its agent's
//! routing variables ([`AgentKind::routing_vars`]) before setting its own.
//!
//! Variable names are the agent CLIs' public configuration surface (Claude
//! Code and Codex documentation), not anything taken from the reference app.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::process::Command;

use serde::{Deserialize, Serialize};

use super::secret::SecretString;

/// Agent CLIs a session can run. Matches the values of the reference app's
/// `sessions.agent_type` column for the agents we support.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentKind {
    Claude,
    Codex,
    Cursor,
    Opencode,
    /// Reason over ACP (`crate::reason_acp`), not a stream-json CLI.
    Reason,
}

impl AgentKind {
    pub const ALL: [AgentKind; 5] = [
        AgentKind::Claude,
        AgentKind::Codex,
        AgentKind::Cursor,
        AgentKind::Opencode,
        AgentKind::Reason,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            AgentKind::Claude => "claude",
            AgentKind::Codex => "codex",
            AgentKind::Cursor => "cursor",
            AgentKind::Opencode => "opencode",
            AgentKind::Reason => "reason",
        }
    }

    /// Environment variables that decide where this agent sends requests or
    /// how it authenticates. Every provider for the agent clears these
    /// before setting its own, so the user's shell cannot override settings.
    pub fn routing_vars(self) -> &'static [&'static str] {
        match self {
            AgentKind::Claude => &[
                vars::ANTHROPIC_API_KEY,
                vars::ANTHROPIC_AUTH_TOKEN,
                vars::ANTHROPIC_BASE_URL,
                vars::CLAUDE_CODE_USE_BEDROCK,
                vars::CLAUDE_CODE_USE_VERTEX,
                vars::CLAUDE_CODE_USE_FOUNDRY,
                vars::AWS_BEARER_TOKEN_BEDROCK,
                vars::ANTHROPIC_VERTEX_PROJECT_ID,
                vars::CLOUD_ML_REGION,
                vars::ANTHROPIC_FOUNDRY_API_KEY,
                vars::ANTHROPIC_FOUNDRY_RESOURCE,
                vars::ANTHROPIC_FOUNDRY_BASE_URL,
                vars::ANTHROPIC_DEFAULT_OPUS_MODEL,
                vars::ANTHROPIC_DEFAULT_SONNET_MODEL,
                vars::ANTHROPIC_DEFAULT_HAIKU_MODEL,
            ],
            AgentKind::Codex => &[
                vars::OPENAI_API_KEY,
                vars::CODEX_API_KEY,
                vars::OPENAI_BASE_URL,
                vars::OPENAI_ORGANIZATION,
                vars::OPENAI_PROJECT,
            ],
            AgentKind::Cursor => &[vars::CURSOR_API_KEY],
            AgentKind::Opencode => &[],
            AgentKind::Reason => &[vars::REASON_API_KEY],
        }
    }
}

impl fmt::Display for AgentKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Environment variable names read by the agent CLIs.
pub mod vars {
    pub const ANTHROPIC_API_KEY: &str = "ANTHROPIC_API_KEY";
    pub const ANTHROPIC_AUTH_TOKEN: &str = "ANTHROPIC_AUTH_TOKEN";
    pub const ANTHROPIC_BASE_URL: &str = "ANTHROPIC_BASE_URL";
    pub const CLAUDE_CODE_USE_BEDROCK: &str = "CLAUDE_CODE_USE_BEDROCK";
    pub const CLAUDE_CODE_USE_VERTEX: &str = "CLAUDE_CODE_USE_VERTEX";
    pub const CLAUDE_CODE_USE_FOUNDRY: &str = "CLAUDE_CODE_USE_FOUNDRY";
    pub const AWS_REGION: &str = "AWS_REGION";
    pub const AWS_PROFILE: &str = "AWS_PROFILE";
    pub const AWS_BEARER_TOKEN_BEDROCK: &str = "AWS_BEARER_TOKEN_BEDROCK";
    pub const ANTHROPIC_VERTEX_PROJECT_ID: &str = "ANTHROPIC_VERTEX_PROJECT_ID";
    pub const CLOUD_ML_REGION: &str = "CLOUD_ML_REGION";
    pub const ANTHROPIC_FOUNDRY_API_KEY: &str = "ANTHROPIC_FOUNDRY_API_KEY";
    pub const ANTHROPIC_FOUNDRY_RESOURCE: &str = "ANTHROPIC_FOUNDRY_RESOURCE";
    pub const ANTHROPIC_FOUNDRY_BASE_URL: &str = "ANTHROPIC_FOUNDRY_BASE_URL";
    pub const ANTHROPIC_DEFAULT_OPUS_MODEL: &str = "ANTHROPIC_DEFAULT_OPUS_MODEL";
    pub const ANTHROPIC_DEFAULT_SONNET_MODEL: &str = "ANTHROPIC_DEFAULT_SONNET_MODEL";
    pub const ANTHROPIC_DEFAULT_HAIKU_MODEL: &str = "ANTHROPIC_DEFAULT_HAIKU_MODEL";
    pub const GOOGLE_APPLICATION_CREDENTIALS: &str = "GOOGLE_APPLICATION_CREDENTIALS";
    pub const OPENAI_API_KEY: &str = "OPENAI_API_KEY";
    pub const CODEX_API_KEY: &str = "CODEX_API_KEY";
    pub const OPENAI_BASE_URL: &str = "OPENAI_BASE_URL";
    pub const OPENAI_ORGANIZATION: &str = "OPENAI_ORGANIZATION";
    pub const OPENAI_PROJECT: &str = "OPENAI_PROJECT";
    pub const CURSOR_API_KEY: &str = "CURSOR_API_KEY";
    pub const REASON_API_KEY: &str = "REASON_API_KEY";
}

/// One environment value for an agent process.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EnvValue {
    Plain(String),
    Secret(SecretString),
}

impl EnvValue {
    pub fn expose(&self) -> &str {
        match self {
            EnvValue::Plain(v) => v,
            EnvValue::Secret(s) => s.expose(),
        }
    }

    pub fn is_secret(&self) -> bool {
        matches!(self, EnvValue::Secret(_))
    }
}

/// Environment changes for one agent launch. A variable is either set or
/// removed, never both: setting a variable cancels an earlier removal.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LaunchEnv {
    set: BTreeMap<String, EnvValue>,
    remove: BTreeSet<String>,
}

impl LaunchEnv {
    pub fn new() -> Self {
        Self::default()
    }

    /// Clears every routing variable of `agent`.
    pub fn cleared_for(agent: AgentKind) -> Self {
        let mut env = Self::new();
        for var in agent.routing_vars() {
            env.remove(var);
        }
        env
    }

    pub fn set(&mut self, name: &str, value: impl Into<String>) {
        self.remove.remove(name);
        self.set
            .insert(name.to_owned(), EnvValue::Plain(value.into()));
    }

    pub fn set_secret(&mut self, name: &str, value: SecretString) {
        self.remove.remove(name);
        self.set.insert(name.to_owned(), EnvValue::Secret(value));
    }

    pub fn remove(&mut self, name: &str) {
        self.set.remove(name);
        self.remove.insert(name.to_owned());
    }

    pub fn get(&self, name: &str) -> Option<&EnvValue> {
        self.set.get(name)
    }

    pub fn is_removed(&self, name: &str) -> bool {
        self.remove.contains(name)
    }

    pub fn set_vars(&self) -> impl Iterator<Item = (&str, &EnvValue)> {
        self.set.iter().map(|(k, v)| (k.as_str(), v))
    }

    pub fn removed_vars(&self) -> impl Iterator<Item = &str> {
        self.remove.iter().map(String::as_str)
    }

    /// Applies removals then assignments to a command about to be spawned.
    pub fn apply(&self, cmd: &mut Command) {
        for name in &self.remove {
            cmd.env_remove(name);
        }
        for (name, value) in &self.set {
            cmd.env(name, value.expose());
        }
    }

    /// `NAME=value` lines safe for logs: secret values are replaced.
    pub fn redacted(&self) -> Vec<String> {
        let mut out: Vec<String> = self
            .set
            .iter()
            .map(|(k, v)| match v {
                EnvValue::Plain(p) => format!("{k}={p}"),
                EnvValue::Secret(_) => format!("{k}=<redacted>"),
            })
            .collect();
        out.extend(self.remove.iter().map(|k| format!("-{k}")));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_cancels_remove_and_remove_cancels_set() {
        let mut e = LaunchEnv::new();
        e.remove("A");
        e.set("A", "1");
        assert!(!e.is_removed("A"));
        e.remove("A");
        assert!(e.get("A").is_none());
        assert!(e.is_removed("A"));
    }

    #[test]
    fn cleared_for_removes_every_routing_var() {
        for agent in AgentKind::ALL {
            let e = LaunchEnv::cleared_for(agent);
            assert_eq!(e.set_vars().count(), 0);
            assert_eq!(e.removed_vars().count(), agent.routing_vars().len());
        }
        assert!(LaunchEnv::cleared_for(AgentKind::Claude).is_removed(vars::CLAUDE_CODE_USE_FOUNDRY));
    }

    #[test]
    fn redaction_hides_secret_values() {
        let mut e = LaunchEnv::new();
        e.set("REGION", "us");
        e.set_secret("TOKEN", SecretString::new("hunter2-secret"));
        e.remove("OLD");
        assert_eq!(e.redacted(), vec!["REGION=us", "TOKEN=<redacted>", "-OLD"]);
        assert!(!format!("{e:?}").contains("hunter2"));
    }

    #[test]
    fn applied_env_replaces_inherited_values() {
        let mut e = LaunchEnv::cleared_for(AgentKind::Claude);
        e.set_secret(vars::ANTHROPIC_API_KEY, SecretString::new("from-settings"));
        let mut cmd = std::process::Command::new("sh");
        cmd.arg("-c")
            .arg("printf '%s|%s' \"${ANTHROPIC_API_KEY-unset}\" \"${ANTHROPIC_BASE_URL-unset}\"");
        // Stand-ins for variables inherited from the user's login shell.
        cmd.env("ANTHROPIC_API_KEY", "stale-shell-key")
            .env("ANTHROPIC_BASE_URL", "https://stale.example");
        e.apply(&mut cmd);
        let out = cmd.output().unwrap();
        assert!(out.status.success());
        assert_eq!(out.stdout, b"from-settings|unset");
    }

    #[test]
    fn agent_kind_serializes_lowercase() {
        for agent in AgentKind::ALL {
            let json = serde_json::to_string(&agent).unwrap();
            assert_eq!(json, format!("\"{}\"", agent.as_str()));
        }
    }
}
