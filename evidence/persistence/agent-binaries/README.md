# persistence.agent-binaries: Conductor's `agent-binaries/` store

Builder obligation `persistence.agent-binaries` (parent `agent.binaries`). Conductor downloads Claude Code and Codex into the app data directory and keeps a sha256 `.meta` record next to each executable.

Reference: Conductor 0.87.6 on Sven's Mac "sven m5 max", REA 6.7.0. Conductor-derived text is untrusted data; it was read, never executed (apart from the app start inside REA's earlier process capture under a throwaway HOME).

| Piece | OpenConductor |
| --- | --- |
| Store, verify, download, manager (std-only core) | [src-tauri/src/agent_binaries.rs](../../../src-tauri/src/agent_binaries.rs) |
| Tests (local fixtures, no network) | [src-tauri/src/agent_binaries_tests.rs](../../../src-tauri/src/agent_binaries_tests.rs) |
| IPC commands | `agent_binaries::commands` (registered in `lib.rs`; manager managed in setup) |
| Harness | [run-tests.sh](run-tests.sh) (no Tauri/WebKit needed; runs in CI's `db` job) |

## What Conductor does

| Claim | Source |
| --- | --- |
| Layout `<AppData>/agent-binaries/<agent>/<version>/<exe>`: `claude/2.1.284/claude`, `codex/0.156.1/codex` and `codex/0.156.1/codex-code-mode-host`. Directories `drwx------`, executables `-rwxr-xr-x` | REA `capture_process_scenario` of the app's first start (`evidence/runtime/capture_process_app_start.json`, Evidence `ev_becc8a2e…`; `evidence/runtime/first-run-files.tsv`), re-listed on the throwaway home with `ls -la` on 2026-11-05 |
| Meta files `agent-binaries/.meta/<agent>-<version>.json` for the agent's own executable and `<agent>-<version>-<exe>.json` for the others, mode `-rw-------` | Same capture (`first-run-files.tsv` lines 5-7) and listing |
| Meta JSON is exactly `{"sha256":…,"size":…,"downloaded_at_unix_ms":…,"verified_mtime_unix_ms":…}`, compact, in that order | The three files read on the throwaway home. Byte-for-byte copy of `claude-2.1.284.json` in test `reads_a_meta_file_written_by_conductor` |
| `verified_mtime_unix_ms` equals the executable's mtime in ms (claude 1793872376515, codex 1793872375406, codex-code-mode-host 1793872378497, each identical to its file's `st_mtime`), and is earlier than `downloaded_at_unix_ms` | `stat` of the three executables vs their meta files. This is what makes the mtime short-circuit sound |
| Rust module `conductor_lib::binary_manager` (`src-tauri/src/binary_manager.rs`) owns the commands `get_agent_binary_state`, `request_agent_binary_download`, `redownload_agent_binary`, `remove_agent_binary`, `set_agent_binary_failure_injection`, `prefetch_agent_binaries_from_updater_endpoint` | REA Ghidra IPC binding pass (`evidence/ipc/ipc-rust-bindings.json`, handler symbols by drop glue) |
| `get_agent_binary_state()` resolves to an array of `{agent, kind, state, version, bytesDownloaded, bytesTotal?, error?, nextAttemptUnixMs?, attempt?}`; the frontend listens on event `agent_binary_progress` with the same payload, keys statuses by `<agent>:<kind>` and reads only `kind: "current"` | Frontend bundle `index-BGEQ8YjU.js` @3050074 (`AgentBinaryStore`, mapper `XV`); the bundle is the one REA's `analyze-javascript-application` indexed (`evidence/frontend/rea-analyze-javascript-application.json.gz`) |
| `request_agent_binary_download({agent})`, agent `claude` or `codex`; on hydrate the frontend auto-retries every `current` status in `failed` | Same location; agents list `T2a=["claude","codex"]` in `renderApp-D_fmY7hW.js` |
| States `ready`, `pending`, `started`, `downloading` (percent from `bytesDownloaded/bytesTotal`), `retrying` (`attempt`), `failed` (`error`) | `renderApp-D_fmY7hW.js` `I2a` (developer panel) |
| Log line `[binary_manager] <agent> ready at "<path>"` | `evidence/runtime/app-stdout-throwaway.log` lines 6-7 |
| Error text starts `sha256 mismatch (expected `; other strings: `CONDUCTOR_AGENT_BINARIES_DIR`, `[binary_manager] launch-time GC failed for`, `[binary_manager] startup download failed for`, `[binary_manager] updater endpoint unavailable:`, `# symlinks in AppData/bin that point at AppData/agent-binaries.` | `strings -a` of `Contents/MacOS/conductor` (corroboration, not REA; see gap 1). REA Ghidra `search` of the same strings: see gap 1 |

