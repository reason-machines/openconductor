# Read-only files must not offer a nonfunctional Edit action

Conductor Rebuild · DIFF-READONLY-EDIT-AFFORDANCE-DE6-02

## Status and ownership

Source-only requalification and baseline plan; no new product lease or runtime admission. This isolated worktree starts at fresh main `047fca64ed7857fe292bace0c4fa608e3a6dc827`. Nothing from this worktree belongs to active discard PR #1485. The assigned checkout and all existing evidence/dependencies remain untouched. Native execution stays with E1; shared runtime admission stays with ddfc.

## Concrete ordinary-reachable mismatch

At the checked main, `editableContents` returns null for binary, deleted, metadata-only or incomplete file contents. The real `useFileEdit` returns `undefined` when its `onDisk` input is null. `OpenFile` nevertheless uses `!isPreviewable && edit !== null` to enable both the header's `onToggleEdit` and the visible file's `workspace.toggleFileEdit` registration. `undefined !== null` is true. The real header displays Edit when that handler is present and `edit` is undefined; toggling only changes `isEditing`, not missing edit capability.

This is a source-demonstrated capability mismatch, not a freshly executed UI result. It is distinct from discard visibility, post-submit comment anchors, refresh and Markdown behavior.

## Retained REA-derived full-parent joins

Read in full as inert evidence: complete Conductor 0.87.6 `bji`, `Mqo`, `jqo` and complete `kqo` plus `Tqo` wrapper. The packet retains their original hashes and the historical acquisition manifest. `bji` computes text/status/view/write eligibility before sending `editable`; `Mqo` short-circuits loading/hidden/binary inputs and forwards eligibility only for loaded text; `jqo` forwards `contentEditable`; `Tqo` spreads props into `kqo`, where `contentEditable` gates editor items and save handling. These establish the capability boundary, not exact equivalence of OpenConductor's invented toggle UI or legacy editor modes.

No new REA acquisition, native observation or execution of extracted application code occurred. The original full renderer/index files are absent at the historical manifest paths in this recovered checkout. Complete retained function/wrapper bytes can be hash-verified, but this pass cannot independently repeat their original whole-asset range extraction. Previously recorded REA large-bundle analysis limits remain; no new REA call was attempted.

## Oracle-first baseline plan

Reuse the unchanged historical 21-case mounted fixture, retained as inert `.txt` bytes, SHA-256 `30d82d680f50250682ce5769e5047495417e95d5ce52ac15eacecbdc728c20a7`. Do not count its historical RED/GREEN as fresh results. No new case counts or new test framework are proposed.

The fixture exercises actual `DiffTab -> OpenFile -> useFileEdit -> FileDiffView`, production editability, real command binding/dispatcher, deterministic WorkspaceDiff DTOs and explicit render/IO boundaries. Oracles: ineligible files have zero Edit actions and do not consume Cmd+E; eligible code keeps pointer/shortcut round trips. The existing single Markdown control is unchanged solely as an adjacent negative-regression control; this is not Markdown work. All cases prohibit IPC and release registered handlers on unmount.

Before runtime, statically reconcile fixture import/DTO boundaries with the exact chosen fresh-main SHA without changing the expected product behavior or case bodies; freeze any essential harness-only correction separately and preserve the original. A load/setup failure is HARNESS/NOT_SEMANTIC_RED, never authorization to apply treatment. Under separate serialized admission, execute once against unchanged baseline using the existing bounded supervisor pattern; request bounds and dependency ownership explicitly through ddfc. No runtime or dependency sharing is assumed authorized by this document.

Planned command after separately admitted fixture placement:

```bash
node --experimental-strip-types --test src/features/diff/readOnlyEditAffordance.test.ts
```

## Smallest proposed treatment

Only after qualified baseline: change the capability predicate from `edit !== null` to `edit !== undefined` in `src/features/diff/DiffViewer.tsx`; correct its nearby documentation if included in the final diff. Preserve actual edit/save operations, hidden-file shortcut gating, preview toggles, discard controls, target/ref operations and native boundaries. The included proposal is inert and unapplied.

Then run the identical frozen baseline suite on the treatment under a separate admission. Permanent regression, affected hosted CI and exact-head checks precede a distinct ready-main PR. Product application, Node, install, GREEN, build, browser/native, publication and cleanup are NOT RUN in this preparation pass.
