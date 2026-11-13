# Generic workspace text reader and editor source implementation

Conductor Rebuild owns this nine-path implementation on the existing Diff branch. The original source base is main `5787800e`; fresh main `b7aba818b106c5029595f07498963be246ff15b2` matches all ten relevant source pins. The implementation is applied, but behavior and types are unverified. No ready PR, execution grant or native parity is claimed.

## Integration contract

```ts
invoke<string>("workspace_read_text", { repo: worktree, path });

interface WorkspaceFileViewProps {
  worktree: string;
  path: string;
  isVisible: boolean;
  readOnly: boolean;
}
```

The named component export is `src/features/files/WorkspaceFileView.tsx`. It renders a raw Pierre file item using the existing `createEditor`, `useFileEdit`, `saveFile` and `diff_write_file` path. It does not fabricate a Git change, introduce a writer, publish an active-file target or install a global shortcut. It has no preview or content-mode prop. SAME135 owns the separate navigation and caller-policy integration, including retaining existing Markdown preview. SAME15 owns the frozen active-file publisher/App/Host/adapter. No WorkspaceView/App/Host files are changed here.

The Rust command accepts existing workspace-relative regular UTF-8 text independently of Git or a Markdown extension. It reuses descriptor-relative `openat`/`O_NOFOLLOW` traversal and nonblocking special-file rejection. It refuses unsafe/missing/nonregular/symlink paths, invalid UTF-8, NUL-containing data and more than 4 MiB. Empty files return a genuine empty string. The bound and NUL rule are local OpenConductor policies. Existing Markdown extension checks, command and preview remain supported.

The UI uses existing `isTextPath`, successful loading and required `readOnly` before offering an editor. Archived status is the represented current local caller qualifier, per SAME135. Historical/turn/attachment/cloud sources are outside this local contract. Hidden views cannot save. Shared draft storage preserves edits across worktree/path/policy transitions. `readText` owns loading/error/ready state and cancellation; old Markdown helper names export the same helper.

## Pending-save correction

The original source review found that a read-only remount could display the pre-save cache. Keying by worktree/path/readOnly forces a fresh read before presenting the new policy state. SAME15 then identified the deferred-write interleaving where that fresh read could precede an in-flight save.

The correction observes the existing save lifecycle. `EditInViewer` registers a target-keyed completion Promise before starting `persistEditorDraft`; the original task settles it on success or failure. `waitForFileSaves(worktree,path)` drains those existing completions. It does not serialize, redirect or start a write, alter draft cleanup, or add an event bus. A replacement loader waits for its own target, then rechecks effect identity before issuing a native read. B does not wait for or receive A's completion. A cancelled loader cannot issue a read after waiting. Rejection releases the read and preserves the draft through existing failure behavior.

V1 patch `ccc03805` and V2 patch `6103564b` remain unchanged as predecessor artifacts. V3 patch SHA-256 is `f1ea57223e73fec42cf70aca2576da64e5775ce9621b236cfaa87eeaa4eef338`.

## Verification actually performed

```bash
python3 .oc-tmp/generic-workspace-file-v3-b7aba818/seal-source.py
git diff --cached --check
```

Source pins, 11 literal retained real-app REA spans and full bundle hashes, all 419 frozen input hashes, nine-path scope, whitespace, and disposable-index patch applicability passed. The seal script verifies source and patch structure only. It does not execute product code or the tests.

There are 33 unrun new cases: six Rust reader tests, seven read-lifecycle tests and twenty React component/save-hook tests. Four deferred-save controls cover read-only replacement, same-target reopen, A-to-B completion isolation and failure/draft retention. The React fixture uses real React and the production component/draft hook, but shims Pierre drawing, desktop transport and presentation dependencies. A fixture pass would not prove actual renderer or native behavior.

Only under an actual matching existing ACC grant:

```bash
cargo test --manifest-path src-tauri/Cargo.toml workspace_file::tests
node --experimental-strip-types --test src/features/files/readText.test.ts src/features/files/WorkspaceFileView.test.ts src/features/files/readMarkdown.test.ts src/features/files/filePreviewWiring.test.ts src/features/diff/editorContents.test.ts src/features/diff/EditInViewer.test.ts src/features/diff/copyFile.test.ts src/features/diff/wholeFileRefresh.test.ts
npm run typecheck
```

Those commands, browser checks, native/package checks and caller integration checks have not run. Existing ACC queue/order and all DE6/275/footer03/history/revisit/SAME15 frozen inputs are unchanged. This is not a new intake or authority to reuse another scope's grant. Source review is not behavior proof. A ready main PR and green merge wait for the requested scoped checks.

## Remaining fidelity limits

Native `readTextAtTarget`/`SSr`, the unmodeled reference workspace-access distinction, special HTML/media/structured preview modes, external watcher/focus refresh and pixel parity remain unverified or unimplemented. Retained reference basis is SAME15 contract `794ac993` and unchanged eleven-span REA closure from its v2 packet `42e1f792`. No fresh app acquisition, reference-code evaluation, REA invocation, installation or new REA gap occurred here.
