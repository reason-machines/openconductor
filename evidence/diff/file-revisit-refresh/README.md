# Refresh complete retained-file contents on a new selection visit

Conductor Rebuild, 2026-11-17. Source-unit work on Reason Cloud only; no
app, browser, native, installation, E2E, or executor dispatch.

## Proven source gap

Original comparison main: `b22fa9adaf67fa79fc3dddf72914cae01f352b08`.
Publication base refreshed to `bcb3ce4f0c0cf92f6a238c1cc6e4d0d54856a24f`;
its Diff sources and dependency manifests are unchanged from the comparison.

The actual `useWorkspaceDiff` reuses file objects when its background list
poll returns unchanged metadata. The retained `OpenFile`'s `useWholeFile`
previously depended on that object, logical identity, eligibility and manual
retry attempt only. If the complete-file request failed, selecting A, B, then
A did not request A again. Unchanged polling did not help. Successfully loaded
complete contents also did not refresh on a later selection visit.

This is not a duplicate of whole-file data retention or the manual Retry update
button: both already worked and remain tested. It is a distinct missing trigger
for supplemental complete-file loads in unified/split (and whitespace-hidden)
views. The existing list loader, whole-file layout, cache, polling, manual retry
UI and file-save operations are not changed.

## Retained real-Conductor contract

Reference: Conductor 0.87.6, REA extraction
`ev_a4ce503a76a3198b2d2bec127c09bb6940b806849318ccc51523f40701751ab5`.
Renderer and index identities are retained in
[recovered-reference.json](recovered-reference.json).

- Complete [Jqo](../../open-in/deleted-finder/reference/Jqo.txt) increments
  `ce[path]` on selected-path changes and passes it as `visibleVisitCount` to
  the retained file view. Filter-only visibility changes do not increment it.
- Complete [bji](../../open-in/deleted-finder/reference/bji.txt) calls its
  returned refetch once for an unseen visit when visible and not fetching,
  provided data is absent or the visit count exceeds one. It records the visit
  before requesting; hidden views do not refresh just because they are hidden.
- The historically qualified `Gri`/`Y9t` boundary is preserved in the complete
  [Y9t literal](../historical-large-file/reference/reference-Y9t.txt). It spreads
  the `yLt` result, preserving refetch.
- Complete `yLt`, index UTF-8 `[3177216,3179015)`, 1,799 bytes, SHA-256
  `0c0639fac7f354a331f35da7e901c0c39701b0d624acbbf82a527ee175a89f0a`,
  calls the store's refetch. Its inert bytes were recovered from the existing
  [source evidence Page](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753?page=3b334f4b-a56c-4a0c-ad5e-c445fe22afe8).
- Complete `vLt`, index UTF-8 `[3172383,3177216)`, 4,833 bytes, SHA-256
  `a57aa542796bd483596be41eff24da40dfc2fe28a8537d3a4c32e05b0d7bf110`,
  refetches through its deduped loader instead of the fetch cache shortcut and
  preserves loaded data/error handling. Bytes were recovered from this Session's
  complete retained tool record `42b46046-5191-4ea3-91d4-a206f1d20d9c`,
  revision `26944120`, and match the committed whole-file-refresh receipt.

`verify-reference.py` checks five complete span hashes and the lexical joins.
It does not evaluate reference JavaScript. Original whole assets were not
reacquired or rehashed in this pass. Their prior REA large-renderer semantic
analysis limit remains documented; no new REA operation or gap was created.

## Minimal repair and ownership

The ledger granted exactly `DiffViewer.tsx`, new `fileRevisitRefresh.test.ts`,
and this evidence directory. No composer, queue, helper, workflow or native
fixture was edited.

The parent tab counts actual path-selection visits. The existing whole-file
hook refreshes once for a later visible visit, waiting for a pending request to
settle rather than duplicating it. An ordinary metadata/layout/manual-retry load
also accounts for the visit it already covers. Visibility alone neither cancels
an in-flight request nor starts one. Complete contents remain display-only
until the current attempt succeeds; drafts remain in the existing draft store.

## Unchanged RED and GREEN

The regression mounts actual `useWorkspaceDiff`, `DiffTab`, `OpenFile`,
`useWholeFile`, `loadWorkspaceDiff`, and `useFileEdit` with real React.
Tauri IPC is deferred; `FileDiffView` is a props probe, and Pierre/DOM editor,
settings and unrelated UI boundaries are inert. No reference source is run.

Frozen test SHA-256:
`0e1b71818442835dbcfa75f8504ce188e2e0cf280f0f61688edd6816d3bf50d5`.
Test-only checkpoint: `875fcc518` (before production edits).

- **RED, exit 1:**
  `DIFF_VIEWER_REGRESSION_REF=b22fa9adaf67fa79fc3dddf72914cae01f352b08 node --experimental-strip-types --test src/features/diff/fileRevisitRefresh.test.ts`
  — 3 passed, 6 intended failures. See [red.tap.gz](red.tap.gz).
- **GREEN, exit 0:**
  `node --experimental-strip-types --test src/features/diff/fileRevisitRefresh.test.ts`
  — the identical nine cases pass. See [green.tap.gz](green.tap.gz).
- **Passed, exit 0:**
  `node --experimental-strip-types --test --test-concurrency=1 src/features/diff/*.test.ts`
  — 561 passed, zero failures/skips/cancellations. See [diff-suite.tap.gz](diff-suite.tap.gz).
- **Passed:** `npm run typecheck`, `npm run build`,
  `python3 evidence/diff/file-revisit-refresh/verify-reference.py`, and
  `git diff --check`. Build retains its existing large-chunk warning.
  Test dependencies were restored using `npm ci --ignore-scripts`; no product
  or native installation occurred.

The nine cases cover rejected and successful revisits, unchanged list polling,
retained drafts/display context, no stale editing while refreshing, pending
request sequencing, one retry per visit, hidden completion, binary exclusion,
same-path reselection and filter-only visibility changes. Existing manual retry,
identity isolation and hidden edit-shortcut tests are included in the full suite.

## Separate delivery and native states

This packet proves source/hook behavior only. `PACKAGE_NOT_VERIFIED`,
`NATIVE_NOT_RUN`. Frontend build success is not a macOS package. No screenshot
is supplied because this source lane has no app/native runtime admission.

Later acceptance belongs to the existing sole executor on an identified package
containing the merge: induce A's complete-file request failure, visit B then A,
confirm A reloads without a metadata change; repeat with loaded A plus an unsaved
draft, pending refresh, and a filter that hides/reveals A without a new path
selection. Record containing build SHA, outcome and visible evidence. No new
executor, installation or runtime request is made by this packet. #1378's
existing 10:10 UTC bounded package-evidence follow-up remains separate.
