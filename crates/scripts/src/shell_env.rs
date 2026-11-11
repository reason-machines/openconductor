//! Capture the user's login-shell environment for scripts.
//!
//! A GUI app does not inherit the PATH and variables a user's shell startup
//! files set, so scripts would miss their toolchains. As the reference does
//! (`evidence/run-scripts/NOTES.md`, "Environment"): run the user's shell as
//! an interactive login shell (`-ilc` for bash and zsh, `-i -l -c` for fish),
//! print `env` between delimiters, strip ANSI escapes, and drop agent
//! credentials and exported bash functions. If that fails, or the shell is
//! unknown, fall back to `zsh -lc`. Timeouts: 5 s, then 3 s for the fallback.

use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub const PRIMARY_TIMEOUT: Duration = Duration::from_secs(5);
pub const FALLBACK_TIMEOUT: Duration = Duration::from_secs(3);

const DELIMITER: &str = "_OPENCONDUCTOR_SHELL_ENV_DELIMITER_";

/// Keys never passed from the captured shell to scripts.
pub const STRIPPED_KEYS: [&str; 7] = [
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CODEX_ACCESS_TOKEN",
    "CODEX_API_KEY",
    "CURSOR_API_KEY",
    "OPENAI_API_KEY",
    "OPENCONDUCTOR_CWD",
];

/// Flags that make `shell` an interactive login shell running a command.
pub fn login_flags(shell: &str) -> Option<&'static [&'static str]> {
    match shell
        .rsplit('/')
        .next()
        .unwrap_or(shell)
        .to_ascii_lowercase()
        .as_str()
    {
        "bash" | "zsh" => Some(&["-ilc"]),
        "fish" => Some(&["-i", "-l", "-c"]),
        _ => None,
    }
}

/// The environment `shell` ends up with after its startup files, run from
/// `cwd` (so directory-based tools like direnv apply). `None` when both the
/// shell and the zsh fallback fail.
pub fn capture(shell: &str, cwd: Option<&Path>) -> Option<BTreeMap<String, String>> {
    capture_with(
        shell,
        FALLBACK_SHELL,
        cwd,
        PRIMARY_TIMEOUT,
        FALLBACK_TIMEOUT,
    )
}

const FALLBACK_SHELL: &str = "/bin/zsh";

/// [`capture`] with the fallback shell and both timeouts as parameters, so
/// tests do not depend on how fast the host's own startup files are.
fn capture_with(
    shell: &str,
    fallback: &str,
    cwd: Option<&Path>,
    primary_timeout: Duration,
    fallback_timeout: Duration,
) -> Option<BTreeMap<String, String>> {
    let script = probe_script(cwd.is_some());
    if let Some(flags) = login_flags(shell) {
        if let Some(env) = run_probe(shell, flags, &script, cwd, primary_timeout) {
            return Some(env);
        }
    }
    run_probe(fallback, &["-lc"], &script, cwd, fallback_timeout)
}

fn probe_script(cd: bool) -> String {
    let cd = if cd {
        "cd \"$OPENCONDUCTOR_CWD\"; "
    } else {
        ""
    };
    format!("{cd}printf '%s\\n' \"{DELIMITER}\"; env; printf '%s\\n' \"{DELIMITER}\"; exit")
}

