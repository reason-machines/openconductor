# A no-match Changes filter hides the selected file

Conductor Rebuild compared retained Conductor 0.87.6 with current main
`0244d800782a3eaf811aac53fedc8a536218fb2b` on 2026-11-10. This is a bounded
shipped-source comparison. Browser and native behavior are not observed.

## Retained reference and consumer

The already-retained renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes,
SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
This pass rehashed the local file and checked the complete `Jqo` literal against
its retained packet. No acquisition, analyzer, app, or target-code execution ran.

The complete viewer occupies UTF-8 bytes `[9652565,9658452)`, UTF-16 units
`[9607037,9612924)`, SHA-256
`0e24efc52f0ab809283b07a30fbb5e615db81ab56a03f12dad7e298d15a81a87`.
Ranges are zero-based and half-open. The production wrapper has one
`p.jsx(Jqo, ...)` call at UTF-8 offset 9659627, with `selectedFile`,
`diffScope`, and `onNavigateToFile`. This is the same complete viewer and
consumer recorded in [navigation-order evidence](navigation-order.md) and
[selection-redirect evidence](filter-selection-redirect.md).

REA application evidence
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`
has incomplete large-renderer semantic coverage. Existing hash-checked literal
reads supplement it. The [REA gap record](../../tools/ui-map/REA-GAPS.md) is
unchanged. No new REA failure occurred.

Within `Jqo`, `_V(n,a)` supplies the loaded files, `fJe` produces `I`, and the
existing tree and filter functions produce `z`. The complete viewer defines:

```javascript
const Ue=I.length>0&&z.length===0;
```

The render inserts `CJ` with title `No files match this filter` when `Ue` is
true. For every previously visited file it computes `it=!Ue&&c===He.path`,
keeps the existing `bji` mounted, and sets its container's `hidden:!it` and
`isVisible:it`. Thus a nonempty loaded list with zero matches hides the file
view without discarding selection or mounted state. A truly empty loaded list
is a separate condition. The existing selection effect does not redirect while
`z` is empty.

This evidence closes the loaded-list, filter, placeholder, and selected-file
visibility chain in one complete renderer function. It does not establish
browser layout, native rendering, scroll retention, or Pierre editor behavior.

## Current-main mismatch

At the comparison pin, the scoped Git blobs are:

- `useWorkspaceDiff.ts`, `40d3944ab5539a9159caf01446461b1d86eddb98`.
- `DiffViewer.tsx`, `ee63ec4eec7b4479603329783b93af6d02735a6f`.
- `viewed.test.ts`, `3f69285705f7cf78cced53e1f3aeb1270687c03f`.

They are unchanged from the initial discovery pin `55ee66f4`. The hook already
computes the filtered navigation sequence and correctly retains an existing
selection while that sequence is empty. `DiffTab` renders `OpenFile` for that
selection without consulting the filter. Selecting `b.drop`, then entering a
query with no matches, leaves `b.drop` visible in the main tab although the
Changes list reports no matches. Before selecting a file, the main tab instead
keeps the generic pick-a-file prompt under the same no-match condition.

## Bounded correction

The ledger granted exactly the derived hook flag and its returned wiring,
`DiffViewer.tsx` placeholder and mounted-container visibility, the existing
actual-hook test with an optional actual-component driver, and this note.
No CSS, filter, list helper, storage, loading, or protected code is changed.

The data shape is one derived `noMatchingFiles` boolean from the existing raw
and filtered sequences. It is not separately stored state. The viewer uses it
to show the no-match explanation and hide, rather than unmount, the existing
file container. Selection, viewed marks, file identity, raw indices, tab-open
callbacks, and the loaded arrays remain unchanged. The hide must override the
existing file container's `display: flex` rule without changing shared CSS.

Initial null selection stays null. A truly empty loaded list, loading, and
errors retain their existing behavior. There is no automatic tab opening or
closing. Recovering a matching query uses #941's existing redirect behavior.
This does not add the reference's empty-diff auto-close, visited-file cache,
stack view, or navigation history.

This follows Model the Domain by deriving the no-match condition from the
existing sequences, rather than adding another mutable lifecycle flag. Type
System Discipline keeps the value inferred from that source. Test Behavior,
Not Implementation makes the regression observe the mounted component output,
selection, and externally visible callback counts.

## Regression-first checkpoint

The first checkpoint changes only the tests and this evidence note. Production
still renders the stale selected file. The existing fixture mounts the actual
`useWorkspaceDiff` with real React, viewed, filter, tree, navigation, and cache
functions. An optional driver also mounts the actual `DiffTab` and `OpenFile`.
A stateful file-preview boundary replaces Pierre, while edit, CSS, and native
boundaries remain inert. No production selection, visibility, or placeholder
logic is duplicated in the driver.

Five cases cover flat and tree no-match round trips, an initially unselected
no-match list, a truly empty list, and a rename matched by its old path. The
round trips check the main-tab explanation, hidden but still-mounted preview,
retained local preview state, selection, raw index, viewed mark, unchanged load
count, and no new tab-open calls. Next and previous are inert while no matches
exist. All existing regression assertions remain unchanged.

The local preview-state sentinel proves that the mounted boundary is not
replaced. It is not a real Pierre draft or a native editor acceptance check.
The fixture's null worktree prevents native polling. The ordinary automatic
hosted command is:

```bash
node --experimental-strip-types --test src/features/diff/*.test.ts
```

Hosted failing-before and passing-after results are pending. The regression
file will remain unchanged between the intended failing run and correction.

## Verification limits

Retained-file and literal-fragment hashes, current-main source comparison,
source review, and `git diff --check` are the permitted local checks. Local
Node tests, dependency installation, typecheck, builds, browser, server, app,
native execution, installation, and acquisition are not run under #847 FULL
STOP. #916 and protected work remain unchanged. No manual workflow dispatch,
rerun, new worker, or duplicate observer runs.

There is no running-UI screenshot because browser and native admission remain
closed. Hosted component tests are not browser layout, installed behavior,
deployment, provider behavior, or complete native parity proof.
