//! zsh shell integration for interactive terminals: the reference app's
//! `terminal-shell-integration/zsh/` store (see
//! `evidence/terminal/shell-integration.md`).
//!
//! When the user's shell is zsh, the reference writes four startup files
//! into `$APPDATA/terminal-shell-integration/zsh/` and starts terminals with
//! `ZDOTDIR` pointing there. Each file sources the user's own file of the
//! same name from their home directory, then points `ZDOTDIR` back at the
//! integration folder so zsh reads the next one from it too. `.zshrc` also
//! puts `CONDUCTOR_PATH_PREFIX` on `PATH` and adds `preexec` / `precmd`
//! hooks that print `ESC ] 633 ; Conductor ; ... BEL` marks: `Prompt` before
//! each prompt, `ProgramStart;<marker>;<program>;<command>` when a command
//! starts and `CommandDone;<marker>` when it ends.
//!
//! The files are written once per launch, on the first interactive spawn,
//! and the result is remembered; a failed write is retried on the next
//! spawn, as the reference forgets a failed attempt. Non-zsh shells get no
//! integration.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use super::spawn::{Program, SpawnRequest};

/// Folder under the app data directory, as the reference names it.
pub const DIR_NAME: &str = "terminal-shell-integration";

/// Environment variable naming the folder put in front of `PATH` by the
/// integration's `.zshrc` (the reference sets it to `$APPDATA/bin`).
pub const PATH_PREFIX_VAR: &str = "CONDUCTOR_PATH_PREFIX";

/// The four startup files, in the order zsh reads them.
pub const ZSH_FILES: [&str; 4] = [".zshenv", ".zprofile", ".zshrc", ".zlogin"];

/// One wrapper file: source the user's file, keep `ZDOTDIR` on the
/// integration folder, optionally keep history in the user's folder, then
/// `extra`. Lines are joined by `\n` with empty ones dropped, so a file
/// without `extra` has no trailing newline (as the reference writes them).
fn wrapper(original: &str, restore_history: bool, extra: Option<&str>) -> String {
    let is_env = original == ".zshenv";
    let var = if is_env {
        "CONDUCTOR_ORIGINAL_ZDOTDIR"
    } else {
        "CONDUCTOR_USER_ZDOTDIR"
    };
    let mut lines: Vec<String> = vec![
        format!("if [[ -n \"${var}\" ]]; then"),
        format!("  export ZDOTDIR=\"${var}\""),
        "fi".into(),
        format!("if [[ -f \"${var}/{original}\" ]]; then"),
        format!("  source \"${var}/{original}\""),
        "fi".into(),
    ];
    if is_env {
        lines.push(
            r#"export CONDUCTOR_USER_ZDOTDIR="${ZDOTDIR:-$CONDUCTOR_ORIGINAL_ZDOTDIR}""#.into(),
        );
    }
    lines.extend(
        [
            r#"if [[ -n "$CONDUCTOR_INTEGRATION_ZDOTDIR" ]]; then"#,
            r#"  export ZDOTDIR="$CONDUCTOR_INTEGRATION_ZDOTDIR""#,
            "fi",
        ]
        .map(String::from),
    );
    if restore_history {
        lines.extend(
            [
                r#"if [[ -z "$HISTFILE" ]]; then"#,
                r#"  HISTFILE="$CONDUCTOR_USER_ZDOTDIR/.zsh_history""#,
                r#"elif [[ "$HISTFILE" == "$CONDUCTOR_INTEGRATION_ZDOTDIR/"* ]]; then"#,
                r#"  HISTFILE="$CONDUCTOR_USER_ZDOTDIR/${HISTFILE#$CONDUCTOR_INTEGRATION_ZDOTDIR/}""#,
                "fi",
            ]
            .map(String::from),
        );
    }
    if let Some(extra) = extra {
        lines.push(extra.into());
    }
    lines.retain(|l| !l.is_empty());
    lines.join("\n")
}

/// The `.zshrc` hooks: PATH prefix, the mark printer, program detection and
/// the prompt prefix. Ends with a newline.
const ZSHRC_HOOKS: &str = r#"if [[ -n "$CONDUCTOR_PATH_PREFIX" ]]; then
  export PATH="$CONDUCTOR_PATH_PREFIX:$PATH"
