// Environment diagnostics: the checks behind Help › Diagnostics, ported from
// Conductor 0.87.6's decoded renderApp-D_fmY7hW.js (sha256 5199d392…):
// `BHe` @10,125,488 (run one command), `dl` @10,125,963 (a command check),
// `loa`/`coa` (env names kept in a redacted report), `uoa`/`doa` @10,127,378
// (hash the rest), `wJn`/`foa` (shell config files, agent env names), `hoa`
// @10,128,169 (the check list), `poa` (run them in order) and `SJn` (the
// Markdown report). Pure apart from `crypto.subtle`: the shell runner is passed
// in, so node:test covers it without the app.

/** One row of the page. `containsEnv` rows have their values hashed in the redacted report. */
export interface CheckDef {
  label: string;
  containsEnv?: boolean;
  run: (shell: ShellRun) => Promise<string>;
}

export type CheckStatus = "pending" | "running" | "done" | "error";

export interface CheckResult {
  label: string;
  status: CheckStatus;
  containsEnv?: boolean;
  value?: string;
}

export interface DiagnosticsReport {
  checks: CheckResult[];
  generatedAt: string;
}

/** Runs one command in zsh without rc files, as Conductor's `BHe` does; returns its output or "[error] …". */
export type ShellRun = (command: string, timeoutMs?: number) => Promise<string>;

/** `BHe`'s default deadline. */
export const DEFAULT_TIMEOUT_MS = 5000;

/** `dl`: a check that is one shell command. */
function cmd(label: string, command: string, opts?: { containsEnv?: boolean; timeoutMs?: number }): CheckDef {
  return { label, containsEnv: opts?.containsEnv, run: (shell) => shell(command, opts?.timeoutMs) };
}

/** `wJn`. */
export const SHELL_CONFIG_FILES = [
  "~/.zshenv", "~/.zprofile", "~/.zshrc", "~/.zlogin", "~/.zlogout", "~/.bashrc", "~/.bash_profile",
  "~/.bash_login", "~/.profile", "~/.config/fish/config.fish", "~/.nushell/config.nu",
] as const;

/** `foa`, with OpenConductor's own variables where Conductor lists CONDUCTOR_*. */
export const AGENT_ENV_VARS = [
  "GITHUB_TOKEN", "GH_TOKEN", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "CLAUDE_CONFIG_DIR",
  "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "AWS_PROFILE", "AWS_REGION", "AWS_DEFAULT_REGION",
  "CONDUCTOR_PORT", "CONDUCTOR_WORKSPACE_PATH", "CONDUCTOR_WORKSPACE_NAME", "CONDUCTOR_ROOT_PATH", "CONDUCTOR_BIN_DIR",
] as const;

/** `loa`: env names whose values stay readable in the redacted report. */
export const NON_SENSITIVE_ENV = new Set([
  "PATH", "MANPATH", "INFOPATH", "FPATH", "SHELL", "TERM", "COLORTERM", "CLICOLOR", "COMMAND_MODE", "SHLVL", "PAGER",
  "LESS", "LSCOLORS", "LS_COLORS", "ZDOTDIR", "ZSH", "ZSH_CUSTOM", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL",
  "LC_CTYPE", "LC_COLLATE", "LC_MESSAGES", "LC_MONETARY", "LC_NUMERIC", "LC_TIME", "TMPDIR", "PWD", "OLDPWD",
  "__CF_USER_TEXT_ENCODING", "MACOSX_DEPLOYMENT_TARGET", "NVM_DIR", "NVM_BIN", "NVM_INC", "NVM_CD_FLAGS",
  "BUN_INSTALL", "CARGO_HOME", "CARGO", "RUSTUP_HOME", "RUSTUP_TOOLCHAIN", "PNPM_HOME", "NODE", "NODE_PATH",
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "EDITOR", "VISUAL", "SSH_AUTH_SOCK", "DISABLE_AUTO_UPDATE",
  "OSLogRateLimit", "XPC_FLAGS", "XPC_SERVICE_NAME", "_", "CONDUCTOR_INTEGRATION_ZDOTDIR", "CONDUCTOR_ORIGINAL_ZDOTDIR",
  "CONDUCTOR_USER_ZDOTDIR", "CONDUCTOR_WORKSPACE_NAME", "CONDUCTOR_CWD", "fellBack", "ANTHROPIC_MODEL",
  "CLAUDE_CONFIG_DIR", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "AWS_PROFILE", "AWS_REGION",
  "AWS_DEFAULT_REGION", "RBENV_ROOT", "RBENV_SHELL", "PYENV_ROOT", "PYENV_SHELL", "NODENV_ROOT", "NODENV_SHELL",
  "MISE_SHELL", "GOPATH", "GOROOT",
]);

