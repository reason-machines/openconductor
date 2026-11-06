//! Handing the selected agent credential to another machine (a Reason cloud
//! computer, a VM) for one launch, so Claude Code or Codex runs there signed
//! in with no sign-in step.
//!
//! What Conductor 0.87.6 does for its cloud workspaces (read from its
//! `conductor-runtime.js` on sven m5 max; strings are data; see
//! `evidence/agent-auth/vm-handoff.md`): the credential is fetched **per
//! spawn**, never stored on the VM. Claude gets `CLAUDE_CODE_OAUTH_TOKEN`
//! (and `CLAUDE_CODE_OAUTH_SCOPES`) or its API key in that spawn's
//! environment, with `ANTHROPIC_API_KEY` deleted when the token is used.
//! Codex gets `CODEX_API_KEY`, or its ChatGPT login as an *access token over
//! the app-server JSON-RPC*: `account/login/start {type:"chatgptAuthTokens",
//! accessToken, chatgptAccountId}`, refreshed by answering Codex's
//! `account/chatgptAuthTokens/refresh` request. No refresh token ever
//! leaves the user's machine.
//!
//! OpenConductor does the same with no server of its own:
//!
//! * [`Handoff::build`] turns the provider selected in Settings › Agents into
//!   the values one launch needs: an API key, or the access token of the
//!   CLI's own login (Claude) / ChatGPT login (Codex). Refresh tokens are
//!   never read into it.
//! * The target runs [`TARGET_SH`]: it makes a private `mktemp -d`
//!   directory, generates an ephemeral X25519 key there and prints only its
//!   public key (`OCPUB1`). [`handshake`] encrypts the hand-off to that key
//!   ([`seal`]: X25519, SHA-256, AES-256-CTR) and writes one `OCENV1` line.
//!   Whatever carries the bytes between the two (a pipe in tests; a channel
//!   that keeps what it carries, such as the Reason device channel's
//!   terminal, whose operations Reason stores as durable job receipts) sees
//!   only ciphertext: the private key never leaves the target
//!   process's 0700 directory and is deleted before the agent starts.
//! * The target decrypts with `openssl` reading every key from a 0600 file
//!   (never argv), exports the values in the shell (never argv), prints
//!   `OCREADY1`, and runs the agent on the same stdin/stdout. Codex's
//!   ChatGPT token is spliced into the app-server's stdin by the target in
//!   place of [`ACCESS_PLACEHOLDER`] / [`ACCOUNT_PLACEHOLDER`], so even the
//!   `account/login/start` request this app writes carries placeholders only.
//!   The directory (and Codex's private `CODEX_HOME` inside it) is removed
//!   when the agent exits.

use std::fmt;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use aes::cipher::{KeyIvInit, StreamCipher};
use base64::Engine as _;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

use super::byok::ProviderConfig;
use super::env::{vars, AgentKind, EnvValue};
use super::secret::{SecretStore, SecretString};

/// Placeholders the target replaces with the Codex ChatGPT login.
pub const ACCESS_PLACEHOLDER: &str = "@OC_SECRET_ACCESS@";
pub const ACCOUNT_PLACEHOLDER: &str = "@OC_SECRET_ACCOUNT@";

const KDF_CONTEXT: &[u8] = b"openconductor-agent-handoff-v1";
const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HandoffError {
    /// The provider could not build its environment (missing key, ...).
    Provider(String),
    /// The CLI login to hand over is missing or unusable; safe to show.
    Login(String),
    /// The agent has no hand-off (Reason runs its own cloud).
    Unsupported(AgentKind),
}

impl fmt::Display for HandoffError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HandoffError::Provider(e) | HandoffError::Login(e) => f.write_str(e),
            HandoffError::Unsupported(a) => write!(f, "{a} chats cannot run on another machine"),
        }
    }
}

impl std::error::Error for HandoffError {}

/// Claude Code's own login, as `claude /login` stores it (the Keychain item
/// `Claude Code-credentials` on macOS, `~/.claude/.credentials.json`
/// elsewhere). Only the access token is kept; the refresh token is not read.
#[derive(Clone, PartialEq, Eq)]
pub struct ClaudeOauth {
    pub access_token: SecretString,
    pub scopes: Vec<String>,
    /// Milliseconds since the epoch.
    pub expires_at: Option<i64>,
}

