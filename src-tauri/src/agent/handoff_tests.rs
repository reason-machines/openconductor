use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};

use super::super::claude::{AnthropicApi, ClaudeLogin};
use super::super::codex::{CodexLogin, OpenAiApi};
use super::super::reason::ReasonLogin;
use super::super::secret::{keys, MemorySecretStore};
use super::*;

const API_KEY: &str = "sk-ant-api03-handoff-test-key-0123456789";
const OAUTH: &str = "sk-ant-oat01-handoff-test-access-token";
const REFRESH: &str = "sk-ant-ort01-handoff-test-refresh-token";
const CHATGPT_ACCESS: &str = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJlLXRlc3Q";
const CHATGPT_REFRESH: &str = "rt_handoff_test_refresh_token";
const ID_TOKEN: &str = "eyJhbGciOiJub25lIn0.eyJlbWFpbCI6InRAeC55In0.";

fn none_claude() -> Option<ClaudeOauth> {
    None
}
fn none_codex() -> Option<String> {
    None
}

fn logins<'a>(
    claude: &'a dyn Fn() -> Option<ClaudeOauth>,
    codex_auth: &'a dyn Fn() -> Option<String>,
) -> LocalLogins<'a> {
    LocalLogins {
        claude,
        codex_auth,
        now_ms: 1_000_000,
    }
}

fn env_of<'a>(h: &'a Handoff, k: &str) -> Option<&'a str> {
    h.env.iter().find(|(n, _)| n == k).map(|(_, v)| v.expose())
}

fn chatgpt_auth_json() -> String {
    format!(
        r#"{{"auth_mode":"chatgpt","OPENAI_API_KEY":null,"tokens":{{"id_token":"{ID_TOKEN}","access_token":"{CHATGPT_ACCESS}","refresh_token":"{CHATGPT_REFRESH}","account_id":"acct-1234"}},"last_refresh":"2026-11-06T00:00:00Z"}}"#
    )
}

#[test]
fn pbkdf2_matches_openssl_enc_derivation() {
    // python3: hashlib.pbkdf2_hmac('sha256', b'abc', b'', 1, 48)
    let (key, iv) = openssl_key_iv(b"abc");
    let hex = |b: &[u8]| b.iter().map(|x| format!("{x:02x}")).collect::<String>();
    assert_eq!(
        hex(&key),
        "02bc3e52a10247870d62483eaa796f81e78bd892f48888fb4d2b0c5649832786"
    );
    assert_eq!(hex(&iv), "cfd695a23f38755c102c6148748d4614");
}

#[test]
fn fingerprints_are_16_hex_of_sha256() {
    // printf %s sk-x | shasum -a 256 (as tools/e2e/fake_claude.py logs it)
    assert_eq!(fingerprint("sk-x"), "9df37f5e7cbc3c39");
}

#[test]
fn anthropic_api_key_travels_as_a_secret_and_logins_are_unset() {
    let store = MemorySecretStore::with(&[(keys::ANTHROPIC_API_KEY, API_KEY)]);
    let h = Handoff::build(
        &ProviderConfig::AnthropicApi(AnthropicApi::default()),
        &store,
        &logins(&none_claude, &none_codex),
    )
    .unwrap();
    assert_eq!(env_of(&h, "ANTHROPIC_API_KEY"), Some(API_KEY));
    for v in [
        "CLAUDE_CODE_OAUTH_TOKEN",
        "CLAUDE_CODE_OAUTH_SCOPES",
        "ANTHROPIC_BASE_URL",
    ] {
        assert!(h.unset.contains(&v.to_owned()), "{v} not unset: {h:?}");
    }
    assert!(!h.unset.contains(&"ANTHROPIC_API_KEY".to_owned()));
    assert!(!h.private_codex_home);
    assert_eq!(h.source, "Anthropic API key");
}

