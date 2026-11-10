# File navigation uses Changes presentation order

Conductor Rebuild compared retained Conductor 0.87.6 with OpenConductor main
`49fde8bf788f0914dc7e53e58c5b024a9294cc61` on 2026-11-10. This is a static
shipped-artifact comparison. Native ordering parity is not observed.

## Reference and causal chain

The retained renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, matching
[the existing extraction manifest](historical-chip/extraction.json). The binary
provenance is SHA-256
`0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
Existing REA evidence
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`
has incomplete large-renderer semantic coverage. This pass supplements it with
bounded literal reads of the already-retained bytes. It neither acquires nor
executes the app and encounters no new REA tool failure.

The complete decoded/minified definitions have these UTF-8 half-open ranges and
SHA-256 hashes:

- `fJe`, `[2731481,2732090)`,
  `94dad71f536536d4dabd1f7081e22aa17154f8b2843c29a7fcff9086c455e095`.
  It sorts conflicts, unviewed and viewed groups by path and returns that sequence.
- `WFn`, `[2826567,2826682)`,
  `d241009b097d847e1ef70853060fcde8a7bc891885fe4a60aeaa13708d6203e5`.
  It traverses the existing directory builder with an empty collapsed set and
  retains file rows. Collapsing a directory does not remove its descendants from
  file navigation.
- `GBt`, `[2829662,2829826)`,
  `9a7d91cf0300b00722bb540e2d3fda87f88f662f34044c2fcc0c41d1d634022c`.
  It reads the workspace route's `diffFileListMode`. The neighboring `qBt` reads
  `filePathFilter` from the same route. Both are the same accessors used by the
  production GitPanel, as recorded in [flat-order evidence](viewed-flat-order.md).
- `gyi`, `[2840025,2840211)`,
  `870f3a77fdc09ab5da4b31e1bef67a2d639c62e5f6254148040ad5f5c9c235a8`.
  It filters matching path or old-path objects while preserving input order.
- `Jqo`, `[9652565,9658452)`,
  `0e24efc52f0ab809283b07a30fbb5e615db81ab56a03f12dad7e298d15a81a87`.
  The mounted DiffView receives `fJe`'s `sortedFiles`. For a nonstack tree it
  replaces that sequence with `WFn` traversal, then applies `gyi`. Its next,
  previous and shared mark-viewed callback all step through that resulting `z`
  sequence. It determines the mark callback's direction before the new mark
  reorders the list. An existing mark is removed without navigation.

The definition of `Jqo` is referenced by its production wrapper's `p.jsx(Jqo, …)`
call with `selectedFile` and `onNavigateToFile`, not only by an isolated utility.
The [earlier navigation receipt](viewed-navigation.md) closes the header
`bji`/`GPo` and keyboard entry points to that shared callback. Timestamp semantics
remain those in [the delivered modification-time receipt](viewed-modification-time.md).
The reference's special stack view is outside OpenConductor's current model and
is not claimed here.

## Distinct mismatch after the delivered fixes

At the current-main comparison pin, `useWorkspaceDiff.ts` is Git blob
`809effca9c6a11ff0c7c1e81bd0c0791d2c8854a`. It uses raw `load.files` for next,
previous and mark-viewed stepping. `ChangesList.tsx`, blob
`e3f26e077b3c8747d45f52e862cfac9297ec1552`, instead renders the sequence from
`changeRows` after applying the shared path filter. `changesTree.ts` is blob
`4ea1d272b554c10548a37033a37de9431403ae46`. All three exact-main blobs match the
inspected checkout.

For loaded paths `a.ts, b.ts, c.ts` with only `b.ts` viewed, the reference and
flat list order are `a.ts, c.ts, b.ts`. Next from `a.ts` must select `c.ts`.
The current hook selects `b.ts`. Marking `a.ts` has the same wrong destination.
The delivered #894 correction made marking navigate rather than stay still;
#897 changed timestamp classification; #902 changed only the displayed flat
rows. This unit corrects the remaining disagreement between display and
navigation, without undoing those fixes.

## Bounded design

Only the existing hook, its actual-hook test file and this evidence note are
leased. The correction reads the existing shared presentation snapshot
and derives a separate navigation sequence with the existing tree and filter
functions. Public `files`, raw indices, path selection, load/cache keys and
network loading stay unchanged. A destination is mapped by path back into that
public array. Tree navigation includes collapsed descendants, matching `WFn`.

Sorting or filtering the public array was rejected because consumers use its
indices and identity. Copying the grouping predicate was rejected because
`changeRows` already owns it. This follows Model the Domain and Type System
Discipline: navigation has one typed `FileDiff[]` sequence and raw indices remain
in their existing domain. No new public API or route state is introduced.

Automatic redirect when the selected path leaves the filter, reference stack
views, conflict-model expansion, comments, editor/save behavior, IPC and native
geometry are outside this unit. The existing `Next unread` control remains
unchanged. This receipt does not claim complete navigation parity.

