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
    let script = probe_script(cwd.is_some());
    if let Some(flags) = login_flags(shell) {
        if let Some(env) = run_probe(shell, flags, &script, cwd, PRIMARY_TIMEOUT) {
            return Some(env);
        }
    }
    run_probe("/bin/zsh", &["-lc"], &script, cwd, FALLBACK_TIMEOUT)
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

    #[test]
    fn captures_a_real_login_shell() {
        let tmp = tempfile::tempdir().unwrap();
        let bash = if Path::new("/bin/bash").exists() {
            "/bin/bash"
        } else {
            "bash"
        };
        let env = capture(bash, Some(tmp.path())).expect("bash login shell env");
        assert!(env.contains_key("PATH"), "{env:?}");
        let pwd = std::fs::canonicalize(tmp.path()).unwrap();
        assert_eq!(
            env.get("PWD").map(|p| std::fs::canonicalize(p).unwrap()),
            Some(pwd)
        );
        assert!(!env.contains_key("OPENCONDUCTOR_CWD"));
    }
}