#[test]
fn claude_login_hands_over_the_access_token_only() {
    let store = MemorySecretStore::new();
    let json = format!(
        r#"{{"claudeAiOauth":{{"accessToken":"{OAUTH}","refreshToken":"{REFRESH}","expiresAt":99999999999,"scopes":["user:inference","user:profile"]}}}}"#
    );
    let fresh = move || ClaudeOauth::parse(&json);
    let h = Handoff::build(
        &ProviderConfig::ClaudeLogin(ClaudeLogin {}),
        &store,
        &logins(&fresh, &none_codex),
    )
    .unwrap();
    assert_eq!(env_of(&h, "CLAUDE_CODE_OAUTH_TOKEN"), Some(OAUTH));
    assert_eq!(
        env_of(&h, "CLAUDE_CODE_OAUTH_SCOPES"),
        Some("user:inference user:profile")
    );
    assert!(h.unset.contains(&"ANTHROPIC_API_KEY".to_owned()));
    assert!(!h.plaintext(b"n").expose().contains(&B64.encode(REFRESH)));
    assert!(!format!("{h:?}").contains(REFRESH));

    let old = || ClaudeOauth::parse(r#"{"claudeAiOauth":{"accessToken":"a","expiresAt":10}}"#);
    let e = Handoff::build(
        &ProviderConfig::ClaudeLogin(ClaudeLogin {}),
        &store,
        &logins(&old, &none_codex),
    )
    .unwrap_err();
    assert!(e.to_string().contains("expired"), "{e}");
    let e = Handoff::build(
        &ProviderConfig::ClaudeLogin(ClaudeLogin {}),
        &store,
        &logins(&none_claude, &none_codex),
    )
    .unwrap_err();
    assert!(e.to_string().contains("claude /login"), "{e}");
}

#[test]
fn codex_chatgpt_login_hands_over_the_access_token_and_account_only() {
    let store = MemorySecretStore::new();
    let auth = || Some(chatgpt_auth_json());
    let h = Handoff::build(
        &ProviderConfig::CodexLogin(CodexLogin {}),
        &store,
        &logins(&none_claude, &auth),
    )
    .unwrap();
    let t = h.codex_chatgpt.as_ref().unwrap();
    assert_eq!(t.access_token.expose(), CHATGPT_ACCESS);
    assert_eq!(t.account_id, "acct-1234");
    assert!(h.private_codex_home);
    assert!(h.unset.contains(&"CODEX_ACCESS_TOKEN".to_owned()));
    assert!(h.unset.contains(&"OPENAI_API_KEY".to_owned()));
    let plain = h.plaintext(b"n");
    for leaked in [CHATGPT_REFRESH, ID_TOKEN] {
        assert!(
            !plain.expose().contains(&B64.encode(leaked)),
            "{leaked} handed over"
        );
    }
    assert!(!format!("{h:?}").contains(CHATGPT_ACCESS));

    let key_auth =
        || Some(r#"{"auth_mode":"apikey","OPENAI_API_KEY":"sk-proj-from-auth-json"}"#.to_owned());
    let k = Handoff::build(
        &ProviderConfig::CodexLogin(CodexLogin {}),
        &store,
        &logins(&none_claude, &key_auth),
    )
    .unwrap();
    assert_eq!(env_of(&k, "CODEX_API_KEY"), Some("sk-proj-from-auth-json"));
    assert!(k.codex_chatgpt.is_none());

    let e = Handoff::build(
        &ProviderConfig::CodexLogin(CodexLogin {}),
        &store,
        &logins(&none_claude, &none_codex),
    )
    .unwrap_err();
    assert!(e.to_string().contains("codex login"), "{e}");
}

#[test]
fn openai_api_key_and_reason() {
    let store = MemorySecretStore::with(&[(keys::OPENAI_API_KEY, "sk-proj-stored")]);
    let h = Handoff::build(
        &ProviderConfig::OpenaiApi(OpenAiApi::default()),
        &store,
        &logins(&none_claude, &none_codex),
    )
    .unwrap();
    assert_eq!(env_of(&h, "CODEX_API_KEY"), Some("sk-proj-stored"));
    assert_eq!(
        h.codex_api_key.as_ref().map(|k| k.expose()),
        Some("sk-proj-stored"),
        "spliced into account/login/start on the target"
    );
    assert!(!format!("{h:?}").contains("sk-proj-stored"));
    assert!(h.private_codex_home);
    assert!(matches!(
        Handoff::build(
            &ProviderConfig::ReasonLogin(ReasonLogin::default()),
            &store,
            &logins(&none_claude, &none_codex)
        ),
        Err(HandoffError::Unsupported(AgentKind::Reason))
    ));
}

#[test]
fn debug_and_logs_never_show_values() {
    let h = Handoff {
        agent: AgentKind::Codex,
        env: vec![
            (
                "CODEX_API_KEY".into(),
                EnvValue::Secret(SecretString::new("sk-proj-secret-value")),
            ),
            (
                "OPENAI_BASE_URL".into(),
                EnvValue::Plain("https://gw.example".into()),
            ),
        ],
        unset: vec![],
        private_codex_home: true,
        codex_chatgpt: Some(ChatgptTokens {
            access_token: SecretString::new(CHATGPT_ACCESS),
            account_id: "acct".into(),
        }),
        codex_api_key: Some(SecretString::new("sk-proj-secret-value")),
        source: "test",
    };
    let shown = format!("{h:?} {:?}", h.fingerprints());
    assert!(!shown.contains("sk-proj-secret-value"), "{shown}");
    assert!(!shown.contains(CHATGPT_ACCESS), "{shown}");
    assert!(shown.contains("CODEX_API_KEY=<redacted>"), "{shown}");
    assert!(
        shown.contains("OPENAI_BASE_URL=https://gw.example"),
        "{shown}"
    );
    let t = TargetLaunch {
        transport: Transport::Exec {
            prefix: vec!["env".into()],
        },
        dir: "/w".into(),
        program: "codex".into(),
        handoff: h,
    };
    let shown = format!("{t:?} {:?}", t.command(&["app-server".into()]));
    assert!(
        !shown.contains("sk-proj-secret-value") && !shown.contains(CHATGPT_ACCESS),
        "{shown}"
    );
}

/// An `openssl` with X25519 (OpenSSL 1.1.1+/3; macOS's LibreSSL may lack it).
fn openssl_dir() -> Option<String> {
    for dir in [
        "/opt/homebrew/opt/openssl@3/bin",
        "/usr/local/opt/openssl@3/bin",
        "/usr/bin",
        "/usr/local/bin",
        "/opt/homebrew/bin",
    ] {
        let exe = Path::new(dir).join("openssl");
        let ok = std::process::Command::new(&exe)
            .args(["genpkey", "-algorithm", "X25519"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success());
        if ok {
            return Some(dir.to_owned());
        }
    }
    None
}

/// Copies every byte that crosses the channel, as a stored receipt would.
#[derive(Clone, Default)]
struct Tap(Arc<Mutex<Vec<u8>>>);
struct TapRead<R>(R, Tap);
struct TapWrite<W>(W, Tap);
impl<R: Read> Read for TapRead<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.0.read(buf)?;
        self.1 .0.lock().unwrap().extend_from_slice(&buf[..n]);
        Ok(n)
    }
}
impl<W: Write> Write for TapWrite<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let n = self.0.write(buf)?;
        self.1 .0.lock().unwrap().extend_from_slice(&buf[..n]);
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.0.flush()
    }
}

