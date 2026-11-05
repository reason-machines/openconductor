# Runtime captures (Wave 0, area 5)

A separate copy of Conductor.app (`ditto` of /Applications/Conductor.app) was run with a throwaway `HOME`; Sven's running instance (pid 90880) and its data were never touched. Both test instances were stopped afterwards. No Conductor login-keychain item changed during the runs (attribute timestamps all at or before 09:21:34Z; runs started 09:53Z).

| Capture | REA tool | Result |
|---|---|---|
| `conductor-runtime cli --help` | `capture-process` | exit 0, 9 rendered frames, no filesystem writes in HOME. Full text in `conductor-cli-help.txt` (171 lines). |
| App first start, 45 s | `capture-process` | ran to timeout (SIGTERM), 46 process samples, `truncated: true`. Filesystem effects below. |
| Main window (1400x800) | `observe-native-ui` | failed: exec'd app has no launch time (REA bug); after relaunch via LaunchServices, `screen-recording-denied`; with `--screenshot=false`, `accessibility-denied`. |
| Main window | `capture-native-ui-scenario` | failed: `screen-recording-denied`. |

No screenshots exist: the REA host process lacks macOS Screen Recording and Accessibility permission, and `screencapture -l` fails the same way. Granting both to the Reason CLI host on the Mac unblocks this.

First-run effects (`capture_process_app_start.json`, `first-run-files.tsv`):
- `~/.conductor/settings.toml` with `$schema` `https://conductor.build/schemas/settings.schema.json`, `[git] branch_prefix_type`, `[models] default`, `[models.codex] default_thinking_level / review_thinking_level`.
- `~/Library/Application Support/com.conductor.app/`: `conductor.db` and `cache.db` (+WAL, migrations applied), `bin/` (copies of bundled scripts, `gh`, `watchexec`, `.internal/*`, plus `claude`, `codex`, `codex-code-mode-host` shims), `agent-binaries/{claude/2.1.284,codex/0.156.1}` downloaded with `.meta/*.json` (sha256, size, downloaded_at), `app-icons/{cursor,ghostty,vscode,xcode,zed}.png` (open-in-editor targets), `local-storage.*` (lottie sprite cache), `.bin-source-markers.json`.
- `~/.local/state/gh/device-id` from the bundled `gh`; a login `zsh` is spawned to resolve `PATH` (`app-stdout-throwaway.log`).
