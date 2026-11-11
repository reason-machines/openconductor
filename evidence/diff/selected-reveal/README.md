# Reveal the active file in the Changes tree

Conductor Rebuild fixes a selected file remaining hidden below collapsed Changes
folders. `WorkspaceView` passes only its active Diff/file path to `RightPanel`.
In Changes/tree mode, a newly active path expands and persists only its ancestors.
Unrelated collapsed folders remain collapsed. Manual re-collapse survives ordinary
rerenders and a return from chat with the same selection. Leaving Changes/tree
resets the reveal guard. Workspace identity prevents an identical path in another
workspace from sharing that guard; inactive tabs cannot reveal a stale Diff path.

Unit: `DIFF-SELECTED-ANCESTOR-REVEAL-01`.

## Retained reference and its limits

The retained Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js` has SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`
and 11,600,457 bytes. Its REA receipt is
`ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.
Historical semantic renderer analysis exhausted its heap. The retained artifact
and all 15 bounded source spans were revalidated as inert bytes; no extracted
reference JavaScript ran. This is shipped-source evidence, not native observation
or complete semantic analysis.

Offsets below are zero-based UTF-8 bytes, with an exclusive end:

- `Wd` `[2148617,2152120)` sets the active file route.
- `WXe` and `Zls` `[2122111,2122523)` expose the active file tab's path.
- `bys` `[2840211,2849411)` reads that path, list mode and persisted collapse
  state, then constructs the visible Changes rows.
- Its effect `[2843241,2843539)` expands a newly active path's ancestors in tree
  mode, resets the last-path guard outside tree mode, and leaves manual collapse
  alone for an unchanged path. SHA-256:
  `db38ae2a680259ca001c1b73c52576384732374574d594c43c4817a8e628e414`.
- `iys` `[2826895,2827028)` enumerates ancestors. `hys`, `Gde`, `WBt` and `fys`
  join the update to workspace-scoped route persistence; `rys` and `hyi` construct
  visible rows from the collapse set.

## Source boundary and unchanged inputs

Immediately before delivery, default main was
`3da2890517fb81365916ef1e4f7f80cc7a93d421`. All 13 producer/state/consumer
source hashes match the tested baseline
`4b298fd9afa4508ec31f7ea663265930006c7ccf`. The owner integrated current main
on its assigned branch before applying the four frozen product hunks.

The product change is confined to `src/components/WorkspaceView.tsx`: an existing
`ancestors` import, the `RightPanel` active-file prop, its guarded reveal effect,
and the sole caller. The optional path is derived from the actual `showDiff` and
workspace-checked `showFile` conditions. No store, hook, ChangesList, tree helper,
filter, rename, cache, CSS, existing fixture, chat callback or tab-identity edit is
included. The only other paths are the new `selectedReveal.test.ts` and this note.

Exact frozen hashes:

- Baseline WorkspaceView: `41a3fb802ef166f335a9d329889fd92a4509c7c061d4f583d5557d1d26034fba`.
- Candidate WorkspaceView: `7eed1cf96f8a5ed52fc98409e5d6691cb16911ad3f8973dcd4e847d0a73592bd`.
- Four-hunk patch: `71966e47b301a787ed03a6e421fa5e6dfcc3bf4502d13fb0431c83eba54f97e5`.
- Entire six-case fixture, unchanged for RED/GREEN and delivery:
  `f37729569d4d2a82d47123113dde98f23762fa0f1afe3664463aec299a9db3c5`.
- Six scenario bodies: `9d6314a1781b928b554243a520ebc9de9e85f79491767277eb7f3c53031b8232`.

## Mounted behavior proof

The fixture extracts the actual `RightPanel`, its sole JSX mount and the actual
`showDiff`/`showFile` declarations from the production AST without rewriting their
bodies. It mounts the real ChangesList, presentation hook/store, tree construction
and browser persistence adapter. Route/diff inputs, storage, unrelated actions and
decorative UI boundaries are controlled. It does not mount the entire application
or exercise the diff-loading hook, Tauri storage, native I/O or a real provider.

The existing sole runtime owner ran the following commands once each, sequentially
on Reason Cloud in its isolated reduced snapshot, with existing pinned public
dependencies. No duplicate local execution, installation or retry occurred in the
delivery checkout. The immutable terminal receipt SHA-256 is
`41bcba67d2427fd2668aa0f0e5c426e00e48cd8919804a6c697f7f5a39c2b472`;
its original bytes remain attached to the owning Session. React and
react-test-renderer were 18.3.1, TypeScript 5.9.3 and fuzzysort 3.1.0. All four
physical package-manifest hashes matched the frozen packet.

### Baseline reproduced the defect

At 2026-11-11 09:28:46.440850–09:28:47.928187 UTC, the unchanged fixture ran
against physical baseline WorkspaceView bytes. The command exited 1 with five
behavioral assertion failures and one inactive/absent-path control pass, not a
setup failure or timeout.

```bash
timeout --kill-after=5s 60s bash -c \
  'cd .rea-work/ui-runtime/frozen-selected && exec node --experimental-strip-types --test --test-concurrency=1 src/features/diff/selectedReveal.test.ts'