struct Target {
    tmp: std::path::PathBuf,
    transport: Transport,
}

/// A fresh "machine": `env -i` with an empty HOME and TMPDIR and a stale
/// key of its own, as a VM's shell might have.
fn target(name: &str) -> Option<Target> {
    let ssl = openssl_dir()?;
    let tmp = std::env::temp_dir().join(format!("oc-handoff-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(tmp.join("home")).unwrap();
    std::fs::create_dir_all(tmp.join("work")).unwrap();
    let transport = Transport::Exec {
        prefix: vec![
            "env".into(),
            "-i".into(),
            format!("PATH={ssl}:/usr/bin:/bin"),
            format!("HOME={}", tmp.join("home").display()),
            format!("TMPDIR={}", tmp.display()),
            "ANTHROPIC_API_KEY=stale-key-on-the-target".into(),
            "CODEX_ACCESS_TOKEN=stale-codex-token-on-the-target".into(),
        ],
    };
    Some(Target { tmp, transport })
}

/// Shell snippet: prints the fingerprint of `t:<$1>`, salted so the
/// channel can also be checked for the plain fingerprint.
const FP: &str =
    r#"fp() { printf 't:%s' "$1" | openssl dgst -sha256 | sed 's/.*= //' | cut -c1-16; }"#;

fn assert_clean(channel: &[u8], secrets: &[&str]) {
    let text = String::from_utf8_lossy(channel);
    for s in secrets {
        assert!(!text.contains(s), "plaintext secret crossed the channel");
        assert!(
            !text.contains(&B64.encode(s)),
            "base64 of a secret crossed the channel"
        );
        assert!(
            !text.contains(&fingerprint(s)),
            "a secret's fingerprint crossed the channel"
        );
    }
}

#[cfg(unix)]
#[test]
fn claude_round_trip_carries_only_ciphertext_and_cleans_up() {
    let Some(t) = target("claude") else {
        eprintln!("note: no openssl with X25519; round trip skipped");
        return;
    };
    let store = MemorySecretStore::with(&[(keys::ANTHROPIC_API_KEY, API_KEY)]);
    let handoff = Handoff::build(
        &ProviderConfig::AnthropicApi(AnthropicApi::default()),
        &store,
        &logins(&none_claude, &none_codex),
    )
    .unwrap();
    let launch = TargetLaunch {
        transport: t.transport.clone(),
        dir: t.tmp.join("work").display().to_string(),
        program: "sh".into(),
        handoff,
    };
    let script = format!(
        r#"{FP}; d=$(dirname "$(pwd)"); printf '%s|%s|%s|%s|%s\n' "$(fp "$ANTHROPIC_API_KEY")" "${{CLAUDE_CODE_OAUTH_TOKEN-unset}}" "${{CODEX_ACCESS_TOKEN+kept}}" "$(pwd)" "$(ls -d "$TMPDIR"/oc-agent-auth.* | wc -l | tr -d ' ')"; cat"#
    );
    let mut cmd = launch.command(&["-c".into(), script]);
    let shown = format!("{cmd:?}");
    assert!(!shown.contains(API_KEY), "secret on a command line");
    let mut child = cmd.spawn().unwrap();
    let tap = Tap::default();
    let mut out = TapRead(child.stdout.take().unwrap(), tap.clone());
    let mut inp = TapWrite(child.stdin.take().unwrap(), tap.clone());
    handshake(&mut out, &mut inp, &launch.handoff).unwrap();
    inp.write_all(b"hello from the app\n").unwrap();
    drop(inp);
    let mut rest = String::new();
    out.read_to_string(&mut rest).unwrap();
    let status = child.wait().unwrap();
    let mut err = String::new();
    child
        .stderr
        .take()
        .unwrap()
        .read_to_string(&mut err)
        .unwrap();
    assert!(status.success(), "{err}");
    let fields: Vec<&str> = rest.lines().next().unwrap().split('|').collect();
    assert_eq!(
        fields[0],
        fingerprint(&format!("t:{API_KEY}")),
        "the key arrived intact"
    );
    assert_eq!(fields[1], "unset");
    assert_eq!(
        fields[2], "kept",
        "Codex's variable is not Claude's to unset"
    );
    assert_eq!(fields[3], t.tmp.join("work").display().to_string());
    assert_eq!(fields[4], "1", "one private directory while the agent runs");
    assert_eq!(rest.lines().nth(1), Some("hello from the app"));
    assert_clean(&tap.0.lock().unwrap(), &[API_KEY]);
    let left: Vec<_> = std::fs::read_dir(&t.tmp)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("oc-agent-auth.")
        })
        .collect();
    assert!(left.is_empty(), "hand-off directory left behind");
    let _ = std::fs::remove_dir_all(&t.tmp);
}

