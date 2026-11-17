//! Local, selected-ref suggestions before a workspace exists. This is our
//! bounded adapter, not an observed implementation of Conductor's native IPC.
//! No provider, checkout, worktree, fetch or workspace creation is involved.

use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::Duration;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::agent_commands::{codex_commands, scan};
use crate::sidecar_stores::completions::{Skill, SlashCommand};
use crate::workspace::service::WorkspaceService;

const MAX_TREE_BYTES: usize = 8 * 1024 * 1024;
const MAX_ENTRIES: usize = 50_000;
const MAX_BLOB_BYTES: usize = 256 * 1024;
const MAX_METADATA_BYTES: usize = 8 * 1024 * 1024;
const MAX_METADATA_FILES: usize = 512;
// Retain existing paths rather than evict a skill a composer may still hold.
// At capacity, fail explicitly; never grow the private cache without bound.
const MAX_SNAPSHOTS: usize = 64;
const GIT_TIMEOUT: Duration = Duration::from_secs(10);
// Serialize publication/validation; readers never see a partial snapshot.
static CACHE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileEntry {
    pub name: String,
    /// Repository-relative selected-tree path, not a path into the checkout.
    pub path: String,
    pub is_directory: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Completions {
    pub files: Vec<FileEntry>,
    pub slash_commands: Vec<SlashCommand>,
    pub skills: Vec<Skill>,
}

/// IPC uses the exact keys `repositoryId`, `ref`, `agentType`.
#[tauri::command]
pub async fn pre_workspace_completions(
    app: AppHandle,
    repository_id: String,
    r#ref: String,
    agent_type: String,
) -> Result<Completions, String> {
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = app.state::<WorkspaceService>();
        complete(
            &service,
            &repository_id,
            &r#ref,
            &agent_type,
            &cache,
            std::env::var_os("HOME").as_deref().map(Path::new),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

fn complete(
    service: &WorkspaceService,
    repository_id: &str,
    reference: &str,
    agent_type: &str,
    cache: &Path,
    home: Option<&Path>,
) -> Result<Completions, String> {
    if !matches!(agent_type, "claude" | "codex" | "reason" | "acp") {
        return Err(format!("unknown agent type {agent_type:?}"));
    }
    validate_ref(reference)?;
    // Lookup only: never ensure/register a repository or fall back to cwd.
    let root = service
        .repository_root(repository_id)
        .map_err(|e| e.to_string())?;
    let repo = Repository::open(&root)?;
    let snapshot = repo.snapshot(reference)?;
    let files = snapshot.entries.iter().map(|e| e.file.clone()).collect();
    let (slash_commands, skills) = match agent_type {
        "claude" | "codex" => {
            let _guard = CACHE_LOCK
                .lock()
                .map_err(|_| "suggestions cache lock poisoned")?;
            let dir = snapshot.materialize(&repo, repository_id, cache)?;
            if agent_type == "claude" {
                (scan::claude_commands(&dir, home, &[]), Vec::new())
            } else {
                (codex_commands(), scan::codex_skills(&dir, home))
            }
        }
        // The existing Reason scan fallback has no local skill source. Do not
        // run `reason skills list` (or any provider) for a pre-workspace menu.
        _ => (Vec::new(), Vec::new()),
    };
    if skills.iter().any(|s| {
        s.name.is_empty()
            || s.name.contains(char::is_whitespace)
            || s.name.contains("](")
            || s.path.contains(char::is_whitespace)
            || s.path.contains(')')
    }) {
        return Err("skill cannot be represented by existing skill links".into());
    }
    repo.unchanged()?;
    let current = service
        .repository_root(repository_id)
        .map_err(|e| e.to_string())?;
    if current != root || canonical(&current)? != repo.root {
        return Err("repository registration changed while reading suggestions".into());
    }
    Ok(Completions {
        files,
        slash_commands,
        skills,
    })
}

fn validate_ref(reference: &str) -> Result<(), String> {
    // Accept HEAD, full object ids, local/remote branches and tags, but never
    // revision expressions, reflogs, options, control characters or traversal.
    if reference.is_empty()
        || reference.len() > 1024
        || reference.starts_with('-')
        || reference.starts_with('/')
        || reference.ends_with('/')
        || reference.ends_with('.')
        || reference.contains("..")
        || reference.contains("//")
        || reference.contains("@{")
        || reference
            .chars()
            .any(|c| c.is_control() || c.is_whitespace() || "~^:?*[\\".contains(c))
        || reference
            .split('/')
            .any(|c| c.starts_with('.') || c.ends_with(".lock"))
    {
        return Err("invalid suggestions ref".into());
    }
    Ok(())
}

fn canonical(path: &Path) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|e| format!("repository/cache path unavailable: {e}"))
}

#[derive(Debug, PartialEq, Eq)]
struct Identity {
    #[cfg(unix)]
    dev: u64,
    #[cfg(unix)]
    ino: u64,
}

fn identity(path: &Path) -> Result<Identity, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_dir() {
        return Err("repository directory unavailable".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Ok(Identity {
            dev: meta.dev(),
            ino: meta.ino(),
        })
    }
    #[cfg(not(unix))]
    {
        Ok(Identity {})
    }
}

/// Git's linked-worktree pointer files are bounded regular files, not links.
fn read_pointer(path: &Path) -> Result<Vec<u8>, String> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let file = options.open(path).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > 4096 {
        return Err("invalid git directory pointer".into());
    }
    let mut bytes = Vec::new();
    file.take(4097)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 4096 {
        return Err("oversized git directory pointer".into());
    }
    Ok(bytes)
}