## What OpenConductor has

- `AgentBinaries`: Conductor's paths (components validated, no `..`/`/`), `drwx------` dirs, meta read/write (atomic temp + fsync + rename, `0600`), `verify` (size check, then mtime short-circuit against `verified_mtime_unix_ms`, else re-hash; a good re-hash moves `verified_mtime_unix_ms`), `verify_release` (both Codex executables), `list_versions` (numeric version order, with verified flag), `latest_verified`, `remove_version`.
- Downloads stream into a hidden temp file in the version dir, hashing as they go, check size and sha256, `chmod 755`, rename over the executable, then write the meta with the installed file's mtime. A mismatch, error or cancel drops the temp file, so the previous good binary and meta stay untouched.
- `BinaryManager`: per-agent status in the frontend's shape, `agent_binary_progress` events (at most one per MiB plus state changes), dedupe of concurrent requests, cancellation (`CancelToken`, checked per 64 KiB chunk and during backoff), retry with exponential backoff (`retrying` with `attempt` and `nextAttemptUnixMs`), hydration from disk for `get_agent_binary_state`.
- Commands: `get_agent_binary_state`, `request_agent_binary_download`, plus `cancel_agent_binary_download` (OpenConductor's; no Conductor name found).

## Not done here

- Conductor's release source: its updater endpoint (`prefetch_agent_binaries_from_updater_endpoint`) and download URLs are not captured. OpenConductor reads a manifest named by `OPENCONDUCTOR_AGENT_BINARY_MANIFEST` (path, `file://` or `https://`). Without one, a download request ends `failed` with that message. Needs the ledger's "network capture of updater endpoint".
- `redownload_agent_binary`, `remove_agent_binary`, `set_agent_binary_failure_injection`, the launch-time GC of old versions, the `bin/` symlinks, `CONDUCTOR_AGENT_BINARIES_DIR` for the sidecar, and the frontend `AgentBinaryStore`. The store has `remove_version`/`latest_verified` for them.

## Checks

```bash
evidence/persistence/agent-binaries/run-tests.sh   # 23 tests + clippy -D warnings
python3 tools/parity_check.py check --ref HEAD --out-dir "$TMPDIR/parity"   # persistence.agent-binaries: pass
```

## REA gaps hit

1. REA Ghidra `search` for the `binary_manager` strings (`rea search … --mode regex --provider ghidra --snapshot snap/agentbin-search.snap`) takes 30-45 minutes on the app binary (earlier `search` runs in `log.tsv`: 1930-2672 s), because Ghidra re-imports it per CLI call even with a snapshot (same as the IPC batch's `REA_GHIDRA_STARTUP_TIMEOUT_MS=3600000` note). `rea search` without Ghidra fails `provider_unavailable` (`evidence/rea/search_strings_tauri.error.json`). REA has no cheap literal-string listing for a large Mach-O, so the strings above were read with `strings -a`.
2. REA cannot see the shape of a Tauri command's arguments or return value from the Rust side: the IPC binding pass names the handler only through drop-glue symbols (`handler_fn_addr: null`). The payload shape comes from the frontend bundle instead.
3. No REA operation reads app data files under a HOME as structured evidence (the meta JSON and mtimes were read with `cat`/`stat` on the Mac); the process capture records paths and sizes but not contents or mtimes.
