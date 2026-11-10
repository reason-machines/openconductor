# Retain the five most recently visited Diff file views

Conductor Rebuild compared retained Conductor 0.87.6 shipped source with main
`385bdea15dc8861f3f3c9c3e42405eb8acfe180b` on 2026-11-10. This is a bounded
static comparison, not observed native behavior.

## Reference identity and complete consumer chain

The retained `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, matching
[the extraction manifest](historical-chip/extraction.json). This pass rehashed
that existing file and checked the complete viewer and file-view literal
receipts. No new acquisition, analyzer, app, or retained-code execution ran.

Existing REA evidence
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`
has incomplete large-renderer semantic coverage. Bounded literal reads supplement
it; the [existing REA gap record](../../tools/ui-map/REA-GAPS.md) is unchanged.
The local literal reader initially found no function declarations for `Tqo`
and `$Vo`; both are `const ... = $.memo(function(...) {...})` assignments.
Reading those complete assignments closed that representation difference, not a
new REA failure.

Ranges below are zero-based, half-open UTF-8 byte ranges:

- Complete `Eji`, `[9658755,9659872)`, SHA-256
  `019b1462190cfd8d6faadd7662fda51c14a685aec4d90094c12584ba1bceb686`.
  The production wrapper passes the selected path, diff scope, navigation
  callback, and close callback into `Jqo`.
- Complete `Jqo`, `[9652565,9658452)`, SHA-256
  `0e24efc52f0ab809283b07a30fbb5e615db81ab56a03f12dad7e298d15a81a87`.
  UTF-16 units are `[9607037,9612924)`.
- Its visit effect, `[9655364,9655516)`, UTF-16 `[9609836,9609988)`, SHA-256
  `54888990488e50ea06c209bfa81057e3f490073c698c0dde57dbd87ce8413a5f`,
  removes a selected path's earlier occurrence, appends it, and keeps `slice(-5)`.
- Its retained render, `[9657449,9658452)`, UTF-16 `[9611921,9612924)`, SHA-256
  `76bab79343defcd9dc1cc2641ae603f314c31d4e12e82df2e09cf577d14852e9`,
  maps loaded files, mounts only visited paths, and hides inactive containers.
  The no-match condition hides every retained view without clearing visits.
- Complete `gji`, `[9642975,9643145)`, UTF-16 `[9597447,9597617)`, SHA-256
  `17ef61ba31087a69545431627a2fc92f736f91734a3327551853e6b6795cacd9`,
  keys each view by path and scope. Commit keys include the commit hash;
  turn keys include both session and turn identifiers.
- Complete `bji`, `[9643145,9646819)`, SHA-256
  `2d2b8aac64bada5ead6bc143ac6bb272544791374a9b71b38e57eab55c8f5688`,
  passes visibility into `Mqo`.
- Complete `Mqo`, `[9637614,9641484)`, SHA-256
  `ba9e64973b294335d69d20e19ffd1ef4eaf63f3c209dd380beacf5ecc509393c`,
  forwards visibility to the editable `jqo` or read-only `$Vo` path.
- Complete `jqo`, `[9641484,9642975)`, SHA-256
  `3b57f4d3fb1c0ba90d3249cf522f66114602f79f79e85afbed10c08b16ba4741`,
  forwards visibility to `Tqo`. Complete `Tqo`, `[9633515,9633977)`, SHA-256
  `e00cb8fb59c4c43481536da01786f0e2ed2a157f7fb2fd95da0c40e750e2577b`,
  forwards its props into `kqo` through an error boundary.
- Complete `kqo`, `[9628186,9633515)`, SHA-256
  `3af80b1ec23526b5f7da46310901c69f22cb9965ef67fba947801071ede1bcc1`,
  mounts comment navigation only when `ge && h`, with `h` its visibility prop.
- Complete `$Vo`, `[9431499,9436022)`, SHA-256
  `d908c703a9de4c3a3e2436109edebd53418afd8dca0543b6f3fbd4bd7bfe2e44`,
  likewise mounts comment navigation only when `D && u`, with `u` visibility.
- Complete `$Mi`, `[9429455,9430800)`, SHA-256
  `f329a09f62fc894bc1a565350986c8a96fd04dbf2be1d45ab0a8ca4cd3f8e7d0`,
  registers `diff.previousComment` and `diff.nextComment` when mounted.

The full `Jqo` selection effect also resets its visited paths to the first
matching path on an automatic selection redirect. That branch is already
located in [selection-redirect evidence](filter-selection-redirect.md). Ordinary
selection and automatic redirect cannot share an indistinguishable cache event.

## Current-main mismatch