struct Repository {
    root: PathBuf,
    git_dir: PathBuf,
    root_id: Identity,
    git_id: Identity,
    git_pointer: Option<Vec<u8>>,
    common: Option<(Vec<u8>, PathBuf, Identity)>,
    // Pin the git directory across rename/replacement. On Unix git runs from
    // this open git directory, not a newly discovered cwd or parent repo.
    git_handle: File,
}

impl Repository {
    fn open(root: &Path) -> Result<Self, String> {
        let root = canonical(root)?;
        let root_id = identity(&root)?;
        let marker = root.join(".git");
        let meta = fs::symlink_metadata(&marker).map_err(|e| e.to_string())?;
        if meta.file_type().is_symlink() {
            return Err("symlinked .git is not supported".into());
        }
        let git_pointer = if meta.is_dir() {
            None
        } else {
            Some(read_pointer(&marker)?)
        };
        let git_dir = if let Some(bytes) = &git_pointer {
            let text = std::str::from_utf8(bytes).map_err(|e| e.to_string())?;
            let path = text
                .trim_end()
                .strip_prefix("gitdir: ")
                .ok_or("invalid .git pointer")?;
            canonical(&root.join(path))?
        } else {
            canonical(&marker)?
        };
        let common = match fs::symlink_metadata(git_dir.join("commondir")) {
            Ok(_) => {
                let bytes = read_pointer(&git_dir.join("commondir"))?;
                let text = std::str::from_utf8(&bytes).map_err(|e| e.to_string())?;
                let path = canonical(&git_dir.join(text.trim_end()))?;
                let id = identity(&path)?;
                Some((bytes, path, id))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(e.to_string()),
        };
        let repo = Self {
            root_id,
            git_id: identity(&git_dir)?,
            git_handle: File::open(&git_dir).map_err(|e| e.to_string())?,
            root,
            git_dir,
            git_pointer,
            common,
        };
        // Explicit git-dir prevents discovery from falling back to a parent.
        let top = repo.git(&["rev-parse", "--show-toplevel"], 8192)?;
        if canonical(Path::new(
            std::str::from_utf8(&top)
                .map_err(|e| e.to_string())?
                .trim_end(),
        ))? != repo.root
        {
            return Err("registered repository root no longer matches git".into());
        }
        Ok(repo)
    }

    fn unchanged(&self) -> Result<(), String> {
        if identity(&self.root)? != self.root_id || identity(&self.git_dir)? != self.git_id {
            return Err("repository replaced while reading suggestions".into());
        }
        let marker = self.root.join(".git");
        if let Some(bytes) = &self.git_pointer {
            if read_pointer(&marker)? != *bytes {
                return Err("repository .git pointer changed".into());
            }
        } else {
            let meta = fs::symlink_metadata(&marker).map_err(|e| e.to_string())?;
            if meta.file_type().is_symlink() || canonical(&marker)? != self.git_dir {
                return Err("repository .git directory changed".into());
            }
        }
        let common_file = self.git_dir.join("commondir");
        if let Some((bytes, path, id)) = &self.common {
            if read_pointer(&common_file)? != *bytes || identity(path)? != *id {
                return Err("repository common directory changed".into());
            }
        } else if common_file.symlink_metadata().is_ok() {
            return Err("repository common directory changed".into());
        }
        Ok(())
    }

    fn git(&self, args: &[&str], limit: usize) -> Result<Vec<u8>, String> {
        self.unchanged()?;
        let mut cmd = Command::new("git");
        // No replace-ref interpretation, optional writes, lazy partial-clone
        // fetches, transport protocols, interactive helpers or inherited repo.
        for (key, _) in std::env::vars_os().filter(|(k, _)| k.to_string_lossy().starts_with("GIT_"))
        {
            cmd.env_remove(key);
        }
        if let Some((_, path, _)) = &self.common {
            cmd.env("GIT_COMMON_DIR", path);
        }
        cmd.args([
            "--no-optional-locks",
            "--no-replace-objects",
            "-c",
            "protocol.allow=never",
            "-c",
            "protocol.file.allow=never",
            "-c",
            "core.hooksPath=/dev/null",
            "--git-dir=.",
        ])
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_WORK_TREE", &self.root)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::fd::AsRawFd;
            use std::os::unix::process::CommandExt;
            let fd = self.git_handle.as_raw_fd();
            // SAFETY: fchdir is async-signal-safe. The directory fd remains
            // open until spawn returns; no allocation or locks in pre_exec.
            unsafe {
                cmd.pre_exec(move || {
                    if libc::fchdir(fd) == -1 {
                        return Err(std::io::Error::last_os_error());
                    }
                    Ok(())
                });
            }
        }
        #[cfg(not(unix))]
        {
            let _ = &self.git_handle;
            cmd.current_dir(&self.git_dir);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("cannot read local git: {e}"))?;
        let stdout = child.stdout.take().ok_or("git stdout unavailable")?;
        let (tx, rx) = mpsc::sync_channel(1);
        let reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let result = stdout
                .take(limit as u64 + 1)
                .read_to_end(&mut bytes)
                .map(|_| bytes);
            let _ = tx.send(result);
        });
        let read = rx.recv_timeout(GIT_TIMEOUT);
        if !matches!(&read, Ok(Ok(bytes)) if bytes.len() <= limit) {
            let _ = child.kill();
        }
        let status = child.wait().map_err(|e| e.to_string())?;
        let _ = reader.join();
        let bytes = read
            .map_err(|_| "local git suggestions read timed out")?
            .map_err(|e| e.to_string())?;
        if bytes.len() > limit {
            return Err("suggestions input exceeds size limit".into());
        }
        if !status.success() {
            return Err("selected ref or local git object is unavailable".into());
        }
        self.unchanged()?;
        Ok(bytes)
    }

    fn snapshot(&self, reference: &str) -> Result<Snapshot, String> {
        validate_ref(reference)?;
        // Exactly one mutable-ref read. All following tree/blob requests use
        // this immutable object identity (or blob oids returned by its tree).
        let bytes = self.git(
            &[
                "rev-parse",
                "--verify",
                "--end-of-options",
                &format!("{reference}^{{commit}}"),
            ],
            128,
        )?;
        let commit = std::str::from_utf8(&bytes)
            .map_err(|e| e.to_string())?
            .trim()
            .to_owned();
        if !object_id(&commit) {
            return Err("invalid commit identity".into());
        }
        let tree = self.git(
            &["ls-tree", "-r", "-t", "-l", "-z", "--full-tree", &commit],
            MAX_TREE_BYTES,
        )?;
        Ok(Snapshot {
            commit,
            entries: parse_tree(&tree)?,
        })
    }
}

