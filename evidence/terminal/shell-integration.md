# Terminal shell integration (`terminal-shell-integration/`)

Builder obligation `persistence.terminal-shell-integration` (parent `term.pty`): the `terminal-shell-integration/` store in Conductor's app data folder. Implementation: [`shell_integration.rs`](../../src-tauri/src/terminal/shell_integration.rs), applied by `pty_spawn` in [`terminal_commands.rs`](../../src-tauri/src/terminal_commands.rs).

## What Conductor does (0.87.6, read on Sven's Mac as data)

- On disk, `~/Library/Application Support/com.conductor.app/terminal-shell-integration/` holds one folder, `zsh/`, with `.zshenv`, `.zprofile`, `.zshrc`, `.zlogin` (all written at the same second), and a `.zcompdump`. The `.zcompdump` comes from the user's own `compinit`, which runs with `ZDOTDIR` pointing at this folder. SHA-256 of the four startup files:

  | File | SHA-256 |
  |---|---|
  | `.zshenv` | `b9e48d9138b255b77cd67005387e2f8be0b892ee547316788456de1977e62730` |
  | `.zprofile` | `652674f9df574d7e399c12d81292626a767077da39c45519289b645973408fbd` |
  | `.zshrc` | `556361569333c873fcbec0195519d8c30e067008d7f376f1878cd241c17039d4` |
  | `.zlogin` | `145c6ab0c914a80d75110a4715f85c47ffc6071dabc4bd0d51a5aa83442f27d0` |

- The frontend writes them, not the Rust binary: `strings` on `MacOS/conductor` and on the Bun sidecar find none of the variable names. In `renderApp-D_fmY7hW.js`:
  - `J7o` (byte ~8636700) builds the `.zshrc` hooks.
  - `W$e` builds each wrapper file.
  - `UHt` (`buildInteractiveShellIntegrationEnv`, ~8639600) runs only for the local host. It checks that the user shell's last path segment, lowercased, is `zsh`. It creates `<AppData>/terminal-shell-integration/zsh` recursively and writes the four files. It returns `{CONDUCTOR_ORIGINAL_ZDOTDIR: home, CONDUCTOR_USER_ZDOTDIR: home, CONDUCTOR_INTEGRATION_ZDOTDIR: dir, ZDOTDIR: dir}`.
  - The promise is memoized for the launch. A failure is logged ("Failed to prepare zsh integration:") and the memo is cleared, so the next terminal retries.
  - "home" is Tauri's `resolve_directory Home` and AppData is `resolve_directory AppData` (index chunk bytes 19898-20694, the `rh`-memoized `mi` and `Gf`), so a `$ZDOTDIR` already in the environment is not used as the user's folder.
- Who gets it: regular terminal tabs (`terminalLaunchEnv`, renderApp ~11153300) and the embedded command terminal (~8642700), both local only. Each env overlay is the workspace env, then the integration env, then `CONDUCTOR_PATH_PREFIX`. `CONDUCTOR_PATH_PREFIX` is `<AppData>/bin` (index `Vl`, byte 818302). It is prefixed with agent path-override shims when Claude or Codex executable paths are set (`Hwa`, `sync_agent_path_overrides`).
- The wrappers source the user's file of the same name from `CONDUCTOR_ORIGINAL_ZDOTDIR` (for `.zshenv`) or `CONDUCTOR_USER_ZDOTDIR` (the others), then point `ZDOTDIR` back at the integration folder. `.zshenv` and `.zshrc` also move `HISTFILE` into the user's folder. `.zshrc` then:
  - puts `CONDUCTOR_PATH_PREFIX` on `PATH`;
  - prefixes `PROMPT` with a zero-width `ESC]633;Conductor;Prompt BEL`;
  - on `preexec`, prints `ProgramStart;<marker>;<program>;<command>`. The program is the first word that is not an assignment, `command`, `builtin`, `exec`, `noglob`, `nocorrect`, `env`, `time` or `sudo`, unquoted, basename, control characters removed and `;` replaced by `_`. The command is the line with newlines turned into spaces and control characters removed. The marker is `${EPOCHREALTIME//./-}-$RANDOM-$RANDOM`;
  - on `precmd`, prints `CommandDone;<marker>`.
- Consumers (index chunk, not part of this obligation): `xkt` (byte 2754392) strips `ESC]633;Conductor;…` marks ended by BEL or `ESC\` from the output. `Pkt` parses them into `prompt`, `program_start {markerId, program, command}` and `command_done {markerId}`. The terminal controller turns those into `runningProgram`, `completedCommandMarkerId`, the active command's output (up to 1 MiB) and the last 5 completed commands (2564200-2566300). It warns once when integration is on but no prompt mark has arrived.

## Ours

- `ShellIntegration::env_for(shell)` writes the four files to `$APPDATA/terminal-shell-integration/zsh/` the first time a zsh terminal starts in a launch. It returns the same four variables, remembers them for the launch, and retries after a failed write.
- `ShellIntegration::prepare` (called by `pty_spawn`) adds them to login-shell terminals after the request's own env, then `CONDUCTOR_PATH_PREFIX=$APPDATA/bin` once [`bundled_bin`](../../src-tauri/src/bundled_bin.rs) has installed it. A write failure is logged and the terminal starts without the integration.
- Tests:
  - `shell_integration::tests::files_are_byte_identical_to_the_reference` compares the SHA-256 of each generated file with the table above.
  - The other unit tests cover zsh-only, write-once, retry and `prepare` ordering.
  - [`tests/shell_integration.rs`](../../src-tauri/src/terminal/tests/shell_integration.rs) runs a real `zsh -i` with the integration. It checks the `Prompt` mark before the user's prompt, `ProgramStart` with `FOO=1 command oc-prefixed` reported as program `oc-prefixed` and the whole line as the label, and the matching `CommandDone`. It also checks that the user's `.zshenv` and `.zshrc` ran, that `HISTFILE` is in their home, that `ZDOTDIR` is ours, and that a tool in the path-prefix folder runs. It skips where zsh is not installed (the Linux builder). It passed on Sven's Mac (zsh 5.9.1, `tools/terminal/run-rust-tests.sh shell_integration`: 6 passed), and macOS CI runs it.

## Our choices where we differ

- Applied in the backend's `pty_spawn` rather than built by the webview, since our terminals' env is assembled there. Only `Program::LoginShell` terminals get it: an explicit argv is not an interactive shell.
- Home is `$HOME`, else the passwd entry. The user shell is `$SHELL`, else the passwd entry, the same lookup `portable-pty` uses to start the shell. Conductor asks its own `userShell` query, whose source was not read.
- No agent path-override shims in `CONDUCTOR_PATH_PREFIX`. We have no Claude or Codex executable-path settings yet.
- Not yet built: the frontend side, which strips the marks and tracks the running program and completed commands. Until then the marks reach xterm.js, which ignores unknown OSC sequences, and the backend screen, which ignores them too. The missing-prompt-mark warning is also not built.

## REA

The store's contents were read straight from disk and its writer from the extracted frontend by byte offset. REA has no finding for either: its JavaScript analysis does not follow the minified re-exports between chunks (`mi as bp` / `Gf as bF` in the index chunk, imported as `Xj` / `WOt` in renderApp), the same gap as in [NOTES.md](NOTES.md). `rea search` from a plain login shell on the Mac fails `provider_unavailable` unless `GHIDRA_INSTALL_DIR` and `JAVA_HOME` are set, as the work folder's `rr.sh` does.
