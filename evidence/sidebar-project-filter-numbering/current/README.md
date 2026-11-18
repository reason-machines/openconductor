# Project-filter numbering: bounded production fix

**Implemented and locally verified by Conductor Rebuild on Reason Cloud.** The frozen 12-case fixture was committed first as `576088ea9`; its SHA-256 remains `3116f4291371e127b6b5dc08afa29eb6213c9e834eb400fa47761b430562d217`.

## Fresh-main RED → unchanged-fixture GREEN

Pinned default head: `1b2d83e6c2e2b3fa2eb251fc25a56d96401d96f1` (fetched this implementation turn). Both its exact source export and the unchanged working production tree reproduced **12 tests: five controls passed, seven intended assertions failed, zero harness errors/skips** before the edit. The identical fixture then passed **12/12** after the edit, including the actual normal preference producer, mounted visible hint and registered numbered-shortcut dispatch.

Only `src/state/sidebarOrder.ts` / `sidebarEntries` / the repository-group arm changes: apply the existing `sidebarRepoFilter` predicate before `flatMap`, exactly as `statusGroupEntries` already does. Pinned and section prefixes, the status branch, sorting/collapse helpers, hidden/archive policy, rendered rows, preferences/store, palette consumers and keybinding handlers are unchanged. This fixes Beta-only filtering to hint 1, Command-1 → Beta, and Command-2 → no target without deleting either loaded project.

Commands and results:

- `python3 evidence/sidebar-project-filter-numbering/current/verify-implementation.py red`: **passed the RED acceptance check** (baseline and candidate each exited 1, five passes/seven intended assertion failures). Logs: `fresh-main-red.tap`, `candidate-red.tap`; result: `implementation-red.json`.
- `python3 evidence/sidebar-project-filter-numbering/current/verify-implementation.py green`: **passed** (same pinned baseline still RED, candidate 12/12 GREEN). Logs: `fresh-main-red-recheck.tap`, `candidate-green.tap`; result: `implementation-green.json`.
- Both verifier phases checked **all 1,259 pinned source files**, the exact fixture hash and original six-test hash before/after replay. GREEN permits only the exact single repo-arm predicate replacement; every other pinned production source stays byte-identical. This is source identity evidence, not 1,259 behavioral tests.
- `node --experimental-strip-types --test evidence/sidebar-project-filter-numbering/current/adjacent-controls.test.ts`: **23/23 passed**, comparing the candidate with the exact pinned baseline for no-filter order, status grouping, cross-project pin/section prefixes, collapse/sort, existing hidden/archive policy, unknown filters and non-mutation. The first supplemental invocation had an off-by-one relative import path and did not run tests; that runner-only error was corrected without changing the frozen fixture. Its raw log is retained as `adjacent-controls-initial-harness-error.tap`; the corrected run is `adjacent-controls.tap`.
- `node --experimental-strip-types --test --test-concurrency=2 src/state/*.test.ts src/home/*.test.ts src/palette/*.test.ts src/keybindings/*.test.ts src/components/*.test.ts`: **1,372/1,372 passed**, zero failures/skips. Raw log is losslessly retained as `adjacent-legacy.tap.gz`.
- `npm run typecheck`: **passed** (`typecheck.log`).
- `npm run build`: **passed** (`build.log`), with Vite's chunk-size advisory; no build error.
- `npm run lint:colors`: **passed**, six checker tests and the repository color scan (`lint-colors.log`).

`implementation-checks.json` records log hashes and decisive results. No browser screenshot was taken: browser/native/runtime execution is explicitly outside this serialized lane. The rendered check is React's in-memory tree, **not** visual, installed-app or OS-key delivery acceptance. Tauri/SQLite persistence, provider behavior, native/package containment and runtime embedding remain unverified/not run. No acquisition, watcher or release dispatch occurred; release acceptance stays with the existing owner.

The original `reference/**` custody remains read-only. The handed packet is reused; no original extraction or vendor-JavaScript evaluation was repeated.

---

## Historical qualification (preserved)

**QUALIFIED, with actual RED. No production lease or implementation.**

Conductor Rebuild checked main `e6f9dfcb2eb9e12dc3b1c67c41baa268236f7269` on Reason Cloud. The test ran against an exact `git archive` export of that commit's `src` and `package.json`, not an assumed up-to-date working branch.

## Closed contract and witness

The held Conductor 0.87.6 REA packet from SAMEde6 closes the local `hBi` filtered sequence through `_ea`, `bea` and the displayed number, and the same sequence into numbered navigation. Local scope excludes the cloud-only tabs substitution. This qualification uses only its minimal witness: two loaded, expanded local projects, one ordinary active workspace per project, Alpha before Beta, Project grouping, Home selected and the normal project filter set to Beta. There are no pins, shared rows or custom sections.

Expected: sequence `[beta-row]`, Beta hint 1, shortcut 1 targets Beta and shortcut 2 has no target. Actual current-main selectors return `[alpha-row, beta-row]`, Beta hint 2, shortcut 1 targets Alpha and shortcut 2 targets Beta. The normal rendered repository-group filter independently returns only Beta.

