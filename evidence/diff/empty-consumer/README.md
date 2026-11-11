# DiffTab loading and first-load error

Conductor Rebuild fixes the mounted DiffTab showing file-selection instructions
while the first changed-file list is loading or has failed. The change adds 14
lines after its unconditional hooks and before `!selected`. Ready-empty closure,
file visitation, whole-file refresh, editing, APIs, caches, CSS, and existing
regressions are unchanged.

## Retained Conductor evidence

Reference: Conductor 0.87.6 shipped assets, read as inert bytes, never executed.

- Renderer `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256
  `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Index `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256
  `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- Historical REA receipt
  `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.
  Semantic renderer analysis exhausted its heap. The retained packet uses bounded
  literal and dataflow extraction, not a claim of complete semantic analysis.
- Source packet `ACQ-DIFF-EMPTY-CONSUMER-01-source-packet.tar.gz`, attachment
  `f770e86b-f7a9-40af-8d63-92fa8d827d1d`, SHA-256
  `af96cb1459c5383d905d5564c557066de342ffc870b24fa62190c89ca9e78157`.
  It contains both original assets, source spans, main snapshots, and a verifier.

Offsets below are zero-based UTF-8 bytes, half-open `[start,end)`.

1. Index `$Lt` at `[3194065,3197110)` returns `useFilesChanged:n` with
   data/loading/error state. Index `[3199036,3199139)` binds it as `K9t`.
   Index `K9t as f1` at `[3483220,3483229)` and renderer `f1 as _V` at
   `[56569,56577)` join that hook to the visible caller.
2. Renderer `Eji` at `[9658755,9659872)` calls `Jqo` with the selected file and
   workspace scope. The file/diff route calls `Eji` with its file path.
3. Renderer `Jqo` at `[9652565,9658452)` reads
   `{data:x,error:w,isError:E,isLoading:k}=_V(n,a)`. It returns a working
   indicator when `k`, then `Couldn't load file changes` and the error description
   when `E && x===undefined`. Its successful empty-list branch and tab-closing
   effect are separate. Complete function SHA-256:
   `0e24efc52f0ab809283b07a30fbb5e615db81ab56a03f12dad7e298d15a81a87`.

The packet verifier previously passed both asset hashes, 25 span hashes, 23
static joins, eight main snapshots, 12 line ranges, and 25 corruption controls.
Those are retained-source checks, not native or visual observations. No new
source acquisition or reference runtime was used for this correction.

## Fresh-main comparison and correction

The executed baseline pins `DiffViewer.tsx` to
`6be97d85b854b2a1bf7930db49e2227a26af2e6a`. Execution HEAD was
`3c620dcda889688a3f6c91b2a319030d26d635ff` on the assigned branch.

Fresh default main `4739c9c029f87c64901a2431de6032b81f2b7348` has byte-identical
`DiffViewer.tsx`, `useWorkspaceDiff.ts`, `api.ts`, and `keyedCache.ts` compared with
that pin and execution HEAD. `WorkspaceView.tsx` differs because of Git panel
routing, but its `openDiffTab` callback, hook binding, and mounted `DiffTab`
expression are unchanged. This is not whole-file equality for that caller.

`useWorkspaceDiff` exposes no selected file before the list is ready.
`openTurnFile` can open its tab before the request completes. Previously, the
actual mounted `DiffTab` therefore returned `Pick a file in the changes list.`
for both initial loading and first-load errors.

The correction uses the existing discriminated load state. Loading returns an
existing `clone-spinner` with a `Loading file changes` status label. Error returns
the reference failure title and `load.message`. The spinner and accessible name
are reuse and accessibility choices, not claims of exact reference appearance.
No retry button is added because the retained first-load consumer has none.

## Frozen mounted regression

`src/features/diff/emptyLoadStates.test.ts` mounts production `DiffTab` with the
production workspace-diff hook, API adapter, keyed state, selection, and turn
switching. Only Tauri IPC is deferred. Editor/file-body and unrelated UI/context
boundaries are substituted. The test does not execute reference JavaScript.

The five cases verify:

1. Initial loading is announced instead of selection instructions.
2. Opening an uncached turn file keeps loading distinct from empty selection.
3. First-load failure displays its title and reason.
4. A later successful list replaces the error with the selected file.
5. Only a successfully loaded empty list closes the tab.

Fixture SHA-256, unchanged between the paired runs:
`7d53f71dcbd62e3b3e1bbaf1557a760ac1ce1440c78b496b60dd756874db14b0`.
The cleared 14-line patch SHA-256 is
`bc39ec2a0daa605290b8debb30e6119b5d70e24c910b0793b83064ecf9bb5df8`.
Viewer SHA-256 before:
`e1063e7b863ce3b417db672381bb07a6c7386701ec217b5d1a2ec5097ab49be2`.
Viewer SHA-256 after:
`cccee3ab384da094d2d01da32bbf5e1b3cd5bceee5727b441ef77d7462d0a033`.

An earlier fixture run had three behavioral failures, one circular-JSON helper
failure, and one pass. Its fixture SHA-256 was
`97d869b49cdacd772dfc32bc28ba7e7dfe3a35feb5afbb9f873caeee2d88ce0f`.
The helper was repaired to project strings through rendered `children`, without
serializing React ownership or arbitrary props. Every scenario body and
assertion remained byte-identical. Only the corrected, frozen fixture below
establishes the paired behavioral result.