impl fmt::Debug for ClaudeOauth {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ClaudeOauth")
            .field("access_token", &"<redacted>")
            .field("scopes", &self.scopes)
            .field("expires_at", &self.expires_at)
            .finish()
    }
}

impl ClaudeOauth {
    pub fn parse(json: &str) -> Option<ClaudeOauth> {
        let v: serde_json::Value = serde_json::from_str(json).ok()?;
        let o = v.get("claudeAiOauth")?;
        let token = o.get("accessToken")?.as_str().filter(|t| !t.is_empty())?;
        Some(ClaudeOauth {
            access_token: SecretString::new(token),
            scopes: o
                .get("scopes")
                .and_then(|s| s.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|s| s.as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default(),
            expires_at: o.get("expiresAt").and_then(|e| e.as_i64()),
        })
    }

    pub fn expired(&self, now_ms: i64) -> bool {
        self.expires_at.is_some_and(|e| e <= now_ms + 60_000)
    }
}

/// A Codex ChatGPT login's access token and account. `Debug` hides the token.
#[derive(Clone, PartialEq, Eq)]
pub struct ChatgptTokens {
    pub access_token: SecretString,
    pub account_id: String,
}

impl fmt::Debug for ChatgptTokens {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ChatgptTokens")
            .field("access_token", &"<redacted>")
            .field("account_id", &self.account_id)
            .finish()
    }
}

/// What `$CODEX_HOME/auth.json` holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodexAuth {
    ApiKey(SecretString),
    Chatgpt(ChatgptTokens),
}

/// Reads Codex's `auth.json`: the ChatGPT access token and account id (the
/// refresh and id tokens are left behind), else its stored API key.
pub fn parse_codex_auth(json: &str) -> Option<CodexAuth> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let tokens = v.get("tokens");
    let access = tokens
        .and_then(|t| t.get("access_token"))
        .and_then(|t| t.as_str())
        .filter(|t| !t.is_empty());
    let account = tokens
        .and_then(|t| t.get("account_id"))
        .and_then(|t| t.as_str())
        .filter(|t| !t.is_empty());
    if let (Some(access), Some(account)) = (access, account) {
        return Some(CodexAuth::Chatgpt(ChatgptTokens {
            access_token: SecretString::new(access),
            account_id: account.to_owned(),
        }));
    }
    v.get("OPENAI_API_KEY")
        .and_then(|k| k.as_str())
        .filter(|k| !k.is_empty())
        .map(|k| CodexAuth::ApiKey(SecretString::new(k)))
}

/// How to read the CLIs' own logins on this machine (injected in tests).
pub struct LocalLogins<'a> {
    pub claude: &'a dyn Fn() -> Option<ClaudeOauth>,
    /// The text of Codex's `auth.json`.
    pub codex_auth: &'a dyn Fn() -> Option<String>,
    pub now_ms: i64,
}

/// What the target needs for one signed-in launch. `Debug` hides values.
#[derive(Clone, PartialEq, Eq)]
pub struct Handoff {
    pub agent: AgentKind,
    /// Variables to export on the target.
    pub env: Vec<(String, EnvValue)>,
    /// Variables to unset on the target first (routing variables).
    pub unset: Vec<String>,
    /// Run Codex with a private, empty `CODEX_HOME` (removed on exit), so a
    /// login on the target is neither used nor written.
    pub private_codex_home: bool,
    /// Codex ChatGPT login, spliced into `account/login/start` by the target.
    pub codex_chatgpt: Option<ChatgptTokens>,
    /// What was handed over, safe to show.
    pub source: &'static str,
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
        f.debug_struct("Handoff")
            .field("agent", &self.agent)
            .field("env", &env)
            .field("unset", &self.unset)
            .field("private_codex_home", &self.private_codex_home)
            .field("codex_chatgpt", &self.codex_chatgpt)
            .field("source", &self.source)
            .finish()
    }
}

fn is_var_name(n: &str) -> bool {
    let mut c = n.chars();
    c.next().is_some_and(|f| f.is_ascii_uppercase() || f == '_')
        && c.all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '_')
}