const notInstalled = (tool: string, version = `${tool} --version`) =>
  `command -v ${tool} && ${version} 2>/dev/null || echo 'not installed'`;
const notFound = (tool: string, version = `${tool} --version`) =>
  `command -v ${tool} && ${version} 2>/dev/null || echo 'not found'`;

/** Conductor's `LD`: the markers around `env` in a capture's output. */
const ENV_DELIMITER = "_OPENCONDUCTOR_SHELL_ENV_DELIMITER_";
/** `K2t`: the variables the captured environment keeps. */
export const CAPTURED_ENV_KEYS = [
  "HOME", "LANG", "LC_ALL", "LC_CTYPE", "SSH_AUTH_SOCK", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
  "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_SSH_COMMAND", "GH_HOST",
] as const;
/** `hL`: directories appended to the captured PATH, and the PATH used when capture fails. */
export const FALLBACK_PATH_DIRS = [
  "/opt/homebrew/bin", "/usr/local/bin", "/home/linuxbrew/.linuxbrew/bin", "$HOME/.local/bin", "/opt/local/bin",
  "/usr/local/git/bin", "/usr/bin", "/bin",
] as const;

/** `Wfe`/`NY`: the captured PATH's entries then the fallback dirs, `$HOME` expanded, without repeats. */
export function mergedPath(path: string | undefined, home: string | undefined): string {
  const expand = (dirs: readonly string[]) => dirs.flatMap((d) => (!d.includes("$HOME") ? [d] : home ? [d.split("$HOME").join(home)] : []));
  const own = (path ?? "").split(":").map((d) => d.trim()).filter((d) => d.length > 0);
  const merged = [...new Set(expand([...own, ...FALLBACK_PATH_DIRS]))];
  return merged.length > 0 ? merged.join(":") : expand(FALLBACK_PATH_DIRS).join(":");
}