#[cfg(unix)]
#[test]
fn codex_chatgpt_token_is_spliced_on_the_target_and_never_crosses() {
    let Some(t) = target("codex") else {
        eprintln!("note: no openssl with X25519; round trip skipped");
        return;
    };
    let auth = || Some(chatgpt_auth_json());
    let handoff = Handoff::build(
        &ProviderConfig::CodexLogin(CodexLogin {}),
        &MemorySecretStore::new(),
        &logins(&none_claude, &auth),
    )
    .unwrap();
    let launch = TargetLaunch {
        transport: t.transport.clone(),
        dir: t.tmp.join("work").display().to_string(),
        program: "sh".into(),
        handoff,
    };
    // Stands in for `codex app-server`: reports its CODEX_HOME and the
    // fingerprint of each request line it receives.
    let script = format!(
        r#"{FP}; printf 'home %s %s %s\n' "$(ls -ld "$CODEX_HOME" | cut -c1-10)" "$(ls -A "$CODEX_HOME" | wc -l | tr -d ' ')" "${{CODEX_ACCESS_TOKEN-unset}}"; while IFS= read -r l; do printf 'got %s\n' "$(fp "$l")"; done"#
    );
    let mut child = launch.command(&["-c".into(), script]).spawn().unwrap();
    let tap = Tap::default();
    let mut out = TapRead(child.stdout.take().unwrap(), tap.clone());
    let mut inp = TapWrite(child.stdin.take().unwrap(), tap.clone());
    handshake(&mut out, &mut inp, &launch.handoff).unwrap();
    let request = format!(
        r#"{{"method":"account/login/start","id":1,"params":{{"type":"chatgptAuthTokens","accessToken":"{ACCESS_PLACEHOLDER}","chatgptAccountId":"{ACCOUNT_PLACEHOLDER}"}}}}"#
    );
    inp.write_all(format!("{request}\n").as_bytes()).unwrap();
    drop(inp);
    let mut rest = String::new();
    out.read_to_string(&mut rest).unwrap();
    assert!(child.wait().unwrap().success(), "{rest}");
    let spliced = request
        .replace(ACCESS_PLACEHOLDER, CHATGPT_ACCESS)
        .replace(ACCOUNT_PLACEHOLDER, "acct-1234");
    let lines: Vec<&str> = rest.lines().collect();
    assert_eq!(lines[0], "home drwx------ 0 unset", "{rest}");
    assert_eq!(
        lines[1],
        format!("got {}", fingerprint(&format!("t:{spliced}"))),
        "{rest}"
    );
    assert_clean(&tap.0.lock().unwrap(), &[CHATGPT_ACCESS, CHATGPT_REFRESH]);
    let _ = std::fs::remove_dir_all(&t.tmp);
}

