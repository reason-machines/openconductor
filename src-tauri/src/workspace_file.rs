//! Bounded UTF-8 reads for the internal Markdown file viewer.
use std::io::Read;
use std::path::{Component, Path};

const MAX_BYTES: u64 = 4 * 1024 * 1024;

pub fn read_markdown(repo: &Path, path: &str) -> Result<String, String> {
    let relative = Path::new(path);
    if path.is_empty() || !relative.components().all(|part| matches!(part, Component::Normal(_))) {
        return Err("Expected a workspace-relative file path".into());
    }
    let extension = relative.extension().and_then(|ext| ext.to_str()).unwrap_or("");
    if !extension.eq_ignore_ascii_case("md") && !extension.eq_ignore_ascii_case("mdx") {
        return Err("Only Markdown files can be previewed".into());
    }
    let file = open_confined(repo, relative)?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Expected a regular file".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Markdown preview is limited to 4 MiB; open this file externally".into());
    }
    String::from_utf8(bytes).map_err(|_| "File is not valid UTF-8; open it externally".into())
}

#[cfg(unix)]
fn open_confined(repo: &Path, relative: &Path) -> Result<std::fs::File, String> {
    use std::ffi::CString;
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::OpenOptionsExt;

    let mut current = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_CLOEXEC)
        .open(repo)
        .map_err(|e| e.to_string())?;
    let mut parts = relative.components().peekable();
    while let Some(part) = parts.next() {
        let name = CString::new(part.as_os_str().as_bytes()).map_err(|e| e.to_string())?;
        let flags = libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW
            | if parts.peek().is_some() { libc::O_DIRECTORY } else { libc::O_NONBLOCK };
        // Each lookup is relative to an owned directory descriptor. O_NOFOLLOW
        // rejects symlinks at every component; NONBLOCK lets metadata reject FIFOs.
        let fd = unsafe { libc::openat(current.as_raw_fd(), name.as_ptr(), flags) };
        if fd < 0 { return Err(std::io::Error::last_os_error().to_string()); }
        // openat returned a fresh descriptor; File owns its only close operation.
        current = unsafe { std::fs::File::from_raw_fd(fd) };
    }
    Ok(current)
}

#[cfg(not(unix))]
fn open_confined(_repo: &Path, _relative: &Path) -> Result<std::fs::File, String> {
    Err("Markdown preview is not supported on this platform; open externally".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(0);
    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            loop {
                let id = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
                let path = std::env::temp_dir().join(format!("oc-markdown-{}-{id}", std::process::id()));
                match std::fs::create_dir(&path) {
                    Ok(()) => return Self(path),
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(error) => panic!("Create test fixture: {error}"),
                }
            }
        }
    }
    impl Drop for Fixture { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }
    #[test]
    fn parallel_fixtures_own_distinct_directories() {
        let fixtures: Vec<_> = (0..32).map(|_| std::thread::spawn(Fixture::new)).collect();
        let fixtures: Vec<_> = fixtures.into_iter().map(|thread| thread.join().unwrap()).collect();
        let paths: std::collections::HashSet<_> = fixtures.iter().map(|fixture| &fixture.0).collect();
        assert_eq!(paths.len(), fixtures.len());
    }
    #[test]
    fn reads_nested_markdown_and_mdx_without_executing_it() {
        let f = Fixture::new();
        std::fs::create_dir(f.0.join("docs")).unwrap();
        for name in ["docs/README.md", "guide.MDX"] {
            std::fs::write(f.0.join(name), "# hello\n<Component />").unwrap();
            assert_eq!(read_markdown(&f.0, name).unwrap(), "# hello\n<Component />");
        }
    }
    #[test]
    fn refuses_escape_non_markdown_directories_and_missing_files() {
        let f = Fixture::new();
        std::fs::create_dir(f.0.join("dir.md")).unwrap();
        for path in ["", "../secret.md", "/tmp/secret.md", "./a.md", "dir.md", "missing.md", "code.ts"] {
            assert!(read_markdown(&f.0, path).is_err(), "{path}");
        }
    }
    #[test]
    fn refuses_invalid_utf8_and_oversized_files() {
        let f = Fixture::new();
        std::fs::write(f.0.join("binary.md"), [0xff]).unwrap();
        assert!(read_markdown(&f.0, "binary.md").unwrap_err().contains("UTF-8"));
        std::fs::write(f.0.join("large.md"), vec![b'a'; MAX_BYTES as usize + 1]).unwrap();
        assert!(read_markdown(&f.0, "large.md").unwrap_err().contains("4 MiB"));
    }
    #[cfg(unix)]
    #[test]
    fn refuses_symlinks_even_when_their_target_is_inside_the_workspace() {
        let f = Fixture::new();
        std::fs::write(f.0.join("real.md"), "inside").unwrap();
        std::os::unix::fs::symlink("real.md", f.0.join("alias.md")).unwrap();
        assert!(read_markdown(&f.0, "alias.md").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn rejects_fifo_without_blocking_on_open() {
        use std::os::unix::ffi::OsStrExt;
        let f = Fixture::new();
        let path = std::ffi::CString::new(f.0.join("pipe.md").as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(path.as_ptr(), 0o600) }, 0);
        assert!(read_markdown(&f.0, "pipe.md").unwrap_err().contains("regular file"));
    }
    #[cfg(unix)]
    #[test]
    fn refuses_file_and_parent_symlink_escapes() {
        let f = Fixture::new();
        let outside = Fixture::new();
        std::fs::write(outside.0.join("secret.md"), "private").unwrap();
        std::os::unix::fs::symlink(outside.0.join("secret.md"), f.0.join("link.md")).unwrap();
        std::os::unix::fs::symlink(&outside.0, f.0.join("dir")).unwrap();
        assert!(read_markdown(&f.0, "link.md").is_err());
        assert!(read_markdown(&f.0, "dir/secret.md").is_err());
    }
}