```

Decisive original TAP excerpts:

```text
not ok 1 - active diff selection reveals nested ancestors, persists them and retains unrelated collapsed folders
  error: 'the actual ChangesList displays the selected nested file'
  code: 'ERR_ASSERTION'
  expected: true
  actual: false
ok 3 - inactive or absent file selection never unfolds stale diff selection
# tests 6
# pass 1
# fail 5
# cancelled 0
# skipped 0
# todo 0
```

Original RED stdout SHA-256:
`934d498df1c1ecd62469016f4d84ed57e6fa5661881f9dc9777f6a6147f426df`.

### The exact candidate passed all six cases

At 09:29:40.368097–09:29:41.763244 UTC, the same command and byte-identical
fixture ran after applying only the frozen product patch. Entire resulting
WorkspaceView bytes equal the candidate hash above. Exit 0; all six scenarios
passed with no skips, cancellations, setup failure or limit hit:

```text
ok 1 - active diff selection reveals nested ancestors, persists them and retains unrelated collapsed folders
ok 2 - manual re-collapse survives rerender and inactive-chat return until tree mode resets
ok 3 - inactive or absent file selection never unfolds stale diff selection
ok 4 - only a file view belonging to this workspace reveals the current file
ok 5 - same file path in a different workspace reveals only that workspace's persisted ancestors
ok 6 - an inactive Changes panel does not reveal until the Changes consumer is mounted
# tests 6
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Original GREEN stdout SHA-256:
`315f9edb724cea23eb5d9c074965c6b0b39b574f095d017a611641a8f2d9968f`.

### Related controls were partial and stopped

At 09:30:51.263686–09:30:52.052160 UTC, the owner ran:

```bash
timeout --kill-after=5s 60s bash -c \
  'cd .rea-work/ui-runtime/frozen-selected && exec node --experimental-strip-types --test --test-concurrency=1 src/features/diff/changesFilter.test.ts src/features/diff/changesPresentation.test.ts src/features/diff/changesTree.test.ts src/features/files/tree.test.ts'
```

The filter (7), presentation (7) and files/tree (8) cases passed: **22 passes**.
`changesTree.test.ts` failed to load because `src/features/diff/viewed.ts` was
not staged into the reduced snapshot. This was a fixture setup failure, not a
product assertion failure. The combined command exited 1 and stopped the unit;
there was no automatic retry, package installation or assertion change.

```text
# tests 23
# pass 22
# fail 1
# cancelled 0
# skipped 0
# todo 0
```

Original related-control stdout SHA-256:
`c8358c3e5a4b0331525920d9567e2087cc9982918be115d857a9a4b3cb48b090`.
The sole runtime slot was released at 09:30:52.052160 UTC.

## Delivery checks and remaining limits

- **Passed:** fresh-main 13-source-pin comparison; exact candidate/fixture byte
  equality; all 15 retained reference-span hash checks; `git diff --check`.
- **Not run locally:** full-project `tsc --noEmit`, build, or the complete related
  suite. The reduced snapshot has no complete root resolver, @types or Tiptap
  dependency tree. Ordinary exact-head hosted CI must validate the full tree
  before protected merge. Its Diff frontend job includes the new fixture.
- **Not run:** browser, native, reference-mounted, visual or live-provider
  acceptance. No screenshot is supplied because this admitted execution was
  Node/React-only. Mounted behavior proof is not installed-app acceptance.
- **Pending at publication:** exact-head hosted CI, protected merge and the
  consuming-main macOS package. A package pass will not close native/visual gaps.

The ready pull request is based directly on main, not another pull request.
Conductor Rebuild retains hosted CI, merge and consuming-package follow-through.
