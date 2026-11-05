//! Claude Code on cloud model platforms: Amazon Bedrock, Google Vertex AI
//! and Microsoft Foundry. Variable names are Claude Code's documented
//! configuration; which platforms exist is in `evidence/providers/README.md`.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::claude::ModelOverrides;
use super::env::{vars, AgentKind, LaunchEnv};
use super::provider::{
    check_nonempty, check_optional_url, require_secret, Provider, ProviderError,
};
use super::secret::{keys, SecretStore};

/// How Claude Code authenticates to Amazon Bedrock.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", rename_all = "snake_case")]
pub enum BedrockAuth {
    /// The AWS SDK default chain (environment, SSO cache, instance role).
    #[default]
    DefaultChain,
    /// A named profile from the user's AWS config.
    Profile { name: String },
    /// A Bedrock API key, kept in the secret store.
    ApiKey,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bedrock {
    pub region: String,
    #[serde(default)]
    pub auth: BedrockAuth,
    #[serde(default, skip_serializing_if = "ModelOverrides::is_empty")]
    pub models: ModelOverrides,
}

impl Provider for Bedrock {
    fn agent(&self) -> AgentKind {
        AgentKind::Claude
    }
    fn kind(&self) -> &'static str {
        "bedrock"
    }
    fn secret_keys(&self) -> Vec<&'static str> {
        match self.auth {
            BedrockAuth::ApiKey => vec![keys::BEDROCK_API_KEY],
            _ => Vec::new(),
        }
    }
    fn check_options(&self) -> Result<(), ProviderError> {
        check_nonempty("region", &self.region)?;
        if let BedrockAuth::Profile { name } = &self.auth {
            check_nonempty("profile", name)?;
        }
        self.models.check()
    }
    fn launch_env(&self, store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        self.check_options()?;
        let mut env = LaunchEnv::cleared_for(AgentKind::Claude);
        env.set(vars::CLAUDE_CODE_USE_BEDROCK, "1");
        env.set(vars::AWS_REGION, self.region.clone());
        match &self.auth {
            BedrockAuth::DefaultChain => {}
            BedrockAuth::Profile { name } => env.set(vars::AWS_PROFILE, name.clone()),
            BedrockAuth::ApiKey => env.set_secret(
                vars::AWS_BEARER_TOKEN_BEDROCK,
                require_secret(store, keys::BEDROCK_API_KEY)?,
            ),
        }
        self.models.apply(&mut env);
        Ok(env)
    }
}

/// Claude Code against Google Vertex AI.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Vertex {
    pub project_id: String,
    pub region: String,
    /// Service account key file; Application Default Credentials when unset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credentials_file: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "ModelOverrides::is_empty")]
    pub models: ModelOverrides,
}

impl Provider for Vertex {
    fn agent(&self) -> AgentKind {
        AgentKind::Claude
    }
    fn kind(&self) -> &'static str {
        "vertex"
    }
    fn secret_keys(&self) -> Vec<&'static str> {
        Vec::new()
    }
    fn check_options(&self) -> Result<(), ProviderError> {
        check_nonempty("project_id", &self.project_id)?;
        check_nonempty("region", &self.region)?;
        if let Some(path) = &self.credentials_file {
            if !path.is_absolute() {
                return Err(ProviderError::InvalidOption {
                    field: "credentials_file",
                    reason: "must be an absolute path".to_owned(),
                });
            }
        }
        self.models.check()
    }
    fn launch_env(&self, _store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        self.check_options()?;
        let mut env = LaunchEnv::cleared_for(AgentKind::Claude);
        env.set(vars::CLAUDE_CODE_USE_VERTEX, "1");
        env.set(vars::ANTHROPIC_VERTEX_PROJECT_ID, self.project_id.clone());
        env.set(vars::CLOUD_ML_REGION, self.region.clone());
        if let Some(path) = &self.credentials_file {
            env.set(
                vars::GOOGLE_APPLICATION_CREDENTIALS,
                path.to_string_lossy().into_owned(),
            );
        }
        self.models.apply(&mut env);
        Ok(env)
    }
}

/// Where a Foundry deployment lives: a resource name, or a full endpoint.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FoundryEndpoint {
    Resource(String),
    BaseUrl(String),
}

/// Claude Code against Microsoft Foundry. Authenticates with a Foundry API
/// key when `api_key` is set, otherwise with the Azure default credential.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Foundry {
    pub endpoint: FoundryEndpoint,
    #[serde(default)]
    pub api_key: bool,
    #[serde(default, skip_serializing_if = "ModelOverrides::is_empty")]
    pub models: ModelOverrides,
}

impl Provider for Foundry {
    fn agent(&self) -> AgentKind {
        AgentKind::Claude
    }
    fn kind(&self) -> &'static str {
        "foundry"
    }
    fn secret_keys(&self) -> Vec<&'static str> {
        if self.api_key {
            vec![keys::FOUNDRY_API_KEY]
        } else {
            Vec::new()
        }
    }
    fn check_options(&self) -> Result<(), ProviderError> {
        match &self.endpoint {
            FoundryEndpoint::Resource(r) => check_nonempty("endpoint.resource", r)?,
            FoundryEndpoint::BaseUrl(u) => {
                check_optional_url("endpoint.base_url", &Some(u.clone()))?
            }
        }
        self.models.check()
    }
    fn launch_env(&self, store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        self.check_options()?;
        let mut env = LaunchEnv::cleared_for(AgentKind::Claude);
        env.set(vars::CLAUDE_CODE_USE_FOUNDRY, "1");
        match &self.endpoint {
            FoundryEndpoint::Resource(r) => env.set(vars::ANTHROPIC_FOUNDRY_RESOURCE, r.clone()),
            FoundryEndpoint::BaseUrl(u) => env.set(vars::ANTHROPIC_FOUNDRY_BASE_URL, u.clone()),
        }
        if self.api_key {
            env.set_secret(
                vars::ANTHROPIC_FOUNDRY_API_KEY,
                require_secret(store, keys::FOUNDRY_API_KEY)?,
            );
        }
        self.models.apply(&mut env);
        Ok(env)
    }
}

