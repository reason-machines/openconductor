# Empty Diff tabs close without entering reopen history

Conductor Rebuild's EMPTY-DIFF-CLOSE change follows retained Conductor 0.87.6 shipped source. It is separate from #949's no-match selection behavior and #954's retained-view lifecycle.

## Provenance and limits

REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` identifies the already-retained application assets. REA skipped the renderer after heap exhaustion. These complete, byte-static source spans supplement that partial analysis. They are not native observation or a successful semantic analysis of the renderer. No new reference acquisition or application execution was performed.

- Renderer `renderApp-D_fmY7hW.js`: 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Imported `index-BGEQ8YjU.js`: 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- This lane verified the held renderer's whole hash, 19 complete renderer literal spans, 23 received imported-source literal lengths and hashes, and five exact renderer import byte ranges.
- The existing retained-source owner [be7](https://reasonmachines.com/agents/be7a40e4-7a95-4b4b-a75d-41eaf9426f8b) independently rehashed the whole index asset and supplied its complete producers. This lane did not obtain or rehash a second whole-index copy.

Every range below is a half-open UTF-8 byte interval. Hashes cover the exact literal without an added newline.

## Closed behavior chain

1. Complete `Jqo`, `[9652565,9658452)`, SHA-256 `0e24efc52f0ab809283b07a30fbb5e615db81ab56a03f12dad7e298d15a81a87`, reads the raw changed-files data. Its effect returns while that data is absent. When `x.length === 0`, it invokes `h()` and returns before selection or filter redirect logic. A nonempty raw list with zero filter matches is a different branch.
2. Complete `Eji`, `[9658755,9659872)`, SHA-256 `019b1462190cfd8d6faadd7662fda51c14a685aec4d90094c12584ba1bceb686`, passes `Wd(n).closeSpecialTab` as that `onClose` callback.
3. Complete `Wd`, `[2148617,2152120)`, SHA-256 `8e3d8ea4ccd0b083eb63a3aeddf52d7fab109c51e9ee0fef202f4fb13d8857d8`, parses the router's current search with imported `aSe`. The default branch clears the workspace's sticky file or comment utility tab. The configurable-center-panel branch decodes the active special tab and removes its exact group key. Both navigate with `search:Lcs, replace:false`.
4. Complete `Lcs`, `[2152120,2152347)`, SHA-256 `245eb08087d9e5bf06460cd27905d4fbff4c32dd703956e47047c2052dcfcd8e`, sets `activeTabType:"session"` and clears terminal and special-tab route fields. It spreads the incoming search and does not replace `sessionId`. This preserves the previous session rather than always selecting the workspace's main chat. `replace:false` creates a route-history entry; this is distinct from closed-tab reopen history.
5. The complete renderer store and adapter, `[2144917,2146436)`, SHA-256 `e6a46ec71b3dde12a16202f338f5057bd9ba774cce3c1a8929830db52ffcf4cc`, close the removal chain through `Toe → Rcs → TJ/WH/Nbi → m5e/Dbi`. Missing roots or keys are no-ops. Removing an active key selects the first remaining key, prunes empty groups, and updates the active group. No closed-tab-history push occurs on this path.

### Imported producers and persistence

The received aliases join `d2 → AOt → rSe`, `d3 → BKt → Dni`, `db → D$ → aSe`, `d9 → s5t → oSe`, and `da → sFt → au`.

- `AOt`, `[3110524,3111247)`, SHA-256 `464979a5a7b5684e35f73df026a52377c49fcd9dfa60b137f2add98c1d03ff6c`, decodes the active route variant, retaining the session identifier for session routes.
- `BKt`, `[3111247,3111887)`, SHA-256 `2d2b8866c21765886fa1086639b024b44833163203e8fac7c467940bd29907b5`, decodes the special-tab fields.
- Schema and normalization, `[773541,777787)`, SHA-256 `09bf55126b62df6a29760f0d4124122828d4e727a400114ccd79344d60d98714`, define `D$` through `bu({schema:M8e,normalize:J8e})` and preserve valid optional `sessionId` values.
- `s5t`, `[391643,391672)`, SHA-256 `0f885f9cd6ca1563f342a8a8b783f7790575473b28a3200baf764beb2b9eec79`, reads `experimental_configurable_center_panel`. The retained default is the string `"false"`; the boolean parser recognizes only `"true"` as true.
- Complete `Ps` store, `[3121822,3126035)`, SHA-256 `3869a6d2c4921a13c6d3b90e68c77cfbad1166a34d2e95d3cabb6387df6fa196`, defines `setStickyUtilityTab` as a keyed state update, separately from `pushClosedTab`. Its persistence selection includes `stickyUtilityTab` but not `closedTabsHistory`.
- Complete `sFt`, `[3126035,3127656)`, SHA-256 `13550ae174ba2ac734f00997b37257aa2b03078a0919c6b62b8adbd65e98562e`, forwards to those store actions without additional history side effects.
- Complete direct store helpers, `[3121375,3121822)`, SHA-256 `59a803c3c9e4e09dabdee7ae39f68adcadf672b2ab764c9179da1030fe6a428e`, define the `workspace-tab-state-v2` persistence key and route normalization.
- Complete persist wrapper, `[256309,257834)`, SHA-256 `3d22b5321ee796d2b7c8a3e8c86e53cccd1d002402f7fef03435f2392ba007dc`, writes the partialized post-set state. The sticky-tab clear therefore persists; it does not implicitly call the separate closed-tab action.

## OpenConductor correction

Fresh main `a0a82a29e7dccee0ddb2fa530203ed711ab8e1e2` was re-read after #954's actual merge and release. Its DiffTab kept a ready-empty view open. Its manual workspace close callback pushed a reopenable Diff entry and always selected the main chat. Reusing that manual handler would implement the wrong history and fallback behavior.

The chosen boundary is optional `DiffTab.onClose`. DiffTab reports only a ready, raw-empty load, not loading, errors, or a nonempty filtered list. WorkspaceView owns a distinct automatic close callback and remembers the last displayed session. It preserves an open prior review chat, otherwise falls back to the workspace chat, without adding reopen history. Its current-workspace and active-tab guards prevent a stale callback from stealing focus. Those guards and the closed-review fallback adapt the retained route behavior to OpenConductor's tab ownership; they are not claims of additional native observation.

The exact four-path lease contains DiffViewer.tsx, the bounded WorkspaceView owner hunk, additive viewed.test.ts, and this note. No hook, FileDiffView, shared CSS, provider, global store or protected #847/#916 behavior changes.

## Behavioral RED and locked regressions

Automatic hosted command:

```bash
node --experimental-strip-types --test src/features/diff/*.test.ts
```

The test-only published head `6933a09b72bac6c6419a33d502603340e50e5e1a` ran in [Diff run 42928229893, job 130220070824](https://github.com/reason-machines/openconductor/actions/runs/42928229893/job/130220070824).

- Confirmed RED: 267 tests, 262 passed, five intended failures, zero skips or cancellations.
- Cases 261, 262, 264, 265 and 266 retained `{tab:"diff", open:true}` instead of closing and selecting the expected chat. Cases 263 and 267 passed the loading/error/filter and manual-history controls.
- All earlier 260 cases passed, including the #949 no-match and #954 retained-view tests.
- Test blob `642819e48e018c40f0b91725dd55245f5951f0c4` is locked for the correction. No prior fixture bytes, new test actions or assertions change between RED and GREEN.

The regression mounts the actual transpiled DiffTab with React's test renderer. It also mounts the bounded, verbatim WorkspaceView state declarations, close handlers, active-tab owner region, and actual DiffTab JSX binding. It does not mount the entire WorkspaceView. Diff data and editor rendering are controlled boundaries. The assertions observe tab selection, open state, callback count and the separate closed-tab boundary rather than matching production source strings.

Passing-after hosted results and remaining exact-head checks are pending at the correction's publication. Merge waits for every triggered check to succeed.

## Verification boundaries

Static retained-source integrity, prior-test byte preservation and `git diff --check` passed. No local dependencies, tests, typecheck, build, browser, server, native app, installation or reference acquisition ran. Automatic hosted CI is the admitted execution surface. No screenshot is provided because new runtime capture is outside the protected scope.

Real-editor state, full-workspace integration in a running app, installed-Mac behavior and full native parity remain unverified. A successful package workflow would prove packaging, not installation, deployment or native acceptance. #949's exact-commit E2E cancellation remains an explicit unverified gap.