fi
autoload -Uz add-zsh-hook
function __conductor_emit() { printf '\033]633;Conductor;%s\a' "$1" }
typeset -g __conductor_prompt_prefix=$'%{\033]633;Conductor;Prompt\a%}'
typeset -g __conductor_command_marker=""
function __conductor_detect_program() {
  local -a tokens
  tokens=(${(z)1})
  local token
  for token in "${tokens[@]}"; do
    if [[ "$token" == [A-Za-z_][A-Za-z0-9_]*=* ]]; then
      continue
    fi
    case "$token" in
      command|builtin|exec|noglob|nocorrect|env|time)
        continue
        ;;
      sudo)
        continue
        ;;
    esac
    token=${(Q)token}
    token=${token:t}
    token=${token//[$'\x00'-$'\x1f'$'\x7f']/}
    token=${token//;/_}
    if [[ -z "$token" ]]; then
      token=unknown
    fi
    print -r -- "$token"
    return 0
  done
  return 1
}
function __conductor_sanitize_command_label() {
  local command="$1"
  command=${command//$'\n'/ }
  command=${command//$'\r'/ }
  command=${command//[$'\x00'-$'\x1f'$'\x7f']/}
  if [[ -z "$command" ]]; then
    return 1
  fi
  print -r -- "$command"
}
function __conductor_next_marker() {
  print -r -- "${EPOCHREALTIME//./-}-$RANDOM-$RANDOM"
}
function __conductor_preexec() {
  local marker program command
  program=$(__conductor_detect_program "$1") || return 0
  command=$(__conductor_sanitize_command_label "$1") || return 0
  marker=$(__conductor_next_marker)
  typeset -g __conductor_command_marker="$marker"
  __conductor_emit "ProgramStart;$marker;$program;$command"
}
function __conductor_ensure_prompt_marker() {
  if [[ "$PROMPT" != "${__conductor_prompt_prefix}"* ]]; then
    PROMPT="${__conductor_prompt_prefix}${PROMPT}"
  fi
}
function __conductor_precmd() {
  if [[ -n "$__conductor_command_marker" ]]; then
    __conductor_emit "CommandDone;$__conductor_command_marker"
    typeset -g __conductor_command_marker=""
  fi
  __conductor_ensure_prompt_marker
}
add-zsh-hook preexec __conductor_preexec
add-zsh-hook precmd __conductor_precmd
__conductor_ensure_prompt_marker
"#;

/// Contents of `name`, one of [`ZSH_FILES`].
pub fn zsh_file(name: &str) -> Option<String> {
    Some(match name {
        ".zshenv" => wrapper(".zshenv", true, None),
        ".zprofile" => wrapper(".zprofile", false, None),
        ".zshrc" => wrapper(".zshrc", true, Some(ZSHRC_HOOKS)),
        ".zlogin" => wrapper(".zlogin", false, None),
        _ => return None,
    })
}

/// Whether `shell` is zsh: its last path segment, lowercased, is `zsh`.
pub fn is_zsh(shell: &Path) -> bool {
    shell
        .to_str()
        .and_then(|s| s.rsplit('/').next())
        .is_some_and(|name| name.to_lowercase() == "zsh")
}

/// The user's shell: `$SHELL`, else the passwd entry's.
pub fn user_shell() -> Option<PathBuf> {
    std::env::var_os("SHELL")
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .or_else(|| passwd_field(|pw| pw.pw_shell))
}

/// The user's home directory: `$HOME`, else the passwd entry's.
pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .or_else(|| passwd_field(|pw| pw.pw_dir))
}

fn passwd_field(field: impl Fn(&libc::passwd) -> *mut libc::c_char) -> Option<PathBuf> {
    use std::ffi::CStr;
    use std::os::unix::ffi::OsStrExt;
    // SAFETY: getpwuid returns a pointer to static storage or null; it is
    // read at once and copied out before any other passwd call.
    unsafe {
        let pw = libc::getpwuid(libc::getuid());
        if pw.is_null() {
            return None;
        }
        let p = field(&*pw);
        if p.is_null() {
            return None;
        }
        let bytes = CStr::from_ptr(p).to_bytes();
        (!bytes.is_empty()).then(|| PathBuf::from(std::ffi::OsStr::from_bytes(bytes)))
    }
}

/// Writes the zsh files once per launch and hands out the environment that
/// selects them.
pub struct ShellIntegration {
    app_data_dir: PathBuf,
    home: Option<PathBuf>,
    prepared: Mutex<Option<Vec<(String, String)>>>,
}

impl ShellIntegration {
    pub fn new(app_data_dir: impl Into<PathBuf>, home: Option<PathBuf>) -> Self {
        Self {
            app_data_dir: app_data_dir.into(),
            home,
            prepared: Mutex::new(None),
        }
    }

    /// `$APPDATA/terminal-shell-integration/zsh`.
    pub fn zsh_dir(&self) -> PathBuf {
        self.app_data_dir.join(DIR_NAME).join("zsh")
    }

    /// Environment for an interactive terminal running `shell`: the four
    /// `ZDOTDIR` variables when it is zsh and the files are in place, else
    /// nothing. Writes the files on first use; an error is returned (and
    /// the write retried next time) when they cannot be written.
    pub fn env_for(&self, shell: &Path) -> std::io::Result<Vec<(String, String)>> {
        if !is_zsh(shell) {
            return Ok(Vec::new());
        }
        let home = self.home.as_ref().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "no home directory")
        })?;
        let mut prepared = self.prepared.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(env) = prepared.as_ref() {
            return Ok(env.clone());
        }
        let dir = self.zsh_dir();
        std::fs::create_dir_all(&dir)?;
        for name in ZSH_FILES {
            let body = zsh_file(name).expect("known file");
            std::fs::write(dir.join(name), body)?;
        }
        let home = home.to_string_lossy().into_owned();
        let dir = dir.to_string_lossy().into_owned();
        let env = vec![
            ("CONDUCTOR_ORIGINAL_ZDOTDIR".to_owned(), home.clone()),
            ("CONDUCTOR_USER_ZDOTDIR".to_owned(), home),
            ("CONDUCTOR_INTEGRATION_ZDOTDIR".to_owned(), dir.clone()),
            ("ZDOTDIR".to_owned(), dir),
        ];
        *prepared = Some(env.clone());
        Ok(env)
    }

    /// Add the integration to a login-shell terminal, as the reference does
    /// for its local interactive terminals: the `ZDOTDIR` variables when the
    /// user's shell is zsh, and [`PATH_PREFIX_VAR`] when `path_prefix` is
    /// known. Applied after the request's own environment. A terminal
    /// running an explicit argv is left alone. A write failure is logged and
    /// the terminal starts without the integration.
    pub fn prepare(&self, req: &mut SpawnRequest, path_prefix: Option<&Path>) {
        self.prepare_for(req, user_shell().as_deref(), path_prefix);
    }

    fn prepare_for(
        &self,
        req: &mut SpawnRequest,
        shell: Option<&Path>,
        path_prefix: Option<&Path>,
    ) {
        if req.program != Program::LoginShell {
            return;
        }
        if let Some(shell) = shell {
            match self.env_for(shell) {
                Ok(env) => req.env.extend(env),
                Err(e) => eprintln!("[terminal] failed to prepare zsh integration: {e}"),
            }
        }
        if let Some(prefix) = path_prefix {
            req.env.push((
                PATH_PREFIX_VAR.to_owned(),
                prefix.to_string_lossy().into_owned(),
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    /// SHA-256 of the files Conductor 0.87.6 wrote on Sven's Mac
    /// (`~/Library/Application Support/com.conductor.app/terminal-shell-integration/zsh/`).
    const REFERENCE_SHA256: [(&str, &str); 4] = [
        (
            ".zshenv",
            "b9e48d9138b255b77cd67005387e2f8be0b892ee547316788456de1977e62730",
        ),
        (
            ".zprofile",
            "652674f9df574d7e399c12d81292626a767077da39c45519289b645973408fbd",
        ),
        (
            ".zshrc",
            "556361569333c873fcbec0195519d8c30e067008d7f376f1878cd241c17039d4",
        ),
        (
            ".zlogin",
            "145c6ab0c914a80d75110a4715f85c47ffc6071dabc4bd0d51a5aa83442f27d0",
        ),
    ];

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    fn tempdir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oc-shellint-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn files_are_byte_identical_to_the_reference() {
        for (name, sha) in REFERENCE_SHA256 {
            let body = zsh_file(name).unwrap();
            assert_eq!(hex(&Sha256::digest(body.as_bytes())), sha, "{name}");
        }
        assert_eq!(zsh_file(".bashrc"), None);
    }

    #[test]
    fn only_zsh_gets_an_integration() {
        assert!(is_zsh(Path::new("/bin/zsh")));
        assert!(is_zsh(Path::new("/opt/homebrew/bin/ZSH")));
        assert!(is_zsh(Path::new("zsh")));
        assert!(!is_zsh(Path::new("/bin/bash")));
        assert!(!is_zsh(Path::new("/usr/bin/zsh-5.9")));
        assert!(!is_zsh(Path::new("/bin/zsh/")));
        let data = tempdir("bash");
        let si = ShellIntegration::new(&data, Some(data.join("home")));
        assert!(si.env_for(Path::new("/bin/bash")).unwrap().is_empty());
        assert!(!data.join(DIR_NAME).exists(), "nothing written for bash");
        std::fs::remove_dir_all(&data).unwrap();
    }

    #[test]
    fn writes_the_files_once_and_returns_the_zdotdir_env() {
        let data = tempdir("zsh");
        let home = data.join("home");
        let si = ShellIntegration::new(&data, Some(home.clone()));
        let env = si.env_for(Path::new("/bin/zsh")).unwrap();
        let dir = data.join("terminal-shell-integration/zsh");
        let s = |p: &Path| p.to_string_lossy().into_owned();
        assert_eq!(
            env,
            vec![
                ("CONDUCTOR_ORIGINAL_ZDOTDIR".into(), s(&home)),
                ("CONDUCTOR_USER_ZDOTDIR".into(), s(&home)),
                ("CONDUCTOR_INTEGRATION_ZDOTDIR".into(), s(&dir)),
                ("ZDOTDIR".into(), s(&dir)),
            ]
        );
        for name in ZSH_FILES {
            assert_eq!(
                std::fs::read_to_string(dir.join(name)).unwrap(),
                zsh_file(name).unwrap()
            );
        }
        // Remembered for the launch: a second spawn does not rewrite.
        std::fs::write(dir.join(".zshrc"), "edited").unwrap();
        assert_eq!(si.env_for(Path::new("/bin/zsh")).unwrap(), env);
        assert_eq!(
            std::fs::read_to_string(dir.join(".zshrc")).unwrap(),
            "edited"
        );
        // A new launch writes them again.
        let again = ShellIntegration::new(&data, Some(home));
        again.env_for(Path::new("/bin/zsh")).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join(".zshrc")).unwrap(),
            zsh_file(".zshrc").unwrap()
        );
        std::fs::remove_dir_all(&data).unwrap();
    }

    #[test]
    fn prepare_adds_the_integration_to_login_shells_only() {
        let data = tempdir("prepare");
        let home = data.join("home");
        let si = ShellIntegration::new(&data, Some(home));
        let bin = data.join("bin");
        let names = |req: &SpawnRequest| req.env.iter().map(|(k, _)| k.clone()).collect::<Vec<_>>();

        let mut zsh = SpawnRequest::shell(&data);
        zsh.env.push(("ZDOTDIR".into(), "/workspace/env".into()));
        si.prepare_for(&mut zsh, Some(Path::new("/bin/zsh")), Some(&bin));
        assert_eq!(
            names(&zsh),
            [
                "ZDOTDIR",
                "CONDUCTOR_ORIGINAL_ZDOTDIR",
                "CONDUCTOR_USER_ZDOTDIR",
                "CONDUCTOR_INTEGRATION_ZDOTDIR",
                "ZDOTDIR",
                "CONDUCTOR_PATH_PREFIX",
            ]
        );
        // The integration comes after the request's env, so it wins.
        let cmd = super::super::spawn::build_command(&zsh).unwrap();
        assert_eq!(
            cmd.get_env("ZDOTDIR").unwrap(),
            data.join("terminal-shell-integration/zsh").as_os_str()
        );
        assert_eq!(
            cmd.get_env("CONDUCTOR_PATH_PREFIX").unwrap(),
            bin.as_os_str()
        );

        let mut bash = SpawnRequest::shell(&data);
        si.prepare_for(&mut bash, Some(Path::new("/bin/bash")), Some(&bin));
        assert_eq!(names(&bash), ["CONDUCTOR_PATH_PREFIX"]);

        let mut argv = SpawnRequest::argv(&data, ["printf", "x"]);
        si.prepare_for(&mut argv, Some(Path::new("/bin/zsh")), Some(&bin));
        assert!(argv.env.is_empty());

        // A write failure leaves the terminal startable without integration.
        let broken_data = tempdir("prepare-broken");
        std::fs::write(broken_data.join(DIR_NAME), "x").unwrap();
        let broken = ShellIntegration::new(&broken_data, Some(broken_data.join("home")));
        let mut req = SpawnRequest::shell(&data);
        broken.prepare_for(&mut req, Some(Path::new("/bin/zsh")), None);
        assert!(req.env.is_empty());
        std::fs::remove_dir_all(&broken_data).unwrap();
        std::fs::remove_dir_all(&data).unwrap();
    }

    #[test]
    fn a_failed_write_is_retried() {
        let data = tempdir("retry");
        // A file where the folder should be makes create_dir_all fail.
        std::fs::write(data.join(DIR_NAME), "not a dir").unwrap();
        let si = ShellIntegration::new(&data, Some(data.join("home")));
        assert!(si.env_for(Path::new("/bin/zsh")).is_err());
        std::fs::remove_file(data.join(DIR_NAME)).unwrap();
        assert_eq!(si.env_for(Path::new("/bin/zsh")).unwrap().len(), 4);
        std::fs::remove_dir_all(&data).unwrap();
    }
}
