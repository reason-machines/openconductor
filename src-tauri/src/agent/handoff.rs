//! Handing an agent's active credential to another machine (a Reason cloud
//! computer, a VM, a container) so the CLI there runs signed in.
//!
//! Conductor's cloud workspaces get credentials from its server: a Codex
//! ChatGPT login is exported as `auth.json` (`id3`, `{schemaVersion: 1,
//! files: [{relativePath: "auth.json", contentBase64}]}`), and the Claude
//! Agent SDK copies a Claude login into a private config dir with the
//! refresh token deleted, mode 0600 (`ou3`/`au3`); see
//! `evidence/agent-auth/README.md`. OpenConductor has no server, so it does
//! the same thing directly over a shell on the target:
//!
//! * [`Handoff::build`] turns the agent's launch environment (API key,
//!   setup token, gateway options) plus, for a CLI login, the login itself
//!   into environment values and files. A Claude login travels as its
//!   access token in `CLAUDE_CODE_OAUTH_TOKEN`; a Codex ChatGPT login as a
//!   copy of `auth.json` whose refresh token is blanked. Neither refresh
//!   token leaves this machine, so the remote copy can never rotate the
//!   user's own login out; it lasts as long as the access token, and a new
//!   chat hands over a fresh one.
//! * [`Remote::install`] writes them on the target into a fresh `mktemp -d`
//!   directory under `umask 077`, read from stdin: values never appear in a
//!   command line, a log or a transcript.
//! * [`Remote::command`] runs the agent there: the routing variables the
//!   remote shell may have are unset, the handed-over ones exported, Codex
//!   pointed at the private `CODEX_HOME`, and the directory removed when the
//!   agent exits.

use std::fmt;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use super::auth_sources::ClaudeOauth;
use super::byok::ProviderConfig;
use super::env::{vars, EnvValue, LaunchEnv};
use super::secret::{SecretStore, SecretString};

/// Directory (inside the hand-off directory) used as `CODEX_HOME`.
pub const CODEX_HOME_DIR: &str = "codex";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HandoffError {
    /// The provider could not build its environment (missing key, ...).
    Provider(String),
    /// The CLI login to hand over is missing or unusable; safe to show.
    Login(String),
}

impl fmt::Display for HandoffError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HandoffError::Provider(e) | HandoffError::Login(e) => f.write_str(e),
        }
    }
}

impl std::error::Error for HandoffError {}

/// What the target needs to run one agent signed in. `Debug` hides values.
#[derive(Clone, Default, PartialEq, Eq)]
pub struct Handoff {
    /// Variables to export on the target.
    pub env: Vec<(String, EnvValue)>,
    /// Variables to unset on the target first (routing variables).
    pub unset: Vec<String>,
    /// Files relative to the hand-off directory.
    pub files: Vec<(String, SecretString)>,
    /// What was handed over, safe to show ("Anthropic API key", ...).
    pub source: String,
}

impl fmt::Debug for Handoff {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let env: Vec<String> = self
            .env
            .iter()
            .map(|(k, v)| match v {
                EnvValue::Plain(p) => format!("{k}={p}"),
                EnvValue::Secret(_) => format!("{k}=<redacted>"),
            })
            .collect();
        let files: Vec<&str> = self.files.iter().map(|(p, _)| p.as_str()).collect();
        f.debug_struct("Handoff")
            .field("env", &env)
            .field("unset", &self.unset)
            .field("files", &files)
            .field("source", &self.source)
            .finish()
    }
}

/// How to read the CLI's own login on this machine.
pub struct LocalLogins<'a> {
    /// Claude Code's login: the Keychain item or `~/.claude/.credentials.json`.
    pub claude: &'a dyn Fn() -> Option<ClaudeOauth>,
    /// Codex's `$CODEX_HOME` (default `~/.codex`).
    pub codex_home: Option<PathBuf>,
    pub now_ms: i64,
}