/// A JWT or account id: safe inside a JSON string without escaping.
fn is_token_text(s: &str) -> bool {
    !s.is_empty()
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}

impl Handoff {
    /// The hand-off for the provider `config` selects, built at launch time.
    pub fn build(
        config: &ProviderConfig,
        store: &dyn SecretStore,
        logins: &LocalLogins,
    ) -> Result<Handoff, HandoffError> {
        let agent = config.provider().agent();
        if agent == AgentKind::Reason {
            return Err(HandoffError::Unsupported(agent));
        }
        let env = config
            .launch_env(store)
            .map_err(|e| HandoffError::Provider(e.to_string()))?;
        let mut h = Handoff {
            agent,
            env: env
                .set_vars()
                .map(|(k, v)| (k.to_owned(), v.clone()))
                .collect(),
            unset: agent
                .routing_vars()
                .iter()
                .map(|s| (*s).to_owned())
                .collect(),
            private_codex_home: agent == AgentKind::Codex,
            codex_chatgpt: None,
            source: "",
        };
        if agent == AgentKind::Claude {
            h.unset.push(vars::CLAUDE_CODE_OAUTH_TOKEN.into());
            h.unset.push(vars::CLAUDE_CODE_OAUTH_SCOPES.into());
        }
        match config {
            ProviderConfig::ClaudeLogin(_) => {
                let login = (logins.claude)().ok_or_else(|| {
                    HandoffError::Login(
                        "Claude Code is not signed in on this Mac: run claude /login".into(),
                    )
                })?;
                if login.expired(logins.now_ms) {
                    return Err(HandoffError::Login(
                        "Claude Code's login on this Mac has expired: run claude once here to refresh it".into(),
                    ));
                }
                h.env.push((
                    vars::CLAUDE_CODE_OAUTH_TOKEN.into(),
                    EnvValue::Secret(login.access_token),
                ));
                if !login.scopes.is_empty() {
                    h.env.push((
                        vars::CLAUDE_CODE_OAUTH_SCOPES.into(),
                        EnvValue::Plain(login.scopes.join(" ")),
                    ));
                }
                h.source = "Claude Code login (access token only)";
            }
            ProviderConfig::AnthropicApi(_) => h.source = "Anthropic API key",
            ProviderConfig::CodexLogin(_) => {
                let text = (logins.codex_auth)().ok_or_else(|| {
                    HandoffError::Login(
                        "Codex is not signed in on this Mac: run codex login".into(),
                    )
                })?;
                match parse_codex_auth(&text) {
                    Some(CodexAuth::Chatgpt(t)) => {
                        if !is_token_text(t.access_token.expose()) || !is_token_text(&t.account_id)
                        {
                            return Err(HandoffError::Login(
                                "Codex's ChatGPT login has an unexpected format".into(),
                            ));
                        }
                        h.codex_chatgpt = Some(t);
                        h.source = "Codex ChatGPT login (access token only)";
                    }
                    Some(CodexAuth::ApiKey(k)) => {
                        h.env
                            .push((vars::CODEX_API_KEY.into(), EnvValue::Secret(k.clone())));
                        h.env
                            .push((vars::OPENAI_API_KEY.into(), EnvValue::Secret(k)));
                        h.source = "Codex login (API key)";
                    }
                    None => {
                        return Err(HandoffError::Login(
                            "Codex is not signed in on this Mac: run codex login".into(),
                        ))
                    }
                }
            }
            ProviderConfig::OpenaiApi(_) => h.source = "OpenAI API key",
            ProviderConfig::ReasonLogin(_) | ProviderConfig::ReasonApi(_) => unreachable!(),
        }
        h.unset.retain(|v| !h.env.iter().any(|(k, _)| k == v));
        h.unset.sort();
        h.unset.dedup();
        debug_assert!(h.env.iter().all(|(k, _)| is_var_name(k)));
        Ok(h)
    }

