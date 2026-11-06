//! Workspace checkpoints: snapshot a worktree's full state (HEAD, index and
//! working tree including untracked files) into a private git ref and
//! restore one.
//!
//! Behavior is recreated from the reference `checkpointer.sh` bundled with
//! the app we are rebuilding (see `evidence/checkpoint/NOTES.md` for what is
//! matched, what differs on purpose and what is unconfirmed). Summary:
//!
//! * `save` never touches HEAD, the index or files on disk. It writes the
//!   index tree, builds a "worktree tree" (index + every untracked file that
//!   is not ignored) through a throwaway index, and records both plus the
//!   HEAD oid in the message of a parentless commit whose tree is the
//!   worktree tree. The commit is pointed to by `refs/<namespace>/<id>`.
//! * `restore` moves HEAD back (mixed reset, only when needed), rewrites only
//!   the files that differ from the snapshot, removes untracked files that
//!   were not in it (ignored files are kept), then puts the index back.
//!   Restoring an already-matching state touches nothing.
//! * Saving is refused while a merge/rebase/cherry-pick/revert is running
//!   ([`CheckpointError::Busy`], reference exit 101) or the index has
//!   unresolved conflicts ([`CheckpointError::UnresolvedConflicts`], 102).
//!   Every operation refuses when the workspace path is not itself the
//!   repository toplevel ([`CheckpointError::RootMismatch`], 103).

mod busy;
mod git;

#[cfg(test)]
mod tests;

use std::ffi::OsString;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub use busy::{busy_state, BusyState};
use git::Git;

/// Ref namespace holding checkpoints; the same one the reference script
/// uses, so repositories checkpointed by either tool interoperate.
pub const REF_NAMESPACE: &str = "refs/conductor-checkpoints";

/// Directory under the worktree's git dir that holds temporary indexes.
const TMP_DIR_NAME: &str = "conductor-checkpoint-tmp";

/// Temp index dirs older than this whose owner process is gone are pruned.
const STALE_TMP_AGE: Duration = Duration::from_secs(60 * 60);

/// HEAD oid recorded for a repository without commits (unborn HEAD).
pub const ZERO_OID: &str = "0000000000000000000000000000000000000000";

/// Neutral identity for checkpoint commits, independent of user config.
const IDENTITY_NAME: &str = "Checkpointer";
const IDENTITY_EMAIL: &str = "checkpointer@noreply";

#[derive(Debug)]
pub enum CheckpointError {
    /// The workspace is not inside a git working tree.
    NotARepository(PathBuf),
    /// Reference exit 103: git resolves the toplevel to a different directory
    /// (usually an ancestor repo), so operating would touch the wrong tree.
    RootMismatch {
        root: PathBuf,
        workspace: PathBuf,
    },
    /// Reference exit 101: an operation is in progress; skip, not a failure.
    Busy(BusyState),
    /// Reference exit 102: the index has stage 1/2/3 entries.
    UnresolvedConflicts,
    AlreadyExists(String),
    NotFound(String),
    InvalidId(String),
    MissingMetadata(String),
    /// The checkpoint was saved before the first commit; restore unsupported.
    UnbornHead(String),
    Git {
        command: String,
        stderr: String,
    },
    Io(std::io::Error),
}

impl CheckpointError {
    /// The exit code the reference script uses for the same condition.
    pub fn reference_exit_code(&self) -> i32 {
        match self {
            CheckpointError::Busy(_) => 101,
            CheckpointError::UnresolvedConflicts => 102,
            CheckpointError::RootMismatch { .. } => 103,
            _ => 1,
        }
    }

    /// True for the "skipped, not an error" outcomes (101 and 102).
    pub fn is_skip(&self) -> bool {
        matches!(
            self,
            CheckpointError::Busy(_) | CheckpointError::UnresolvedConflicts
        )
    }
}