fn object_id(s: &str) -> bool {
    matches!(s.len(), 40 | 64) && s.bytes().all(|b| b.is_ascii_hexdigit())
}

#[derive(Debug)]
struct Entry {
    file: FileEntry,
    oid: String,
    size: usize,
    executable: bool,
}
struct Snapshot {
    commit: String,
    entries: Vec<Entry>,
}

fn safe_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 4096
        && !path.contains('\\')
        && !path.chars().any(char::is_control)
        && path
            .split('/')
            .all(|c| !c.is_empty() && c != "." && c != ".." && !c.eq_ignore_ascii_case(".git"))
        && Path::new(path)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}

fn parse_tree(bytes: &[u8]) -> Result<Vec<Entry>, String> {
    let mut entries = Vec::new();
    for (count, record) in bytes
        .split(|b| *b == 0)
        .filter(|r| !r.is_empty())
        .enumerate()
    {
        if count >= MAX_ENTRIES {
            return Err("selected tree has too many entries".into());
        }
        let record =
            std::str::from_utf8(record).map_err(|_| "selected tree has a non-UTF-8 path")?;
        let (meta, path) = record.split_once('\t').ok_or("invalid tree entry")?;
        if !safe_path(path) {
            return Err("unsafe selected-tree path".into());
        }
        let cols: Vec<_> = meta.split_whitespace().collect();
        if cols.len() != 4 || !object_id(cols[2]) {
            return Err("invalid tree metadata".into());
        }
        let is_directory = match (cols[0], cols[1]) {
            ("040000", "tree") => true,
            ("100644" | "100755", "blob") => false,
            // Never follow/materialize symlinks or submodules.
            ("120000", "blob") | ("160000", "commit") => continue,
            _ => return Err("unsupported selected-tree mode".into()),
        };
        let size = if is_directory {
            0
        } else {
            cols[3].parse().map_err(|_| "invalid blob size")?
        };
        entries.push(Entry {
            file: FileEntry {
                name: path.rsplit('/').next().unwrap().into(),
                path: path.into(),
                is_directory,
            },
            oid: cols[2].into(),
            size,
            executable: cols[0] == "100755",
        });
    }
    entries.sort_by(|a, b| a.file.path.cmp(&b.file.path));
    Ok(entries)
}