    /// The plaintext the target decrypts: `N <nonce>`, `U <name>`,
    /// `E <name> <base64>`, `S ACCESS|ACCOUNT <base64>`, `C`. Only [`seal`]
    /// sees it.
    fn plaintext(&self, nonce: &[u8]) -> SecretString {
        let mut out = format!("N {}\n", B64.encode(nonce));
        for name in &self.unset {
            out.push_str(&format!("U {name}\n"));
        }
        for (name, value) in &self.env {
            out.push_str(&format!("E {name} {}\n", B64.encode(value.expose())));
        }
        if let Some(t) = &self.codex_chatgpt {
            out.push_str(&format!(
                "S ACCESS {}\n",
                B64.encode(t.access_token.expose())
            ));
            out.push_str(&format!("S ACCOUNT {}\n", B64.encode(&t.account_id)));
        }
        if self.private_codex_home {
            out.push_str("C\n");
        }
        SecretString::new(out)
    }

    /// SHA-256 fingerprints (16 hex) of every value handed over, for logs
    /// and evidence. Never the values.
    pub fn fingerprints(&self) -> Vec<(String, String)> {
        let mut out: Vec<(String, String)> = self
            .env
            .iter()
            .filter(|(_, v)| v.is_secret())
            .map(|(k, v)| (k.clone(), fingerprint(v.expose())))
            .collect();
        if let Some(t) = &self.codex_chatgpt {
            out.push((
                "chatgpt.access_token".into(),
                fingerprint(t.access_token.expose()),
            ));
        }
        out
    }
}

/// First 16 hex of SHA-256: safe to log.
pub fn fingerprint(value: &str) -> String {
    let d = Sha256::digest(value.as_bytes());
    d.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

type Aes256Ctr = ctr::Ctr128BE<aes::Aes256>;

/// PBKDF2-HMAC-SHA256 with an empty salt and one iteration, 48 bytes: what
/// `openssl enc -pbkdf2 -iter 1 -md sha256 -nosalt -kfile` derives the
/// AES-256 key and IV from.
fn openssl_key_iv(password: &[u8]) -> ([u8; 32], [u8; 16]) {
    let mut out = [0u8; 64];
    for (i, block) in out.chunks_mut(32).enumerate() {
        let mut mac = Hmac::<Sha256>::new_from_slice(password).expect("any key length");
        mac.update(&(i as u32 + 1).to_be_bytes());
        block.copy_from_slice(&mac.finalize().into_bytes());
    }
    let mut key = [0u8; 32];
    let mut iv = [0u8; 16];
    key.copy_from_slice(&out[..32]);
    iv.copy_from_slice(&out[32..48]);
    (key, iv)
}

/// The `OCENV1` line for a target whose public key is `target_pub`:
/// `OCENV1 <host public key> <ciphertext> <sha256 of plaintext>`, all
/// base64. The plaintext starts with a random nonce, so its hash reveals
/// nothing.
pub fn seal(handoff: &Handoff, target_pub: &[u8; 32]) -> io::Result<String> {
    let mut nonce = [0u8; 16];
    getrandom::getrandom(&mut nonce).map_err(|e| io::Error::other(e.to_string()))?;
    let secret = x25519_dalek::EphemeralSecret::random();
    let host_pub = x25519_dalek::PublicKey::from(&secret);
    let shared = secret.diffie_hellman(&x25519_dalek::PublicKey::from(*target_pub));
    if !shared.was_contributory() {
        return Err(io::Error::other("the target sent an invalid public key"));
    }
    let mut kdf = Sha256::new();
    kdf.update(KDF_CONTEXT);
    kdf.update(shared.as_bytes());
    kdf.update(target_pub);
    kdf.update(host_pub.as_bytes());
    let password: String = kdf.finalize().iter().map(|b| format!("{b:02x}")).collect();
    let (key, iv) = openssl_key_iv(password.as_bytes());
    let plain = handoff.plaintext(&nonce);
    let mut data = plain.expose().as_bytes().to_vec();
    Aes256Ctr::new(&key.into(), &iv.into()).apply_keystream(&mut data);
    Ok(format!(
        "OCENV1 {} {} {}\n",
        B64.encode(host_pub.as_bytes()),
        B64.encode(&data),
        B64.encode(Sha256::digest(plain.expose().as_bytes()))
    ))
}

/// Reads one line from `r` a byte at a time, so nothing after it is
/// consumed (the agent's own output follows on the same stream).
fn read_line_raw(r: &mut impl Read) -> io::Result<Option<String>> {
    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        match r.read(&mut byte)? {
            0 if buf.is_empty() => return Ok(None),
            0 => break,
            _ if byte[0] == b'\n' => break,
            _ => buf.push(byte[0]),
        }
        if buf.len() > 64 * 1024 {
            return Err(io::Error::other("target sent an overlong line"));
        }
    }
    Ok(Some(
        String::from_utf8_lossy(&buf)
            .trim_end_matches('\r')
            .to_owned(),
    ))
}

