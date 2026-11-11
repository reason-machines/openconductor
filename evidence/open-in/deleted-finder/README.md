# Deleted-file Finder regression

Conductor Rebuild owns `DELETED-FINDER-CONSUMER-JOIN-15`. This is the test-only baseline. Production behavior is unchanged.

## Source contract

Retained Conductor 0.87.6 REA bytes connect the diff's current selected path through `Jqo`, `bji`, `GPo`, `NPo`, `tee`, and `uD`. Rename `oldPath` is a label, not the open target. For a primary file, Finder reveals an existing file on macOS. Otherwise it opens the immediate parent bounded by the workspace. The source does not search for the nearest existing ancestor.

The renderer imports `Kc` from index export `W`, which is `Ce`. For the local host, `Ce` invokes `execute_shell_command` through the actual Tauri invoke wrapper. Retained symbol-bounded arm64 disassembly connects that command's argument decoding to its blocking worker and `Command::spawn`. This is a static consumer join, not successful command execution or native acceptance.

`source.json` pins both original assets, 25 UTF-8 byte spans, REA evidence IDs, seven main sources at `516a58c931f31097007c97e844a1bb56d118c528`, the retained native packet, and the fixture. All seven sources are unchanged from the earlier source handoff. `native-source-only.tar.gz` retains the original static REA and disassembly packet, including its recorded decompiler failures. Nothing from that packet executes in the regression.

## Executable boundary

`src-tauri/src/open_in/deleted_finder_ipc.rs` invokes the real `open_in_app` command through Tauri mock IPC. Each case runs in a separate child test process with an isolated `PATH`. Only the external `open` and `xdg-open` programs are fake. No application opens and the parent process environment is unchanged.

The ten behavior cases cover existing file and directory, deleted file, deleted extensionless file, deleted workspace-root file, missing immediate parent, rejected missing editor target, rejected relative path, unknown app, and rejected outside-workspace target. The helper entry is an eleventh test function, not a behavior case. Four assertions are predicted to fail. Six controls are predicted to pass. Neither prediction is an observed result.

`fileContext.workspacePath` is a proposed OpenConductor input design, not an original Conductor API name or trusted authorization. The baseline command ignores that additional JSON field. The outside-workspace rejection is a safety control, not recovered original policy. The missing-parent case uses a failing launcher and checks one immediate-parent attempt, not a successful open.

The ordinary existing CI app jobs run this module through `cargo test --locked`. A focused equivalent is:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib open_in::deleted_finder_ipc -- --nocapture
```

No workflow, manual dispatch, local Rust, local Node, browser, or native runtime is added or used. The frozen #1080 and #1086 cases are unchanged.

## Verification status

`python3 evidence/open-in/deleted-finder/verify_source.py --baseline` checks retained-source integrity, current-main qualification, loader registration, fixture immutability, and unchanged production files. It does not compile Rust, execute original JavaScript, or prove parity. Hosted assertion RED and unchanged-fixture GREEN are pending. No product repair or merge request precedes actual intended behavioral RED.

Native Finder activation, side-by-side screenshots, GUI behavior, and a released app are NOT_RUN. There is no screenshot because this lane has no native or browser admission.