/// A Codex `auth.json` with its refresh token blanked. Codex keeps using
/// the access token (observed with Codex CLI 0.166.0: a ChatGPT-plan turn
/// ran from such a copy, and an absent `refresh_token` key instead makes
/// Codex send no credentials at all).
pub fn codex_auth_without_refresh(json: &str) -> Option<SecretString> {
    let mut v: serde_json::Value = serde_json::from_str(json).ok()?;
    if let Some(tokens) = v.get_mut("tokens").and_then(|t| t.as_object_mut()) {
        if tokens.contains_key("refresh_token") {
            tokens.insert(
                "refresh_token".into(),
                serde_json::Value::String(String::new()),
            );
        }
    }
    serde_json::to_string(&v).ok().map(SecretString::new)
}

fn is_var_name(n: &str) -> bool {
    let mut c = n.chars();
    c.next().is_some_and(|f| f.is_ascii_uppercase() || f == '_')
        && c.all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '_')
}

impl Handoff {
    /// The hand-off for `config`, built from its launch environment, plus
    /// the CLI's own login when the provider is a CLI login and no stored
    /// token replaces it.
    pub fn build(
        config: &ProviderConfig,
        store: &dyn SecretStore,
        logins: &LocalLogins,
    ) -> Result<Handoff, HandoffError> {
        let agent = config.provider().agent();
        let env: LaunchEnv = config
            .launch_env(store)
            .map_err(|e| HandoffError::Provider(e.to_string()))?;
        let mut h = Handoff {
            env: env
                .set_vars()
                .map(|(k, v)| (k.to_owned(), v.clone()))
                .collect(),
            unset: agent
                .routing_vars()
                .iter()
                .map(|s| (*s).to_owned())
                .collect(),
            ..Default::default()
        };
        h.unset.retain(|v| !h.env.iter().any(|(k, _)| k == v));
        match config {
            ProviderConfig::ClaudeLogin(_) if env.get(vars::CLAUDE_CODE_OAUTH_TOKEN).is_some() => {
                h.source = "Claude subscription token".into();
            }
            ProviderConfig::ClaudeLogin(_) => {
                let login = (logins.claude)().ok_or_else(|| {
                    HandoffError::Login("Claude Code is not signed in on this Mac: run claude /login, or paste a setup token".into())
                })?;
                if login.expired(logins.now_ms) {
                    return Err(HandoffError::Login(
                        "Claude Code's login has expired: run claude once on this Mac to refresh it, or paste a setup token".into(),
                    ));
                }
                h.env.push((
                    vars::CLAUDE_CODE_OAUTH_TOKEN.into(),
                    EnvValue::Secret(login.access_token),
                ));
                h.unset.retain(|v| v != vars::CLAUDE_CODE_OAUTH_TOKEN);
                h.source = "Claude Code login (access token only)".into();
            }
            ProviderConfig::CodexLogin(_) => {
                let home = logins
                    .codex_home
                    .as_deref()
                    .ok_or_else(|| HandoffError::Login("no Codex home".into()))?;
                let text = std::fs::read_to_string(home.join("auth.json")).map_err(|_| {
                    HandoffError::Login(
                        "Codex is not signed in on this Mac: run codex login".into(),
                    )
                })?;
                let auth = codex_auth_without_refresh(&text).ok_or_else(|| {
                    HandoffError::Login("~/.codex/auth.json is not valid JSON".into())
                })?;
                h.files.push((format!("{CODEX_HOME_DIR}/auth.json"), auth));
                h.source = "Codex login (auth.json without its refresh token)".into();
            }
            other => h.source = source_label(other.provider().kind()).into(),
        }
        debug_assert!(h.env.iter().all(|(k, _)| is_var_name(k)));
        Ok(h)
    }

    /// Lines written to the target's stdin by [`Remote::install`]:
    /// `E <name> <base64 value>`, `F <base64 path> <base64 content>`,
    /// `U <name>`. Exposed for tests; this is the only place values are
    /// serialized.
    pub fn payload(&self) -> String {
        let mut out = String::new();
        for name in &self.unset {
            out.push_str(&format!("U {name}\n"));
        }
        for (name, value) in &self.env {
            out.push_str(&format!("E {name} {}\n", b64(value.expose().as_bytes())));
        }
        for (path, content) in &self.files {
            out.push_str(&format!(
                "F {} {}\n",
                b64(path.as_bytes()),
                b64(content.expose().as_bytes())
            ));
        }
        out
    }
}