#[cfg(unix)]
#[test]
fn codex_api_key_is_spliced_on_the_target_and_never_crosses() {
    const KEY: &str = "sk-proj-handoff-test-openai-key_0123";
    let Some(t) = target("codex-key") else {
        eprintln!("note: no openssl with X25519; round trip skipped");
        return;
    };
    let handoff = Handoff::build(
        &ProviderConfig::OpenaiApi(OpenAiApi::default()),
        &MemorySecretStore::with(&[(keys::OPENAI_API_KEY, KEY)]),
        &logins(&none_claude, &none_codex),
    )
    .unwrap();
    let launch = TargetLaunch {
        transport: t.transport.clone(),
        dir: t.tmp.join("work").display().to_string(),
        program: "sh".into(),
        handoff,
    };
    let script = format!(r#"{FP}; while IFS= read -r l; do printf 'got %s\n' "$(fp "$l")"; done"#);
    let mut child = launch.command(&["-c".into(), script]).spawn().unwrap();
    let tap = Tap::default();
    let mut out = TapRead(child.stdout.take().unwrap(), tap.clone());
    let mut inp = TapWrite(child.stdin.take().unwrap(), tap.clone());
    handshake(&mut out, &mut inp, &launch.handoff).unwrap();
    let request = format!(
        r#"{{"method":"account/login/start","id":1,"params":{{"type":"apiKey","apiKey":"{APIKEY_PLACEHOLDER}"}}}}"#
    );
    inp.write_all(format!("{request}\n").as_bytes()).unwrap();
    drop(inp);
    let mut rest = String::new();
    out.read_to_string(&mut rest).unwrap();
    assert!(child.wait().unwrap().success(), "{rest}");
    let spliced = request.replace(APIKEY_PLACEHOLDER, KEY);
    assert_eq!(
        rest.lines().next(),
        Some(format!("got {}", fingerprint(&format!("t:{spliced}"))).as_str()),
        "{rest}"
    );
    assert_clean(&tap.0.lock().unwrap(), &[KEY]);
    let _ = std::fs::remove_dir_all(&t.tmp);
}

#[cfg(unix)]
#[test]
fn a_tampered_envelope_is_refused_on_the_target() {
    let Some(t) = target("tamper") else {
        return;
    };
    let handoff = Handoff {
        agent: AgentKind::Claude,
        env: vec![(
            "ANTHROPIC_API_KEY".into(),
            EnvValue::Secret(SecretString::new(API_KEY)),
        )],
        unset: vec![],
        private_codex_home: false,
        codex_chatgpt: None,
        codex_api_key: None,
        source: "test",
    };
    let mut child = t.transport.command("/", "true", &[]).spawn().unwrap();
    let mut out = child.stdout.take().unwrap();
    let mut inp = child.stdin.take().unwrap();
    let line = read_line_raw(&mut out).unwrap().unwrap();
    let key: [u8; 32] = B64
        .decode(line.strip_prefix("OCPUB1 ").unwrap())
        .unwrap()
        .try_into()
        .unwrap();
    let sealed = seal(&handoff, &key).unwrap();
    let mut parts: Vec<String> = sealed.trim_end().split(' ').map(str::to_owned).collect();
    let mut ct = B64.decode(&parts[2]).unwrap();
    ct[0] ^= 1;
    parts[2] = B64.encode(ct);
    inp.write_all(format!("{}\n", parts.join(" ")).as_bytes())
        .unwrap();
    let reply = read_line_raw(&mut out).unwrap().unwrap();
    assert_eq!(reply, "OCFAIL1 checksum");
    assert!(!child.wait().unwrap().success());
    let _ = std::fs::remove_dir_all(&t.tmp);
}

#[cfg(unix)]
#[test]
fn a_target_stopped_mid_hand_off_removes_its_private_key() {
    let Some(t) = target("killed") else {
        return;
    };
    let mut child = t.transport.command("/", "true", &[]).spawn().unwrap();
    let mut out = child.stdout.take().unwrap();
    let line = read_line_raw(&mut out).unwrap().unwrap();
    assert!(line.starts_with("OCPUB1 "), "{line}");
    let dirs = || {
        std::fs::read_dir(&t.tmp)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("oc-agent-auth.")
            })
            .count()
    };
    assert_eq!(dirs(), 1, "the key directory exists while waiting");
    // `env` execs sh, so the child is the target shell itself.
    unsafe { libc_kill(child.id() as i32, 15) };
    assert!(!child.wait().unwrap().success());
    assert_eq!(dirs(), 0, "private key left behind after TERM");
    let _ = std::fs::remove_dir_all(&t.tmp);
}