/// Runs the hand-off over the target's stdin/stdout: waits for `OCPUB1`
/// (lines before it, such as a login banner, are skipped), sends the sealed
/// `OCENV1` line, and returns once the target says `OCREADY1`. After that
/// the streams belong to the agent.
pub fn handshake(
    stdout: &mut impl Read,
    stdin: &mut impl Write,
    handoff: &Handoff,
) -> io::Result<()> {
    let target_pub = loop {
        let line = read_line_raw(stdout)?
            .ok_or_else(|| io::Error::other("the target closed before the credential hand-off"))?;
        if let Some(reason) = line.strip_prefix("OCFAIL1 ") {
            return Err(io::Error::other(format!(
                "credential hand-off failed on the target: {reason}"
            )));
        }
        if let Some(b64) = line.strip_prefix("OCPUB1 ") {
            let raw = B64
                .decode(b64.trim())
                .map_err(|_| io::Error::other("the target sent a malformed public key"))?;
            let key: [u8; 32] = raw
                .try_into()
                .map_err(|_| io::Error::other("the target sent a malformed public key"))?;
            break key;
        }
    };
    stdin.write_all(seal(handoff, &target_pub)?.as_bytes())?;
    stdin.flush()?;
    loop {
        let line = read_line_raw(stdout)?
            .ok_or_else(|| io::Error::other("the target closed during the credential hand-off"))?;
        if let Some(reason) = line.strip_prefix("OCFAIL1 ") {
            return Err(io::Error::other(format!(
                "credential hand-off failed on the target: {reason}"
            )));
        }
        if line == "OCREADY1" {
            return Ok(());
        }
    }
}

/// The target side, POSIX `sh` with `openssl` (1.1.1 or 3). Arguments:
/// `<working directory> <agent program> <agent args...>`. Prints `OCPUB1`,
/// reads `OCENV1`, prints `OCREADY1` (or `OCFAIL1 <step>`), then runs the
/// agent on the same stdin and stdout. Every key is read from a file.
pub const TARGET_SH: &str = r#"umask 077
d=$(mktemp -d "${TMPDIR:-/tmp}/oc-agent-auth.XXXXXX") || { echo "OCFAIL1 mktemp"; exit 97; }
trap 'rm -rf "$d"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
fail() { echo "OCFAIL1 $1"; exit 97; }
cwd=$1; shift
command -v openssl >/dev/null 2>&1 || fail openssl-missing
openssl genpkey -algorithm X25519 -out "$d/k" 2>/dev/null || fail genpkey
openssl pkey -in "$d/k" -pubout -outform DER 2>/dev/null | tail -c 32 > "$d/tp" || fail pubkey
echo "OCPUB1 $(base64 < "$d/tp" | tr -d '\n')"
IFS=' ' read -r tag hp ct sum || fail read
[ "$tag" = OCENV1 ] || fail envelope
{ printf '\060\052\060\005\006\003\053\145\156\003\041\000'; printf '%s' "$hp" | base64 -d; } > "$d/hp.der" 2>/dev/null || fail peer
openssl pkeyutl -derive -inkey "$d/k" -peerkey "$d/hp.der" -peerform DER -out "$d/s" 2>/dev/null || fail derive
{ printf '%s' 'openconductor-agent-handoff-v1'; cat "$d/s" "$d/tp"; printf '%s' "$hp" | base64 -d; } | openssl dgst -sha256 -binary | od -An -v -tx1 | tr -d ' \n' > "$d/pw" || fail kdf
printf '%s' "$ct" | base64 -d > "$d/ct" 2>/dev/null || fail ciphertext
openssl enc -d -aes-256-ctr -pbkdf2 -iter 1 -md sha256 -nosalt -kfile "$d/pw" -in "$d/ct" -out "$d/p" 2>/dev/null || fail decrypt
rm -f "$d/k" "$d/s" "$d/pw" "$d/ct" "$d/hp.der"
[ "$(openssl dgst -sha256 -binary < "$d/p" | base64 | tr -d '\n')" = "$sum" ] || fail checksum
sa=; sc=; subst=
while IFS=' ' read -r t a b; do
  case "$t" in
    N) ;;
    U) case "$a" in ''|*[!A-Z0-9_]*) fail name ;; esac; unset "$a" ;;
    E) case "$a" in ''|*[!A-Z0-9_]*) fail name ;; esac
       v=$(printf '%s' "$b" | base64 -d) || fail value; export "$a=$v" ;;
    S) v=$(printf '%s' "$b" | base64 -d) || fail value
       case "$v" in ''|*[!A-Za-z0-9._-]*) fail token ;; esac
       case "$a" in ACCESS) sa=$v ;; ACCOUNT) sc=$v ;; *) fail slot ;; esac; subst=1 ;;
    C) mkdir "$d/codex" || fail codex-home; export CODEX_HOME="$d/codex" ;;
    *) fail payload ;;
  esac