fn source_label(kind: &str) -> &'static str {
    match kind {
        "anthropic_api" => "Anthropic API key or auth token",
        "openai_api" => "OpenAI API key",
        "codex_gateway" => "Gateway API key",
        _ => "Provider settings",
    }
}

/// Standard base64 with padding (no dependency on a base64 crate).
fn b64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for c in bytes.chunks(3) {
        let n = (c[0] as u32) << 16
            | (*c.get(1).unwrap_or(&0) as u32) << 8
            | *c.get(2).unwrap_or(&0) as u32;
        s.push(T[(n >> 18) as usize & 63] as char);
        s.push(T[(n >> 12) as usize & 63] as char);
        s.push(if c.len() > 1 {
            T[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        s.push(if c.len() > 2 {
            T[n as usize & 63] as char
        } else {
            '='
        });
    }
    s
}

/// Single-quotes `s` for a POSIX shell.
pub fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// Reads the payload on stdin into a new private directory and prints it.
/// Paths are checked on the target too: no absolute paths, no `..`.
const INSTALL: &str = r#"umask 077
d=$(mktemp -d "${TMPDIR:-/tmp}/oc-agent-auth.XXXXXX") || exit 1
fail() { rm -rf "$d"; exit 1; }
mkdir "$d/env" "$d/unset" || fail
while read -r t a b; do
  case "$t" in
    U|E) case "$a" in ''|*[!A-Z0-9_]*) fail ;; esac ;;
  esac
  case "$t" in
    U) : > "$d/unset/$a" ;;
    E) printf '%s' "$b" | base64 -d > "$d/env/$a" || fail ;;
    F) p=$(printf '%s' "$a" | base64 -d) || fail
       case "/$p/" in */../*|*/./*) fail ;; esac
       case "$p" in /*|'') fail ;; esac
       mkdir -p "$d/$(dirname "$p")" && printf '%s' "$b" | base64 -d > "$d/$p" || fail ;;
    *) fail ;;
  esac
done
printf '%s\n' "$d""#;

/// Runs `"$@"` with the hand-off applied, then removes the directory.
/// `$1` is the hand-off directory, `$2` the working directory.
const LAUNCH: &str = r#"d=$1; cwd=$2; shift 2
for f in "$d"/unset/*; do [ -e "$f" ] && unset "${f##*/}"; done
for f in "$d"/env/*; do [ -e "$f" ] && export "${f##*/}=$(cat "$f")"; done
[ -d "$d/codex" ] && export CODEX_HOME="$d/codex"
if [ -n "$cwd" ]; then cd "$cwd" || { rm -rf "$d"; exit 1; }; fi
"$@"; s=$?
rm -rf "$d"
exit $s"#;

/// A shell on the target machine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Remote {
    /// `ssh <host>`: a VM, a Reason cloud computer, any SSH host. Batch mode,
    /// so a missing key fails instead of prompting.
    Ssh { host: String },
    /// A command prefix that runs argv on the target, such as
    /// `docker exec -i <container>` or `limactl shell <vm>`.
    Exec { prefix: Vec<String> },
}

/// A hand-off directory on the target.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Installed {
    pub dir: String,
}

impl Remote {
    /// Parses `ssh:<host>` or `exec:<argv words>` (whitespace separated).
    pub fn parse(spec: &str) -> Option<Remote> {
        if let Some(host) = spec.strip_prefix("ssh:") {
            let host = host.trim();
            return (!host.is_empty()
                && !host.starts_with('-')
                && !host.contains(char::is_whitespace))
            .then(|| Remote::Ssh {
                host: host.to_owned(),
            });
        }
        let words: Vec<String> = spec
            .strip_prefix("exec:")?
            .split_whitespace()
            .map(str::to_owned)
            .collect();
        (!words.is_empty()).then_some(Remote::Exec { prefix: words })
    }