impl fmt::Display for CheckpointError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CheckpointError::NotARepository(p) => {
                write!(f, "not inside a git working tree: {}", p.display())
            }
            CheckpointError::RootMismatch { root, workspace } => write!(
                f,
                "repo root ({}) does not match working directory ({}); refusing to operate outside the workspace",
                root.display(),
                workspace.display()
            ),
            CheckpointError::Busy(state) => {
                write!(f, "skipped: git operation in progress ({})", state.as_str())
            }
            CheckpointError::UnresolvedConflicts => {
                write!(f, "skipped: index has unresolved conflicts")
            }
            CheckpointError::AlreadyExists(id) => {
                write!(f, "checkpoint '{id}' already exists (use force to overwrite)")
            }
            CheckpointError::NotFound(id) => write!(f, "checkpoint not found: {id}"),
            CheckpointError::InvalidId(id) => write!(f, "invalid checkpoint id: {id:?}"),
            CheckpointError::MissingMetadata(id) => {
                write!(f, "checkpoint is missing metadata (id: {id})")
            }
            CheckpointError::UnbornHead(id) => write!(
                f,
                "cannot restore {id}: checkpoint saved with unborn HEAD (no commits)"
            ),
            CheckpointError::Git { command, stderr } => write!(f, "{command} failed: {stderr}"),
            CheckpointError::Io(e) => write!(f, "io error: {e}"),
        }
    }
}

impl std::error::Error for CheckpointError {}

/// One saved checkpoint, parsed from its commit message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Checkpoint {
    pub id: String,
    /// The checkpoint commit (what the ref points at).
    pub commit: String,
    /// HEAD at save time; `None` when HEAD was unborn.
    pub head: Option<String>,
    /// Tree of the staged state at save time.
    pub index_tree: String,
    /// Tree of the full working tree (tracked + non-ignored untracked).
    pub worktree_tree: String,
    /// UTC timestamp, `YYYY-MM-DDTHH:MM:SSZ`.
    pub created: String,
    /// Worktree the checkpoint was taken in. Our addition; `None` for
    /// checkpoints written by the reference script.
    pub worktree: Option<PathBuf>,
}

#[derive(Debug, Clone, Default)]
pub struct SaveOptions {
    /// Checkpoint id; defaults to `cp-YYYYMMDDTHHMMSSZ` (UTC).
    pub id: Option<String>,
    /// Overwrite an existing checkpoint with the same id.
    pub force: bool,
}

fn ref_name(id: &str) -> String {
    format!("{REF_NAMESPACE}/{id}")
}

/// Resolve and validate the workspace root (reference `ensure_repo` +
/// `ensure_root_is_cwd`). Returns the canonical workspace path.
fn workspace_root(workspace: &Path) -> Result<PathBuf, CheckpointError> {
    let git = Git::new(workspace);
    let inside = git.output(["rev-parse", "--is-inside-work-tree"]);
    match inside {
        Ok(out) if out.success && out.stdout.trim() == "true" => {}
        _ => return Err(CheckpointError::NotARepository(workspace.to_path_buf())),
    }
    let root = PathBuf::from(git.run(["rev-parse", "--show-toplevel"])?);
    let phys_root = fs::canonicalize(&root).map_err(CheckpointError::Io)?;
    let phys_ws = fs::canonicalize(workspace).map_err(CheckpointError::Io)?;
    if phys_root != phys_ws {
        return Err(CheckpointError::RootMismatch {
            root: phys_root,
            workspace: phys_ws,
        });
    }
    Ok(phys_ws)
}

fn validate_id(root: &Path, id: &str) -> Result<(), CheckpointError> {
    if id.is_empty() || id.contains('/') {
        return Err(CheckpointError::InvalidId(id.to_string()));
    }
    let out = Git::new(root).output(["check-ref-format", &ref_name(id)])?;
    if !out.success {
        return Err(CheckpointError::InvalidId(id.to_string()));
    }
    Ok(())
}

