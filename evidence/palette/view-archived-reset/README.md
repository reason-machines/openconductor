# View archived workspaces resets project restrictions

Authored by Conductor Rebuild. Unit `PALETTE-VIEW-ARCHIVED-RESET-PROJECTS-15-03`.

## Change and source

The command now uses `CLEARED_FILTERS` instead of retaining the current project list while changing only the archive filter. It opens the Workspaces tab, clears the query, keeps the palette open, and does not overwrite Home's saved filters. Ordinary tab navigation and manual filter persistence remain unchanged.

Checked containing main `f62f81ab` on branch baseline `52dea811`. Retained real-Conductor 0.87.6 REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` identifies renderer `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The retained `m_a` action at UTF-8 offset 10,889,115–10,920,819 sets the initial Workspaces filters to `{showArchived:true}`. `Gba` at 10,875,438–10,875,615 projects omitted projects to `[]` and `showArchived:true` to archive filter `all`. `Kba` at 10,875,642–10,876,174 initializes local state from that projection; saving is a distinct manual apply operation. Span identities are retained in [source.json](source.json). These are static retained REA observations, not a new original-app runtime or side-by-side observation. No original renderer code was executed.

## Original frozen execution

All commands ran sequentially on Reason Cloud computer 352 under ACC grant `4b79ecf6`, with no native/provider/package execution.

- `npm ci --ignore-scripts --no-audit --no-fund` passed, exit 0. The root lockfile stayed SHA-256 `0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a`.
- Original frozen regression SHA-256 `8b8bcf8f59d3038643ac80c6a652e2a27232c2b1102608e3f54f93a4d698d153` reproduced **three product assertion failures and one passing control**. The failures omitted the other project's rows, not setup failures.
- After the one-line product change, the **identical original frozen bytes passed all four tests**. No assertions changed between RED and GREEN.
- The five retained neighboring test files passed **95/95**, exit 0.
- The first typecheck **failed**, exit 2, on three diagnostics in the original frozen test harness. Its full log is preserved, not relabeled as a pass.

Identical original RED/GREEN command:

```bash
timeout -k 10s 120s nice -n 19 env NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 src/palette/viewArchivedReset.test.ts
```

Adjacent command:

```bash
timeout -k 10s 120s nice -n 19 env NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 src/palette/paletteComposition.test.ts src/palette/state.test.ts src/palette/tabSelection.test.ts src/palette/workspacesTab.test.ts src/palette/fromAppState.test.ts
```

First typecheck command:

```bash
timeout -k 10s 180s nice -n 19 env NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck
```

Raw TAP, logs and exit files are adjacent. Runtime was explicitly released at 2026-11-12T15:39:55Z after the typecheck terminal failure. `preview_stop` confirmed no running server, and the process listing contained no own Node/npm/Vite/Chromium jobs. No browser/server was started in that admission.

## Type-safe delivery copy

ACC disposition `fdbd030d` permits source-only compatibility corrections. [original.test.ts.txt](original.test.ts.txt) preserves the original frozen executable bytes and the original fixture sources remain inert alongside it.

The published `src/palette/viewArchivedReset.test.ts` differs from the original only in fixture typing:

- Use boolean `true` for the declared `Workspace.userSetWorkspaceName` field.
- Bind the exported component to a stable, asserted local constant before using it in the async callback.
- Derive the `onSelect` parameter type from the real `CommandPaletteProps` callback signature.

[compatibility.diff](compatibility.diff) records the complete transformation. All four cases, behavioral assertions and boundary mocks remain unchanged. No production type, test assertion, configuration or exclusion was weakened. The browser fixture's name flag uses the same boolean correction.

Corrected delivery test SHA-256 is `d0c2dde58cef115ab551f74e5fa70a5927bb06814040ef95ff781bdcd2afe9df`; corrected browser fixture SHA-256 is `00e6e756f2539128a2ee5febe527596e1385e3f7c11881f3441888f3d94207db`. These are **not** original-byte-identical inputs. They have not yet been executed locally after the correction.

## Remaining verification and scope

A remaining typecheck and supported Vite/browser pass are queued as a continuation of the same ACC entry. No automatic retry or duplicate executor was started. The intended visible route is `/evidence/palette/view-archived-reset/fixture.html`, mounting the actual CommandPalette with two synthetic local projects and no native backend. Browser proof and screenshots have **not run** yet.

Native focus, real database/provider behavior, original-app side-by-side visual parity, installed/package behavior, and release inclusion remain **unverified**. The existing release cut is unchanged. Project-filter keyboard, M11, and Open in transport work are excluded from this change. Merge waits for every enabled exact-head check and the remaining scoped verification.
