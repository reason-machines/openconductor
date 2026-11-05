# REA test report: Wave 0 on Conductor.app v0.87.6

REA 6.7.0 (`/opt/homebrew/bin/rea`, CLI; MCP `tools/list` used only to read input schemas), on Sven's Mac "sven m5 max" (macOS 26.4, arm64, Node 26.8.1). Target: a `ditto` copy of `/Applications/Conductor.app` (bundle `com.conductor.app`, 0.87.6). Every invocation, exit code and first error line is in `evidence/rea/rea-invocations.tsv`; failing outputs are in `evidence/rea/*.error.json`.

Conductor-derived data is treated as untrusted; Sven's running Conductor (pid 90880) and its data were never modified. Databases were analysed from APFS clones; runtime used a separate app copy with a throwaway HOME.

## Results by tool

| REA tool | Result | Notes |
|---|---|---|
| `doctor` | exit 1 (unhealthy) | No analysis engine configured (Ghidra/Hopper/IDA/Kuna/JADX); skill dir is a symlink; most client registrations missing. Informative, not a bug. |
| `inspect-macho` | pass | arm64, min macOS 11.0, SDK 26.5; load commands, segments. |
| `inspect-signature` | pass | Developer ID, team 27XN666UJ7, hardened runtime, entitlements allow-jit, allow-unsigned-executable-memory, audio-input. Also on `conductor-runtime`. |
| `inspect-rust-binary` | pass (empty) | No cargo-auditable `.dep-v0` section; only a rustc commit hash. Crate list came from panic paths via `strings` instead. |
| `inspect-plist` | pass | |
| `inspect-artifact` | pass | App bundle (30 nodes), `conductor-runtime`, `agent-launcher`. Does not recognise the Bun `__BUN` payload or the Tauri asset table. |
| `trace-dylib-resolution` | pass | |
| `extract-artifact` (app dir) | pass | 30 entries; embedded frontend not surfaced. |
| `extract-artifact` (Mach-O) | **fail** | `integrity_mismatch`: "Regular artifact entry is missing from inventory: slices/arm64". Same with `--integrity-policy record-and-continue`, which the error itself recommends. Bug: thin Mach-O extraction is impossible. |
| `inspect` / `analyze` / `search` (binary_overview, search_strings) | **fail** | `provider_unavailable` until a disassembler is configured. |
| `inspect-binary-layout` | **fail** | `capability_unavailable`: pwntools profile supports Linux x64 only. |
| `inspect --provider ghidra` | **fail x3, then running** | (1) Ghidra 12.1.4 macOS release ships no `mac_arm_64` decompiler: `executable_missing`. Built `decompile`/`sleigh` from the bundled sources (needed `DEPNAMES` override; Makefile hardcodes `-arch x86_64` on Darwin, so the first build was x86_64 and was correctly rejected; final build thinned with `lipo`). (2) `provider_timeout` at the fixed 330 s startup deadline on the 70 MB binary; remediation `REA_GHIDRA_STARTUP_TIMEOUT_MS` worked. (3) Then passed: overview finished and saved `snap/conductor.snap`. |
| `search --provider ghidra --snapshot` (after `inspect`) | **fail** | `evidence_integrity_mismatch: Analysis snapshot profile_mismatch` in 2-9 s for every `search` and `trace`: a snapshot saved by `inspect` cannot be reused by other operations. |
| `search --provider ghidra` (151 IPC names, regex) | pass, 4 matches | 1,930 s (32 min), almost all of it re-importing and auto-analysing the 70 MB binary, because the Ghidra database is ephemeral and a fresh `--snapshot` does not skip import. Only 4 of 151 names matched: Ghidra's defined strings are Rust's packed, unterminated literal blobs, so a `^(...)$` regex only hits names that happen to be a whole defined string. |
| `search --kind procedures --mode regex` (Ghidra, 151 IPC names) | pass, 831 procedures | 2,437 s (41 min; exit 0, 409 KB; slower than the 1,930 s strings run while another REA analysis shared the CPU). Agrees with the nm bindings (`evidence/ipc/ipc-rust-bindings.json`, #93): all 67 commands nm bound to a `conductor_lib` handler also have a Ghidra procedure carrying that exact v0 identifier, and all 17 plain-fn `handler_fn_addr`s are Ghidra procedure entry points. Of nm's 336 handler symbols, 335 are at a Ghidra procedure address and 325 under the same name; the 10 name differences are linker-folded (ICF) aliases where Ghidra keeps one name per address (e.g. `redownload_agent_binary` closures named `request_agent_binary_download`), and 1 `drop_glue` at 0x1004e7208 is not a Ghidra procedure. Ghidra matched 2 more names (`list_port_forwards`, `set_enabled`), both only inside generic tauri/core instantiations, not `conductor_lib` fns; nm's rule excludes those on purpose. |
| `trace` (Ghidra, 8 key commands) | running, corroboration only | Started 11:59Z after the procedures search; each call re-imports (~32-41 min). Not needed for the bindings, which the procedures search already confirms. |
| `xrefs` (Ghidra) | not run | One address per call; at ~32 min per call, 151 string sites would take ~80 h. IPC bindings were derived statically instead (`tools/ipc_bindings.py`, see `evidence/ipc/README.md`). |
| `analyze-javascript-application` (on `conductor-runtime`) | fail (expected) | Accepts only a directory or `.asar`; Bun single-file executables are not supported. |
| `analyze-javascript-application` (on extracted frontend) | pass | 1,908 files, 1,896 parsed, 0 parse failures, 15,557 findings, 213 MB Evidence. Summary is Electron-centric: 0 IPC operations because Tauri `invoke` / `__TAURI_INTERNALS__` is not modelled. Many files hit "result budget" limits. |
| `recover-javascript-sources` | **fail** | Needs `REA_WAKARU_COMMAND`, and only a Wakaru Linux x64 binary is accepted, so it cannot run on macOS arm64. |
| `trace-javascript-semantics` | pass, 0 matches | Literal seeds `pty_spawn` (callers) and `rpc_to_sidecar` (forward-influence) found 0 seed nodes though both literals are in `index-BGEQ8YjU.js`; 935 / 11,355 relevant unknowns. Likely the budget-truncated file nodes are not searchable. |
| `analyze-web-bundle` | not run | Needs a CDP endpoint; Tauri's WKWebView exposes none. Gap: no WKWebView/Safari Web Inspector route. |
| `inspect-sqlite-database` | fail, then pass | Refuses DBs over 256 MiB (`resource_constraint`); both DBs are ~7 GB. Passed on schema-only snapshots (DDL + `_sqlx_migrations`). |
| `capture-process` (CLI `--help`, app first start) | pass | Terminal frames, process samples, filesystem effects. Rendered frames keep only the visible screen, so long `--help` output had to be read directly as well. App run `truncated: true`. |
| `observe-native-ui` | **fail** | (1) exec'd app: "process-identity-unavailable: Selected application does not expose a launch time" (works only for LaunchServices launches; bug or undocumented requirement). (2) After `open -n`: `screen-recording-denied`. (3) `--screenshot=false`: `accessibility-denied`. |
| `capture-native-ui-scenario` | **fail** | `screen-recording-denied`. No screenshots of any screen exist. |
| `build-reconstruction-obligation-ledger` | fail x2, then pass | (1) 11 obligations rejected for empty `review_evidence_ids` (min 1). (2) "Evidence bundle manifests are not canonical": the CLI gives no way to build a bundle from loose records, and `evidence-export` rejects the same non-canonical input. Fixed by calling REA's own `createEvidenceBundle` from `dist/domain/evidenceBundle.js`. Then 274 obligations. |
| `evidence-export` | fail, then pass | Same canonicalisation issue; passed on the canonical bundle (17 records, 215 MB). |
| `--schema` for workflow tools | gap | `trace-javascript-semantics` and `build-reconstruction-obligation-ledger` show only `inputJson: string`; the real schema is only in MCP `tools/list`. |

## REA gaps and bugs (summary)

1. No extractor for Tauri embedded assets (brotli asset table in `__TEXT`); wrote `tools/extract_tauri_assets.py` (2,902 assets).
2. No support for Bun single-file executables (`__BUN` segment) in `inspect-artifact`, `extract-artifact` or `analyze-javascript-application`.
3. `analyze-javascript-application` / `trace-javascript-semantics` do not model Tauri IPC (`invoke`, `plugin:x|y`); IPC list was derived by `tools/ipc_scan.py`.
4. `extract-artifact` fails on any thin Mach-O (`slices/arm64` missing), even with `record-and-continue`.
5. Ghidra provider on Apple silicon: release has no mac_arm_64 natives; REA's remediation says it will not build them but gives no route. 330 s default startup deadline is too low for a 70 MB binary.
6. `inspect-binary-layout` and `recover-javascript-sources` (Wakaru) are Linux-x64-only.
7. `observe-native-ui` requires a launch date only LaunchServices launches have; error text does not say so.
8. `inspect-sqlite-database` hard 256 MiB cap with no schema-only mode.
9. Building a ledger or bundle from loose Evidence records requires private canonical ordering; CLI `--schema` hides workflow input schemas.
10. `trace-javascript-semantics` literal seeds miss literals present in budget-truncated files.
11. Environment, not REA: Screen Recording and Accessibility are not granted to the REA host on this Mac, which blocks all native UI capture.
12. Packaging (see `evidence/packaging/README.md`): `inspect-signature` on an `.app` inspects only the main executable (no bundle seal, sealed resources or nested code, no trust validation) and gives the signing timestamp as a local string with no time zone; no REA command covers notarization or Gatekeeper assessment.
13. Ghidra snapshots are operation-scoped: a snapshot saved by `inspect` is rejected by `search` and `trace` (`profile_mismatch`), and the Program is discarded after each CLI call, so every operation re-imports the binary (~32 min for 70 MB on an M5 Max). No batch or persistent-project mode, and `xrefs` accepts only one address per call.
14. Ghidra `search` over defined strings cannot find Rust string literals reliably (packed, unterminated blobs); there is no substring or byte-pattern search that returns the containing definition, and no Rust symbol-path search (the binary keeps 94,469 v0-mangled local symbols, which `nm` reads in under a second).
15. String search cannot see literals LLVM emits as instruction immediates: in Conductor every literal of 8 bytes or fewer in the compiled Tauri ACL (`exec-zsh`, `/bin/zsh`, `kill`, `open`, `git`, `rm`) is a movz/movk sequence, so `search` reported Conductor's shell scope without `exec-zsh` and #212 shipped guessed scopes. REA has no immediate-constant or decoded-literal search, and no Tauri ACL decoder; wrote `tools/decode_tauri_acl.py`.
16. `execute-rizin-command` fails with `capability_unavailable` (rizin ENOENT) when rizin is not installed; `doctor` does not flag it and REA has no fast byte-read or disassembly route that avoids a ~40 min Ghidra import.
17. Codex area (`evidence/providers/codex-conductor-client.md`): `analyze-javascript-application` on the 13 MB JavaScript extracted from `conductor-runtime` exits 0 but its worker runs out of heap, leaving a 6-node graph with no strings or calls. There is no setting to raise the worker heap or analyze one region. The workaround was to cut the Codex client out at top-level statement starts (213 KB), which then parsed fully with 0 failures.
18. `trace-javascript-semantics` finds 0 seed matches for literal seeds that are in a fully parsed file. On the 213 KB Codex slice (0 parse failures, no budget limits), `callers` of `turn/start`, `thread/start`, `app-server`, `danger-full-access`, `acceptForSession` and `item/tool/requestUserInput` all return `status: partial` with no seeds, though each literal is in the source. This narrows item 10: the miss is not only in budget-truncated files.
