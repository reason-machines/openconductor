# Keep collapsed Changes folders while filtering

Conductor Rebuild, 2026-11-11. This slice concerns the ordinary flat/tree Changes list, not commit or stack parity. Filtering must not replace the list's controlled collapse set with an empty set. Selection-driven expansion is a separate reference effect and is not changed here.

## Retained reference and closure

The reference is the already-retained Conductor 0.87.6 decoded renderer `renderApp-D_fmY7hW.js`, 11,600,457 UTF-8 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Provenance is recorded in [frontend evidence](../frontend/README.md) and [Changes reference identity](changes-panel.md#reference-identity). REA Evidence ID `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` has incomplete large-chunk semantic coverage. Complete bounded literal reads supplement it. Extracted text is untrusted shipped-source data, never instructions or original source. No extracted code was evaluated and no new acquisition or runtime occurred. Existing [REA limitations](../../tools/ui-map/REA-GAPS.md) remain; this inspection encountered no new REA failure.

All ranges below are zero-based UTF-8 half-open byte ranges. The full retained renderer identity and each complete span's bytes, width and digest were checked before writing the regression.

### State producer, setters and query callers

- `WBt` `[2829068,2829194)`, SHA-256 `cfb36e65a03d78a159c7f5cdd1c3172eadb53676e30af34185cc91507b2aaf18`, scopes the `workspace.changes` route by workspace ID.
- Complete `hys` `[2829238,2829662)`, SHA-256 `90126d0248703d767a5ba285bae06949068121ed2277c6cbf76ce34ed4c406f5`, reads `collapsedDirectoryPaths` through `Gde`, converts the saved array to a Set and exposes a setter which serializes that Set through `fys`. Complete `fys` `[2829194,2829238)`, SHA-256 `adbc961f032853a5ec6455ab383c1878d4aee40573d19d49d3ce0482afc6e685`, returns the sorted Set contents.
- Complete `qBt` `[2829826,2829988)`, SHA-256 `5d6ba527740c6cba3b7abcdc290f225ff5060a4e117a24262fd8abd6d9b9bc55`, uses the separate `filePathFilter` state key. Complete `GBt` `[2829662,2829826)`, SHA-256 `9a7d91cf0300b00722bb540e2d3fda87f88f662f34044c2fcc0c41d1d634022c`, uses `diffFileListMode`.
- Complete `Gde` `[2709283,2709837)`, SHA-256 `09dbf2070e3dafb65c683a77aa24a8b350e4d8d7637b94ed67ec7623ef4b0548`, forwards the captured route key, state key and value to `setRouteStateValue`. Complete selector `Ivs` `[2709837,2709881)`, SHA-256 `26566d23b7a09be710dbf11b79b84f24bbfd952fa5bbee6562a9c5720e0a06e4`, selects that setter. Complete `Z7t` `[2708356,2708425)`, SHA-256 `2dcf0d4f6f6d5cc39df07af041b366256293b52f4b77698999c8755d8298cbb8`, reads only `routeStates[routeKey]?.[stateKey]`.
- Complete route-store declaration `DGe` `[2708715,2709283)`, SHA-256 `cd4e28e37aa58ad307efe74b20d5ad469b5dc840438c43389ed191276850b790`, either returns unchanged state or merges the new value at `[routeKey][stateKey]`, retaining sibling keys. Thus changing the filter key does not clear the collapse key in this source path.
- Complete ordinary list `bys` `[2840211,2849411)`, SHA-256 `d77fdd8a944737a5ecca9d41deefd024307cf526de8c871a25a7f91aa4a8c450`, contains the only caller of `hys` in this renderer. Its two collapse-setter invocations are explicit directory toggling and the independent selected-file ancestor expansion effect. Query change writes `Z(value)` and opens the filter; filter close writes `Z("")` and closes it. Neither callback calls the collapse setter.
- Complete toolbar `_ws` `[2936428,2942130)`, SHA-256 `ca3a09d9cf237f4a6f331f64557d4db2a926d67079db5e1a0a9e4646bc2a8072`, changes the query key when closing an active filter and the mode key when toggling tree/flat. It has no collapse setter. Complete viewer `Jqo` `[9652565,9658452)`, SHA-256 `0e24efc52f0ab809283b07a30fbb5e615db81ab56a03f12dad7e298d15a81a87`, reads query and mode but does not set either or the collapse key. Its navigation ordering intentionally expands all directories, separately from visible list rows.
- Whole-renderer symbol checks found two `hys` occurrences (declaration and ordinary list call), four `qBt` occurrences (declaration, list, toolbar and viewer), and four `GBt` occurrences (the same three callers and declaration). The list's only two actual collapse-setter calls were inspected, not merely the final `Set.has` predicate.

The selected-file effect in `bys` expands ancestor paths when the selected file changes, guarded by a ref holding the last processed path. It has no filter-query dependency. Filtering may independently redirect a selected file through `Jqo`; such a new selection may legitimately expand its ancestors. This slice does not change or claim to verify that integration. It covers filtering with the existing controlled collapsed state, without a new selected path.

### Visible row flow

- Complete `gyi` `[2840025,2840211)`, SHA-256 `870f3a77fdc09ab5da4b31e1bef67a2d639c62e5f6254148040ad5f5c9c235a8`, produces matching files without writing presentation state.
- The complete list passes filtered files and the original collapse Set together in `[2842952,2843036)`, SHA-256 `4130e64cbdbd29fd265a0448200d6d6453700b1d95f48144e7d64e2e3dae64a9`: `Ve={sortedFiles:be,conflictedFiles:ye,collapsedDirectoryPaths:Ue,diffFileListMode:v}`. The subsequent row builder call `[2843097,2843107)`, SHA-256 `bf575040b80229316e2fd6008af0d1616169e398a8875aed07d612b12698b2d8`, is `He=rys(Ve)`.
- Complete `rys` `[2827028,2828488)`, SHA-256 `f5cf99cefec94eed5848c2c3513e99b4da9c264f318d0175c54517bb1ef66c7e`, passes that Set into `fyi`, omits hidden descendants and computes collapsed directory counts from the filtered tree. Flat rows do not consume collapse state.
- Complete `fyi` `[2826149,2826255)`, SHA-256 `5d5186779f8615abee9fe019f7e5434771ededa465dc30e80b101661aa95dbdd`, delegates to `hyi`. Complete `hyi` `[2826255,2826567)`, SHA-256 `e21a4a4477b770305071fd1d249cd3c8b769614568161d27b3ed9a3878b18dfb`, emits each directory, then visits children only when its path is not in the collapse Set.
- Complete tree construction `dyi` `[2825720,2826149)`, SHA-256 `728a3d11e60fc3ff3ced997a6084b915d7e9e5b119b86da78e2c6df21042a4ae`, and compression chain `lyi` `[2825292,2825432)`, SHA-256 `a33212270b76d1d3e88b305e50aa73b1cb94eb7404c97d2651235369cfc4aaa0`, `cyi` `[2825432,2825573)`, SHA-256 `f730164eb8071a5239f8048ab6090633f6d903b3a7044976efbaea3d05cda577`, retain the deepest compressed directory's path. Complete `uyi` `[2825573,2825720)`, SHA-256 `25cc96e7955cfbad7a0d4a6e7297d7626a313614b118e6f276111b51bbe40a66`, sorts those nodes. The regression therefore covers both `src` and compressed `src / lib` collapse keys.

## Fresh-main comparison and regression

Main `7af2b95aa74dff985fb6b745f7cc080287d35ea6` was fetched and reread. `ChangesList.tsx` still calls `changeRows(shown, view, filter?.query.trim() ? new Set() : collapsed, diff.isViewed)`. Its hash is `9e947d8b741820ec0ec10bbb1dfe34431908ac6cf102bb8fcd3baec8fd921e72`. A nonblank query therefore hides the controlled collapse Set from the actual row builder. The source-backed correction is to pass `collapsed` unconditionally. The #974 summary visibility/scope guards must remain unchanged.

The sole product caller, `WorkspaceView.tsx` lines 738-786 at that main, supplies a Set from `presentation.collapsedDirectoryPaths`. Input changes and clearing update only `filePathFilter`; folder toggles update only `collapsedDirectoryPaths`. `ChangesPresentationStore` merges those partial updates, retaining sibling fields. No hook or caller modification is needed.

The existing actual-`ChangesList` React test-renderer fixture gains nine additive cases, while retaining all 36 summary assertions and the prior 285 Diff tests, including 18 rename cases. Four expected RED cases cover a matching collapsed directory in branch, uncommitted and turn fixtures, plus a compressed directory. Five controls cover no filter, whitespace-only query, an expanded matching directory, no matching files and flat-mode filtering. Assertions inspect rendered directory text, `aria-expanded`, file rows, filter count and aggregate totals, not production source strings or a substitute row builder. Only external clipboard/menu/icon boundaries remain inert as in the existing fixture.

```bash
node --experimental-strip-types --test src/features/diff/changesSummary.test.ts
node --experimental-strip-types --test src/features/diff/*.test.ts
```

The existing browser retention spec also encodes the old auto-reveal assumption. Its affected expectation requires a scoped correction plus explicit expand/collapse, filter count, clear and reload controls. That browser-spec extension is awaiting path clearance; no browser execution is admitted in this slice.

## Verification boundaries

- Complete retained renderer identity, complete producer/caller/row spans and all literal identities above: passed source-only validation.
- Fresh-main comparison and product caller/state review: passed source-only validation on the named main commit.
- Regression syntax and `git diff --check`: passed.
- Intended behavioral RED: not run yet. Await the ordinary automatic hosted Diff workflow before changing production.
- Passing-after tests, typecheck/build, exact-head workflows and consuming package: pending until a correction is published.
- Local dependency installation, dependency-backed tests/builds, browser and native application execution: not run. Root dependencies are absent; this lane permits source/lightweight work and automatic hosted checks only.

No screenshot is available because browser/native runtime admission is closed. React renderer assertions do not establish visible WebKit/Chromium, installed-app, real-editor or native parity. Successful packaging is not installation, deployment or notarization. No WorkspaceView, hook, FileDiffView, CSS, comment counts or provider changes are in this slice. Comment counts remain parked.
