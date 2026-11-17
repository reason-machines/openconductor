# Create-composer binary staging

Conductor Rebuild. Source/unit correction, not native parity acceptance.

## Fresh source and discrepancy

Checked main `f60b6e365395ceb62b2b2ec6e1542a16a5b0d0ee` on 2026-11-17.
`src/components/CreateWorkspaceComposer.tsx` read binary bytes but retained
only `The user attached a file (N bytes): name`. The initial pending-send
consumer bypasses the ordinary composer copy barrier, so replacing that
note with a path alone would still advertise a nonexistent file.

PR #1370's merge commit `796ecbcf4ac32c2e0eca675641f67cc97783a876`
has **no tree change**, despite its description claiming staging. Verify:

```bash
git diff 796ecbcf4^ 796ecbcf4 --stat
git diff 796ecbcf4^ 796ecbcf4 -- src/components/CreateWorkspaceComposer.tsx
```

Both commands produce empty diffs. This describes the delivered tree; it does
not establish why the historical publication was empty.

## Qualified retained real-app evidence

- [Hji source](../../dialogs/workspace-launch-close/reference/Hji.txt) and
  [retained source identity](../../dialogs/workspace-launch-close/retained-source.json):
  Conductor 0.87.6's decoded `renderApp-D_fmY7hW.js`, SHA256
  `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
  Hji UTF-8 range `[9770840, 9779927)`, span SHA256
  `3c5589cd46083bc08b635d4e752bfe1f93bc8456ae81e68c401dc6814948f567`.
  It obtains `G` from `getOrCreateDraftWorkspaceId()`, passes
  `draftWorkspaceId:G` to `eQo`, and gates creation on `!Li`
  (`isStagingAttachments`). This retained declaration establishes the caller
  and readiness contract, not the unrecovered body of `eQo`.
- [Existing staging reconstruction](../../persistence/draft-attachments/README.md):
  source offsets in the app-extracted `index-BGEQ8YjU.js` establish
  `.context/attachments/<random6>/<name>`, draft storage and materialization
  before attachment delivery. The note explicitly qualifies the unproven
  native handler internals and recorded REA limitations.

These are retained REA/app-extracted source observations, not a fresh REA run,
not a new real-app interaction, and not native copy semantics proof.
No new REA invocation or REA failure occurred in this increment.

## Repair boundary

Use the existing `draftAttachmentsApi`, without changing storage or transports:

1. Generate one UUID per create-composer draft. Read/classify selected files
   with the existing helpers; keep small UTF-8 text inline as before.
2. Write binary/oversized-text bytes under that draft ID and a safe random
   workspace-relative path before adding its chip. Await all pending file
   reads/writes before accepting Create or Add to backlog.
3. Once the new workspace path exists, call `materialize` with the **same draft
   ID** and the created workspace path. Inspect every selected staged path's
   result; a missing receipt, IPC rejection or per-file error is not success.
4. Publish the pending first-message send only after every copy succeeds,
   before dispatch mounts the new workspace. Attachment-only sends still work.
5. On copy failure, register the already-created workspace, keep the first
   message editable through a pending draft, warn the user to reattach, and
   do not auto-send nonexistent paths. The store retains failed staging bytes.
   Automatic restoration/rekeying of those failed attachments is not added.
6. Removing a chip removes only its staged file. Backlog creation materializes
   selected files but still starts no first chat session.

OpenConductor's create API chooses the actual workspace ID, so this uses the
existing materializer's explicit `workspacePath` with the stable draft ID; it
does not pretend that the provisional ID is the created workspace ID.

## Executable verification

The mounted component fixture loads the real create component and attachment
classifier. React test renderer stubs the shared editor and the IPC boundary.
The fake store records exact bytes, gates writes/copy completion, and injects
failures. It does not launch a product/browser/native runtime or an agent.

Frozen test SHA256:
`2a58b7a69b147d1160b33df7c60c17202a6ff073cc9f2a7ced011be50f0d7674`.

- **RED**, same acceptance file against unchanged fresh main `f60b6e365`:
  **15 passed / 9 failed / 0 skipped**. One failure is the independently fixed
  #1377 empty-file paste guard; eight are binary-stage/materialization cases.
  See [RED output](red.tap).
- **GREEN**, same test content against the repaired component:
  **24 passed / 0 failed / 0 skipped**. See [GREEN output](green.tap) and
  [frozen test hash](test-before.sha256).
- **Passed**, adjacent staging/classifier/settlement/submit/long-paste tests:
  **28 passed / 0 failed / 0 skipped**.
- **Passed**, `node node_modules/typescript/bin/tsc --noEmit`.
- **Passed**, existing std-only storage core: **14/14**, with `-D warnings`.
  The harness's subsequent Clippy step **could not run**: `cargo-clippy` is not
  installed for this toolchain. No toolchain installation was attempted.
- **Passed**, `git diff --check`.

Commands:

```bash
# Use the unchanged baseline component and dialog, while keeping the acceptance
# test and classifier from the candidate checkout.
mkdir -p .qa/binary-main/src/components
for file in CreateWorkspaceComposer.tsx CreateWorkspaceDialog.tsx; do
  git show f60b6e365:src/components/$file > .qa/binary-main/src/components/$file
done
OC_LAUNCH_CLOSE_SOURCE_ROOT="$PWD/.qa/binary-main" \
  node --test src/components/createWorkspaceLaunchClose.test.ts

node --test src/components/createWorkspaceLaunchClose.test.ts
sha256sum -c evidence/composer/create-binary-staging/test-before.sha256
node --test src/features/draft-attachments/staging.test.ts \
  src/features/chat/composerAttachments.test.ts \
  src/features/chat/composerAttachmentSettlement.test.ts \
  src/features/chat/composerSubmit.test.ts \
  src/features/chat/composerLongPaste.test.ts
node node_modules/typescript/bin/tsc --noEmit
DRAFT_ATTACHMENTS_HARNESS_DIR="$PWD/.qa/binary-store-harness" \
  bash evidence/persistence/draft-attachments/run-tests.sh
git diff --check
```

## Not exercised

Product browser, macOS/WebKit, actual native IPC from the mounted app, installed
package, and agent reading the copied file: **NOT_RUN**. No runtime admission
was granted, so there is no screenshot or recording. The separate std-only
Rust tests exercise real disposable filesystem copies, not the UI-to-native
integration. Native acceptance remains: attach a disposable binary file in
Create, create a disposable workspace, verify exact destination bytes before
the first prompt, and verify the chosen agent can read that file.

No slash/@ behavior or long-paste changes. Voice/speech stays
**DEFERRED / UNVERIFIED**, not parity-complete.
