# End-to-end run on Sven's Mac

Run by Conductor Rebuild on 2026-11-05 against `main` @ `454a219` on the Mac "sven m5 max" (macOS 26.4 build 25E246, arm64).

## Outcome

The app builds, signs and launches on the Mac. The GUI walk could not run: the Mac's screen was locked for the whole run, and Reason's background worker on that Mac has no Accessibility or Screen Recording permission. No flow was observed on screen and **no screenshots exist**.

Each flow therefore has one of three results:

- **pass**: proven on the Mac without the screen (build, launch, tests).
- **fail (source)**: the flow cannot work in this build. Main's source and the app's registered IPC commands show it is not wired. Not observed on screen.
- **not run**: the flow is wired, but it needs the screen to check. Rerun when the Mac is unlocked.

The failures are filed as builder obligations in [issue #150](https://github.com/reason-machines/openconductor/issues/150).

## What ran

| Step | Command | Result |
|---|---|---|
| Clone | `gh repo clone reason-machines/openconductor` into `~/oc-e2e/openconductor` | `454a219` |
| Build | `npm ci && scripts/package-macos.sh` (debug) | exit 0; signed `Developer ID Application: SVEINUNG MYHRE (6N57FMKAZW)`, hardened runtime, `com.reasonmachines.openconductor` |
| Launch | `open src-tauri/target/debug/bundle/macos/OpenConductor.app` | process `openconductor` running (pid 97432) for the length of the run; created `~/Library/WebKit/` and `~/Library/Caches/com.reasonmachines.openconductor` |
| Backend tests | `cargo test` in `src-tauri` | 140 passed, 0 failed, 1 ignored (workspace 28, agent 42, terminal 21, diff 19, quick_open 14, settings 12) |
| Screen check | `ioreg -n Root -d1` | `CGSSessionScreenIsLocked=Yes` at start and end |
| Screenshot | `screencapture -x` and `screencapture -l <window>` | `could not create image from display` / `could not create image from window` |
| Computer use | Reason computer snapshot on the Mac | refused: Accessibility and Screen & System Audio Recording are not granted to Reason's background worker |

Test repo for the rerun: `~/oc-e2e/testrepo`, a clone of this repo with `origin` set and a `conductor.json` holding a setup and a run script.

## Per-flow results

| # | Flow | Result | Evidence | Obligation |
|---|---|---|---|---|
| 0 | Build and launch | **pass** | Build exit 0, signed, process running (table above). No window screenshot (screen locked). | - |
| 1 | Add a repo | **not run** | Wired: native folder picker, then `inspect_project_folder` and `add_repository`. Needs the screen for the picker. A folder with no `origin` only shows an info toast; the create-GitHub-repo dialog is not built. | - |
| 2 | Create a workspace from a git worktree | **not run** | Wired: Create dialog calls `create_workspace`. Workspace backend tests (28) pass on the Mac. | - |
| 3 | Setup and run scripts | **fail (source)** | `workspace/scripts.rs` has no Tauri command and no UI reads `setup_script`, `run_script` or `conductor.json`. | `e2e.scripts` |
| 4 | Claude Code turn in chat | **fail (source)** | The composer appends the message and the local note "No agent is connected yet..."; no command starts `agent::claude_cli`; `chat/` is not compiled. | `e2e.claude-turn` |
| 5 | Reason ACP turn in chat | **fail (source)** | `reason_acp/` is not declared in `lib.rs`, so it is not in the app; no runtime picker. | `e2e.reason-acp-turn` |
| 6 | Run a command in the terminal | **fail (source)** | `pty_*` commands are registered and terminal tests (21) pass, but no component mounts a terminal and Cmd+J has no handler. | `e2e.terminal` |
| 7 | Open the diff viewer | **fail (source)** | `WorkspaceView` mounts `DiffViewer` with `worktree={null}`; in the desktop app `loadWorkspaceDiff` then throws "This workspace has no worktree on disk yet." | `e2e.diff-viewer` |
| 8 | Settings and BYOK page | **fail (source)** | Settings commands are registered, but nothing in `src/` calls them and Cmd+, has no handler. | `e2e.settings-byok` |
| 9 | Spotlight | **fail (source)** | Spotlight testing (ledger `ws.spotlight`) has no code. `src/spotlight/` is the quick-open ranker. | `e2e.spotlight` |
| 10 | Quick open | **not run** (at best partial) | Cmd+P calls `fuzzy_match_files` (quick_open tests pass). Choosing a file only shows "Opened <path> (file viewer not built yet)". | `e2e.quick-open-viewer` |
| 11 | Keyboard shortcuts | **not run** (at best partial) | Handlers exist for Cmd+K, Cmd+N, Cmd+P, Cmd+B, Cmd+Shift+H, Cmd+Shift+A, workspace next/previous and Cmd+1..9. Cmd+,, Cmd+J, Cmd+Alt+/, Cmd+Alt+T and zoom have none. | `e2e.shortcuts` |
| 12 | Merge a test PR through the gh runner | **fail (source)** | `pr/` (gh runner with `merge` and auto-merge) is not declared in `lib.rs`, so it is not in the app and has no command or UI. No test PR was opened, because the app has no way to merge it. | `e2e.gh-merge` |

One more obligation came out of the run: `chat`, `checkpoint`, `pr` and `reason_acp` are not declared in `lib.rs`, so CI never compiles or tests them (`e2e.uncompiled-modules`).

## Not verified

- Every on-screen flow, and every screenshot the run asked for. Nothing here was seen on screen.
- Whether the "fail (source)" flows show any partial UI in the running app beyond what the source shows.
- The ACP and Claude Code CLIs on the Mac. They are not reachable from this build, so they were not exercised.

## Rerun

1. Unlock "sven m5 max" and keep it unlocked (or awake with the display on).
2. Turn on Accessibility and Screen & System Audio Recording for Reason's background worker in System Settings > Privacy & Security.
3. Build the current `main` the same way, add `~/oc-e2e/testrepo`, and walk the 12 flows with a screenshot each. Re-check the boxes in issue #150.
