//! Reading settings files from disk and git.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::{resolve, ConfigError, Layer, LayerSource, ResolvedScripts};

/// Directory, under the repository root and the home directory, that holds
/// settings files. Kept as the reference app's name so existing repository
/// settings work unchanged.
pub const SETTINGS_DIR: &str = ".conductor";

/// Where the repository shared `settings.toml` is read from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SharedSource {
    /// The repository root's working tree.
    WorkingTree,
    /// A git revision, normally `origin/<default branch>` (the reference
    /// reads shared settings from the remote default branch). Falls back to
    /// the working tree, with a warning, when the revision does not resolve.
    GitRef(String),
}

/// Where to look for settings files.
#[derive(Debug, Clone)]
pub struct SettingsPaths {
    /// `~/.conductor`: user and managed settings, legacy home `conductor.json`.
    pub user_dir: PathBuf,
    /// The repository's main checkout.
    pub repo_root: PathBuf,
    /// The workspace whose legacy `conductor.json` is read, if any.
    pub workspace: Option<PathBuf>,
    pub shared_from: SharedSource,
}

impl SettingsPaths {
    /// `~/.conductor` for the current user, if `HOME` is set.
    pub fn default_user_dir() -> Option<PathBuf> {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join(SETTINGS_DIR))
    }
}

/// Every settings file that exists, plus warnings. A file that exists but
/// does not parse is an error.
pub fn load_layers(paths: &SettingsPaths) -> Result<(Vec<LayerSource>, Vec<String>), ConfigError> {
    let mut layers = Vec::new();
    let mut warnings = Vec::new();
    let user = &paths.user_dir;
    let repo = paths.repo_root.join(SETTINGS_DIR);
    let files = [
        (Layer::User, user.join("settings.json")),
        (Layer::User, user.join("settings.toml")),
        (Layer::RepoLocal, repo.join("settings.local.json")),
        (Layer::RepoLocal, repo.join("settings.local.toml")),
        (Layer::Managed, user.join("settings.managed.json")),
        (Layer::Managed, user.join("settings.managed.toml")),
    ];
    for (layer, path) in files {
        if let Some(text) = read_optional(&path)? {
            layers.push(parse_by_extension(
                layer,
                &path.display().to_string(),
                &text,
            )?);
        }
    }
    for rel in [".conductor/settings.json", ".conductor/settings.toml"] {
        if let Some((origin, text)) = read_shared(paths, rel, &mut warnings)? {
            layers.push(parse_by_extension(Layer::RepoShared, &origin, &text)?);
        }
    }
    if !repo.join("settings.toml").exists() {
        let legacy = [
            (
                Layer::RepoShared,
                paths.workspace.as_ref().map(|w| w.join("conductor.json")),
            ),
            (Layer::User, Some(user.join("conductor.json"))),
        ];
        for (layer, path) in legacy {
            let Some(path) = path else { continue };
            if let Some(text) = read_optional(&path)? {
                layers.push(LayerSource::from_conductor_json(
                    layer,
                    path.display().to_string(),
                    &text,
                )?);
            }
        }
    }
    Ok((layers, warnings))
}

/// [`load_layers`] then [`resolve`].
pub fn load(paths: &SettingsPaths) -> Result<ResolvedScripts, ConfigError> {
    let (layers, warnings) = load_layers(paths)?;
    let mut resolved = resolve(&layers);
    resolved.warnings.splice(0..0, warnings);
    Ok(resolved)
}

fn parse_by_extension(layer: Layer, origin: &str, text: &str) -> Result<LayerSource, ConfigError> {
    if origin.ends_with(".json") {
        LayerSource::from_json(layer, origin, text)
    } else {
        LayerSource::from_toml(layer, origin, text)
    }
}

pub(super) fn read_optional(path: &Path) -> Result<Option<String>, ConfigError> {
    match fs::read_to_string(path) {
        Ok(t) => Ok(Some(t)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(ConfigError::Io {
            origin: path.display().to_string(),
            message: e.to_string(),
        }),
    }
}

/// A repository-relative file from the shared source, as (origin, text).
fn read_shared(
    paths: &SettingsPaths,
    rel: &str,
    warnings: &mut Vec<String>,
) -> Result<Option<(String, String)>, ConfigError> {
    if let SharedSource::GitRef(rev) = &paths.shared_from {
        let verify = format!("{rev}^{{commit}}");
        if git(
            &paths.repo_root,
            &["rev-parse", "--verify", "--quiet", &verify],
        )?
        .0
        {
            let spec = format!("{rev}:{rel}");
            if !git(&paths.repo_root, &["cat-file", "-e", &spec])?.0 {
                return Ok(None);
            }
            let (ok, out) = git(&paths.repo_root, &["cat-file", "blob", &spec])?;
            if !ok {
                return Err(ConfigError::Git {
                    message: format!("cannot read {spec}"),
                });
            }
            let text = String::from_utf8(out).map_err(|_| ConfigError::Parse {
                origin: spec.clone(),
                message: "not UTF-8".into(),
            })?;
            return Ok(Some((spec, text)));
        }
        let warning = format!("shared settings: {rev} does not resolve, reading the working tree");
        if !warnings.contains(&warning) {
            warnings.push(warning);
        }
    }
    let path = paths.repo_root.join(rel);
    Ok(read_optional(&path)?.map(|t| (path.display().to_string(), t)))
}

/// Run git in `repo`, returning (success, stdout).
fn git(repo: &Path, args: &[&str]) -> Result<(bool, Vec<u8>), ConfigError> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo).args(args);
    for var in ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"] {
        cmd.env_remove(var);
    }
    let out = cmd.output().map_err(|e| ConfigError::Git {
        message: e.to_string(),
    })?;
    Ok((out.status.success(), out.stdout))
}
