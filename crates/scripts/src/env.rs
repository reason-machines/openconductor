//! Environment variables given to setup, run and archive scripts.
//!
//! Names keep the reference app's `CONDUCTOR_` prefix so existing repository
//! settings (`pnpm dev --port $CONDUCTOR_PORT`) keep working. Which variable
//! each script kind gets is recorded in `evidence/run-scripts/NOTES.md`
//! ("Environment").

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Branch reported when a workspace has no intended target branch.
pub const DEFAULT_TARGET_BRANCH: &str = "main";

/// Which script an environment is built for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScriptKind {
    Setup,
    Run,
    Archive,
}

/// What a script needs to know about its workspace.
#[derive(Debug, Clone)]
pub struct WorkspaceContext {
    pub workspace_id: String,
    pub workspace_name: String,
    pub workspace_path: PathBuf,
    /// The repository's main checkout.
    pub root_path: PathBuf,
    /// Branch the workspace will merge into; `None` reports `main`.
    pub target_branch: Option<String>,
    /// First port of the workspace's block (see [`crate::ports`]).
    pub port: u16,
    pub user_id: Option<String>,
    /// Directory of helper binaries prepended for scripts, if any.
    pub path_prefix: Option<PathBuf>,
}

/// The `CONDUCTOR_*` variables for `kind`, plus the repository's shared
/// environment variables. Shared variables never override `CONDUCTOR_*`.
pub fn script_env(
    ctx: &WorkspaceContext,
    kind: ScriptKind,
    shared: &BTreeMap<String, String>,
) -> BTreeMap<String, String> {
    let mut env = shared.clone();
    let mut set = |k: &str, v: String| {
        env.insert(k.to_string(), v);
    };
    set("CONDUCTOR_WORKSPACE_NAME", ctx.workspace_name.clone());
    set("CONDUCTOR_WORKSPACE_PATH", path_string(&ctx.workspace_path));
    set("CONDUCTOR_ROOT_PATH", path_string(&ctx.root_path));
    set(
        "CONDUCTOR_DEFAULT_BRANCH",
        ctx.target_branch
            .clone()
            .unwrap_or_else(|| DEFAULT_TARGET_BRANCH.to_string()),
    );
    set("CONDUCTOR_PORT", ctx.port.to_string());
    set("CONDUCTOR_IS_LOCAL", "1".to_string());
    if let Some(user) = &ctx.user_id {
        set("CONDUCTOR_USER_ID", user.clone());
    }
    if let Some(prefix) = &ctx.path_prefix {
        set("CONDUCTOR_PATH_PREFIX", path_string(prefix));
    }
    // The reference setup env has no workspace id; run (and, by our choice,
    // archive) scripts get it.
    if kind != ScriptKind::Setup {
        set("CONDUCTOR_WORKSPACE_ID", ctx.workspace_id.clone());
    }
    env
}

/// The variables the Run tab's Open URLs may use, in the reference app's
/// order (`wE` in its index chunk), which is the order it replaces them in.
/// No shared settings variables, no workspace id or path prefix.
pub fn preview_env(ctx: &WorkspaceContext) -> Vec<(String, String)> {
    let mut env = vec![
        ("CONDUCTOR_WORKSPACE_NAME", ctx.workspace_name.clone()),
        ("CONDUCTOR_WORKSPACE_PATH", path_string(&ctx.workspace_path)),
        ("CONDUCTOR_ROOT_PATH", path_string(&ctx.root_path)),
        (
            "CONDUCTOR_DEFAULT_BRANCH",
            ctx.target_branch
                .clone()
                .unwrap_or_else(|| DEFAULT_TARGET_BRANCH.to_string()),
        ),
        ("CONDUCTOR_PORT", ctx.port.to_string()),
    ];
    if let Some(user) = &ctx.user_id {
        env.push(("CONDUCTOR_USER_ID", user.clone()));
    }
    env.push(("CONDUCTOR_IS_LOCAL", "1".to_string()));
    env.into_iter().map(|(k, v)| (k.to_string(), v)).collect()
}

/// Expand `$NAME` and `${NAME}` from `env`. Unknown names are left as
/// written, as is a `$` not followed by a name.
pub fn expand_vars(input: &str, env: &BTreeMap<String, String>) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(i) = rest.find('$') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        let (name, consumed) = if let Some(braced) = after.strip_prefix('{') {
            match braced.find('}') {
                Some(end) if end > 0 => (&braced[..end], end + 2),
                _ => ("", 0),
            }
        } else {
            let end = after
                .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
                .unwrap_or(after.len());
            (&after[..end], end)
        };
        match env.get(name) {
            Some(value) if !name.is_empty() => out.push_str(value),
            _ => out.push_str(&rest[i..i + 1 + consumed]),
        }
        rest = &after[consumed..];
    }
    out.push_str(rest);
    out
}