At the comparison pin, `DiffViewer.tsx` is blob
`868e0ed565c9ec9a2aedfd134ae36aae17b2a282`; `viewed.test.ts` is
`76b0ee30f8893597280363387b958e39e9cc3c7f`; `useWorkspaceDiff.ts` is
`d4d16b3fa9799566930a12c662cf4b2924b75f9a`.

`WorkspaceView` passes the shared hook state to the actual `DiffTab`.
`DiffTab` renders one `OpenFile`, whose `FileDiffView` has `key={selected.path}`.
Selecting A, B, then A destroys A's component-local state, even though the
reference keeps it mounted until eviction. The shared editor draft store is
separate: this finding is not a claim that draft text is lost.

Retaining multiple current `FileDiffView` instances without a visibility boundary
would also retain competing global comment shortcuts. Its `Code` mounts
`CommentNav` unconditionally and registers every mounted path in the revealer
map. The bounded correction must leave inactive views mounted but make their
comment shortcuts and reveal navigation inactive. Existing callers that omit
visibility must remain active.

## Scoped data shape and ownership

The ledger cleared five exact paths: the retained-view state/container in
`DiffViewer.tsx`, optional visibility and active-only navigation in
`FileDiffView.tsx`, the existing selection state's automatic-redirect signal in
`useWorkspaceDiff.ts`, additive regressions in `viewed.test.ts`, and this note.
No shared CommentNav, CSS, filter helper, store, loading/cache, or protected code
is changed.

The intended cache is one ordered list of up to five unique visited paths,
not separately cached copies of file data. Rendering uses the current raw file
objects. View identity includes worktree, path, scope, commit hash, and turn
session/turn identity. A redirect revision travels atomically with the existing
selected path: explicit selections preserve it; only the existing automatic
redirect branch increments it. The tab resets visits on that revision without
duplicating the hook's filter/selection predicate.

This follows Model the Domain: selection and its reset cause form one atomic
value, and recency is an ordered bounded list. Test Behavior, Not Implementation
checks retained local values, visible views, navigation effects, and eviction.

## Regression-first checkpoint

The first checkpoint changes only `viewed.test.ts` and this note. Product source
is unchanged. Existing no-match, selection, viewed, presentation, whitespace,
and scope assertions remain intact.

The existing actual hook/DiffTab fixture uses real React and a stateful preview
boundary instead of Pierre. New cases exercise A/B/A retention, five-entry
recency/eviction, no-match retention, automatic-redirect reset, all/uncommitted
and commit separation, distinct commit hashes, and both turn identity fields.
Another fixture mounts actual `FileDiffView`, `Code`, and `CommentNav`, with
geometry, Pierre and native boundaries inert. It checks that hidden views do
not register global comment handlers or revealers, active navigation still
works, local Code selection survives visibility changes, and omitted visibility
retains the previous active behavior.

The ordinary automatic hosted command is:

```bash
node --experimental-strip-types --test src/features/diff/*.test.ts
```

## Hosted failing-before result and correction

Published test-only head `e8d22410bee7f4842b566655483b52a6348cf2ba` ran the
[automatic Diff frontend job](https://github.com/reason-machines/openconductor/actions/runs/42923886866/job/130205318833).
It reported 260 cases, 253 passed and seven intended failures, with zero skips
or cancellations. Cases 250–255 failed retention, recency, no-match retention,
redirect precondition, or returning-scope isolation. Case 259 observed two
comment-shortcut registrations instead of one for active/hidden views. Three
new distinct commit/turn controls and all 250 previous cases passed. Both Diff
Rust jobs passed. Dependency setup and actual component mounting succeeded.

Before the product correction, main was refreshed to
`71c6bead64f4787b825f0951d38b0fe5d7db1e9d`. The three product files remain
byte-identical between this pin and the initial comparison pin. The correction
adds the five-entry path list, scope-keyed mounted views, active-only comment
navigation/reveal registration, and the atomic redirect revision. The existing
single redirect predicate is unchanged. No-match explanation, selection, loaded
arrays, raw indices, and tab-open behavior are preserved.

The regression is Git blob `943d2788bb33a357833afde678bbc97cdc1518eb`,
byte-identical to the failing checkpoint. No assertion, action, case, or fixture
boundary changed afterward. Automatic hosted passing-after verification and
all exact-head checks are pending.

## Verification limits

Passed locally: retained file/literal hash checks, current-main source comparison,
and `git diff --check`. Local tests, dependency installation, typecheck, build,
browser, server, native app, installation and acquisition are not run under
#847 FULL STOP. #916 remains untouched. No manual workflow dispatch, rerun, new
worker or duplicate observer is used. #949's existing consuming-main/package
recheck remains separate and sole.

No running-UI screenshot is available because runtime capture is not admitted.
The preview sentinel is not Pierre draft/scroll proof. The navigation fixture
uses synthetic geometry, not browser layout. Installed behavior, real editor
state, deployment and full native parity remain unverified.