/// Snapshot the workspace into `refs/<namespace>/<id>` without touching
/// HEAD, the index or any file. Returns the checkpoint id.
pub fn save(workspace: &Path, opts: &SaveOptions) -> Result<String, CheckpointError> {
    let root = workspace_root(workspace)?;
    let state = busy_state(&root)?;
    if state != BusyState::Clean {
        return Err(CheckpointError::Busy(state));
    }

    let now = SystemTime::now();
    let id = match &opts.id {
        Some(id) if !id.is_empty() => id.clone(),
        _ => format!("cp-{}", compact_utc(now)),
    };
    validate_id(&root, &id)?;
    let git = Git::new(&root);
    let reference = ref_name(&id);
    if git.verify(&reference)?.is_some() && !opts.force {
        return Err(CheckpointError::AlreadyExists(id));
    }

    let head_oid = git.verify("HEAD")?.unwrap_or_else(|| ZERO_OID.to_string());

    if busy::has_unmerged_entries(&root)? {
        return Err(CheckpointError::UnresolvedConflicts);
    }
    // Both trees come from a private copy of the real index: `write-tree`
    // takes `index.lock` on the index it reads, so running it on the real
    // index fails whenever another git process in this worktree holds the
    // lock (#435). Git replaces the index by rename, so the copy is a whole
    // index, and it keeps stat info, so `add -A` only rehashes changed files.
    // Tracked files that match .gitignore stay in the worktree tree (ignore
    // rules only apply to untracked paths).
    let tmp = TempIndexDir::create(&root, "chkpt-index")?;
    copy_real_index(&root, &tmp.index_path())?;
    let tmp_git = Git::new(&root).env("GIT_INDEX_FILE", tmp.index_path());
    let index_tree = tmp_git.run(["write-tree"])?;
    tmp_git.run(["add", "-A", "--", "."])?;
    let worktree_tree = tmp_git.run(["write-tree"])?;
    drop(tmp);

    let created = iso_utc(now);
    let mut msg = format!(
        "checkpoint:{id}\nhead {head_oid}\nindex-tree {index_tree}\nworktree-tree {worktree_tree}\ncreated {created}"
    );
    let root_str = root.to_string_lossy();
    if !root_str.contains('\n') {
        msg.push_str(&format!("\nworktree {root_str}"));
    }
    msg.push('\n');

    let commit = Git::new(&root)
        .env("GIT_AUTHOR_NAME", IDENTITY_NAME)
        .env("GIT_AUTHOR_EMAIL", IDENTITY_EMAIL)
        .env("GIT_AUTHOR_DATE", &created)
        .env("GIT_COMMITTER_NAME", IDENTITY_NAME)
        .env("GIT_COMMITTER_EMAIL", IDENTITY_EMAIL)
        .env("GIT_COMMITTER_DATE", &created)
        .stdin(msg)
        .run(["commit-tree", &worktree_tree])?;

    git.run(["update-ref", &reference, &commit])?;
    Ok(id)
}

/// Read one checkpoint's metadata.
pub fn get(workspace: &Path, id: &str) -> Result<Checkpoint, CheckpointError> {
    let root = workspace_root(workspace)?;
    let git = Git::new(&root);
    let commit = git
        .verify(&ref_name(id))?
        .ok_or_else(|| CheckpointError::NotFound(id.to_string()))?;
    parse_checkpoint(&git, id, &commit)
}

