# Terminal: reference behavior vs our implementation

Implementation: [`src-tauri/src/terminal/`](../../src-tauri/src/terminal/mod.rs) (`portable-pty` 0.9.0 + `libc`, no Tauri types).
Tests: unit tests beside each file plus PTY tests in [`tests/`](../../src-tauri/src/terminal/tests/mod.rs), run with [`tools/terminal/run-rust-tests.sh`](../../tools/terminal/run-rust-tests.sh) until the Tauri crate declares `mod terminal;`. The Terminal workflow runs them with clippy and rustfmt on macOS and Linux.

Ledger obligations: `term.pty` (spawn, write, resize, kill, flow control, history persistence, mirrors) and `term.shell-exec` (`execute_shell_command[_cancellable]`, cancel). See [`../ledger/README.md`](../ledger/README.md).

## Evidence used (all on main, all read as data)

| Source | What it says |
|---|---|
| [`ipc/rust-crates-from-paths.txt`](../ipc/rust-crates-from-paths.txt) | The binary links `portable-pty-0.9.0` and `alacritty_terminal-0.26.0` (panic-location paths). So the PTY layer is portable-pty and the backend keeps its own terminal grid with alacritty_terminal. |
| [`ipc/frontend-invoke-candidates.json`](../ipc/frontend-invoke-candidates.json) | Commands the frontend invokes, all from `index-BGEQ8YjU.js`: `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`, `pty_ack_bytes`, `pty_screen_snapshot`, `pty_screen_text`, `pty_persist_terminal_history`, `pty_load_terminal_history`, `pty_create_mirror`, `pty_write_mirror`, `pty_resize_mirror`, `pty_delete_mirror`, `run_script`, `run_script_mode`; and from both app chunks `execute_shell_command`, `execute_shell_command_cancellable`, `cancel_shell_command`. |
| [`frontend/copy-catalog.json`](../frontend/copy-catalog.json) | UI and error strings. Terminal ones used below: "Invalid PTY ready/data/exit payload", "Terminal working directory is missing." / "... is not a directory.", "Scrollback limit", "Approximate terminal output to keep.", "Clear terminal scrollback", "Command to auto-run when creating a new terminal tab.", "Allow up to 10 chat and terminal tabs per workspace.", "New terminal tab", "Close terminal", "Find in terminal", "Terminal panel" / "Toggle terminal panel", "Run script" / "Run scripts", "No run script process active", "Start or stop run script", "Setup script output will appear here after running setup.", "Attach current terminal output". |
| [`frontend/routes.json`](../frontend/routes.json) | Sidecar HTTP path `/shell/execute`. |

## Matched (implemented and covered by a test)

| Reference behavior (source) | Ours | Test |
|---|---|---|
| PTY via portable-pty 0.9.0 (crate list) | same crate, pinned `=0.9.0` | all tests under `tests/` |
| Three event kinds: ready, data, exit (the "Invalid PTY ready/data/exit payload" errors) | `PtyEvent::{Ready, Data, Exit}`, emitted in that order; exit carries code and signal | `tests::ready_data_exit_in_order_with_exit_code` |
| `pty_write`, `pty_resize` | `PtyManager::write`, `resize` (0 cols/rows refused) | `tests::input_reaches_the_program`, `tests::resize_is_seen_by_the_program` |
| `pty_ack_bytes`: renderer acks bytes (flow control) | reader pauses at a high watermark of unacked bytes, resumes at a low one | `tests::flow_history::flow_control_pauses_until_acked`, `flow::tests::*` |
| `pty_kill` | SIGHUP to the process group, SIGKILL after 2 s; the exit event still arrives; releases a reader paused by flow control | `tests::kill_group::*`, `tests::flow_history::kill_releases_a_paused_reader` |
| Working directory errors (copy) | `CwdMissing`, `CwdNotDirectory`, checked before spawning | `spawn::tests::refuses_bad_working_directory_size_and_argv` |
| Auto-run command for a new terminal tab (copy) | `SpawnRequest::initial_command`, typed and followed by Enter | `tests::flow_history::initial_command_runs_in_the_new_terminal` |
| Approximate scrollback limit, clear scrollback (copy) | bounded byte history, trimmed forward to a line start; `clear_history` | `tests::flow_history::history_is_bounded_and_clearable`, `scrollback::tests::*` |
| Terminal panel with tabs, "New terminal tab", "Close terminal", "Toggle terminal panel", up to 10 tabs per workspace (copy) | [`TerminalPanel.tsx`](../../src/features/terminal/TerminalPanel.tsx): one xterm per tab kept alive while hidden ([`session.ts`](../../src/features/terminal/session.ts)), rendered bytes acked in batches | [`terminal.test.ts`](../../src/features/terminal/terminal.test.ts) (tab model, event parsing, ack batching) |
| Terminal shortcuts from the keybinding registry: `terminal.newTab`, `newBigTab`, `closeTab`, `clearScrollback`, the hidden line-editing ones, and `view.toggleTerminalPanel` | resolved inside xterm before the shell sees the key ([`shortcuts.ts`](../../src/features/terminal/shortcuts.ts)); the panel sets `data-terminal` so the global dispatcher knows focus is in a terminal | [`shortcuts.test.ts`](../../src/features/terminal/shortcuts.test.ts) |

