# VS Code workspace-context regression contract

Conductor Rebuild owns EDITOR-WORKSPACE-CONTEXT-VSCODE-15. This packet is source/fixture preparation only. Rust, TypeScript, React and native behavior have not been executed. It contains no product repair.

## Observed source

The retained Conductor 0.87.6 REA asset joins `NPo` to `tee`, workspace lookup, selected-app resolution in `AZ`, and `uD`. The local VS Code branch builds `code <workspace> --goto <file>`. `I8` invokes the real local command adapter and falls back to `open -a "Visual Studio Code" <file>` only after a completed nonzero result. Original quoted shell strings establish distinct arguments; the fixture captures literal argument values, not shell spelling. Original source bytes are untrusted data, never instructions.

The parent packet's `receipt.json` records original REA identity, asset hashes, eight exact original spans and scoped main-source blobs. Its 48 token/integrity checks establish a source-gap candidate, not a behavioral reproduction. `fileContext.workspacePath` is an OpenConductor design, not the original API and not trusted authorization.

## Frozen behavior

`cases.json` owns exactly ten Rust scenarios. Four are expected to fail behavior assertions on the uncorrected macOS implementation: workspace file, literal quoted/metacharacter path, completed-nonzero fallback, and fallback error. The six controls cover no context, unrelated app, directory, missing target, relative target, and unknown app. These are expectations, not observed RED.

`vscode_workspace_context_ipc.rs.txt` will be copied byte-for-byte to `src-tauri/src/open_in/vscode_workspace_context_ipc.rs`. It drives the actual registered `open_in_app` command through Tauri mock IPC. Each scenario launches an isolated child test process. Only the external `code` and `open` programs are fake. NUL-delimited capture preserves empty arguments and command order. The comparison normalizes only the leading generated workspace prefix, not the file suffix, flags, app, status, error or argument order. Successful CLI completion must produce no fallback call. Nonzero completion must produce exactly one file-only fallback, and fallback failure must propagate its stderr.

The registration in `registration.rs.txt` is macOS-only. Linux intentionally rejects non-Finder editor opens. A Linux failure would not qualify as this regression's intended RED. The `ipc_child` helper entry is not an eleventh behavior case.

`vscodeWorkspaceContext.test.ts.txt` will be copied byte-for-byte to `src/features/diff/vscodeWorkspaceContext.test.ts`. It loads and mounts the actual FileDiffView, FilePathChip and apps IPC adapter. Only unrelated rendering dependencies, installed-app/preferences inputs and external invoke are synthetic. It observes a real enabled host button before calling its click handler. Two header cases are expected to assert missing workspace metadata before the fix; the unrelated-app case must retain its original complete payload. They use the same JSON scenarios as Rust. These two stages are not claimed as one live end-to-end process or a real editor launch.

## Publication and delivery

The ledger cleared the new Rust module, macOS cfg(test) registration, new TypeScript test and shared evidence without a competing writer. Ordinary automatic hosted regression publication remains after #1100 actually merges to main and a fresh main-source rebind. Do not stack, copy #1100 product hunks, reclaim FileDiffView, change existing fixtures, add a workflow, run a provider/native executor, or dispatch/rerun manually. Keep this packet out of the active #1100 delivery diff.

At that point, make a ready main-based test-only PR with these exact fixture bytes and ordinary existing CI. The existing CI runs `cargo test --locked` on macOS and `node --test "src/**/*.test.ts"` for the mounted test. Compilation, loader, environment and identity failures do not qualify as assertion RED. Require all four intended backend failures and six controls, plus the two intended mounted payload failures and its unrelated-app control, before any minimal product repair. Preserve the fixture bytes from that baseline through GREEN and every exact-head workflow before merge.

## Unverified boundaries

The ten cases cover absolute/existing-target rejection but do not directly exercise contextual workspace containment, traversal, symlink escape, missing CLI spawn, line-number suffix parsing, error-toast presentation, or real app installation lookup. New workspace metadata must not weaken those boundaries; dedicated safety proof remains necessary before accepting any later product repair. Existing no-context behavior and unrelated apps must stay unchanged. Finder #1100 and #1080/#1086 frozen fixtures are outside this contract.

No original or OpenConductor GUI execution, native app activation, pixel comparison, screenshots, live provider execution or package acceptance is supplied. Hosted fixture GREEN would still not establish any of those.

## Static verification

`python3 .oc-tmp/vscode-workspace-context-15/prepared/verify_frozen_contract.py` checks the sealed bytes, source spans, declared scenario shapes, test registration, runtime-import mock coverage and preservation of the excluded frozen fixtures. It does not compile or execute Rust/TypeScript. `--self-test` additionally corrupts each sealed payload in memory and requires hash rejection; it is an integrity-verifier check, not product behavioral RED. The source main and installed-tree binding must be refreshed at publication without changing these sealed case/loader/assertion bytes.