fn parse_checkpoint(git: &Git<'_>, id: &str, commit: &str) -> Result<Checkpoint, CheckpointError> {
    let raw = git.run(["cat-file", "commit", commit])?;
    // Same lookup as the reference get_meta: first line starting with
    // "<key> " anywhere in the object (headers included).
    let meta = |key: &str| -> Option<String> {
        let prefix = format!("{key} ");
        raw.lines()
            .find_map(|l| l.strip_prefix(prefix.as_str()).map(str::to_string))
    };
    let missing = || CheckpointError::MissingMetadata(id.to_string());
    let head = meta("head").filter(|h| !h.is_empty()).ok_or_else(missing)?;
    let index_tree = meta("index-tree")
        .filter(|t| !t.is_empty())
        .ok_or_else(missing)?;
    let worktree_tree = meta("worktree-tree")
        .filter(|t| !t.is_empty())
        .ok_or_else(missing)?;
    Ok(Checkpoint {
        id: id.to_string(),
        commit: commit.to_string(),
        head: if head == ZERO_OID { None } else { Some(head) },
        index_tree,
        worktree_tree,
        created: meta("created").unwrap_or_default(),
        worktree: meta("worktree").map(PathBuf::from),
    })
}

/// Make HEAD, the index and the working tree match checkpoint `id`.
///
/// Only files that differ are rewritten; untracked files absent from the
/// snapshot are removed (ignored files are kept). Works from a conflicted
/// index or a half-finished merge/cherry-pick/revert. The checkpoint may
/// have been taken in another worktree of the same repository.
pub fn restore(workspace: &Path, id: &str) -> Result<(), CheckpointError> {
    restore_keeping(workspace, id, &[])
}

/// [`restore`], except that each file in `keep` (relative to the workspace
/// root) is left as it is on disk, whatever the checkpoint holds for it: it
/// is never written and never removed, not even for a moment, so a reader
/// that looks at it during the restore sees its bytes (or its absence)
/// unchanged. The index still follows the checkpoint.
pub fn restore_keeping(workspace: &Path, id: &str, keep: &[&Path]) -> Result<(), CheckpointError> {
    let root = workspace_root(workspace)?;
    let git = Git::new(&root);
    let commit = git
        .verify(&ref_name(id))?
        .ok_or_else(|| CheckpointError::NotFound(id.to_string()))?;
    let cp = parse_checkpoint(&git, id, &commit)?;
    let head = cp
        .head
        .clone()
        .ok_or_else(|| CheckpointError::UnbornHead(id.to_string()))?;

    // 1) HEAD, via a mixed reset (soft refuses mid-merge; hard would touch
    //    files). Skipped in the steady state so a no-op restore adds no
    //    reflog entry.
    let needs_reset = git.verify("HEAD")?.as_deref() != Some(head.as_str())
        || busy::has_unmerged_entries(&root)?
        || git.verify("MERGE_HEAD")?.is_some()
        || git.verify("CHERRY_PICK_HEAD")?.is_some()
        || git.verify("REVERT_HEAD")?.is_some();
    if needs_reset {
        git.run(["reset", "-q", "--mixed", &head])?;
    }

    // 2) Snapshot the current files into the index with fresh stat info, then
    //    two-way merge to the saved worktree tree so only differing files are
    //    written; then drop untracked files/dirs that were not saved.
    //    A kept file is in neither the index nor the target tree, so the
    //    two-way merge does not touch it, and `clean` is told to skip it.
    git.run(["read-tree", "--reset", &head])?;
    git.run(["add", "-A", "--", "."])?;
    let target = if keep.is_empty() {
        cp.worktree_tree.clone()
    } else {
        forget_paths(&git, keep)?;
        let tmp = TempIndexDir::create(&root, "chkpt-keep")?;
        let tmp_git = Git::new(&root).env("GIT_INDEX_FILE", tmp.index_path());
        tmp_git.run(["read-tree", &cp.worktree_tree])?;
        forget_paths(&tmp_git, keep)?;
        tmp_git.run(["write-tree"])?
    };
    git.run(["read-tree", "--reset", "-u", &target])?;
    let mut clean: Vec<OsString> = vec!["clean".into(), "-fd".into()];
    for path in keep {
        clean.push("-e".into());
        clean.push(anchored_ignore_pattern(path).into());
    }
    git.run(clean)?;

    // 3) Put the staged state back without touching files and refresh stat
    //    info so later status/restore calls do not rehash everything.
    git.run(["read-tree", "--reset", &cp.index_tree])?;
    let _ = git.output(["update-index", "-q", "--refresh"]);
    Ok(())
}