## Regression checkpoint

The first checkpoint adds seven actual-hook regression cases to the existing
`viewed.test.ts`, without changing production code or previous assertions.
The fixture retains the real production hook, viewed predicates, navigation,
tree and filter helpers. Its new presentation boundary supplies the shared
route snapshot; loading, storage and keybinding registration remain the
existing isolated boundaries. The fixture has a null worktree and creates no
native IPC, app process or polling timer.

Cases cover next and previous wrapping through interleaved viewed groups;
header and keyboard marking; final-unviewed backward fallback; natural tree
order including collapsed descendants; filtered stepping with raw-index and
object identity preservation; presentation changes without extra loading; and
a timestamp invalidation that changes ordering. Previous stationary-unmark,
empty-selection and timestamp assertions are unchanged.

The ordinary hosted command is:

```bash
node --experimental-strip-types --test src/features/diff/*.test.ts
```

Hosted RED is verified at published head
`f18948d8d925d6a896d2aaaf0f2e3930d2329d94`. The automatic
[Diff frontend job](https://github.com/reason-machines/openconductor/actions/runs/42830853640/job/129880156798)
ran 195 tests. All 188 previous tests passed and exactly the seven new cases
failed. Next selected `b.ts` instead of `c.ts`; both mark entry points made the
same wrong choice; backward fallback selected viewed `b.ts` instead of `a.ts`;
tree navigation selected `root.ts` instead of `dir/item10.ts`; both filter cases
selected `b.drop` instead of `c.keep`. These are assertion failures in the actual
production hook, not setup or dependency failures.

The production correction adds one presentation-derived navigation array and
steps by path through it. The direction calculation uses that same pre-mark
snapshot. No regression assertion or fixture was changed after RED.

Hosted same-assertion GREEN is verified at published head
`e0554c20089f76cbe291528b6db939aa7d40c893`. The automatic
[Diff frontend job](https://github.com/reason-machines/openconductor/actions/runs/42831165875/job/129881247240)
passed all 195 tests, with zero failures, cancellations or skips. The regression
file remains Git blob `30bd102e8b7726f54a1741a95a22f044dbcfbd1d`, identical to
RED. Diff Rust tests and clippy passed on Linux and macOS.

That head completed 23 successful checks and one failed check. The automatic
[Keybindings job](https://github.com/reason-machines/openconductor/actions/runs/42831165905/job/129881247571)
failed the final Undo assertion in `composer-long-paste.e2e.mjs` and the immediate
four-label Focus menu assertion in `sidebar-sections.e2e.mjs`. Neither cause is
established. Their existing owners retain diagnosis. No assertion was weakened
and this receipt does not classify either failure as unrelated or flaky.

Published head `6c5f12352f17ca6f487375f81080562b1fa9f51b` incorporates main
`75a1196dd92f9303474067296e5d64500078180c`, including #906's diagnostic-only paste
coverage. Its composer test matches main blob
`6e9419aa7323a3b930e3e11be64fd5c9da40b25c`. The Diff frontend and both OS Rust
checks passed. The automatic
[Keybindings job](https://github.com/reason-machines/openconductor/actions/runs/42835101427/job/129895096019)
failed one subtest, with 201 passed, one failed and one skipped. Its new immediate
post-fill precondition observed lengths `0, 0, 270` before the three paste inputs.
The third iteration failed `270 !== 0` at line 105, before the short paste and final
Undo. All three isolated text, no-attachment, Undo and Redo controls passed. The
Focus menu assertion did not fail in that run. This establishes a nonempty shared
fixture at the observation point, not its cause or a product threshold defect.
The existing composer owner retains causal diagnosis. The original assertions
remain unchanged.

The branch now also incorporates main
`1771b07d72c7cbb44e9d4617a0d18d59b75b57b2`, including #909's diagnostic-only Focus
coverage. The Focus test matches main blob
`ded6aaa77027c24be8d33298958c9d406977ac13`. Both scoped #909 diagnostic paths are
byte-identical to its checked PR head `9f3cf0fe20791bfc380dbc00666f63a76fccc2ad`.
The immediate query and exact four-label assertion remain intact. The Diff hook
remains blob `ece91c83a54945925b98fee9de026612c71020d5`; the regression remains
blob `30bd102e8b7726f54a1741a95a22f044dbcfbd1d`, byte-identical to RED. Neither main
integration is a repair or clearance of historical failures. New exact-head
automatic checks are required before merge. There is no additional diagnostic
writer, consumer observer or runtime admission.

Capacity restrictions prohibit local tests, builds and dependency installation,
so no local executable regression or typecheck ran. Local `git diff --check` is
the only source whitespace check. There are no new workflow dispatches, reruns
or observers. The ready PR's normal automatic CI owns RED and later GREEN.

No app, browser, native execution, screenshots or fresh REA acquisition ran.
There is no screenshot because native admission remains stopped. Packaging
cannot establish native navigation parity.