    /// `sh -c <script> sh <args...>` on the target.
    pub fn sh(&self, script: &str, args: &[String]) -> Command {
        match self {
            Remote::Ssh { host } => {
                // ssh joins its arguments into one string for the remote shell.
                let mut line = format!("sh -c {} sh", sh_quote(script));
                for a in args {
                    line.push(' ');
                    line.push_str(&sh_quote(a));
                }
                let mut c = Command::new("ssh");
                c.args(["-o", "BatchMode=yes", "-T", host, "--", &line]);
                c
            }
            Remote::Exec { prefix } => {
                let mut c = Command::new(&prefix[0]);
                c.args(&prefix[1..])
                    .args(["sh", "-c", script, "sh"])
                    .args(args);
                c
            }
        }
    }

    /// Writes the hand-off on the target; returns its private directory.
    pub fn install(&self, handoff: &Handoff) -> io::Result<Installed> {
        let mut child = self
            .sh(INSTALL, &[])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        {
            let mut stdin = child
                .stdin
                .take()
                .ok_or_else(|| io::Error::other("no stdin"))?;
            stdin.write_all(handoff.payload().as_bytes())?;
        }
        let out = child.wait_with_output()?;
        let dir = String::from_utf8_lossy(&out.stdout).trim().to_owned();
        if !out.status.success() || !dir.starts_with('/') || dir.contains('\n') {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(io::Error::other(format!(
                "could not hand the credential to the target ({}): {}",
                out.status,
                err.lines().last().unwrap_or("")
            )));
        }
        Ok(Installed { dir })
    }

    /// The agent command on the target, signed in through `installed`.
    pub fn command(
        &self,
        installed: &Installed,
        cwd: Option<&str>,
        program: &str,
        args: &[String],
    ) -> Command {
        let mut all = vec![
            installed.dir.clone(),
            cwd.unwrap_or("").to_owned(),
            program.to_owned(),
        ];
        all.extend(args.iter().cloned());
        let mut c = self.sh(LAUNCH, &all);
        c.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        c
    }

    /// Removes the hand-off directory (also done when the agent exits).
    pub fn remove(&self, installed: &Installed) -> io::Result<()> {
        self.sh(
            r#"case "$1" in */oc-agent-auth.*) rm -rf "$1" ;; esac"#,
            std::slice::from_ref(&installed.dir),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|_| ())
    }
}

/// Reads Claude Code's login on this machine: the macOS Keychain item
/// `Claude Code-credentials` (as Conductor's runtime reads it, `ru3`:
/// `security find-generic-password -a <user> -w -s <service>`), else
/// `~/.claude/.credentials.json`.
pub fn read_claude_login(home: Option<&Path>) -> Option<ClaudeOauth> {
    #[cfg(target_os = "macos")]
    {
        let user = std::env::var("USER").unwrap_or_default();
        if let Ok(out) = Command::new("/usr/bin/security")
            .args([
                "find-generic-password",
                "-a",
                &user,
                "-w",
                "-s",
                "Claude Code-credentials",
            ])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
        {
            if out.status.success() {
                if let Some(o) = ClaudeOauth::parse(String::from_utf8_lossy(&out.stdout).trim()) {
                    return Some(o);
                }
            }
        }
    }
    let text = std::fs::read_to_string(home?.join(".claude/.credentials.json")).ok()?;
    ClaudeOauth::parse(&text)
}

