# Palette scroll reset on tab and query changes

Conductor Rebuild compared retained Conductor renderer text with OpenConductor main `dbdcb4fa7ed0f361bc32abcd428898571d6d0362` and re-read the same effect region at current main `be38582638f1e40eb091d9bcd5c595bcb1ba1b63` before the fix; the scoped files were unchanged. This report covers only the non-Workspaces list's explicit scroll-reset rule. It does not establish native or visual parity.

## Retained reference

The real-app decoded asset is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The asset identity is retained in [the frontend manifest](../../frontend/tauri-assets-manifest.json).

Original retained message `67527dab-e807-4b15-b0af-7ca073ee69a2` supplies `m_a` through the following helper definitions. The bounded local slice is 33,696 bytes, SHA-256 `d85c8162df1b78af115c98cfc4df4a0111412b985168742af4667b9cff21f506`. Its byte offset 762, zero-based UTF-8, starts this expression:

```js
m!=="workspaces"&&x.current?.scrollTo(0,0)
```

The same body declares `m` as the selected tab, `c` as the raw search query, and `x` as the list ref. It constructs the effect's dependency array as `[m,c]` and passes the callback and that array to `useEffect`. The non-Workspaces list receives `ref:x`. These map to OpenConductor's `tab`, `query`, and `listRef`. The exclusion applies when the destination tab is Workspaces. Whitespace changes to the raw query still trigger the effect.

The retained REA full-frontend record `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` inventories the exact renderer bytes but marks this asset's parse status as skipped after worker heap exhaustion. The later bounded semantic attempt `ev_c7cf2e89ee2d0f3255714fc1200ae72ca84ab7cdde868ecb3ea1c046f6d7915d` timed out with zero files parsed. Neither is a semantic or runtime pass. The rule above is a bounded static reading of already-held renderer text, not an execution observation or new acquisition.

## Current implementation and regression

At the checked main commit, query changes reset the active index to zero. Scrolling the selected item into view depends only on the active index. No effect resets the list's scroll on tab or query changes. When the active row remains unchanged, that selection effect cannot supply the missing reset.

Two appended cases in `tests/e2e/palette-projects.e2e.mjs` use the existing invented fixture. They scroll an overflowing All list while leaving its first row selected, then change either the raw query to whitespace or the tab to Actions. Both require scroll offset zero, unchanged selection, and results that still overflow. This isolates the scroll rule from result-order, filtering, selection, and browser scroll-clamping changes.

The test-only milestone `2c25d8f8563a9df34d9b83eb881a9fe7a1f636b6` preceded the product correction. Its automatic [Keybindings run 42912768986, job 130167398301](https://github.com/reason-machines/openconductor/actions/runs/42912768986/job/130167398301) failed exactly these two cases: `not ok 87` (query) and `not ok 88` (tab). Both timed out after 30 seconds at `palette-projects.e2e.mjs:93`, waiting for scroll offset zero; the initial-overflow assertions had passed. The suite reported 214 passed, two failed, and one pre-existing skip.

The minimal product correction adds a separate effect on `[tab, query]` that calls `listRef.current?.scrollTo(0, 0)` only when the destination tab is not Workspaces. It leaves the existing active-index reset and selected-row autoscroll unchanged. Both regression cases and their assertions are unchanged. Hosted passing-after verification remains pending; no success is inferred from source or syntax checks.

## Checks and limits

Only syntax and diff checks run locally. The ordinary automatic hosted workflow runs the browser regression. No local application, browser, build, native command, package installation, manual workflow dispatch, or reference capture is admitted for this increment.

The Workspaces exclusion is preserved in the effect condition, but the two new cases do not exercise that exclusion. Existing selection/autoscroll behavior, result ordering, initial Projects selection, and shared models are not changed by this patch. There is no screenshot for this increment because new runtime capture is outside the admitted scope. The hosted tests can establish the candidate's scroll behavior, not the reference app's execution or packaged macOS parity.