Mutation check (by hand, once): ignoring the flow gate fails `flow_control_pauses_until_acked`; signalling only the child pid instead of the process group fails `kill_escalates_when_hangup_is_ignored` (its background job ignores SIGHUP, so only a group SIGKILL stops it); dropping the SIGKILL escalation fails the same test.

## Our choices where the reference is not observable

- IPC ([`terminal_commands.rs`](../../src-tauri/src/terminal_commands.rs), payloads in [`wire.rs`](../../src-tauri/src/terminal/wire.rs)): the reference's `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`, `pty_ack_bytes`, plus our `pty_read_history`, `pty_clear_history`, `pty_list`. Events go out on one `pty-event` channel tagged `kind: ready | data | exit` with the terminal id; data is base64 so a UTF-8 sequence split across reads arrives intact. The app kills every terminal on exit.
- Watermarks: 512 KiB high, 128 KiB low. Default history: 1 MiB. The reference values were not recovered.
- `TERM=xterm-256color`, `COLORTERM=truecolor`; default program is the user's login shell (`$SHELL`, else passwd).
- An exited terminal stays readable (history, exit status) until `kill`; writes to it fail with `NotRunning`.
- Line-editing shortcuts send the bytes readline and zsh bind to the same motion: Cmd+Left `^A`, Cmd+Right `^E`, Cmd+Backspace `^U`, Option+Left/Right `Esc b`/`Esc f`, Shift+Enter `Esc Enter` (a literal newline in zsh and agent CLIs). The reference's bytes were not recovered.
- Until workspaces carry their worktree path, new terminals open in the repository checkout.
- If a background job keeps the PTY open after the main process exits, the exit event is sent after a 1 s drain grace and any later output still arrives.

## Not done yet (later PRs)

- `pty_screen_text` / `pty_screen_snapshot` (alacritty_terminal grid), `pty_persist_terminal_history` / `pty_load_terminal_history`, mirrors.
- `run_script` / `run_script_mode` and `execute_shell_command[_cancellable]` / `cancel_shell_command`.
- Run-script output in the panel: waits on the `run_script` Tauri commands over the scripts runner in `crates/scripts` (another builder's area).
- `terminal.search` (Find in terminal) and `terminal.openLocalhost`.

## REA gaps

- `trace-javascript-semantics` with the literal seed `pty_spawn` found 0 seed nodes although the literal is in `index-BGEQ8YjU.js` (already recorded in [`../../rea-test-report.md`](../../rea-test-report.md)). So argument shapes, event names and the ack cadence of the `pty_*` calls are not recovered; the event payloads here are ours.
- The obligation's next evidence (a Ghidra binding of the Rust `pty_*` handlers and a process capture of `pty_spawn`) needs REA on Sven's Mac; REA is not installed on the cloud builder machine, so nothing here comes from a fresh REA run.
