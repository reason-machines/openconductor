# Projects keyboard navigation and activation

Conductor Rebuild reproduced and fixed a Projects activation mismatch. After visiting Accra, filtering Projects to `tide`, pressing ArrowDown to select `tide-api`, and pressing Enter, Conductor returned to Accra. OpenConductor opened Tallinn, that project's first workspace. The fixed app returns to Accra.

## Reference and tested source

- Reference: decoded frontend from Conductor 0.87.6 on Sven's Mac, asset `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. No new extraction or native launch.
- Static contract in `m_a`: Projects items select `project-${id}` through `_a = OS`. The handler prefers the first nonarchived matching entry in recent workspace order, then the nonarchived matching workspace with greatest `updatedAt`. The comparator is `__a(t,e) = e.updatedAt - t.updatedAt`. No target calls `g5()` with the repository ID; its internals were not established here.
- Runtime: REA 6.8.0 `capture-browser-scenario`, Chromium 155.0.8059.84, 1280×820, dark theme. OpenConductor's fake settings explicitly select Dark and Stone. Conductor uses system Dark and its Stone palette.
- Both apps use the invented populated seed's three projects and six workspaces. Tauri IPC is mocked. The OpenConductor seed is [projects-fixture.mjs](../../../tools/palette/projects-fixture.mjs).
- The before build uses main `154ba0da`. The after build uses that base plus the `PaletteHost.tsx` and `projectWorkspace.ts` changes, whose exact content hashes are in [checks.json](checks.json). Main `70bf6c5e` was merged after capture; it adds only sidebar evidence. These are not screenshots of the final published commit or a native package.

## Behavior exercised

Both reference and OpenConductor passed the retained navigation scenario: type `tide`, confirm two rows, then ArrowDown, ArrowUp, ArrowUp, ArrowDown, Ctrl+N, Ctrl+P. Each step asserts the selected project. This establishes forward and reverse movement and wrapping across distinct filtered rows, not a single-result label check.

The activation scenario first opens Workspaces, types `pagination`, presses ArrowDown and Enter to visit Accra, then opens Projects and activates the second filtered row with ArrowDown and Enter. The reference's final URL contains `repo-tide-api/workspace/ws-accra`. Before, OpenConductor's header is `tallinn`; after, it is `accra`. All final scenario steps completed. [checks.json](checks.json) records the REA IDs, raw-record hashes, and those exact assertions. The input scenarios are retained beside it.

## Checks

- Red: the old first-workspace policy passes 1 and fails 2 of the 3 isolated target-selection cases. [unit-before.tap](unit-before.tap).
- Green: `node --test src/palette/projectWorkspace.test.ts src/palette/state.test.ts` passes 7 tests. [unit-after.tap](unit-after.tap).
- Green: `node --test "src/**/*.test.ts"` passes 1,313 tests. [all-unit.tap.gz](all-unit.tap.gz).
- Green: `npm run build`, `npm run lint:colors`, and `git diff --check` pass.
- Green: `node --test tests/e2e/palette-projects.e2e.mjs` passes both built-app checks. [browser-after.tap](browser-after.tap). The capture run supplied `PALETTE_PROJECTS_BASE_URL` to reuse the owned preview; without it, this test starts Vite preview in its normal test setup.
- Visual: reference, before, and after screenshots were opened and inspected. [Review page](review.html). Only the activated workspace is compared, not whole-screen pixel parity.
- Lifecycle: the bounded cloud proof slot ran 02:06–02:15 UTC, with controlled harness restarts. The final owned server `0f506e5f-5875-417e-9ce4-de490187ae9c`, port 4518, was stopped with an actual process-group-ended receipt. [Shutdown receipt](preview-stop.json). No further preview or capture is planned.

## Limits and REA gaps

- Native app behavior, real agents and authentication, clipboard, IME, modifier-number workspace activation, Home/End, and platform-specific key interception were not run. Home's shortcut work remains separate.
- The newest-workspace fallback and missing/stale recent IDs are unit-tested. The reference runtime case exercises the last-viewed path, not that fallback or an empty project.
- Initial unfiltered Projects focus remains a separate gap. Direct browser observation showed no reference row selected before typing. This change does not alter initial selection or the Workspaces tab's selection policy.
- The reference screenshot includes an expired Virtuoso development-license banner and mocked PR-data error. Neither is a defect introduced by this change.
- An initial REA capture from an isolated Bash process could not navigate to the preview. Running the same capture as an owned preview child fixed the execution context. No evidence from the failed attempt is counted.
- REA returned exit code 0 and an Evidence ID even when a scenario action failed and later actions were cancelled. An early hidden-input selector also matched the Workspaces filter's hidden input. The final scenario uses `input[placeholder]`; every step's status, not process exit alone, must be `completed`. Earlier incomplete captures are superseded by the final IDs in [checks.json](checks.json).
- The read-only static trace could analyze only a supplied bounded slice on its separate computer. Its full-asset provenance was parent-supplied; the runtime reference asset was directly rehashed in this Session. No graph-only claim about keyboard behavior is made.
