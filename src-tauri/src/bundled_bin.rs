//! Tools shipped in the app bundle's `Resources/bin/`, installed into
//! `$APPDATA/bin/` at startup.
//!
//! Conductor 0.87.6 does the same: its frontend runs `gh` as
//! `join(appData(), "bin", "gh")` and `watchexec` / `checkpointer.sh` from that
//! folder too (REA-extracted frontend, `evidence/packaging/bundled-bin.json`),
//! while the files ship in `Contents/Resources/bin/`. A Finder-launched app gets
//! launchd's PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), so a Homebrew `gh` is not
//! found without this.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// `$APPDATA/bin`, set once the bundled tools are installed.
static INSTALLED_BIN: OnceLock<PathBuf> = OnceLock::new();

/// Copy every file in `<resource_dir>/bin/` to `<app_data_dir>/bin/`, keeping
/// the relative layout, and mark it executable. A file whose installed copy
/// already has the same length is skipped, so a relaunch copies nothing.
/// Returns the files it copied. A missing `<resource_dir>/bin/` (a dev build)
/// installs nothing.
pub fn install(resource_dir: &Path, app_data_dir: &Path) -> io::Result<Vec<PathBuf>> {
    let src = resource_dir.join("bin");
    let dst = app_data_dir.join("bin");
    let mut copied = Vec::new();
    if src.is_dir() {
        copy_tree(&src, &dst, &mut copied)?;
    }
    Ok(copied)
}

fn copy_tree(src: &Path, dst: &Path, copied: &mut Vec<PathBuf>) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_tree(&from, &to, copied)?;
        } else if kind.is_file() && !same_len(&from, &to) {
            // Copy beside the target, then rename, so a running copy is never
            // half-written.
            let tmp = dst.join(format!(".{}.partial", entry.file_name().to_string_lossy()));
            fs::copy(&from, &tmp)?;
            set_executable(&tmp)?;
            fs::rename(&tmp, &to)?;
            copied.push(to);
        }
    }
    Ok(())
}

fn same_len(a: &Path, b: &Path) -> bool {
    match (fs::metadata(a), fs::metadata(b)) {
        (Ok(a), Ok(b)) => a.len() == b.len(),
        _ => false,
    }
}

#[cfg(unix)]
fn set_executable(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o755))
}

#[cfg(not(unix))]
fn set_executable(_: &Path) -> io::Result<()> {
    Ok(())
}

/// Where the shell shims in `bin/` find the app binary they exec in tool
/// mode (`tool_cli.rs`), like Conductor's shims exec
/// `bin/.internal/conductor-runtime`.
pub const EXE_LINK: &str = ".internal/openconductor";

/// Point `<bin_dir>/.internal/openconductor` at `exe`, replacing a link to
/// an older location (the app was moved or updated). Returns whether it
/// changed anything.
#[cfg(unix)]
pub fn link_exe(bin_dir: &Path, exe: &Path) -> io::Result<bool> {
    let link = bin_dir.join(EXE_LINK);
    if fs::read_link(&link).is_ok_and(|target| target == exe) {
        return Ok(false);
    }
    fs::create_dir_all(link.parent().expect("EXE_LINK has a parent"))?;
    let tmp = link.with_file_name(".openconductor.partial");
    let _ = fs::remove_file(&tmp);
    std::os::unix::fs::symlink(exe, &tmp)?;
    fs::rename(&tmp, &link)?;
    Ok(true)
}

#[cfg(not(unix))]
pub fn link_exe(_: &Path, _: &Path) -> io::Result<bool> {
    Ok(false)
}

/// Install the bundled tools and remember `$APPDATA/bin` for [`gh_path`].
/// Failure is logged, not fatal: `gh` then falls back to PATH.
pub fn install_at_startup(resource_dir: &Path, app_data_dir: &Path) {
    match install(resource_dir, app_data_dir) {
        Ok(copied) => {
            for path in copied {
                eprintln!("[bundled-bin] installed {}", path.display());
            }
        }
        Err(e) => eprintln!("[bundled-bin] install failed: {e}"),
    }
    match std::env::current_exe().and_then(|exe| link_exe(&app_data_dir.join("bin"), &exe)) {
        Ok(true) => eprintln!("[bundled-bin] linked {EXE_LINK}"),
        Ok(false) => {}
        Err(e) => eprintln!("[bundled-bin] link {EXE_LINK} failed: {e}"),
    }
    let _ = INSTALLED_BIN.set(app_data_dir.join("bin"));
}

