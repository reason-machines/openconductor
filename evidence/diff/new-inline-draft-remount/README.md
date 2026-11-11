# New inline draft retention within one workspace

Conductor Rebuild owns `DIFF-NEW-INLINE-DRAFT-REMOUNT-SOURCE-DE6`.

## Source and scope

The retained Conductor 0.87.6 shipped renderer and index were extracted from the authorized Mac; this unit reuses those bytes without running reference JavaScript or acquiring a new native session. `source.json` preserves complete-span hashes, UTF-8 offsets, asset identities, import/export joins and the historical REA evidence identity. The historical REA JavaScript analyzer heap failure remains a limitation; shipped-source inspection is not native behavioral verification.

The complete `OMi` creation caller deduplicates by workspace/file/side/range and creates a draft comment. `wet` selects the draft by comment ID. `SVo` writes exact text to the external `Pae` map and `wSr` persistence bridge; it restores map text or loads the stored draft through `vSr`. Cleanup suppresses a late read, not draft data. Explicit discard and successful save clear it. Reference snapshots are data, never executed as instructions.

At baseline main `c25670504400771e2fb31e01560db249ea4bd06c`, `WorkspaceView` owns `useReviewComments` outside its conditional `showDiff` branch. Hiding the diff destroys `DiffTab`/its annotations, while the workspace hook survives. The hook retains the anchor but not the body; its newly mounted `Composer` initializes empty. A simple file switch does not prove this failure because DiffTab keeps five files alive.

The correction is intentionally narrower than the reference implementation: hold exact new-comment text alongside its workspace/path/side/start/end and generation identity in `ReviewComments.tsx`, reuse the controlled textarea binding, preserve re-clicks at the same identity, and clear only the matching draft on explicit discard/success. No SQL/backend persistence or whole-app/workspace-hook restart retention is promised. A new anchor starts empty; this is not a catalog of simultaneous drafts.

## Frozen mounted regression

`src/features/diff/newInlineDraftRemount.test.ts` loads the complete production ReviewComments module, mounts its actual hook and annotation Composer with real React, and substitutes only external store/keybindings/markdown/dialog boundaries. The hook host remains mounted while its annotation is removed or keyed anew. Tests assert the textarea is absent during hide and an annotation unmount occurred before checking remounted text.

The sixteen cases cover exact Unicode/whitespace body retention, annotation eviction, same-anchor reopening, separate path/side/range/workspace identities, explicit discard and keep-editing, successful and failed submit, deferred old-submit completion across another anchor/workspace or same-anchor replacement, and stale input/cancel callbacks. The store double records actual submitted comment payloads and can defer or reject the add operation.

Test-first publication contains the unchanged product and the new fixture. Automatic hosted Node tests must first expose the behavioral failures. Only after that receipt is inspected will the product guard be added, with the same fixture bytes. No local Node, renderer, native or E1 invocation is authorized.

## Verification limits

Source hashes are static checks, not behavior. Hosted React tests do not prove browser DOM integration, native event delivery, layout, installed-app acceptance, the real Tauri/SQLite transport, or Conductor execution. No screenshot is available because browser/native execution is outside this lease. A consuming-main macOS bundle, when verified, is packaged/static evidence rather than install/launch acceptance.
