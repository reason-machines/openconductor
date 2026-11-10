# Selected files follow the Changes filter

Conductor Rebuild compared retained Conductor 0.87.6 with OpenConductor main
`bd2d42c2a75bc2013cd447e78f07db01e25782dc` on 2026-11-10. This is a bounded
shipped-source comparison. Browser and native behavior are not observed.

## Retained selection effect

REA application evidence
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`
has incomplete large-renderer semantic coverage. Existing hash-checked literal
reads supplement it. The [REA gap record](../../tools/ui-map/REA-GAPS.md) remains
unchanged. No new analyzer, acquisition, app, or target-code execution ran.

The retained renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, matching
[the existing extraction manifest](historical-chip/extraction.json). This pass
rehashed that local file and compared the complete `Jqo` literal to its retained
packet, rather than searching for a new asset.

The complete viewer `Jqo` occupies UTF-8 bytes `[9652565,9658452)`, SHA-256
`0e24efc52f0ab809283b07a30fbb5e615db81ab56a03f12dad7e298d15a81a87`.
Its selection effect and dependency construction occupy UTF-8 bytes
`[9654598,9655364)`, UTF-16 units `[9609070,9609836)`, SHA-256
`0f8ecdde964dc9be5fda9d22a5f7eaf7a3bb6c8f9788994fda8f1301e9e2ced4`.
Ranges are zero-based and half-open.

Within that complete viewer:

- `c` is the `selectedFile` prop, and `u` is `onNavigateToFile`.
- `z` is the presentation-ordered file list after filtering. `K` contains its paths.
- Once loaded `x` is nonempty, a nonempty `z` redirects a missing or excluded
  selected path with `u(z[0]?.path, {replace: true})`.
- A selected path already in `K` is retained. An empty filtered list supplies
  no replacement destination.

The exact redirect condition and call are:

```javascript
const He=c?K.has(c):!1;
z.length>0&&(!c||!He)&&(LXn.debug("selected file not in view, redirecting",{selectedFile:c,isSelectedFileInCurrentView:He,firstFile:z[0]?.path,fileCount:z.length,diffScope:a}),u(z[0]?.path,{replace:!0}),Z([z[0]?.path]))
```

[Navigation-order evidence](navigation-order.md) closes the existing `fJe`,
`WFn`, `GBt`, `qBt`, and `gyi` ordering and filtering chain and the production
wrapper's `p.jsx(Jqo, ...)` call. This correction does not change those rules.
It does not copy the reference's empty-diff close or navigation history system.

## Current-main mismatch and implementation boundary

At the comparison pin:

- `useWorkspaceDiff.ts` is Git blob `ff3fa47fa570dc1f9412ec2766e56e24269a9189`.
- `DiffViewer.tsx` is Git blob `ee63ec4eec7b4479603329783b93af6d02735a6f`.
- `viewed.test.ts` is Git blob `5dfca11f7c87fd6e97098c425f837298b05edab7`.
- `WorkspaceView.tsx` is Git blob `503909365d604e06920f80631267143056b2492d`.

The hook derives filtered `navigationFiles` but never reconciles `selectedPath`
against them. `DiffTab` renders that selection through `OpenFile` without
checking the filter. `WorkspaceView` passes the same hook state to the active
Diff tab. Selecting `b.drop` and filtering to `keep` leaves that excluded file
open even when `a.keep` and `c.keep` are available. Next and previous keys also
cannot step from a path absent from their navigation sequence.

The bounded correction belongs in the existing hook, beside its navigation
sequence. It replaces only an existing non-null selection that is absent from
a nonempty sequence. The first existing row supplies its path. A functional
state update preserves a pending workspace reset. It does not call `open` or
`onOpen`, so a filter change does not open a tab or add a separate navigation
entry. Raw file arrays, raw indices, file identities, viewed marks, filtering,
list helpers, loading, caches, storage, CSS, and public API stay unchanged.

Unlike the reference's viewer component, this hook also mounts while the chat
is visible and before any file has been selected. Initial null selection stays
null. No-match and truly empty loaded lists stay inert. These are explicit
scope boundaries, not claims of complete viewer parity. Automatic tab opening,
empty-diff closing, the no-match visual, and browser history are not implemented
or verified here.

The ledger cleared only the hook's selection effect, the existing actual-hook
test and its driver, and this new evidence note. There is no other source owner
for these hunks. Protected work and #916 remain excluded.

## Regression-first checkpoint

The existing fixture mounts the actual production hook using React and the
real viewed, tree, filter, navigation, and keyed-cache helpers. It already
supports presentation updates and loaded-list replacements. Its only new
boundary records calls to the existing `onOpen` callback. No selection logic
is simulated. Its worktree remains null, so no native polling timer starts.

Eight new cases cover flat viewed-last and natural tree replacement order,
collapsed descendants, matching-selection retention, no-match recovery,
loaded-path removal, initial null selection, truly empty lists, and rename
old-path matching. Assertions retain raw indices and object identity, viewed
marks, unchanged load counts for presentation changes, and unchanged tab-open
counts. Every prior regression assertion is retained.

The first published checkpoint changes only this test and evidence. Production
still has no redirect effect. The existing automatic Diff workflow runs:

```bash
node --experimental-strip-types --test src/features/diff/*.test.ts
```

## Hosted failing-before result

At published test-only head `8d19da6f1ddcc232ae92e77e04a87e9a1e3e6cd0`, the
[automatic Diff job](https://github.com/reason-machines/openconductor/actions/runs/42911750177/job/130163887522)
ran 245 tests. It passed 240 and failed exactly five new selection cases,
with no skips or cancellations. Dependencies and the fixture initialized
successfully. Failures were tests 229, 230, 232, 233, and 236:

- Flat filtering retained `b.drop` instead of `c.keep`.
- Tree filtering retained `selected.drop` instead of `dir/item2.keep`.
- Recovery from a no-match filter retained `b.drop` instead of `a.keep`.
- Removing the loaded selected path left selection null instead of `a.ts`.
- Old-path filtering retained `selected.ts` instead of renamed `new-name.ts`.

All 237 previous tests and the three new preservation controls passed. Those
controls exercise matching selection, initial null selection, and empty-list
recovery. The no-match condition also passed before its later redirect assertion
failed.

## Minimal correction checkpoint

The production change is one five-line effect beside the existing derived
navigation sequence. It uses that sequence's first row only when the current
non-null path is absent. Its functional state update retains a null path from
a pending workspace reset. It changes no loading, history, or tab-open boundary.
There are no new helpers or types.

`viewed.test.ts` remains byte-identical to the failing-before checkpoint, Git
blob `3f69285705f7cf78cced53e1f3aeb1270687c03f`. No old or new assertion, fixture
boundary, case name, or action changed after RED. Hosted passing-after
verification and all exact-head checks are pending.

## Verification limits

Retained-file and literal-fragment hashes, current-main source comparison,
source diff review, and `git diff --check` passed on the cloud computer. Local
Node tests, dependency installation, typecheck, builds, browser, server, app,
native execution, installation, and screenshots were not run under #847 FULL
STOP. No workflow dispatch, rerun, new worker, or duplicate observer ran.
Hosted hook tests do not prove browser keys, rendered Pierre behavior, native
parity, installation, deployment, or provider behavior. There is no running-UI
screenshot because runtime admission remains closed.