done < "$d/p"
rm -f "$d/p"; v=
cd "$cwd" 2>/dev/null || fail cwd
splice() {
  while IFS= read -r l || [ -n "$l" ]; do
    while :; do
      case "$l" in
        *@OC_SECRET_ACCESS@*) l=${l%%@OC_SECRET_ACCESS@*}$sa${l#*@OC_SECRET_ACCESS@} ;;
        *@OC_SECRET_ACCOUNT@*) l=${l%%@OC_SECRET_ACCOUNT@*}$sc${l#*@OC_SECRET_ACCOUNT@} ;;
        *) break ;;
      esac
    done
    printf '%s\n' "$l"
  done
}
echo OCREADY1
if [ -n "$subst" ]; then splice | "$@"; else "$@"; fi
"#;

/// How the target's shell is reached. Which channel carries a Reason cloud
/// computer's agent is still being decided (the Reason device channel
/// stores every terminal byte as a durable job receipt, so only the sealed
/// envelope above may cross it); until then the one transport is the
/// debug builds' stand-in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Transport {
    /// A command prefix that runs argv on the target with stdio attached
    /// (`env -i ...` for the tests' fresh machine). Debug builds and tests
    /// only (`crate::agent_target`).
    Exec { prefix: Vec<String> },
}

impl Transport {
    /// `sh -c TARGET_SH sh <cwd> <program> <args...>` on the target, piped.
    pub fn command(&self, cwd: &str, program: &str, args: &[String]) -> Command {
        let Transport::Exec { prefix } = self;
        let mut c = Command::new(&prefix[0]);
        c.args(&prefix[1..])
            .args(["sh", "-c", TARGET_SH, "sh", cwd, program])
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        c
    }
}

/// One agent launch on another machine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetLaunch {
    pub transport: Transport,
    /// The workspace's folder on the target.
    pub dir: String,
    /// The agent's command on the target (`claude`, `codex`, or a path).
    pub program: String,
    pub handoff: Handoff,
}

impl TargetLaunch {
    pub fn command(&self, args: &[String]) -> Command {
        self.transport.command(&self.dir, &self.program, args)
    }
}

/// Reads Claude Code's login on this machine: the macOS Keychain item
/// `Claude Code-credentials` (as Conductor's runtime reads it: `security
/// find-generic-password -a <user> -w -s <service>`), else
/// `~/.claude/.credentials.json`. Read only.
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

/// `$CODEX_HOME/auth.json` (default `~/.codex`), read only.
pub fn read_codex_auth(home: Option<&Path>) -> Option<String> {
    let dir = std::env::var_os("CODEX_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .or_else(|| home.map(|h| h.join(".codex")))?;
    std::fs::read_to_string(dir.join("auth.json")).ok()
}

#[cfg(test)]
#[path = "handoff_tests.rs"]
mod tests;
