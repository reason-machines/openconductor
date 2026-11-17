# Reason cloud file-open identity — frozen failing reproduction

> Historical baseline record. The current scoped repair and GREEN receipts are in [TREATMENT.md](TREATMENT.md). Failing TAP logs are losslessly gzip-archived with decoded hashes in `log-encoding.json`; decompress `baseline.tap.gz` before using the legacy baseline-only `verify.py` on an unchanged baseline tree. Use `verify-treatment.py` on the repaired tree.

Prepared by **Conductor Rebuild**. Status: **FROZEN RED, awaiting product lease**.
This is OpenConductor's Reason-specific local/cloud integration requirement, **not a claim about Conductor behavior or native parity**.

## Checked revision and scope

Fresh `main`: `74c004a95d7b10072f54f71ca611f22c50944f64`.
The relevant routing files are unchanged from the previous source-only qualification at `c1e74c56f6bb7455bb59311797515138adc4a235`.

Only new files were created:

- `src/reasonCloudFileIdentity.test.ts`
- `evidence/chat/reason-cloud-file-identity/**`

All production files, including the held WorkspaceView callback regions, remain read-only. No dependency install/change, provider/CLI, Tauri/application, browser/native, remote request, credential read, real filesystem target or user-data mutation was used.

## What actually executed

1. Inert ACP notifications use the shapes owned by the current production parser and existing `updates_tests.rs`: metadata local/cloud transitions, pending `tool_call`, completed `tool_call_update`, locations and diff content.
2. A parser-only Rust probe includes **the entire production `updates.rs`** unchanged. It executes the exact extracted `let routed = { ... };` notification-routing block from `provider.rs` with inert in-memory storage for the fields that block uses. No provider/process module is compiled or launched.
3. The probe executes **unchanged extracted `agent_json`, `tool_json`, `diff_json`, `path_json`** from `wire.rs`, plus its exact chat-envelope tail and session-start JSON expression. The two small fixture wrapper functions and storage/sink are harness code, not production functions. No output/result formatter is reimplemented.
4. The resulting `wire.json` enters the **exact extracted production `reasonBackend.listen` adapter**, its source `EVENT` constant, and actual `applyReasonPayload`, reducer, `diffForSave`, `restoreEvents`, `buildRows` and `conductorTools`.
5. React test renderer mounts production Transcript declarations and the entire production ToolRows module. The actual FileBadge `onClick` runs. Unrelated visual leaves/preferences are inert stubs; no file/IPC/network leaf is called.
6. The click reaches the **exact TypeScript-AST-extracted current production ChatPanel normalization, `openFileOrViewer` and `openAnyFile` callbacks**. Only their environment/state setters, local diff store and notification sink are inert witnesses. The whole WorkspaceView/app is not mounted, and no local file is opened/read for real.

`source.json` pins 12 relevant production files and 8 Rust source spans. `observations.json` retains 13 exact extracted TypeScript spans and 26 click witnesses. `verify.py` checks their source identity and exact failure list.

## Frozen result

Command:

```bash
node --experimental-strip-types --test src/reasonCloudFileIdentity.test.ts
```

**Expected nonzero exit 1: 31 tests, 19 passed, 12 intended failed, 0 unexpected failed, 0 skipped/cancelled.**

The 12 failures are six cloud-normalized file targets, repeated live and after save/restore:

- Read -> existing local diff;
- Read -> local file viewer;
- Write -> local file viewer;
- Edit -> existing local diff;
- two separate targets in a multi-diff result -> local diffs.

Every failed click still has exact `place: cloud`, `relative`, original `raw` and parent `sessionId` in the mounted `data-tool-input`. The FileBadge action loses that provenance; ChatPanel strips cwd; the local dispatch receives `src/same.txt` or `src/second.txt`, and there is no cloud notification. Assertions require **no local open** for a known cloud target; they do not prescribe a new API, callback signature or result formatter.

Passing controls prove normal local diff/viewer/read/write/edit opens (including returning from cloud to local), literal cloud-child paths, same chat/session routing, rejection of an unregistered Session, pending->completed replacement, exact output text, parent/child path identity and persistence. Literal-cloud child paths reach the existing cloud notice and do not open local targets.

Adjacent command:

```bash
node --experimental-strip-types --test \
  src/features/chat/reason.test.ts \
  src/features/chat/reducer.test.ts \
  src/features/chat/persist.test.ts \
  src/features/chat/conductorTools.test.ts \
  src/features/chat/view.test.ts
```

**Passed: 66/66, 0 failed/skipped.**

Integrity command:

```bash
python3 evidence/chat/reason-cloud-file-identity/verify.py
```

**Passed:** frozen inputs/test/wire/probe/source integrity, exact unmodified extracted source, all 12 intended failures and 26 click witnesses, no production edit.

## Freeze and setup transparency

`freeze.json` was written before the completed behavioral baseline. The final test, inputs, probe and actual Rust wire bytes have not changed after that baseline. Input SHA-256 starts `4f90d373`; test starts `a027e8aa`; wire starts `e471b501`; all full digests are retained.

The first rustc invocation omitted transitive cached dependency search directories and failed to link serde_json. The corrected invocation reused the same cached rlibs, added their `-L dependency` directories, and compiled successfully in 0.316 seconds without new dependencies. The first frontend setup attempt lacked the production EVENT constant in its VM environment and failed before behavioral tests. Its output and setup freeze are retained, explicitly **not** counted as the RED baseline. The missing binding was fixed before the final baseline freeze; inputs and oracle assertions were not changed.

`probe.rs` has a machine-local include path generated by `prepare.py`. It is retained as the exact executed probe, not a portable production entry point. Running `prepare.py` elsewhere regenerates this include path and source receipt; it does not compile anything. To replay here, the existing serde_json cache is linked directly:

```bash
# This compile is serialized through the existing ledger's queue.
# Each existing rlib directory is supplied once as -L dependency=DIR.
rustc --edition=2021 evidence/chat/reason-cloud-file-identity/probe.rs \
  --crate-name reason_cloud_identity_probe --extern serde_json=EXISTING_SERDE_JSON_RLIB \
  -L dependency=EXISTING_RLIB_DIR ... \
  -C codegen-units=1 -C debuginfo=0 -o /tmp/reason-cloud-identity-probe
/tmp/reason-cloud-identity-probe < evidence/chat/reason-cloud-file-identity/inputs.json \
  > evidence/chat/reason-cloud-file-identity/wire.json
```

The full corrected command and cached artifact hashes are in `compile-command.json`. The compiled probe is deliberately excluded from the source handoff. The foreground compile/replay and Node test processes ended; explicit own-process readback was empty and the heavy slot was released to the ledger.

## Official contract and limits

Official documentation was freshly read:

- https://docs.reasonmachines.com/docs/build/choose-a-path.md — local, cloud, or both in one Session;
- https://docs.reasonmachines.com/docs/acp.md — one editor thread is one Reason Session;
- https://docs.reasonmachines.com/docs/build/editor-app-acp.md — one provider, computer metadata on initial read and moves.

This fixture is source-valid protocol exercise, **not a current provider recording**. Historical CLI 0.2.683 path normalization remains labelled historical. The docs' live local/cloud `pwd` acceptance test was **not run**. Current CLI/provider, native/browser/packaged behavior, package inclusion, full-chat suite, full Rust/app build and typecheck are **not verified** by this narrow baseline. Previous full-chat timeouts remain incomplete. No UI screenshot exists because no app/browser/native execution was admitted.

No repair has been made. The exact next product seam and any held-region coordination belong to the existing ledger; the frozen oracle must remain unchanged through the treatment.