#[cfg(unix)]
extern "C" {
    #[link_name = "kill"]
    fn libc_kill(pid: i32, sig: i32) -> i32;
}

/// A real chat session (stream-json `claude`, `codex app-server` JSON-RPC)
/// on a fresh target, with the repository's fake CLIs standing in for the
/// agents: the turn runs with no sign-in there.
#[cfg(unix)]
mod sessions {
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    use serde_json::Value;

    use super::super::super::claude_cli::ClaudeLaunch;
    use super::super::super::claude_session::{ClaudeSession, SessionEvent};
    use super::super::super::claude_stream::ClaudeEvent;
    use super::super::super::codex_cli::CodexLaunch;
    use super::super::super::codex_rpc::ThreadOptions;
    use super::super::super::codex_runner::{CodexRunner, RunnerConfig, Timeouts};
    use super::super::super::codex_wire::Outcome;
    use super::super::super::env::LaunchEnv;
    use super::*;

    /// The repository: from this file's path when the harness compiled it by
    /// absolute path (tools/agent/run-rust-tests.sh), else src-tauri/..
    fn repo() -> std::path::PathBuf {
        let file = Path::new(file!());
        match file.ancestors().nth(4) {
            Some(root) if file.is_absolute() => root.to_path_buf(),
            _ => Path::new(env!("CARGO_MANIFEST_DIR")).join(".."),
        }
    }

    /// The fake at `tools/e2e/<name>` as `<tmp>/bin/<cmd>`, on the target's PATH.
    fn install_fake(t: &Target, name: &str, cmd: &str) -> Option<String> {
        let fake = repo().join("tools/e2e").join(name);
        assert!(fake.exists(), "{} missing", fake.display());
        let bin = t.tmp.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let python = std::process::Command::new("sh")
            .args(["-c", "command -v python3"])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
            .filter(|p| !p.is_empty())?;
        let path = bin.join(cmd);
        std::fs::write(
            &path,
            format!("#!/bin/sh\nexec {python} {} \"$@\"\n", fake.display()),
        )
        .unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        Some(path.display().to_string())
    }

    fn fake_log(t: &Target, file: &str) -> Vec<Value> {
        std::fs::read_to_string(t.tmp.join("home").join(file))
            .unwrap_or_default()
            .lines()
            .filter_map(|l| serde_json::from_str(l).ok())
            .collect()
    }

    #[test]
    fn a_claude_code_chat_on_a_fresh_target_runs_a_turn_with_the_handed_over_key() {
        let Some(t) = target("claude-session") else {
            return;
        };
        let Some(program) = install_fake(&t, "fake_claude.py", "claude") else {
            return;
        };
        let store = MemorySecretStore::with(&[(keys::ANTHROPIC_API_KEY, API_KEY)]);
        let handoff = Handoff::build(
            &ProviderConfig::AnthropicApi(AnthropicApi::default()),
            &store,
            &logins(&none_claude, &none_codex),
        )
        .unwrap();
        let mut launch = ClaudeLaunch::new("/not/on/the/target", LaunchEnv::new());
        launch.plugin_dirs = vec!["/only/on/this/mac".into()];
        launch.target = Some(TargetLaunch {
            transport: t.transport.clone(),
            dir: t.tmp.join("work").display().to_string(),
            program,
            handoff,
        });
        let mut session = ClaudeSession::spawn(&launch).unwrap();
        session.send_user("hello from a cloud computer").unwrap();
        let deadline = Instant::now() + Duration::from_secs(20);
        let result = loop {
            assert!(Instant::now() < deadline, "no result");
            match session.next_event(Duration::from_secs(1)) {
                Some(SessionEvent::Event(ClaudeEvent::Result(r))) => break r,
                Some(SessionEvent::Closed) => {
                    panic!("claude exited: {:?}", session.pending_events())
                }
                _ => {}
            }
        };
        assert!(!result.is_error, "{result:?}");
        assert_eq!(
            result.text.as_deref(),
            Some("turn 1: hello from a cloud computer (auth: apikey)")
        );
        drop(session);
        let launch_line = fake_log(&t, "claude-fake.jsonl")
            .into_iter()
            .find(|l| l.get("launch").is_some())
            .unwrap();
        let keys = &launch_line["launch"]["keys"];
        assert_eq!(
            keys["ANTHROPIC_API_KEY"],
            fingerprint(API_KEY),
            "the stale target key was replaced"
        );
        assert_eq!(keys["CLAUDE_CODE_OAUTH_TOKEN"], Value::Null);
        assert_eq!(
            launch_line["launch"]["login_file"], false,
            "no login on the target"
        );
        let args = launch_line["launch"]["args"].to_string();
        assert!(!args.contains("/only/on/this/mac"), "{args}");
        let _ = std::fs::remove_dir_all(&t.tmp);
    }