/// `$APPDATA/bin` once [`install_at_startup`] has run.
pub fn installed_bin_dir() -> Option<&'static Path> {
    INSTALLED_BIN.get().map(PathBuf::as_path)
}

/// `gh` to run: `$OPENCONDUCTOR_GH` when set, else the installed bundled copy
/// in `$APPDATA/bin`, else `gh` on PATH.
pub fn gh_path() -> PathBuf {
    resolve_gh(
        std::env::var_os("OPENCONDUCTOR_GH").map(PathBuf::from),
        INSTALLED_BIN.get().map(PathBuf::as_path),
    )
}

fn resolve_gh(env_override: Option<PathBuf>, installed_bin: Option<&Path>) -> PathBuf {
    env_override
        .or_else(|| installed_bin.map(|dir| dir.join("gh")).filter(|p| p.is_file()))
        .unwrap_or_else(|| PathBuf::from("gh"))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("oc-bundled-bin-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write(path: &Path, body: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, body).unwrap();
    }

    #[test]
    fn installs_tree_once_and_marks_executable() {
        let tmp = TempDir::new("install");
        let res = tmp.path().join("Resources");
        let data = tmp.path().join("data");
        write(&res.join("bin/gh"), "gh-binary");
        write(&res.join("bin/.internal/helper"), "#!/bin/sh\n");

        let mut first = install(&res, &data).unwrap();
        first.sort();
        assert_eq!(first, vec![data.join("bin/.internal/helper"), data.join("bin/gh")]);
        assert_eq!(fs::read_to_string(data.join("bin/gh")).unwrap(), "gh-binary");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(data.join("bin/gh")).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o755);
        }
        assert!(install(&res, &data).unwrap().is_empty(), "relaunch copies nothing");

        write(&res.join("bin/gh"), "gh-binary-v2");
        assert_eq!(install(&res, &data).unwrap(), vec![data.join("bin/gh")]);
        assert_eq!(fs::read_to_string(data.join("bin/gh")).unwrap(), "gh-binary-v2");
        assert!(!data.join("bin/.gh.partial").exists());
    }

    #[cfg(unix)]
    #[test]
    fn exe_link_follows_the_app() {
        let tmp = TempDir::new("link");
        let bin = tmp.path().join("bin");
        let old = tmp.path().join("old/openconductor");
        let new = tmp.path().join("new/openconductor");
        assert!(link_exe(&bin, &old).unwrap());
        assert_eq!(fs::read_link(bin.join(EXE_LINK)).unwrap(), old);
        assert!(!link_exe(&bin, &old).unwrap(), "same target: unchanged");
        assert!(link_exe(&bin, &new).unwrap());
        assert_eq!(fs::read_link(bin.join(EXE_LINK)).unwrap(), new);
    }

    #[test]
    fn dev_build_without_resources_installs_nothing() {
        let tmp = TempDir::new("dev");
        assert!(install(&tmp.path().join("none"), &tmp.path().join("data")).unwrap().is_empty());
    }

    #[test]
    fn gh_resolution_order() {
        let tmp = TempDir::new("resolve");
        let bin = tmp.path().join("bin");
        assert_eq!(resolve_gh(None, Some(&bin)), PathBuf::from("gh"), "not installed: PATH");
        write(&bin.join("gh"), "x");
        assert_eq!(resolve_gh(None, Some(&bin)), bin.join("gh"));
        assert_eq!(
            resolve_gh(Some("/custom/gh".into()), Some(&bin)),
            PathBuf::from("/custom/gh")
        );
        assert_eq!(resolve_gh(None, None), PathBuf::from("gh"));
    }
}