/// `$CODEX_HOME`, else `~/.codex`.
pub fn codex_home(home: Option<&Path>) -> Option<PathBuf> {
    std::env::var_os("CODEX_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .or_else(|| home.map(|h| h.join(".codex")))
}

#[cfg(test)]
mod tests {
    use super::super::claude::{AnthropicApi, ClaudeLogin};
    use super::super::codex::{CodexLogin, OpenAiApi};
    use super::super::secret::{keys, MemorySecretStore};
    use super::*;

    fn no_claude() -> Option<ClaudeOauth> {
        None
    }

    fn logins<'a>(
        claude: &'a dyn Fn() -> Option<ClaudeOauth>,
        codex_home: Option<PathBuf>,
    ) -> LocalLogins<'a> {
        LocalLogins {
            claude,
            codex_home,
            now_ms: 1_000,
        }
    }

    fn env_of<'a>(h: &'a Handoff, k: &str) -> Option<&'a str> {
        h.env.iter().find(|(n, _)| n == k).map(|(_, v)| v.expose())
    }

    #[test]
    fn base64_matches_rfc4648() {
        assert_eq!(b64(b""), "");
        assert_eq!(b64(b"f"), "Zg==");
        assert_eq!(b64(b"fo"), "Zm8=");
        assert_eq!(b64(b"foo"), "Zm9v");
        assert_eq!(b64(b"foobar"), "Zm9vYmFy");
        assert_eq!(b64(&[0xfb, 0xff]), "+/8=");
    }

    #[test]
    fn api_keys_travel_as_secret_env_and_routing_vars_are_unset() {
        let store = MemorySecretStore::with(&[
            (keys::ANTHROPIC_API_KEY, "sk-ant-api03-k"),
            (keys::OPENAI_API_KEY, "sk-proj-k"),
        ]);
        let h = Handoff::build(
            &ProviderConfig::AnthropicApi(AnthropicApi::default()),
            &store,
            &logins(&no_claude, None),
        )
        .unwrap();
        assert_eq!(env_of(&h, "ANTHROPIC_API_KEY"), Some("sk-ant-api03-k"));
        assert!(h.unset.contains(&"CLAUDE_CODE_OAUTH_TOKEN".to_owned()));
        assert!(!h.unset.contains(&"ANTHROPIC_API_KEY".to_owned()));
        assert!(h.files.is_empty());
        assert!(!format!("{h:?}").contains("sk-ant"), "{h:?}");

        let c = Handoff::build(
            &ProviderConfig::OpenaiApi(OpenAiApi::default()),
            &store,
            &logins(&no_claude, None),
        )
        .unwrap();
        assert_eq!(env_of(&c, "CODEX_API_KEY"), Some("sk-proj-k"));
        assert_eq!(env_of(&c, "OPENAI_API_KEY"), Some("sk-proj-k"));
        assert!(c.unset.contains(&"CODEX_ACCESS_TOKEN".to_owned()));
    }

    #[test]
    fn claude_login_hands_over_the_access_token_only_and_refuses_an_expired_one() {
        let store = MemorySecretStore::new();
        let fresh = || {
            ClaudeOauth::parse(
                r#"{"claudeAiOauth":{"accessToken":"sk-ant-oat01-a","refreshToken":"sk-ant-ort01-r","expiresAt":5000}}"#,
            )
        };
        let h = Handoff::build(
            &ProviderConfig::ClaudeLogin(ClaudeLogin {}),
            &store,
            &logins(&fresh, None),
        )
        .unwrap();
        assert_eq!(
            env_of(&h, "CLAUDE_CODE_OAUTH_TOKEN"),
            Some("sk-ant-oat01-a")
        );
        assert!(!h.payload().contains(&b64(b"sk-ant-ort01-r")));
        let old = || ClaudeOauth::parse(r#"{"claudeAiOauth":{"accessToken":"a","expiresAt":10}}"#);
        let e = Handoff::build(
            &ProviderConfig::ClaudeLogin(ClaudeLogin {}),
            &store,
            &logins(&old, None),
        )
        .unwrap_err();
        assert!(e.to_string().contains("expired"));
        assert!(Handoff::build(
            &ProviderConfig::ClaudeLogin(ClaudeLogin {}),
            &store,
            &logins(&no_claude, None)
        )
        .is_err());

        let token =
            MemorySecretStore::with(&[(keys::CLAUDE_CODE_OAUTH_TOKEN, "sk-ant-oat01-setup")]);
        let t = Handoff::build(
            &ProviderConfig::ClaudeLogin(ClaudeLogin {}),
            &token,
            &logins(&no_claude, None),
        )
        .unwrap();
        assert_eq!(
            env_of(&t, "CLAUDE_CODE_OAUTH_TOKEN"),
            Some("sk-ant-oat01-setup")
        );
        assert_eq!(t.source, "Claude subscription token");
    }

    #[test]
    fn codex_login_hands_over_auth_json_with_a_blank_refresh_token() {
        let dir = std::env::temp_dir().join(format!("oc-handoff-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("auth.json"),
            r#"{"auth_mode":"chatgpt","OPENAI_API_KEY":null,"tokens":{"access_token":"acc","refresh_token":"REFRESH","account_id":"x"},"last_refresh":"t"}"#,
        )
        .unwrap();
        let store = MemorySecretStore::new();
        let h = Handoff::build(
            &ProviderConfig::CodexLogin(CodexLogin {}),
            &store,
            &logins(&no_claude, Some(dir.clone())),
        )
        .unwrap();
        assert_eq!(h.files.len(), 1);
        assert_eq!(h.files[0].0, "codex/auth.json");
        let v: serde_json::Value = serde_json::from_str(h.files[0].1.expose()).unwrap();
        assert_eq!(v["tokens"]["refresh_token"], "");
        assert_eq!(v["tokens"]["access_token"], "acc");
        assert!(!h.payload().contains(&b64(b"REFRESH")));
        let missing = Handoff::build(
            &ProviderConfig::CodexLogin(CodexLogin {}),
            &store,
            &logins(&no_claude, Some(dir.join("nope"))),
        );
        assert!(missing.unwrap_err().to_string().contains("codex login"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn remote_specs() {
        assert_eq!(
            Remote::parse("ssh:vm"),
            Some(Remote::Ssh { host: "vm".into() })
        );
        assert_eq!(Remote::parse("ssh:-oProxyCommand=x"), None);
        assert_eq!(Remote::parse("ssh: "), None);
        assert_eq!(
            Remote::parse("exec:docker exec -i box"),
            Some(Remote::Exec {
                prefix: vec!["docker".into(), "exec".into(), "-i".into(), "box".into()]
            })
        );
        assert_eq!(Remote::parse("docker"), None);
    }

    /// The whole round trip against a local "target" (`env -i sh`): values
    /// arrive intact, the target's own routing variables are unset, nothing
    /// secret is on any command line, and the directory is private and gone
    /// after the agent exits.
    #[cfg(unix)]
    #[test]
    fn install_and_launch_round_trip_on_a_local_target() {
        let tmp = std::env::temp_dir().join(format!("oc-handoff-rt-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        let target = Remote::Exec {
            prefix: vec![
                "env".into(),
                format!("TMPDIR={}", tmp.display()),
                "ANTHROPIC_API_KEY=stale-on-target".into(),
                "PATH=/usr/bin:/bin".into(),
            ],
        };
        let h = Handoff {
            env: vec![
                (
                    "CLAUDE_CODE_OAUTH_TOKEN".into(),
                    EnvValue::Secret(SecretString::new("tok'en with $pace\"s")),
                ),
                (
                    "ANTHROPIC_BASE_URL".into(),
                    EnvValue::Plain("https://x".into()),
                ),
            ],
            unset: vec!["ANTHROPIC_API_KEY".into()],
            files: vec![("codex/auth.json".into(), SecretString::new("{\"a\":1}\n"))],
            source: "test".into(),
        };
        let installed = target.install(&h).unwrap();
        assert!(
            installed.dir.starts_with(&tmp.display().to_string()),
            "{installed:?}"
        );
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&installed.dir)
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o700);
        let fmode = std::fs::metadata(format!("{}/codex/auth.json", installed.dir))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(fmode, 0o600);

        let mut cmd = target.command(
            &installed,
            Some(tmp.to_str().unwrap()),
            "sh",
            &["-c".into(), "printf '%s|%s|%s|%s|' \"$CLAUDE_CODE_OAUTH_TOKEN\" \"${ANTHROPIC_API_KEY-unset}\" \"$ANTHROPIC_BASE_URL\" \"$(pwd)\"; cat \"$CODEX_HOME/auth.json\"".into()],
        );
        let line = format!("{cmd:?}");
        assert!(!line.contains("tok'en") && !line.contains("pace"), "{line}");
        let out = cmd.output().unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        assert_eq!(
            String::from_utf8_lossy(&out.stdout),
            format!(
                "tok'en with $pace\"s|unset|https://x|{}|{{\"a\":1}}\n",
                tmp.display()
            )
        );
        assert!(
            !Path::new(&installed.dir).exists(),
            "hand-off directory left behind"
        );

        let bad = Handoff {
            files: vec![("../escape".into(), SecretString::new("x"))],
            ..Default::default()
        };
        assert!(target.install(&bad).is_err());
        assert!(!tmp.join("escape").exists());
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