## Observed RED and GREEN

Both runs executed on Reason Cloud computer 300,
`b3bf539c-baa9-5c0a-bd50-9c4212affce9`, using existing dependencies with no install.
Each ran one test worker at nice 19, a 384 MiB Node heap cap, a 60-second timeout,
and a five-second kill grace.

RED command:

```bash
DIFF_EMPTY_REGRESSION_REF=6be97d85b854b2a1bf7930db49e2227a26af2e6a \
  NODE_OPTIONS=--max-old-space-size=384 nice -n 19 \
  timeout --kill-after=5s 60s node --experimental-strip-types \
  --test --test-concurrency=1 src/features/diff/emptyLoadStates.test.ts
```

- Start: `2026-11-11T07:32:02.719712828Z`.
- End: `2026-11-11T07:32:04.141097624Z`.
- Exit `1`: three intended assertion failures and two passes.
- Initial and uncached-turn loading each had zero loading statuses instead of one.
- First-load failure rendered selection instructions instead of the failure title.
- Recovery and ready-empty closure passed. No fixture/setup error occurred.

After that observed RED, the cleared guards were applied. GREEN command:

```bash
env -u DIFF_EMPTY_REGRESSION_REF NODE_OPTIONS=--max-old-space-size=384 \
  nice -n 19 timeout --kill-after=5s 60s node --experimental-strip-types \
  --test --test-concurrency=1 src/features/diff/emptyLoadStates.test.ts
```

- Start: `2026-11-11T07:32:30.954826530Z`.
- End: `2026-11-11T07:32:33.880526329Z`.
- Exit `0`: all five unchanged cases passed, with no skipped/cancelled cases.
- Fixture hash remained unchanged. Both commands terminated normally; no matching
  test/timeout process remained. The serialized execution slot was released.
- `git diff --check` and `git diff --cached --check` passed.

Raw outputs remain in this Session's scratch directory as
`corrected-red-20261111.log` and `corrected-green-20261111.log` under
`.rea-work/diff-empty-consumer/`. The existing Diff workflow includes the new file
through `src/features/diff/*.test.ts`.

## CI typecheck correction

The first published head `c4143a7cac5cb5c6b22113b8d3273084097df729`
passed the hosted Diff and frontend unit-test jobs, but six jobs failed at the
same TypeScript check. `emptyLoadStates.test.ts:108` reported TS18046 because the
dynamically loaded `useWorkspaceDiff` export remained `unknown` inside the
hoisted `Fixture` function declaration. The app build stopped before producing
the executable, so downstream chat E2E launches reported a missing binary.

The correction changes only that declaration to a non-hoisted `const` arrow
created after the existing runtime `typeof` guard. It adds no type assertion,
`any`, suppression, or compiler exclusion. All five scenario bodies and their
assertions, production code, and the dynamic-loader boundary remain unchanged.
The corrected fixture SHA-256 is
`a76b8b68460a1d2f6b1b9b2c6a253cb603844307377f3c828a46b57658305180`.
The original RED/GREEN fixture hash above is historical, not this corrected hash.

The serialized correction check passed on Reason Cloud using the existing
dependencies, with no install or build:

```bash
NODE_OPTIONS=--max-old-space-size=1536 nice -n 19 \
  timeout --kill-after=5s 120s node node_modules/typescript/lib/tsc.js --noEmit

env -u DIFF_EMPTY_REGRESSION_REF NODE_OPTIONS=--max-old-space-size=384 \
  nice -n 19 timeout --kill-after=5s 60s node --experimental-strip-types \
  --test --test-concurrency=1 src/features/diff/emptyLoadStates.test.ts
```

- Full-project typecheck passed, exit `0`, from
  `2026-11-11T07:52:58.354475530Z` to `2026-11-11T07:53:19.985181417Z`.
- The five-case fixture passed `5/5`, exit `0`, from
  `2026-11-11T07:53:19.986062428Z` to `2026-11-11T07:53:21.162941148Z`.
  No cases were skipped or cancelled.
- The corrected fixture hash stayed unchanged. All five scenario bodies and
  assertions match the first published fixture byte-for-byte, SHA-256
  `cf2e49cc887b54d4e9ce65cc117c1f519e0a9058adfea0b3acf11cd2e5c9f765`.
- Production `DiffViewer.tsx` matches the published head byte-for-byte.
  Both commands terminated normally and no owned matching process remained;
  the local execution slot was released. No retry or additional test ran.
- `git diff --check` passed. The correction changes only this README and the
  two declaration lines in the existing regression fixture.

The earlier hosted TS18046 is the observed compiler failure before this
correction. The local post-correction pass does not establish hosted success;
all exact-head hosted checks must still pass. Raw outputs remain in Session
scratch as `ci-correction-typecheck.log` and `ci-correction-fivecase.log`.

## Verification limits

The paired check proves mounted React loading/error rendering, recovery, and
ready-empty closure through controlled IPC. It does not prove actual backend
availability, installed-app behavior, reference/native interaction, geometry,
focus, or visual parity. No screenshot exists because browser/native runtime was
not admitted or launched. Local adjacent/full suites and build were not run.
The full-project no-emit typecheck passed after the fixture-only correction
above. Exact-head hosted checks remain required before protected merge.
Consuming-main CI and macOS package verification remain a separate delivery step.