The initial source joins and selector-only run are retained in `qualification.json` and `red.tap`. The strengthened replay in `consumer-qualification.json` now executes the actual project radio click through `useRepoFilter`, `appPrefs` and `useAppStore`, mounts `Sidebar` and `SidebarWorkspaceRow`, and dispatches Command-1/2 through the real registry, `bindCommands`, dispatcher and `PaletteHost` numbered handlers. It verifies actual `select` actions and the real store reducer, not only the shortcut-order array.

This is an in-memory React component replay, not a launched application: preference storage uses the actual browser-fallback path with isolated fixture storage; native invocation is forbidden. Geometry/portals/time and the `useKeybindings` React glue are adapters. Unrelated features, effects and decoration are inert. OS/window key delivery, browser layout and native persistence are not exercised.

## Frozen regression

File: `src/sidebar/sidebarProjectFilterNumbering.test.ts`

Current 12-case fixture SHA-256: `3116f4291371e127b6b5dc08afa29eb6213c9e834eb400fa47761b430562d217`.

The six original selector tests remain byte-identical after removing added imports and the supplemental replay: original SHA-256 `bbea95554e60381830e80fe5980fa63583a7f39db2aa90dcd66d211c6a2e286e`.

The frozen replay verified the fixture before/after and all 1,256 exported main source files against their exact Git blobs, then checked them unchanged after the run. The tracked diff stayed empty. To recreate the exact baseline from this checkout:

```bash
mkdir -p .oc-tmp/sidebar-project-filter-numbering/main
git archive e6f9dfcb2eb9e12dc3b1c67c41baa268236f7269 src package.json \
  | tar -x -C .oc-tmp/sidebar-project-filter-numbering/main
mkdir -p .oc-tmp/sidebar-project-filter-numbering/main/src/sidebar
cp src/sidebar/sidebarProjectFilterNumbering.test.ts \
  .oc-tmp/sidebar-project-filter-numbering/main/src/sidebar/
node --experimental-strip-types --test \
  .oc-tmp/sidebar-project-filter-numbering/main/src/sidebar/sidebarProjectFilterNumbering.test.ts
```

**Strengthened actual result:** exit 1; 12 cases; five passing controls and seven assertion failures: the original four selector failures plus visible hint, Command-1 selection and Command-2 no-target failures. No loader/harness errors, cancellations or skips. Full output: `consumer-red.tap`, SHA-256 `5118362ec34d4613f6b1ecc2d82b57066c4f8068ed09657a728e778693fec363`; summary, exact source hashes and limits: `consumer-qualification.json`.

The passing mounted controls exercise unfiltered hints/dispatch, the normal Beta radio producer and full-repository preservation, and the normal All projects radio restoring both labels/hints/targets unchanged. The Beta-only rendered label is `Beta row`, with a visible hint `2` and `aria-label="Switch with Command-2"`. Real Command-1 dispatch selects `alpha-row`; real Command-2 dispatch selects `beta-row`.

`verify-consumer-freeze.py` reproduces the frozen run, packet identity, old-test identity and unchanged-source checks. It requires the two handed original uploads in this Session's attachment staging directory; it never extracts or evaluates the original renderer. `qualification.json` and `red.tap` remain the historical six-case selector-only result, not the stronger consumer result.

## Original-reference custody and verification

The original source packet and verifier were transferred with their exact recorded SHA-256 hashes verified. The packet-only verifier passed here: 25 complete retained spans, 23 literal joins, eight predicate-translation controls and six consumer-translation controls. Its output is `reference-transfer-check.json`.

SAMEde6 independently reported full held-renderer hash/byte and span parsing checks passing. This current-only helper did not repeat that original extraction or full-asset verification after the scope split. No vendor JavaScript was evaluated. The two original attachments remain under SAMEde6/Home271 reference custody; they are not rewritten under this current-only evidence directory.

Reference packet attachment: `292abcb2-2baa-4baa-8ab3-fe0b080b66cf`, SHA-256 `5e704cf8e4df1f325992613f051bf7f21de164057eb38cb9846e2b324a52c627`.

Verifier attachment: `75f921a9-1f3d-4cc3-a57f-c2028a9f86af`, SHA-256 `08408455c80d52c7745cd3b549d71a1dbf12cd62f5b69a30f1468f478076b6cc`.

## Explicit limits

- This is a bounded source-backed regression, not a general rule that arbitrary visible rows must be consecutively numbered. #757's visible 1 and 3 are not used as an oracle.
- No general multi-row sorting, custom-section, pin/shared-prefix, hidden/collapse, cloud/tabs or pending-launch acceptance is claimed.
- Only the new qualification test and this `current` evidence directory were written. Existing production files and #1430 were not changed.
- No fix/GREEN replay, typecheck/build/full integration, real browser/DOM/native/package/provider test, fresh REA acquisition, watcher or release dispatch was run. React's in-memory renderer is the only rendered-consumer check; it is not a screenshot or native acceptance result.
- No commit or PR was created: publication and production implementation were outside this qualification-only assignment.