/// Drop `paths` from the index `git` works on, without touching any file.
fn forget_paths(git: &Git<'_>, paths: &[&Path]) -> Result<(), CheckpointError> {
    let mut args: Vec<OsString> = vec!["update-index".into(), "--force-remove".into(), "--".into()];
    args.extend(paths.iter().map(|p| p.as_os_str().to_owned()));
    git.run(args).map(|_| ())
}

/// A gitignore pattern matching exactly `path` (relative to the root).
fn anchored_ignore_pattern(path: &Path) -> String {
    let mut pattern = String::from("/");
    for c in path.to_string_lossy().chars() {
        if matches!(c, '*' | '?' | '[' | '\\' | '!' | '#' | ' ') {
            pattern.push('\\');
        }
        pattern.push(c);
    }
    pattern
}

/// One side of `checkpointer diff`: a saved checkpoint or the current files.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiffSide<'a> {
    Checkpoint(&'a str),
    Current,
}

/// Resolve both sides of a checkpoint diff to git objects (reference
/// `checkpointer diff`): a checkpoint becomes its ref, `Current` a transient
/// tree of the full working tree (seeded from HEAD, honoring .gitignore).
/// Returns the workspace root and the two objects to pass to `git diff`.
pub fn diff_objects(
    workspace: &Path,
    left: &str,
    right: DiffSide<'_>,
) -> Result<(PathBuf, String, String), CheckpointError> {
    let root = workspace_root(workspace)?;
    let git = Git::new(&root);
    let resolve = |id: &str| -> Result<String, CheckpointError> {
        let reference = ref_name(id);
        match git.verify(&reference)? {
            Some(_) => Ok(reference),
            None => Err(CheckpointError::NotFound(id.to_string())),
        }
    };
    let a = resolve(left)?;
    let b = match right {
        DiffSide::Checkpoint(id) => resolve(id)?,
        DiffSide::Current => current_tree(&root, &git)?,
    };
    Ok((root, a, b))
}

/// Paths whose content differs between checkpoint `id` and the workspace's
/// files now, as `checkpointer diff <id> current -- --name-only -z` lists
/// them (the reference's "N changed" count in the reset dialog).
pub fn changed_since(workspace: &Path, id: &str) -> Result<Vec<String>, CheckpointError> {
    let root = workspace_root(workspace)?;
    let git = Git::new(&root);
    let reference = ref_name(id);
    if git.verify(&reference)?.is_none() {
        return Err(CheckpointError::NotFound(id.to_string()));
    }
    let current = current_tree(&root, &git)?;
    let args = [
        "-c",
        "core.quotePath=false",
        "diff",
        "--name-only",
        "-z",
        reference.as_str(),
        current.as_str(),
    ];
    let out = git.output(args)?;
    if !out.success {
        return Err(CheckpointError::Git {
            command: format!("git {}", args.join(" ")),
            stderr: out.stderr.trim().to_string(),
        });
    }
    Ok(out
        .stdout
        .split('\0')
        .filter(|p| !p.is_empty())
        .map(str::to_string)
        .collect())
}

/// The reference's transient "current" tree: a temp index seeded from HEAD
/// (not the real index), then `add -A`, so untracked non-ignored files count
/// and ignored ones do not. Nothing in the workspace changes.
fn current_tree(root: &Path, git: &Git) -> Result<String, CheckpointError> {
    let tmp = TempIndexDir::create(root, "chkpt-cur")?;
    let tmp_git = Git::new(root).env("GIT_INDEX_FILE", tmp.index_path());
    if let Some(head) = git.verify("HEAD")? {
        tmp_git.run(["read-tree", &head])?;
    }
    tmp_git.run(["add", "-A", "--", "."])?;
    tmp_git.run(["write-tree"])
}