#[cfg(test)]
mod tests {
    use super::super::claude::testutil::*;
    use super::super::secret::MemorySecretStore;
    use super::*;

    #[test]
    fn bedrock_auth_methods() {
        let store = MemorySecretStore::with(&[(keys::BEDROCK_API_KEY, "bedrock-key")]);
        let mut p = Bedrock {
            region: "eu-west-1".into(),
            ..Default::default()
        };
        let env = p.launch_env(&store).unwrap();
        assert_eq!(plain(&env, vars::CLAUDE_CODE_USE_BEDROCK), Some("1"));
        assert_eq!(plain(&env, vars::AWS_REGION), Some("eu-west-1"));
        assert!(env.get(vars::AWS_PROFILE).is_none());
        assert!(p.secret_keys().is_empty());
        assert_clears_all(&env);

        p.auth = BedrockAuth::Profile {
            name: "work".into(),
        };
        assert_eq!(
            plain(&p.launch_env(&store).unwrap(), vars::AWS_PROFILE),
            Some("work")
        );

        p.auth = BedrockAuth::ApiKey;
        assert_eq!(p.secret_keys(), vec![keys::BEDROCK_API_KEY]);
        let env = p.launch_env(&store).unwrap();
        assert_eq!(
            secret(&env, vars::AWS_BEARER_TOKEN_BEDROCK),
            Some("bedrock-key")
        );

        p.region = " ".into();
        assert!(matches!(
            p.check_options(),
            Err(ProviderError::InvalidOption {
                field: "region",
                ..
            })
        ));
    }

    #[test]
    fn vertex_needs_project_region_and_absolute_credentials() {
        let mut p = Vertex {
            project_id: "my-proj".into(),
            region: "us-east5".into(),
            ..Default::default()
        };
        let env = p.launch_env(&MemorySecretStore::new()).unwrap();
        assert_eq!(plain(&env, vars::CLAUDE_CODE_USE_VERTEX), Some("1"));
        assert_eq!(
            plain(&env, vars::ANTHROPIC_VERTEX_PROJECT_ID),
            Some("my-proj")
        );
        assert_eq!(plain(&env, vars::CLOUD_ML_REGION), Some("us-east5"));
        assert!(env.get(vars::GOOGLE_APPLICATION_CREDENTIALS).is_none());

        p.credentials_file = Some(PathBuf::from("keys/sa.json"));
        assert!(matches!(
            p.check_options(),
            Err(ProviderError::InvalidOption {
                field: "credentials_file",
                ..
            })
        ));
        p.credentials_file = Some(PathBuf::from("/abs/sa.json"));
        let env = p.launch_env(&MemorySecretStore::new()).unwrap();
        assert_eq!(
            plain(&env, vars::GOOGLE_APPLICATION_CREDENTIALS),
            Some("/abs/sa.json")
        );
        p.project_id.clear();
        assert!(p.check_options().is_err());
    }

    #[test]
    fn foundry_resource_or_url_with_optional_key() {
        let store = MemorySecretStore::with(&[(keys::FOUNDRY_API_KEY, "fk")]);
        let mut p = Foundry {
            endpoint: FoundryEndpoint::Resource("my-res".into()),
            api_key: false,
            models: ModelOverrides::default(),
        };
        let env = p.launch_env(&MemorySecretStore::new()).unwrap();
        assert_eq!(plain(&env, vars::CLAUDE_CODE_USE_FOUNDRY), Some("1"));
        assert_eq!(
            plain(&env, vars::ANTHROPIC_FOUNDRY_RESOURCE),
            Some("my-res")
        );
        assert!(env.is_removed(vars::ANTHROPIC_FOUNDRY_API_KEY));
        assert_clears_all(&env);

        p.endpoint = FoundryEndpoint::BaseUrl("https://my-res.services.ai.azure.com".into());
        p.api_key = true;
        let env = p.launch_env(&store).unwrap();
        assert!(env.is_removed(vars::ANTHROPIC_FOUNDRY_RESOURCE));
        assert_eq!(secret(&env, vars::ANTHROPIC_FOUNDRY_API_KEY), Some("fk"));
        assert_eq!(
            p.validate(&MemorySecretStore::new()),
            Err(ProviderError::MissingSecret {
                key: keys::FOUNDRY_API_KEY
            })
        );
        p.endpoint = FoundryEndpoint::BaseUrl("my-res".into());
        assert!(p.check_options().is_err());
    }

    #[test]
    fn options_round_trip_and_reject_unknown_fields() {
        let p = Bedrock {
            region: "us-east-1".into(),
            auth: BedrockAuth::Profile { name: "dev".into() },
            models: ModelOverrides {
                opus: Some("arn:x".into()),
                ..Default::default()
            },
        };
        let json = serde_json::to_string(&p).unwrap();
        assert_eq!(
            json,
            r#"{"region":"us-east-1","auth":{"method":"profile","name":"dev"},"models":{"opus":"arn:x"}}"#
        );
        assert_eq!(serde_json::from_str::<Bedrock>(&json).unwrap(), p);
        assert!(
            serde_json::from_str::<Vertex>(r#"{"project_id":"p","region":"r","x":1}"#).is_err()
        );
    }
}