/// The existing scanners' entrypoint files. Command recursion is limited
/// to three folders; only immediate skill packages have a SKILL.md entry.
fn metadata_path(path: &str) -> bool {
    if let Some(name) = path.strip_prefix(".claude/commands/") {
        return name.ends_with(".md") && name.split('/').count() <= 4;
    }
    [".claude/skills/", ".codex/skills/", ".agents/skills/"]
        .iter()
        .any(|prefix| {
            path.strip_prefix(prefix)
                .is_some_and(|s| s.split('/').count() == 2 && s.ends_with("/SKILL.md"))
        })
}

/// Root of an allowed skill package, including its trailing slash. Relative
/// script/reference resources must remain beside the selected SKILL.md, but
/// are never executed by this adapter. Git's executable bit is preserved
/// as owner-only 0700; regular files are owner-only 0600.
fn skill_root(path: &str) -> Option<&str> {
    for prefix in [".claude/skills/", ".codex/skills/", ".agents/skills/"] {
        if let Some(rest) = path.strip_prefix(prefix) {
            return rest.find('/').map(|i| &path[..prefix.len() + i + 1]);
        }
    }
    None
}

impl Snapshot {
    fn materialize(
        &self,
        repo: &Repository,
        repository_id: &str,
        cache: &Path,
    ) -> Result<PathBuf, String> {
        let skill_roots: HashSet<_> = self
            .entries
            .iter()
            .filter(|e| {
                !e.file.is_directory && metadata_path(&e.file.path) && e.file.name == "SKILL.md"
            })
            .filter_map(|e| skill_root(&e.file.path))
            .collect();
        let selected: Vec<_> = self
            .entries
            .iter()
            .filter(|e| {
                !e.file.is_directory
                    && (metadata_path(&e.file.path)
                        || skill_root(&e.file.path).is_some_and(|r| skill_roots.contains(r)))
            })
            .collect();
        if selected.len() > MAX_METADATA_FILES
            || selected.iter().any(|e| e.size > MAX_BLOB_BYTES)
            || selected.iter().map(|e| e.size as u64).sum::<u64>() > MAX_METADATA_BYTES as u64
        {
            return Err("selected command/skill metadata exceeds suggestions limits".into());
        }
        fs::create_dir_all(cache).map_err(|e| e.to_string())?;
        let base = canonical(cache)?.join("pre-workspace-v1");
        private_dir(&base)?;
        // No raw repository id/path/ref in cache names. Identity and commit
        // partition identical refs in different registrations/repositories.
        let key = format!(
            "{}\0{}\0{:?}\0{:?}\0{}",
            repository_id,
            repo.root.display(),
            repo.root_id,
            repo.git_id,
            self.commit
        );
        let dest = base.join(format!("{:x}", Sha256::digest(key.as_bytes())));
        let dest_text = dest.to_str().ok_or("non-UTF-8 suggestions cache path")?;
        if dest_text.chars().any(char::is_whitespace) || dest_text.contains(')') {
            return Err("suggestions cache path cannot be represented by skill links".into());
        }
        // Read bounded immutable blobs even on cache hits: verify persisted
        // bytes before handing a path to a scanner/provider on a later turn.
        let mut blobs = Vec::new();
        for entry in selected {
            let bytes = repo.git(&["cat-file", "blob", &entry.oid], MAX_BLOB_BYTES)?;
            if bytes.len() != entry.size {
                return Err("selected blob size changed".into());
            }
            blobs.push((entry.file.path.as_str(), bytes, entry.executable));
        }
        if dest.symlink_metadata().is_ok() {
            verify_cache(&dest, &blobs)?;
            return Ok(dest);
        }
        if fs::read_dir(&base)
            .map_err(|e| e.to_string())?
            .take(MAX_SNAPSHOTS)
            .count()
            >= MAX_SNAPSHOTS
        {
            return Err(
                "suggestions cache capacity reached; retained skill paths were preserved".into(),
            );
        }
        let stage = base.join(format!(".stage-{}", uuid::Uuid::new_v4()));
        private_dir(&stage)?;
        let result = (|| {
            for (relative, bytes, executable) in &blobs {
                let path = stage.join(relative);
                let mut parent = stage.clone();
                for component in Path::new(relative).parent().unwrap().components() {
                    parent.push(component);
                    private_dir(&parent)?;
                }
                let mut options = OpenOptions::new();
                options.write(true).create_new(true);
                #[cfg(unix)]
                {
                    use std::os::unix::fs::OpenOptionsExt;
                    options
                        .mode(if *executable { 0o700 } else { 0o600 })
                        .custom_flags(libc::O_NOFOLLOW);
                }
                let mut file = options.open(path).map_err(|e| e.to_string())?;
                file.write_all(bytes).map_err(|e| e.to_string())?;
            }
            fs::rename(&stage, &dest).map_err(|e| e.to_string())?;
            verify_cache(&dest, &blobs)?;
            Ok(dest)
        })();
        // Stage paths are our private random directory, never caller input.
        if stage.exists() {
            let _ = fs::remove_dir_all(stage);
        }
        result
    }
}

