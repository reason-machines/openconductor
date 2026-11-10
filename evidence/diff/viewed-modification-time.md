# Viewed-file modification time

Conductor Rebuild compares retained Conductor 0.87.6 source with OpenConductor
main `36336d1d92d0905164afafa56170a4e7b540dbba` on 2026-11-10. This is a
source-only correction. Native behavior has not been observed.

## Reference contract

The retained REA application evidence is
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.
Its large-chunk semantic coverage is incomplete. Bounded literal source reads
supplement that evidence, not native observation or complete service analysis.

The renderer asset `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
[Viewed navigation evidence](viewed-navigation.md) identifies its complete,
hash-checked `pH` store and `fJe` definitions. `pH` records `Date.now()` for a
workspace and path. `fJe` uses this predicate:

```js
viewedAt !== undefined && lastModifiedTime !== undefined && viewedAt >= lastModifiedTime
```

Equality and an older modification time are viewed. A newer modification time
is unviewed, even when the diff contents are unchanged. Missing metadata is
unviewed even when a mark exists. Zero is defined, not missing. Changing diff
context or whitespace options does not invalidate a mark when modification time
is unchanged. File grouping and navigation are outside this correction.

The producer asset `index-BGEQ8YjU.js` is 3,493,297 bytes, SHA-256
`b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`, matching
[the retained extraction manifest](../frontend/tauri-assets-manifest.json).
Transfer `aff5eba9-df1c-4b98-92d2-26ebfde6fdfd` copied the already-extracted,
REA-analyzed asset to the existing source owner's Cloud scratch. No new analyzer,
app execution or native acceptance ran.

All ranges below are UTF-8 bytes, zero-based and half-open:

- `K9t as f1` at `[3483220,3483229)` resolves renderer import `_V` to
  `KLt.useFilesChanged`, not the producer asset's unrelated `_V` function.
  Complete `$Lt` at `[3194065,3197110)` selects the all, uncommitted, commit or
  turn producer without adding timestamps itself.
- `zGe` at `[690591,690814)` sets deleted-file time and size to zero and selects
  nondeleted paths missing metadata. `GGe` at `[690814,691208)` parses stat
  seconds and assigns `Math.round(seconds * 1000)`.
- Complete `x$` at `[698631,699527)` runs host-specific stat commands and passes
  their output to `GGe`. Complete all-files `XGe` at `[695160,695782)` and
  uncommitted `_f` at `[695782,696371)` call it before returning their files.
  A missing stat row can leave metadata absent.
- Commit `Lje` at `[745267,745551)` returns `wA(_A(nameStatus), v_(numstat))`.
  Complete `wA` at `[690080,690300)` constructs path, status, line counts,
  binary flag and old path, without modification time or size.
- Complete `IFt` at `[3135254,3137934)` delegates turn queries to
  `getTurnChanges`. Fresh `readTurnChanges` at `[3132145,3132957)` uses the same
  `wA` assembler. It does not stat today's worktree.
- `loadTurnChanges` at `[3131925,3132145)` returns a cache hit unchanged.
  Complete cache factory `vFt` at `[3130285,3130753)` validates through the
  changed-file schema `zse` at `[702650,702802)`, which permits optional numeric
  `lastModifiedTime` and `fileSize`. Cached numeric metadata must not be dropped.
  This does not establish what any actual cache contains.

The existing source owner's complete commit/turn receipt is retained as Reason
source `53470344-3c16-42d0-912f-38f85d7245e0`, revision `25840501`: 16 complete
spans and 6,648 literal source bytes, with per-span byte and hash checks.
[The source-owner Session](https://reasonmachines.com/agents/e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46)
holds that receipt. Shell execution, schema-library internals and actual cache
contents are not established by the literals.

## OpenConductor mismatch and bounded correction

OpenConductor stores FNV fingerprints over status and hunk contents. A
same-content rewrite with a newer filesystem modification time can remain
viewed, while a diff-option-only hunk change can invalidate a mark. Its full and
summary diff models do not transport modification time.

The correction uses optional snake_case `last_modified_time` in Unix
milliseconds in both models. Only the worktree return path enriches metadata,
after whitespace-only hunk substitution. Deleted worktree files receive zero;
stat failure leaves metadata absent without failing the diff. Fresh commit and
turn returns remain absent. Present-day worktree timestamps are never assigned
to historical results. Existing cached numeric metadata is preserved unchanged.

Viewed marks become numeric wall-clock timestamps. Legacy string fingerprints
are ignored rather than interpreted as times. Pruning, counting and the shared
navigation callback remain otherwise unchanged. The callback and its nine
navigation assertions from #894 are not weakened; fixtures supply modification
times so that a mark can legitimately be current.

## Regression checkpoint

The first checkpoint changes tests and this evidence note, not production
behavior. Tests exercise the real viewed functions, existing turn-cache reader,
and production `useWorkspaceDiff` through its existing boundary harness.
Assertions cover equality, older and newer times, missing metadata, deleted
zero, legacy strings, nonfinite stored values, cached numeric data, same-content
load-array replacement, and option-only hunk replacement.

Rust regressions use temporary Git repositories and controlled `FileTimes`.
They assert rounded stat values in full and summary JSON, same-content rewrites,
whitespace and context options, deletions, renames, untracked files, and absent
metadata for fresh commit and turn results. Model round trips cover absent,
zero, negative and positive timestamps. Before the fix these tests use JSON
assertions instead of referring to a model field that does not yet exist.

Hosted RED is verified at published head
`5ebb40bd437cea6d8c83b7d99da8a0f04c734068`:

- [Diff frontend](https://github.com/reason-machines/openconductor/actions/runs/42803246110/job/129785845174)
  ran 181 tests: 174 passed and exactly the seven new timestamp/storage/cache/hook
  cases failed. All existing #894 navigation assertions passed. The same-content
  rewrite stayed viewed, option-only changes lost the mark, and absent metadata
  stayed viewed under the old fingerprint implementation.
- [Linux Rust](https://github.com/reason-machines/openconductor/actions/runs/42803246110/job/129785844781)
  and [macOS Rust](https://github.com/reason-machines/openconductor/actions/runs/42803246110/job/129785845100)
  each ran 53 tests: 49 passed and four timestamp transport/serialization cases
  failed because JSON had no timestamp. The historical-absence test passed.
  Hosted formatting passed on both platforms before the tests ran.
- The full frontend typecheck failed at the three test uses of the missing
  `last_modified_time` wire field. This is separate from the executable
  behavioral failures above.

The fix removes fingerprints, transports optional signed Unix milliseconds, and
adds the worktree-only stat reader. Frontend regression assertions are unchanged
from RED. Existing Rust regression assertions are unchanged; two supplemental
real-filesystem checks cover missing-stat absence in full/summary serialization
and negative-epoch rounding, including ties toward positive infinity as in
`Math.round`. These supplemental cases were added with the stat reader and do
not receive a failing-before claim. Hosted unchanged-assertion GREEN and all
exact-head checks remain pending.

The existing automatic workflows run these commands:

```bash
node --experimental-strip-types --test src/features/diff/*.test.ts
bash tools/diff/run-rust-tests.sh
rustfmt --edition 2021 --check src-tauri/src/diff/*.rs
```

Local tests, dependency installation, builds, browser or native app execution,
workflow dispatch and new observers are not admitted and have not run. Local
Rust formatting was attempted but the existing toolchain lacks the `rustfmt`
component; no component was installed. Hosted formatting passed at RED and
remains required on the fix head. `git diff --check` is the local source whitespace check.

There is no screenshot because native admission remains closed. Packaging and
hook tests do not prove native parity, pointer propagation, Pierre visuals,
real-provider behavior or actual save IPC.
