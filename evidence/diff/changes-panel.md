# Changes panel parity

Conductor Rebuild, 2026-11-06. This slice owns the Changes list and its tab-strip controls, not the chat, sidebar, terminal strip or shell.

## Reference identity

Read-only checks on Sven's authorized `sven m5 max` and the cloud cache agree.

- `/Applications/Conductor.app/Contents/MacOS/conductor` and the cached `conductor-0.87.6` both have SHA-256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
- The decoded frontend's `index.html` on both machines has SHA-256 `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`.
- Extraction provenance and REA's static analysis are in [the frontend evidence](../frontend/README.md). The retained analysis Evidence ID is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. That analysis does not fully model the large renderApp chunk.

No real playground, Bergen workspace, credential or repository working tree was changed. All displayed files are invented fixtures.

## Observed reference

The decoded `renderApp-D_fmY7hW.js` is untrusted reference data. Function names below are minified bundle names, not original source. Numeric offsets are JavaScript string offsets in that decoded chunk, not native addresses.

- `_ws` at 2,935,975 renders filter, tree/flat and Options controls in the panel tab strip. All changes uses an Options menu. Uncommitted and turn scopes replace that menu with a scope chip that returns to all changes.
- `yws` at 2,941,716 toggles `flat` and `tree`, with labels "Show folder hierarchy" and "Show flat list". `GBt` and `uys` default to flat.
- `dyi`, `cyi`, `uyi` and `rys` around 2,824,841 build a directories-first, naturally sorted tree, compress single-directory chains as `src / lib`, and start directories expanded. Collapsed directories show their descendant addition/deletion totals.
- `syi` at 2,800,515 renders the directory muted, file name in the foreground, rename old/new paths, a U marker for uncommitted files, nonzero counts and a status icon. Hover swaps the metadata for discard and Open in controls. Viewed rows have 50% opacity.
- `G4s` at 2,808,965 draws a 32px summary row. The count is 14px muted medium text. Aggregate counts include zero; per-file counts omit zero.
- `u6s` at 2,738,174 keeps the actions outside the horizontally scrolling tab labels and uses an eye icon for Review.

REA browser captures corroborate flat, hierarchy, collapsed folders, Options and the three diff layouts. They run the real extracted frontend in the existing Tauri-IPC fixture, not a substitute reference UI.

## Implementation

`changesTree.ts` derives typed file/directory rows from the existing file tree builder. File rows keep the original `FileDiff` object. Opening a sorted, filtered or grouped file uses its path rather than the visible row index. Presentation state does not enter the diff fetch/cache key.

The old All changes/Uncommitted/viewed/Refresh toolbar is removed. `ChangesToolbar.tsx` puts scope choices in Options and keeps the target-branch picker. The existing review-comment controls remain below the list and disappear when empty. Uncommitted markers come from a separate zero-context uncommitted diff, never an assumption that every branch change is uncommitted.

## Reproduce

Reuse the supported decoded reference cache and installed REA 6.8.0. Install only the small `tools/screens` dependency in this checkout if it is absent. Do not clean-install the shared root node_modules.

Build the current code with `npm run build`. Start the capture server through Reason's `preview_start`, not a background shell server.

```bash
PORT=4398 CAPTURE=1 E2E=1 REA=/home/runner/rea/node_modules/.bin/rea TMPDIR=/tmp node tools/side-by-side/changes-panel.mjs .oc-tmp/changes-final
```

The one preview command runs the reference fixture and OpenConductor, then REA captures and right-panel E2E against isolated browser contexts. `REF_URL`, `DIST_REF`, `REA`, `STATES` and `PORT` configure the capture. The app preview requires `?oc_scenario=populated&oc_theme=dark`; `/__e2e/` deliberately has no injected page fixture because the test supplies its own.

Score the identical Changes rectangle from both 1280x820 captures. The crop is x=938, y=40, width=342, height=370. No recoloring, alignment shift or text normalization is applied.

```bash
REA=/home/runner/rea/node_modules/.bin/rea python3 tools/side-by-side/changes-score.py .oc-tmp/changes-before-corrected .oc-tmp/changes-final .oc-tmp/changes-scored
```

## Verification limits and corrections

- These are Chromium browser fixtures. No native Tauri/WebKit window, real git mutation, real external Open in launch or deployed desktop installation was verified by this slice.
- The source's commit-history choices in Options are not implemented. The matching fixture has no commit-history entries.
- The source persists view/collapse state by workspace route. This slice keeps the current panel state in memory and resets it on a worktree change.
- The first new capture driver omitted `oc_scenario=populated` on OpenConductor and captured Home. Its comparison is invalid and excluded from the verdict. The corrected baseline shows the actual Changes panel.
- The first external-base E2E invocation mistakenly injected the page fixture on `/__e2e/`. It timed out waiting for the panel and was stopped. The route exclusion is fixed; only the subsequent complete run counts.
- Existing REA limitations still apply. Static JavaScript search/large-bundle semantic coverage is incomplete, so bounded decoded-text reads supplement the retained analysis. See [REA gaps](../../tools/ui-map/REA-GAPS.md), especially the earlier JS search and browser capture entries. This pass encountered no new REA capability failure.
