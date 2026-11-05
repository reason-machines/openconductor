# Sidecar stores: session event outbox and slash-command snapshots

Builder obligation `persistence.sidecar-stores` (parent `proc.sidecar`): Conductor's `sidecar-v2-session-event-outbox/` and `sidecar-v2-completions/` stores, rebuilt in `src-tauri/src/sidecar_stores/`.

Reference: Conductor 0.87.6 on Sven's Mac "sven m5 max", a `ditto` copy of `/Applications/Conductor.app`, REA 6.7.0. `conductor-runtime` sha256 `5723ead40316bb29e3d0b446cdc82bede489cc75443d6ce08a4e6421ae6eac0d`. Conductor-derived text is untrusted data. It was read and never executed, except for the sidecar run inside REA's process capture under a throwaway HOME.

## What Conductor does

| Claim | Source |
|---|---|
| At start the sidecar creates `~/.conductor/sidecar-v2-session-event-outbox/` (mode `drwx------`), and does not create `sidecar-v2-completions/` | REA `capture-process` of `conductor-runtime sidecar` with a throwaway HOME ([`rea/capture-process-sidecar-start.toon`](rea/capture-process-sidecar-start.toon), Evidence `ev_ddecfc50...`, scenario [`rea/scen_sidecar_start.json`](rea/scen_sidecar_start.json)): filesystem effects show `.conductor` and `.conductor/sidecar-v2-session-event-outbox` created, mode 16832 |
| The app shell moves both stores into App Support: it sets `CONDUCTOR_SESSION_EVENT_OUTBOX_ROOT` and `CONDUCTOR_SIDECAR_V2_COMPLETIONS_DIR` to `<app data>/sidecar-v2-session-event-outbox` and `<app data>/sidecar-v2-completions` | Strings in the Rust binary next to the sidecar launcher (`bin/.internal/sidecar`, `sidecar-v2-session-event-outbox`, `sidecar-v2-completions`, both env names). REA's earlier `capture-process` of the app's first start (`evidence/runtime/capture_process_app_start.json`) shows `Library/Application Support/com.conductor.app/sidecar-v2-session-event-outbox` created |
| Outbox format, validation, durability and acknowledgement rules | `conductor-runtime.js` (`Lc6`, `Pc6`, `zc6`, `_v8`, `vv8`, `jc6`), read by byte offset (see REA gaps) |
| Snapshot store format, pruning (30 days, newest 500), size limit (5 MiB), file modes, compare-and-set, replacement rule (`T27`) | `conductor-runtime.js` (`Hp5`, `AB6`, `Rp5`, `Pp5`, `T27`, constants `_27`, `I27`, `Y27`, `K27`), read by byte offset |
| Only `agent`, `userMessage` and `checkpointCreated` events go through the outbox; a failed backup disables the backup for the process and never blocks live delivery; replay sends each session's head and waits up to 10 s for the frontend's acknowledgement | `conductor-runtime.js` (`kp5`, `_p5`, `l27`, `Tp5`) |

## What OpenConductor has

`src-tauri/src/sidecar_stores/`:

- `outbox.rs`, `SessionEventOutbox`. It uses Conductor's file names (base64url of the UTF-16LE session id, `.json`) and its state JSON. It writes through a temp file, fsync and rename, then fsyncs the directory. Duplicate, conflict, not-head and unknown-event outcomes match Conductor. A corrupt file blocks its session and a failed directory sync marks the session `durabilityUncertain`. A root can be open only once per process, and `listHeads` comes back sorted.
- `completions.rs`, `SlashCommandSnapshotStore`. It uses Conductor's file, key (`["userId","repoFullName","agentType"]`) and snapshot-as-string entries, with the same pruning, size limit, directory and file modes, and compare-and-set. `write_decision` is Conductor's `T27` rule.
- `mod.rs` holds the paths. They default to the app data dir, as Conductor's shell sets them, and Conductor's env names still override them.
- `lib.rs` opens the outbox at startup, which creates its directory as Conductor does, and manages both stores. If the outbox fails to open, the app logs the error and carries on, as Conductor does.

## Not done here

OpenConductor has no frontend acknowledgement channel for agent events yet. So nothing enqueues into or acknowledges the outbox, and nothing yet writes snapshots: there is no slash-command fetch. Those hooks belong to the agent run (`agent.session-run`) and the composer (`agent.models`), whose owners call `enqueue`/`acknowledge`/`list_heads` and `read`/`compare_and_set`.

## Checks

```bash
evidence/persistence/sidecar-stores/run-tests.sh   # 15 tests + clippy -D warnings, no Tauri toolchain needed
```

## REA gaps hit

1. `analyze-javascript-application` on the 13 MB `conductor-runtime.js` (cut from the Bun binary's `__BUN` payload at offset 62,734,375) parsed 0 of 1 files: "Owned JavaScript worker exhausted its heap" ([`rea/analyze-javascript-application-runtime.toon`](rea/analyze-javascript-application-runtime.toon), Evidence `ev_3f6cc3f4...`). It has no option to raise the worker heap or to analyze one function range. This adds to the known gap that REA cannot open Bun single-file executables at all.
2. The process capture's first try ran `conductor-runtime` without arguments and only got its usage line. REA's capture gives no hint that a multi-command Bun binary needs a subcommand. That is not a bug, just a note for the next run: use `arguments: ["sidecar"]`.
3. The capture's `exit` is `timeout`, since the sidecar runs until it is signalled. The filesystem effects are still complete (`after_settlement`).