/** `yAt`: the `NAME=value` lines between the two markers, with terminal escapes removed. */
export function parseCapturedEnv(output: string): Record<string, string> | null {
  const body = output.split(ENV_DELIMITER)[1];
  if (body === undefined) return null;
  const env: Record<string, string> = {};
  // eslint-disable-next-line no-control-regex
  for (const line of body.replace(/[\u001b\u009b][[\]()#;?]*(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])/g, "").split(/\r?\n/u)) {
    const eq = line.indexOf("=");
    if (eq > 0) env[line.substring(0, eq)] = line.substring(eq + 1);
  }
  return env;
}

/**
 * Conductor's "captured shell env" row (`yni` → `Bfe`/`Y2t`, index chunk @3,350,678): the
 * login shell's environment as the app captures it at startup (`zsh -ilc` within 6 s, else
 * `zsh -lc` within 3 s, `Fde`), reduced to `K2t` with the merged PATH (`Z2t`); when both fail,
 * the fallback PATH alone with `fellBack=true` (`LY`). Printed as `fellBack`, `PATH`, then the keys.
 */
export async function capturedShellEnv(shell: ShellRun): Promise<string> {
  const probe = `printf '%s\\n' ${ENV_DELIMITER}; env; printf '%s\\n' ${ENV_DELIMITER}; exit`;
  let env: Record<string, string> | null = null;
  for (const [flags, timeoutMs] of [["-ilc", 6000], ["-lc", 3000]] as const) {
    env = parseCapturedEnv(await shell(`DISABLE_AUTO_UPDATE=true zsh ${flags} ${shellQuote(probe)}`, timeoutMs));
    if (env) break;
  }
  const lines: string[] = [];
  if (env) {
    lines.push("fellBack=false", `PATH=${mergedPath(env.PATH, env.HOME)}`);
    const kept = CAPTURED_ENV_KEYS.filter((k) => env![k] !== undefined && env![k] !== "").map((k) => [k, env![k]] as const);
    for (const [k, v] of kept.sort(([a], [b]) => a.localeCompare(b))) lines.push(`${k}=${v}`);
  } else {
    const home = (await shell("echo $HOME")).trim();
    lines.push("fellBack=true", `PATH=${mergedPath(undefined, home && !home.startsWith("[error]") ? home : undefined)}`);
  }
  return lines.join("\n");
}

/** `hoa`: every check, in Conductor's order. */
export function diagnosticChecks(): CheckDef[] {
  const checks: CheckDef[] = [
    cmd("macOS version", "sw_vers"),
    cmd("CPU architecture", "uname -m"),
    cmd("Default shell (dscl)", "dscl . -read /Users/$(whoami) UserShell | awk '{print $2}'"),
    cmd("$SHELL", "echo $SHELL"),
    cmd("Shell version", "$SHELL --version 2>&1 | head -1"),
    cmd("Shell init timing (zsh -ilc)", "start=$EPOCHREALTIME; zsh -ilc 'true' >/dev/null 2>&1; end=$EPOCHREALTIME; printf '%.3fs' $((end - start))", { timeoutMs: 12000 }),
    cmd("Shell init stdout (zsh -ilc)", 'output=$(zsh -ilc "true" 2>/dev/null); if [ -n "$output" ]; then echo "WARNING: shell init writes to stdout:"; echo "$output" | head -10; else echo "clean (no stdout)"; fi', { timeoutMs: 12000 }),
    cmd("Login shell PATH", "zsh -lc 'echo $PATH'"),
    cmd("Interactive login shell PATH", "zsh -ilc 'echo $PATH' 2>/dev/null"),
    cmd("Non-interactive non-login shell PATH (zsh -fc)", "zsh -fc 'echo $PATH'"),
    cmd("Login shell env", "zsh -lc env 2>/dev/null | sort", { containsEnv: true }),
    cmd("Interactive login shell env", "zsh -ilc env 2>/dev/null | sort", { containsEnv: true }),
    cmd("Non-interactive non-login shell env", "zsh -fc env 2>/dev/null | sort", { containsEnv: true }),
    cmd("Known agent env vars (interactive login shell)", `zsh -ilc '${AGENT_ENV_VARS.map((v) => `echo "${v}=\${${v}:+set}"`).join("; ")}' 2>/dev/null | sort`),
    cmd("Shell config files present", SHELL_CONFIG_FILES.map((f) => `[ -f ${f} ] && echo "${f}"`).join("; ") + "; true"),
    cmd("Shell config file sizes", SHELL_CONFIG_FILES.map((f) => `[ -f ${f} ] && echo "${f}: $(wc -c < ${f} | tr -d '[:space:]') bytes"`).join("; ") + "; true"),
    cmd("oh-my-zsh plugins", 'if [ -f ~/.zshrc ]; then grep -E "^\\s*plugins=\\(" ~/.zshrc | head -5; elif [ -n "$ZDOTDIR" ] && [ -f "$ZDOTDIR/.zshrc" ]; then grep -E "^\\s*plugins=\\(" "$ZDOTDIR/.zshrc" | head -5; else echo "no .zshrc found"; fi; true'),
    cmd("Problematic zsh plugins", 'for p in fast-syntax-highlighting zsh-autosuggestions zsh-syntax-highlighting zsh-vi-mode dotenv; do found=""; for d in "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/$p" "$HOME/.oh-my-zsh/plugins/$p" "$HOME/.zsh/plugins/$p"; do [ -d "$d" ] && found="$d" && break; done; [ -n "$found" ] && echo "$p: $found"; done; true'),
    cmd("PTY wrappers / exec in shell init", 'for f in ~/.zshrc ~/.zprofile ~/.zshenv ~/.bash_profile ~/.bashrc; do [ -f "$f" ] && grep -n "^[^#]*\\bexec " "$f" 2>/dev/null | while read line; do echo "$f:$line"; done; done; true'),
    cmd("Known PTY wrapper tools", 'for tool in kiro-cli kiro-cli-term q warp-cli; do p=$(command -v "$tool" 2>/dev/null); [ -n "$p" ] && echo "$tool: $p"; done; true'),
    cmd("Homebrew", "command -v brew && brew --prefix 2>/dev/null || echo 'not installed'"),
    cmd("Nix", notInstalled("nix")),
    cmd("asdf", notInstalled("asdf")),
    cmd("mise", notInstalled("mise")),
    cmd("fnm", notInstalled("fnm")),
    cmd("nvm", `[[ -s "$HOME/.nvm/nvm.sh" ]] && echo "$HOME/.nvm/nvm.sh" || echo 'not installed'`),
    cmd("rbenv", notInstalled("rbenv")),
    cmd("nodenv", notInstalled("nodenv")),
    cmd("pyenv", notInstalled("pyenv")),
    cmd("oh-my-zsh", '[ -d "$HOME/.oh-my-zsh" ] && echo "installed" || echo "not installed"'),
    cmd("powerlevel10k", '[ -d "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k" ] && echo "installed" || echo "not installed"'),
    cmd("powerlevel10k instant prompt", '[ -f ~/.p10k.zsh ] && grep -q "instant_prompt" ~/.p10k.zsh && echo "enabled" || echo "not enabled or not installed"'),
    cmd("starship", notInstalled("starship")),
    cmd("git", notFound("git")),
    cmd("mkdir", "command -v mkdir || echo 'not found'"),
    cmd("node", notFound("node")),
    cmd("gh", "command -v gh && gh --version 2>/dev/null | head -1 || echo 'not found'"),
    cmd("bun", notFound("bun")),
    cmd("ruby", notFound("ruby")),
    cmd("python3", notFound("python3")),
    cmd("which mkdir (login)", "zsh -lc 'which mkdir' 2>/dev/null"),
    cmd("which git (login)", "zsh -lc 'which git' 2>/dev/null"),
    cmd("Version-managed tools (interactive login)", `zsh -ilc 'echo "node: $(which node 2>/dev/null || echo not found)"; echo "bun: $(which bun 2>/dev/null || echo not found)"; echo "ruby: $(which ruby 2>/dev/null || echo not found)"; echo "python3: $(which python3 2>/dev/null || echo not found)"; echo "gh: $(which gh 2>/dev/null || echo not found)"' 2>/dev/null`),
    cmd("GitHub CLI auth status", "command -v gh >/dev/null 2>&1 && gh auth status 2>&1 || echo 'gh not installed'"),
    cmd("/etc/zshenv", '[ -f /etc/zshenv ] && echo "exists" || echo "does not exist"'),
    cmd("/etc/zprofile", '[ -f /etc/zprofile ] && echo "exists" || echo "does not exist"'),
    cmd("/etc/zshrc", '[ -f /etc/zshrc ] && echo "exists" || echo "does not exist"'),
    cmd("/etc/paths", "cat /etc/paths 2>/dev/null || echo 'not found'"),
    cmd("/etc/paths.d contents", "ls /etc/paths.d/ 2>/dev/null && cat /etc/paths.d/* 2>/dev/null || echo 'none'"),
    cmd("XDG directories", 'echo "XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-unset}"; echo "XDG_DATA_HOME=${XDG_DATA_HOME:-unset}"; echo "XDG_CACHE_HOME=${XDG_CACHE_HOME:-unset}"'),
    cmd("$HOME", "echo $HOME"),
    cmd("$USER", "echo $USER"),
    cmd("$LANG", 'echo "${LANG:-unset}"'),
    cmd("$LC_ALL", 'echo "${LC_ALL:-unset}"'),
    cmd("$TMPDIR", 'echo "${TMPDIR:-unset}"'),
    { label: "OpenConductor captured shell env", containsEnv: true, run: capturedShellEnv },
    cmd("Disk space (root)", "df -h / | tail -1"),
    cmd("System integrity protection (SIP)", "csrutil status 2>/dev/null || echo 'unknown'"),
  ];
  // Conductor appends this one after the list, so it runs last.
  checks.push({
    label: "Non-zsh default shell env",
    containsEnv: true,
    run: async (shell) => {
      const path = (await shell("dscl . -read /Users/$(whoami) UserShell | awk '{print $2}'")).trim();
      if (!path || path.startsWith("[error]") || path.endsWith("/zsh")) return "default shell is zsh (skipped)";
      const name = path.split("/").pop() ?? path;
      const lines = [`shell: ${path}`];
      lines.push(`PATH: ${await shell(`${path} -lc 'echo $PATH' 2>/dev/null`, 10000)}`);
      const env = await shell(`${path} -lc env 2>/dev/null | sort`, 10000);
      lines.push(`env (${name} -lc):`, env);
      return lines.join("\n");
    },
  });
  return checks;
}

/** `poa`: runs every check in order, publishing the whole list after each change. */
export async function runDiagnostics(
  checks: CheckDef[],
  shell: ShellRun,
  onUpdate: (results: CheckResult[]) => void,
  now: () => Date = () => new Date(),
): Promise<DiagnosticsReport> {
  const results: CheckResult[] = checks.map((c) => ({ label: c.label, status: "pending", containsEnv: c.containsEnv }));
  onUpdate([...results]);
  for (let i = 0; i < checks.length; i++) {
    results[i] = { ...results[i], status: "running" };
    onUpdate([...results]);
    try {
      results[i] = { ...results[i], status: "done", value: await checks[i].run(shell) };
    } catch (e) {
      results[i] = { ...results[i], status: "error", value: `[error] ${String(e)}` };
    }
    onUpdate([...results]);
  }
  return { checks: results, generatedAt: now().toISOString() };
}

/** `uoa`: the first 4 bytes of SHA-256, hex. */
export async function shortHash(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest.slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `doa`: replaces the value of every `NAME=value` line whose name is not in
 * NON_SENSITIVE_ENV with `<hash:…>`, and drops the continuation lines of a
 * hashed multi-line value. Other lines stay as they are.
 */
export async function redactEnv(text: string): Promise<string> {
  const out: string[] = [];
  let inHashed = false;
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq <= 0) {
      if (!inHashed) out.push(line);
      continue;
    }
    const name = line.substring(0, eq);
    if (NON_SENSITIVE_ENV.has(name)) {
      inHashed = false;
      out.push(line);
    } else {
      inHashed = true;
      out.push(`${name}=<hash:${await shortHash(line.substring(eq + 1))}>`);
    }
  }
  return out.join("\n");
}

/** `SJn`: the Markdown report, full or redacted. */
export async function reportMarkdown(report: DiagnosticsReport, redacted: boolean, appName = "OpenConductor"): Promise<string> {
  const lines = [`# ${appName} Environment Diagnostics Report`];
  if (redacted) lines.push("(redacted — non-allowlisted env values replaced with hashes)");
  lines.push(`Generated: ${report.generatedAt}`, "");
  for (const c of report.checks) {
    lines.push(`## ${c.label}`);
    if (c.status === "error") lines.push(c.value ?? "[unknown error]");
    else if (c.value) lines.push(redacted && c.containsEnv ? await redactEnv(c.value) : c.value);
    else lines.push("[no output]");
    lines.push("");
  }
  return lines.join("\n");
}

/** The "Checking (n/total)" line and the bar: finished checks over all, rounded percent. */
export function progress(results: CheckResult[]): { finished: number; total: number; percent: number } {
  const finished = results.filter((r) => r.status === "done" || r.status === "error").length;
  const total = results.length;
  return { finished, total, percent: total > 0 ? Math.round((finished / total) * 100) : 0 };
}

/** POSIX single-quote `s` for `/bin/sh -c`. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * OpenConductor's shell runner uses `/bin/sh -c`; Conductor runs these checks in
 * `/bin/zsh` with no rc files (`noRcs`). Wraps `command` so it runs the same way,
 * falling back to sh where zsh is missing (Linux).
 */
export function zshNoRcs(command: string): string {
  const q = shellQuote(command);
  return `if [ -x /bin/zsh ]; then exec /bin/zsh -f -c ${q}; else exec /bin/sh -c ${q}; fi`;
}

/** `BHe`'s result: stdout trimmed, or "[error] <stderr or exit code>". */
export function shellResult(out: { stdout: string; stderr: string; exitCode: number | null }): string {
  if (out.exitCode !== 0) return `[error] ${out.stderr.trim() || `exit code ${out.exitCode}`}`;
  return out.stdout.trim();
}