/// Working directory for a run script: the workspace, or its expanded
/// `options.cwd` (relative paths resolve against the workspace).
pub fn run_cwd(workspace: &Path, cwd: Option<&str>, env: &BTreeMap<String, String>) -> PathBuf {
    match cwd.map(|c| expand_vars(c, env)) {
        Some(c) if !c.is_empty() => workspace.join(c),
        _ => workspace.to_path_buf(),
    }
}

fn path_string(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> WorkspaceContext {
        WorkspaceContext {
            workspace_id: "ws-1".into(),
            workspace_name: "tokyo".into(),
            workspace_path: "/w/tokyo".into(),
            root_path: "/r/app".into(),
            target_branch: None,
            port: 55000,
            user_id: None,
            path_prefix: Some("/opt/oc/bin".into()),
        }
    }

    #[test]
    fn setup_env_has_no_workspace_id() {
        let env = script_env(&ctx(), ScriptKind::Setup, &BTreeMap::new());
        assert_eq!(env["CONDUCTOR_WORKSPACE_NAME"], "tokyo");
        assert_eq!(env["CONDUCTOR_WORKSPACE_PATH"], "/w/tokyo");
        assert_eq!(env["CONDUCTOR_ROOT_PATH"], "/r/app");
        assert_eq!(env["CONDUCTOR_DEFAULT_BRANCH"], "main");
        assert_eq!(env["CONDUCTOR_PORT"], "55000");
        assert_eq!(env["CONDUCTOR_IS_LOCAL"], "1");
        assert_eq!(env["CONDUCTOR_PATH_PREFIX"], "/opt/oc/bin");
        assert!(!env.contains_key("CONDUCTOR_WORKSPACE_ID"));
        assert!(!env.contains_key("CONDUCTOR_USER_ID"));
    }

    #[test]
    fn run_env_has_workspace_id_and_shared_vars_cannot_override() {
        let mut c = ctx();
        c.target_branch = Some("develop".into());
        c.user_id = Some("u1".into());
        let shared = BTreeMap::from([
            ("API_URL".to_string(), "http://x".to_string()),
            ("CONDUCTOR_PORT".to_string(), "1".to_string()),
        ]);
        let env = script_env(&c, ScriptKind::Run, &shared);
        assert_eq!(env["CONDUCTOR_WORKSPACE_ID"], "ws-1");
        assert_eq!(env["CONDUCTOR_DEFAULT_BRANCH"], "develop");
        assert_eq!(env["CONDUCTOR_USER_ID"], "u1");
        assert_eq!(env["API_URL"], "http://x");
        assert_eq!(env["CONDUCTOR_PORT"], "55000");
    }

    #[test]
    fn preview_env_is_ordered_and_has_only_preview_vars() {
        let mut c = ctx();
        c.user_id = Some("u1".into());
        let keys: Vec<String> = preview_env(&c).into_iter().map(|(k, _)| k).collect();
        assert_eq!(
            keys,
            [
                "CONDUCTOR_WORKSPACE_NAME",
                "CONDUCTOR_WORKSPACE_PATH",
                "CONDUCTOR_ROOT_PATH",
                "CONDUCTOR_DEFAULT_BRANCH",
                "CONDUCTOR_PORT",
                "CONDUCTOR_USER_ID",
                "CONDUCTOR_IS_LOCAL",
            ]
        );
        let env: BTreeMap<_, _> = preview_env(&ctx()).into_iter().collect();
        assert_eq!(env["CONDUCTOR_PORT"], "55000");
        assert_eq!(env["CONDUCTOR_DEFAULT_BRANCH"], "main");
        assert!(!env.contains_key("CONDUCTOR_USER_ID"));
    }

    #[test]
    fn expands_known_vars_and_keeps_unknown() {
        let env = BTreeMap::from([("A".to_string(), "x".to_string())]);
        assert_eq!(expand_vars("$A/${A}/b", &env), "x/x/b");
        assert_eq!(expand_vars("$B ${B} $ ${} ${A", &env), "$B ${B} $ ${} ${A");
        assert_eq!(expand_vars("pre$A_post", &env), "pre$A_post");
        assert_eq!(expand_vars("", &env), "");
    }

    #[test]
    fn run_cwd_resolves_against_workspace() {
        let env = BTreeMap::from([("SUB".to_string(), "web".to_string())]);
        let ws = Path::new("/w/tokyo");
        assert_eq!(run_cwd(ws, None, &env), PathBuf::from("/w/tokyo"));
        assert_eq!(
            run_cwd(ws, Some("apps/$SUB"), &env),
            PathBuf::from("/w/tokyo/apps/web")
        );
        assert_eq!(run_cwd(ws, Some("/abs"), &env), PathBuf::from("/abs"));
    }
}
