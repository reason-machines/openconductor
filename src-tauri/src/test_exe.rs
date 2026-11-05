//! Writing stand-in executables (a fake `claude`, `codex`, `gh`, `reason`)
//! from tests.
//!
//! `fs::write` followed by running the file is racy in a test binary. Tests
//! run on many threads, and a thread that forks while the file is open for
//! writing gives its child a copy of that descriptor, which stays open until
//! the child calls exec. `execve` of a file that any process holds open for
//! writing fails with `ETXTBSY` ("Text file busy"). A `/bin/sh` child writes
//! the file instead, so no descriptor in this process ever refers to it and no
//! fork here can leak one.

use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

/// Writes `contents` to `path` and sets its permission bits to `mode`.
pub(crate) fn write_executable(path: &Path, contents: &str, mode: u32) {
    let mut child = Command::new("/bin/sh")
        .args(["-c", r#"cat > "$1" && chmod "$2" "$1""#, "sh"])
        .arg(path)
        .arg(format!("{mode:o}"))
        .stdin(Stdio::piped())
        .spawn()
        .expect("start /bin/sh");
    child
        .stdin
        .take()
        .expect("piped stdin")
        .write_all(contents.as_bytes())
        .expect("write script");
    let status = child.wait().expect("wait for /bin/sh");
    assert!(
        status.success(),
        "writing {} failed: {status}",
        path.display()
    );
}