/// Copy the worktree's index to `dest` without taking its lock. A repository
/// with no index yet (nothing ever staged) leaves `dest` absent, which git
/// reads as an empty index, as it would the real one.
fn copy_real_index(root: &Path, dest: &Path) -> Result<(), CheckpointError> {
    let path = PathBuf::from(Git::new(root).run(["rev-parse", "--git-path", "index"])?);
    let path = if path.is_relative() {
        root.join(path)
    } else {
        path
    };
    match fs::copy(&path, dest) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(CheckpointError::Io(e)),
    }
}

/// Temporary index directory under the worktree's git dir, removed on drop.
/// Leftovers from killed processes are pruned by later runs once they are
/// over an hour old and their recorded owner pid is gone.
struct TempIndexDir {
    dir: PathBuf,
}

impl TempIndexDir {
    fn create(root: &Path, prefix: &str) -> Result<Self, CheckpointError> {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let git_dir = PathBuf::from(Git::new(root).run(["rev-parse", "--absolute-git-dir"])?);
        let parent = git_dir.join(TMP_DIR_NAME);
        fs::create_dir_all(&parent).map_err(CheckpointError::Io)?;
        prune_stale(&parent);

        let pid = std::process::id();
        loop {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.subsec_nanos())
                .unwrap_or(0);
            let n = COUNTER.fetch_add(1, Ordering::Relaxed);
            let dir = parent.join(format!("{prefix}.{pid}.{nanos:x}{n:x}"));
            match fs::create_dir(&dir) {
                Ok(()) => {
                    fs::write(dir.join("owner-pid"), pid.to_string())
                        .map_err(CheckpointError::Io)?;
                    return Ok(Self { dir });
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(CheckpointError::Io(e)),
            }
        }
    }

    fn index_path(&self) -> PathBuf {
        self.dir.join("index")
    }
}

impl Drop for TempIndexDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}

fn prune_stale(parent: &Path) {
    let Ok(entries) = fs::read_dir(parent) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|m| now.duration_since(m).ok())
            .is_some_and(|age| age > STALE_TMP_AGE);
        if !old {
            continue;
        }
        let owner = fs::read_to_string(path.join("owner-pid")).ok();
        let owner_alive = owner
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .is_some_and(pid_alive);
        if !owner_alive {
            let _ = fs::remove_dir_all(&path);
        }
    }
}

/// `kill -0 <pid>`. If the check itself cannot run, assume alive so a
/// concurrent operation never loses its index.
fn pid_alive(pid: &str) -> bool {
    if !pid.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    match std::process::Command::new("kill")
        .args(["-0", pid])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
    {
        Ok(status) => status.success(),
        Err(_) => true,
    }
}

/// UTC civil date/time from a SystemTime (proleptic Gregorian).
fn utc_parts(t: SystemTime) -> (i64, u32, u32, u32, u32, u32) {
    let secs = t
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // Howard Hinnant's civil_from_days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let y = yoe + era * 400 + i64::from(m <= 2);
    (
        y,
        m,
        d,
        (rem / 3600) as u32,
        (rem % 3600 / 60) as u32,
        (rem % 60) as u32,
    )
}

/// `YYYY-MM-DDTHH:MM:SSZ` (reference `date -u +"%Y-%m-%dT%H:%M:%SZ"`).
fn iso_utc(t: SystemTime) -> String {
    let (y, mo, d, h, mi, s) = utc_parts(t);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

/// `YYYYMMDDTHHMMSSZ` (reference `date -u +%Y%m%dT%H%M%SZ`).
fn compact_utc(t: SystemTime) -> String {
    let (y, mo, d, h, mi, s) = utc_parts(t);
    format!("{y:04}{mo:02}{d:02}T{h:02}{mi:02}{s:02}Z")
}