    #[test]
    fn a_claude_code_chat_on_the_cli_login_gets_its_access_token_only() {
        let Some(t) = target("claude-login") else {
            return;
        };
        let Some(program) = install_fake(&t, "fake_claude.py", "claude") else {
            return;
        };
        let json = format!(
            r#"{{"claudeAiOauth":{{"accessToken":"{OAUTH}","refreshToken":"{REFRESH}","expiresAt":99999999999,"scopes":["user:inference"]}}}}"#
        );
        let login = move || ClaudeOauth::parse(&json);
        let handoff = Handoff::build(
            &ProviderConfig::ClaudeLogin(ClaudeLogin {}),
            &MemorySecretStore::new(),
            &logins(&login, &none_codex),
        )
        .unwrap();
        let mut launch = ClaudeLaunch::new("/", LaunchEnv::new());
        launch.target = Some(TargetLaunch {
            transport: t.transport.clone(),
            dir: t.tmp.join("work").display().to_string(),
            program,
            handoff,
        });
        let mut session = ClaudeSession::spawn(&launch).unwrap();
        session.send_user("hi").unwrap();
        let deadline = Instant::now() + Duration::from_secs(20);
        let result = loop {
            assert!(Instant::now() < deadline, "no result");
            if let Some(SessionEvent::Event(ClaudeEvent::Result(r))) =
                session.next_event(Duration::from_secs(1))
            {
                break r;
            }
        };
        assert_eq!(
            result.text.as_deref(),
            Some("turn 1: hi (auth: oauth-token)")
        );
        drop(session);
        let line = fake_log(&t, "claude-fake.jsonl")
            .into_iter()
            .find(|l| l.get("launch").is_some())
            .unwrap();
        assert_eq!(
            line["launch"]["keys"]["CLAUDE_CODE_OAUTH_TOKEN"],
            fingerprint(OAUTH)
        );
        assert_eq!(
            line["launch"]["keys"]["ANTHROPIC_API_KEY"],
            Value::Null,
            "the target's stale key was unset"
        );
        assert_eq!(line["launch"]["oauth_scopes"], "user:inference");
        let _ = std::fs::remove_dir_all(&t.tmp);
    }

