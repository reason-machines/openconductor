# Staged composer attachment drafts

Conductor Rebuild — bounded source correction on Reason Cloud, 2026-11-07.

## Demonstrated discrepancy

Before this correction, `WorkspaceView` kept attachment chips only in component state. Its draft flush saved only the text, and `ComposerDrafts.load` discarded the attachment array from an otherwise valid persisted envelope. A same-workspace parent remount therefore had no metadata with which to restore separately staged chips. Encoded file atoms in the editor are a different path and were already covered by the earlier seven mounted checks.

This change persists the existing chip metadata with the text, restores validated metadata through the same draft hydration, and treats an attachment-only draft as nonempty. Existing text-only records remain strings. Attachment removal participates in the existing debounce/teardown flush; clearing the draft removes its full envelope. It does not change attachment upload, queue, provider, identity, branch or terminal logic.

## Retained real-Conductor source

These are zero-based UTF-8 byte offsets, end exclusive, in previously REA-extracted artifacts. Text was read as inert data, not executed. SHA256 was recomputed in this pass.

- `renderApp-D_fmY7hW.js`: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, 11,600,457 bytes. The local staged-file caller at `[167100,168150)` resolves the staged copy, writes it, and invokes `nc.addAttachment` with `source.kind` `staged-file`, the stored source reference, session ID and local workspace ID. Cancellation removes the staged copy/attachment.
- `index-BGEQ8YjU.js`: `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`, 3,493,297 bytes. `[2475152,2477000)` defines attachment metadata, the string-or-`{message, attachments}` draft schema, and per-session attachment IDs. `[2479300,2482200)` hydrates attachment IDs and metadata and writes complete draft envelopes. `Q_t` at `[2482178,2482478)` constructs the envelope from message and attachment IDs. The native file store's continued existence after a real relaunch is not established by this source.

Existing REA extraction limitations remain in `evidence/chat/rea-gaps.md` and `evidence/persistence/local-storage/NOTES.md`; no fresh extraction or REA runtime call was made.

## Red to green

Base: main `35159dcf0189b039dd990c9b0199f61137192e9b`.

`node --test src/lib/local-storage/composerDrafts.test.ts` before the fix: 5 passed, 2 failed. The new failures were:

- attachment-only draft: actual `''`, expected `{message: '', attachments: [...]}`;
- independent second draft: actual `'other draft'`, expected `{message: 'other draft', attachments: [...]}`.

After the fix:

- `node --test src/lib/local-storage/*.test.ts src/features/chat/composer*.test.ts src/features/draft-attachments/staging.test.ts`: **46 passed, 0 failed**. Covers a new storage client restoring metadata, attachment-only drafts, independent IDs, removal with unchanged text, clearing the complete stored envelope, consumer-decoder round trip and invalid staged path rejection.
- `npm run typecheck`: **passed** after correcting a decoder narrowing error. The initial 60-second attempt timed out under shared CPU load; a subsequent attempt found that type error, which was fixed before the passing run.
- `git diff --check`: **passed**.

## Verification limits and serialized acceptance

No browser, build, provider, native app, package dispatch or install was started. No screenshot exists for this change because mounted execution is queued through the existing runtime coordinator behind the admitted scroll and other queued owners. Service/decoder tests are not mounted UI proof.

Required mounted observations: attach a file, retain its displayed label and staged path, unmount the actual parent before its save debounce, remount the same workspace and read back the restored chip; repeat with a second workspace to check isolation; remove the chip, remount and confirm absence; submit successfully, remount and confirm the draft/attachment envelope is gone. Native WebKit, real IME, disk persistence across actual app exit/relaunch, and model-menu Tab/type-to-search focus remain unverified.