fn private_dir(path: &Path) -> Result<(), String> {
    let mut builder = fs::DirBuilder::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    match builder.create(path) {
        Ok(()) => (),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
        Err(e) => return Err(e.to_string()),
    }
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("unsafe suggestions cache directory".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.uid() != unsafe { libc::geteuid() } || meta.mode() & 0o077 != 0 {
            return Err("suggestions cache directory is not private".into());
        }
    }
    Ok(())
}

fn verify_cache(root: &Path, blobs: &[(&str, Vec<u8>, bool)]) -> Result<(), String> {
    private_dir(root)?;
    fn walk(
        root: &Path,
        dir: &Path,
        blobs: &[(&str, Vec<u8>, bool)],
        seen: &mut usize,
    ) -> Result<(), String> {
        for item in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let path = item.map_err(|e| e.to_string())?.path();
            let relative = path
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_str()
                .ok_or("invalid cache path")?;
            let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
            if meta.is_dir() {
                if !blobs
                    .iter()
                    .any(|(p, ..)| p.starts_with(&format!("{relative}/")))
                {
                    return Err("unexpected cache directory".into());
                }
                private_dir(&path)?;
                walk(root, &path, blobs, seen)?;
            } else {
                let expected = blobs
                    .iter()
                    .find(|(p, ..)| *p == relative)
                    .ok_or("unexpected cache file")?;
                if !meta.is_file()
                    || meta.file_type().is_symlink()
                    || meta.len() != expected.1.len() as u64
                {
                    return Err("unsafe suggestions cache file".into());
                }
                #[cfg(unix)]
                {
                    use std::os::unix::fs::MetadataExt;
                    if meta.uid() != unsafe { libc::geteuid() }
                        || meta.mode() & 0o777 != if expected.2 { 0o700 } else { 0o600 }
                        || meta.nlink() != 1
                    {
                        return Err("suggestions cache file is not private".into());
                    }
                }
                let mut opts = OpenOptions::new();
                opts.read(true);
                #[cfg(unix)]
                {
                    use std::os::unix::fs::OpenOptionsExt;
                    opts.custom_flags(libc::O_NOFOLLOW);
                }
                let mut bytes = Vec::new();
                opts.open(&path)
                    .map_err(|e| e.to_string())?
                    .take(MAX_BLOB_BYTES as u64 + 1)
                    .read_to_end(&mut bytes)
                    .map_err(|e| e.to_string())?;
                if bytes != expected.1 {
                    return Err("suggestions cache content mismatch".into());
                }
                *seen += 1;
            }
        }
        Ok(())
    }
    let mut seen = 0;
    walk(root, root, blobs, &mut seen)?;
    if seen != blobs.len() {
        return Err("incomplete suggestions cache".into());
    }
    Ok(())
}

#[cfg(test)]
#[path = "pre_workspace_completions/tests.rs"]
mod tests;
