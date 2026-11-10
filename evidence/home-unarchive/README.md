# Restore an archived workspace directly from Home

Conductor Rebuild, 2026-11-10. Hosted RED is recorded in [the exact-head receipt](hosted-red.md). The reserved product fix now adds the Home row control; hosted GREEN remains pending. PR #849 merged separately after all 21 checks passed; its source lease was released before this unit began.

## Retained reference

[The static receipt](reference-static.json) records decoded Conductor 0.87.6 shipped JavaScript, tied to REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Existing evidence owners read retained archive members. This Session did not re-extract or execute Conductor.

- `w_` resolves the hosting-server URL; `t9e` normalizes every local workspace to `write`. `xXe`/`MXe` select the workspace and `kYt`/`Ld` read the normalized permission.
- `_Jo` derives archived state; `vJo` selects `yJo` for archived rows. `yJo` renders a passive mark for `read`, otherwise a button named **Unarchive workspace**, disabled while pending.
- Click and Enter stop propagation, prevent default, and invoke the existing `BYe`/`HYt`/`Z2` restore mutation. The normal archive icon changes to Lucide `rotate-ccw` on row hover or control focus; this is not `ArchiveRestore`.

Only OpenConductor's local Home list is in scope. No cloud UI, permission model, store, backend, dependency or workflow changes are included. Static evidence does not establish native interaction, and opaque ancestors have not been exhaustively traced.

## Regression boundary

`tests/e2e/sidebar-archived-view.e2e.mjs` adds two actual-store cases (click and Enter). Each archives a demo workspace, opens Home's **Only archived** filter, and requires restoration without navigating or selecting the workspace. Existing row-opening and sidebar archive assertions are unchanged.

The same suite mounts production `AllWorkspaces` through `tools/home-unarchive/index.html` using the existing, unmodified Vite fixture helper. Its dispatch records actions without restoring files; real archive events control completion. The controlled cases cover click/Enter, no bubbling or row navigation, per-row pending, duplicate suppression, unrelated workspace/repository events, retry after failure, a no-restore completion, and independent row-name navigation. This fixture is not a backend or native restoration substitute.

The ordinary Keybindings workflow already runs `npm run test:e2e`, which includes this file. Its regression-only head exposed five direct missing-button failures, while the independent row-opening control passed. Only after that RED did the product fix replace the passive mark with a tooltip-wrapped button. It dispatches the existing restore action, prevents click and Enter propagation/default behavior, suppresses duplicate activation synchronously, and settles pending only on a matching repository/workspace terminal event. The icon uses the retained archive and rotate-ccw geometry, switching on row hover or button focus. All interaction assertions and controlled fixture inputs are unchanged.

No local test, build, install, browser or native runtime is admitted for this source-only unit. The same assertions must pass on the fixed head before merge.

## Checks and limits

- **Passed earlier:** all 11 retained excerpt byte lengths and SHA-256 digests; see `verify-reference.mjs`.
- **Historical rendered RED:** `node --experimental-strip-types --test evidence/home-unarchive/render-probe.mjs` recorded two passing controls and one missing-button failure in `render-red.tap`. Its source digest is retained in the output. It was not rerun on the current main head and is not mounted behavior proof.
- **Passed:** source diff whitespace checks and exact equality of the interaction test and controlled fixture against the regression checkpoint.
- **Failed before the fix:** five direct Unarchive cases timed out on the absent button at published head `4d799fa4456369779ba34641be76987d536e6781`; their parent group also failed. Existing archive controls and independent row opening passed. See [hosted RED](hosted-red.md).
- **Failed on the first fixed head:** Frontend unit job `129748634879` at `29d62d935b2049baf402fa6864f55b90ffaf3570` reported five `Unexpected Home dependency: ./Tooltip` errors in the existing Home repository-icon SSR loader. The follow-up adds only its missing import adapter. All original icon assertions, inputs and Unarchive interaction tests remain unchanged. Merge was refused, not queued.
- **Pending:** automatic exact-head hosted results after that test-loader adapter.
- **Not run locally:** new interaction cases, semantic fixture typecheck, application build, install, browser/native interaction, worktree/setup/persistence, tooltip/layout, side-by-side acceptance, and screenshots.

There are no screenshots because local browser/native execution is not admitted and the existing hosted workflow does not retain Home screenshots. `SCREENSHOT_DIR` continues to support captures when a later authorized acceptance run supplies it.