fn run_probe(
    shell: &str,
    flags: &[&str],
    script: &str,
    cwd: Option<&Path>,
    timeout: Duration,
) -> Option<BTreeMap<String, String>> {
    let mut cmd = Command::new(shell);
    cmd.args(flags)
        .arg(script)
        .env("DISABLE_AUTO_UPDATE", "true");
    if let Some(dir) = cwd {
        cmd.env("OPENCONDUCTOR_CWD", dir);
    }
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = thread::spawn(move || {
        let mut out = Vec::new();
        let _ = stdout.read_to_end(&mut out);
        out
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(10)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    let out = reader.join().ok()?;
    status
        .success()
        .then(|| parse(&String::from_utf8_lossy(&out)))
        .flatten()
}

/// The `KEY=value` lines between the first two delimiters, cleaned.
pub fn parse(output: &str) -> Option<BTreeMap<String, String>> {
    let body = output.split(DELIMITER).nth(1)?;
    output.split(DELIMITER).nth(2)?; // the closing delimiter must be there
    let mut env = BTreeMap::new();
    for line in strip_ansi(body).lines() {
        if let Some((k, v)) = line.split_once('=') {
            if !k.is_empty() && !STRIPPED_KEYS.contains(&k) && !k.starts_with("BASH_FUNC_") {
                env.insert(k.to_string(), v.to_string());
            }
        }
    }
    Some(env)
}

/// Remove CSI (`ESC [ … final`) and OSC (`ESC ] … BEL`) sequences.
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('[') => {
                for c in chars.by_ref() {
                    if ('@'..='~').contains(&c) {
                        break;
                    }
                }
            }
            Some(']') => {
                for c in chars.by_ref() {
                    if c == '\u{7}' {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_between_delimiters_and_strips() {
        let out = format!(
            "motd\n{DELIMITER}\n\u{1b}[1mPATH=/opt/bin:/usr/bin\u{1b}[0m\nOPENAI_API_KEY=x\nBASH_FUNC_f%%=() {{ :; }}\nEMPTY=\n{DELIMITER}\nbye"
        );
        let env = parse(&out).unwrap();
        assert_eq!(
            env.get("PATH").map(String::as_str),
            Some("/opt/bin:/usr/bin")
        );
        assert_eq!(env.get("EMPTY").map(String::as_str), Some(""));
        assert!(!env.contains_key("OPENAI_API_KEY"));
        assert_eq!(env.len(), 2);
        assert_eq!(parse("no delimiters"), None);
        assert_eq!(
            parse(&format!("{DELIMITER}\nA=1\n")),
            None,
            "unterminated output"
        );
    }

    #[test]
    fn flags_by_shell() {
        assert_eq!(login_flags("/bin/zsh"), Some(&["-ilc"][..]));
        assert_eq!(
            login_flags("/usr/local/bin/fish"),
            Some(&["-i", "-l", "-c"][..])
        );
        assert_eq!(login_flags("/bin/tcsh"), None);
    }

    /// A stand-in shell named `name` in `dir`: it insists on `flag`, runs
    /// `startup` (its "startup files"), then the probe script with `/bin/sh`.
    fn fake_shell(dir: &Path, name: &str, flag: &str, startup: &str) -> String {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.join(name);
        let body = format!(
            "#!/bin/sh\n[ \"$1\" = {flag} ] || exit 9\n{startup}\nexec /bin/sh -c \"$2\"\n"
        );
        std::fs::write(&path, body).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        // A test thread that forked while the file was open for writing makes
        // exec fail with ETXTBSY until its child execs; wait that out.
        for _ in 0..200 {
            match Command::new(&path).stdout(Stdio::null()).status() {
                Err(e) if e.raw_os_error() == Some(libc::ETXTBSY) => {
                    thread::sleep(Duration::from_millis(10))
                }
                _ => break,
            }
        }
        path.to_str().unwrap().to_string()
    }

    fn canonical(p: &str) -> std::path::PathBuf {
        std::fs::canonicalize(p).unwrap()
    }

    #[test]
    fn captures_what_the_login_shell_startup_sets_from_the_cwd() {
        let tmp = tempfile::tempdir().unwrap();
        let cwd = tempfile::tempdir().unwrap();
        let bash = fake_shell(
            tmp.path(),
            "bash",
            "-ilc",
            "printf 'motd \\033[1mhi\\033[0m\\n'; export FROM_PROFILE=yes OPENAI_API_KEY=synthetic-test-key",
        );
        let env = capture_with(
            &bash,
            "/nonexistent/zsh",
            Some(cwd.path()),
            Duration::from_secs(30),
            Duration::from_secs(30),
        )
        .expect("probe env");
        assert_eq!(env.get("FROM_PROFILE").map(String::as_str), Some("yes"));
        assert!(env.contains_key("PATH"), "{env:?}");
        assert!(!env.contains_key("OPENAI_API_KEY"));
        assert!(!env.contains_key("OPENCONDUCTOR_CWD"));
        assert_eq!(
            env.get("PWD").map(|p| canonical(p)),
            Some(std::fs::canonicalize(cwd.path()).unwrap())
        );
    }

    #[test]
    fn a_shell_slower_than_its_timeout_falls_back() {
        // CI run 42924968664: the runner's bash startup outlived the 5 s
        // timeout and Linux has no /bin/zsh, so capture returned None.
        let tmp = tempfile::tempdir().unwrap();
        let slow = fake_shell(tmp.path(), "bash", "-ilc", "exec sleep 30");
        let zsh = fake_shell(tmp.path(), "zsh", "-lc", "export FALLBACK=1");
        let started = Instant::now();
        let env = capture_with(
            &slow,
            &zsh,
            None,
            Duration::from_millis(300),
            Duration::from_secs(30),
        )
        .expect("fallback env");
        assert_eq!(env.get("FALLBACK").map(String::as_str), Some("1"));
        assert!(
            started.elapsed() < Duration::from_secs(20),
            "the slow shell was not cut off"
        );
        assert_eq!(
            capture_with(
                &slow,
                "/nonexistent/zsh",
                None,
                Duration::from_millis(300),
                Duration::from_secs(1)
            ),
            None
        );
    }

    #[test]
    fn a_failing_or_unknown_shell_uses_the_fallback() {
        let tmp = tempfile::tempdir().unwrap();
        let broken = fake_shell(tmp.path(), "bash", "-ilc", "exit 1");
        let zsh = fake_shell(tmp.path(), "zsh", "-lc", "export FALLBACK=1");
        let long = Duration::from_secs(30);
        for shell in [broken.as_str(), "/bin/tcsh"] {
            let env = capture_with(shell, &zsh, None, long, long).expect(shell);
            assert_eq!(
                env.get("FALLBACK").map(String::as_str),
                Some("1"),
                "{shell}"
            );
        }
    }

    #[test]
    fn captures_a_real_login_shell() {
        let tmp = tempfile::tempdir().unwrap();
        let bash = if Path::new("/bin/bash").exists() {
            "/bin/bash"
        } else {
            "bash"
        };
        // The host's own startup files run here, so allow far more than the
        // product's 5 s: a slow CI runner must not fail this test.
        let timeout = Duration::from_secs(60);
        let env = capture_with(bash, "/bin/zsh", Some(tmp.path()), timeout, timeout)
            .expect("bash login shell env");
        assert!(env.contains_key("PATH"), "{env:?}");
        let pwd = std::fs::canonicalize(tmp.path()).unwrap();
        assert_eq!(
            env.get("PWD").map(|p| std::fs::canonicalize(p).unwrap()),
            Some(pwd)
        );
        assert!(!env.contains_key("OPENCONDUCTOR_CWD"));
    }
}