    #[test]
    fn a_codex_chat_on_a_fresh_target_signs_in_with_the_chatgpt_access_token() {
        let Some(t) = target("codex-session") else {
            return;
        };
        let Some(program) = install_fake(&t, "fake_codex_app_server.py", "codex") else {
            return;
        };
        let auth = || Some(chatgpt_auth_json());
        let handoff = Handoff::build(
            &ProviderConfig::CodexLogin(CodexLogin {}),
            &MemorySecretStore::new(),
            &logins(&none_claude, &auth),
        )
        .unwrap();
        let mut launch = CodexLaunch::new("/", LaunchEnv::new());
        launch.target = Some(TargetLaunch {
            transport: t.transport.clone(),
            dir: t.tmp.join("work").display().to_string(),
            program,
            handoff,
        });
        let seen = Arc::new(Mutex::new(Vec::<Value>::new()));
        let s = seen.clone();
        let runner = CodexRunner::start(
            RunnerConfig {
                launch,
                thread: ThreadOptions::default(),
                resume: None,
                client_name: "openconductor".into(),
                client_version: "0.0.0".into(),
                timeouts: Timeouts::default(),
            },
            Arc::new(move |p| s.lock().unwrap().push(serde_json::to_value(p).unwrap())),
        );
        let end = runner
            .prompt("hi from a cloud computer", None, None)
            .recv_timeout(Duration::from_secs(30))
            .map_err(|e: mpsc::RecvTimeoutError| e.to_string())
            .unwrap();
        assert_eq!(
            end.outcome,
            Outcome::Completed,
            "{end:?} {:?}",
            seen.lock().unwrap()
        );
        let shown = serde_json::to_string(&*seen.lock().unwrap()).unwrap();
        assert!(
            shown.contains("turn 1: hi from a cloud computer (auth: chatgptAuthTokens)"),
            "{shown}"
        );
        assert!(!shown.contains(CHATGPT_ACCESS));
        drop(runner);
        let log = fake_log(&t, "codex-fake.jsonl");
        let launch_line = log.iter().find(|l| l.get("launch").is_some()).unwrap();
        assert_eq!(
            launch_line["launch"]["access_token_env"],
            Value::Null,
            "the target's stale token was unset"
        );
        assert_eq!(launch_line["launch"]["codex_home"], true);
        let login = log
            .iter()
            .find_map(|l| l.get("tokens_login"))
            .expect("signed in with tokens");
        assert_eq!(login["access"], fingerprint(CHATGPT_ACCESS));
        assert_eq!(login["account"], "acct-1234");
        let text = serde_json::to_string(&log).unwrap();
        assert!(!text.contains(CHATGPT_ACCESS) && !text.contains(CHATGPT_REFRESH));
        let _ = std::fs::remove_dir_all(&t.tmp);
    }

    #[test]
    fn a_codex_chat_on_a_fresh_target_logs_in_with_the_handed_over_api_key() {
        const KEY: &str = "sk-proj-handoff-test-openai-key_4567";
        let Some(t) = target("codex-key-session") else {
            return;
        };
        let Some(program) = install_fake(&t, "fake_codex_app_server.py", "codex") else {
            return;
        };
        let handoff = Handoff::build(
            &ProviderConfig::OpenaiApi(OpenAiApi::default()),
            &MemorySecretStore::with(&[(keys::OPENAI_API_KEY, KEY)]),
            &logins(&none_claude, &none_codex),
        )
        .unwrap();
        // The app's own launch env also carries the key (OpenAI API mode);
        // the app-server's stdin must still get only the placeholder.
        let mut env = LaunchEnv::new();
        env.set_secret(vars::CODEX_API_KEY, SecretString::new(KEY));
        let mut launch = CodexLaunch::new("/", env);
        launch.target = Some(TargetLaunch {
            transport: t.transport.clone(),
            dir: t.tmp.join("work").display().to_string(),
            program,
            handoff,
        });
        let seen = Arc::new(Mutex::new(Vec::<Value>::new()));
        let s = seen.clone();
        let runner = CodexRunner::start(
            RunnerConfig {
                launch,
                thread: ThreadOptions::default(),
                resume: None,
                client_name: "openconductor".into(),
                client_version: "0.0.0".into(),
                timeouts: Timeouts::default(),
            },
            Arc::new(move |p| s.lock().unwrap().push(serde_json::to_value(p).unwrap())),
        );
        let end = runner
            .prompt("hi with a key", None, None)
            .recv_timeout(Duration::from_secs(30))
            .map_err(|e: mpsc::RecvTimeoutError| e.to_string())
            .unwrap();
        assert_eq!(
            end.outcome,
            Outcome::Completed,
            "{end:?} {:?}",
            seen.lock().unwrap()
        );
        let shown = serde_json::to_string(&*seen.lock().unwrap()).unwrap();
        assert!(!shown.contains(KEY));
        drop(runner);
        let log = fake_log(&t, "codex-fake.jsonl");
        let login = log
            .iter()
            .find(|l| l["method"] == "account/login/start")
            .expect("logged in after initialized");
        assert_eq!(login["params"]["type"], "apiKey");
        assert_eq!(
            login["params"]["apiKey"],
            format!("sha256:{}", fingerprint(KEY)),
            "the target spliced the real key in"
        );
        let launch_line = log.iter().find(|l| l.get("launch").is_some()).unwrap();
        assert!(
            launch_line["launch"]["args"]
                .to_string()
                .contains("cli_auth_credentials_store"),
            "{launch_line}"
        );
        assert_eq!(launch_line["launch"]["codex_home"], true);
        let text = serde_json::to_string(&log).unwrap();
        assert!(!text.contains(KEY));
        let _ = std::fs::remove_dir_all(&t.tmp);
    }
}
