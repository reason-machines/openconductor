# Retain edits to existing review comments

Conductor Rebuild compared current main `5bea00de87fac9ef306e89a4fd35e3d88527ad15`, which contains #1046, with retained real Conductor renderer source. OpenConductor keeps edit mode and text in mounted components. Removing an annotation or remounting the review loses both.

## Source evidence

The retained `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The five exact UTF-8 spans, offsets and hashes are in [source.json](source.json), with copies under [reference](reference/).

- `Pae` holds per-comment drafts outside component mount lifetimes. Starting an edit does not overwrite an existing draft.
- `wet` reads the draft by comment ID and shows the editor when one exists.
- `SVo` reads the retained body, including an empty string. Typing updates the draft rather than the saved comment. A successful save or explicit discard removes that draft; a rejected save leaves it intact.
- `kVo` and `TVo` start edits only for user-local comments.

These are static source observations, not a live Conductor interaction trace. No new REA invocation or native executor was started for this change.

## Implementation

Only `ReviewComments.tsx` changes product behavior. An in-memory map owns an optional body for each workspace/comment identity, and `useSyncExternalStore` connects mounted editors to it. An absent entry means not editing; an empty string remains an active edit. Workspace qualification is an OpenConductor isolation choice because its comment stores are workspace-scoped.

The Laziness Protocol keeps this fix in the existing module: no backend schema, persistence API, file-save change, reply/new-comment draft change or broad cache refactor. Drafts survive component unmounts, not application restarts. Existing dirty-cancel confirmation and save success/failure semantics remain in place.

## Verification

The fixture is the prepared v2 six-case fixture, unchanged at SHA-256 `487a0b6d0bb87c7325c865c864e0664f060c16d6e51d48981c250b511ec5ddf7`. It mounts actual `useReviewComments` and uses the real local comment store. It checks nonempty and empty edits after annotation unmount, review remount and workspace/comment isolation, successful and failed saves, and explicit discard with another draft still active.

The automatic PR workflow runs the same fixture against the pinned consuming-main `ReviewComments.tsx` and the candidate. Baseline must produce four named assertion failures and two passing controls; candidate must pass all six. Setup errors, changed names, incomplete plans, skips, cancellations and wrong assertion failures are rejected.

```bash
python3 evidence/diff/comment-edit-drafts/run-paired.py --self-test
python3 evidence/diff/comment-edit-drafts/run-paired.py --out /tmp/comment-edit-drafts-proof
```

Local source qualification and verifier self-tests passed. No local Node/component, browser or native execution was admitted. Hosted execution results are attached to the PR, not inferred from these self-tests.

The old moved-anchor fixture, baseline and assertions remain unchanged; only its candidate `ReviewComments.tsx` hash is requalified. All 29 hidden-whitespace source pairs and its exact fixture/assertion identities remain unchanged and validate. Both existing automatic paired workflows continue to execute their original fixtures against the current candidate.

The prerequisite [#1046 package receipt](anchor-package-proof.json) records its successful automatic main package, downloaded artifact digest, all 39 passing bundle-contract checks and static command presence. It is not installed-package behavioral acceptance.

## Limits

The component fixture substitutes `DialogFrame`, markdown rendering and the comment-store selector. It does not exercise browser/editor DOM, real Tauri/SQLite transport, visual parity or E1. There is no screenshot because those runtime surfaces are not admitted. Native queue order and frozen whitespace, aggregate, ROW and copy fixtures are unchanged.
