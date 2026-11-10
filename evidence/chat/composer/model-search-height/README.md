# Model search height

Conductor Rebuild owns `VIEWPORT135-02`. This repair preserves the model menu's pre-search height while the query filters its rows. It does not change search matching, result ordering, selection behavior, effort, Fast, or the footer.

## Retained reference

The same-build renderer retained from Conductor is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its complete `A7o` definition occupies UTF-8 half-open byte interval `[8599657, 8601817)`, SHA-256 `e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce`.

The renderer and complete excerpt hashes were revalidated from the existing retained bytes. No new acquisition or reference JavaScript execution occurred. The original retained packet is `.rea-work/model-agent-search-73c1e4da/retained-packet.json`; the complete source-chain receipt is `.ara-state/composer-chain-investigation/model-token-search-complete-packet.json` in the owning Session. Those retained files are not part of this change.

Every link needed for this lifecycle is inside `A7o`:

1. `o` is the query, `c` is the optional measured height, and `d` is the rows ref.
2. Input handler `O` calls `w`, whose complete body is `x`.
3. If the next query is blank after trimming, `x` releases the height with `u(void 0)`.
4. Only when the previous query is blank and the next is nonblank, `x` measures `d.current.getBoundingClientRect().height` and stores it with `u(...)`, before updating the query with `a(F)`.
5. During search, `P` is `{height:c}`. The returned rows container receives both `ref:d` and `style:P`, whether it displays results or `No models found`.
6. Reset callback `v` releases both height and query. Selection callback `k` invokes it after selecting a result. Escape invokes the same reset.

These are static source observations, not claims about a running Conductor instance. Search scoring, full fuzzy matching, and unrelated helpers are outside this evidence boundary.

## OpenConductor mismatch and mapping

The fresh default branch checked before editing was `0244d800782a3eaf811aac53fedc8a536218fb2b`. Its `ModelPicker.tsx` updates the query directly and has no measured search height. Search removes default-only rows, so the source has no mechanism to retain the pre-search viewport.

OpenConductor's default-only controls sit beside `.oc-model-list` inside `.oc-model-menu-inner`. The bounded mapping therefore measures and pins that inner wrapper rather than changing the list tag or moving controls. The search input remains inside the pinned wrapper. The footer remains outside it. Existing global `box-sizing: border-box` makes the measured border-box height usable as its inline height. No CSS change is needed.

The optional `number` state represents an unpinned menu with `undefined` and a captured search height with a number. One query-change callback owns the blank-to-search measurement, release on blank input, and search-index reset. Enter, result click, and Escape reuse that callback. Closing the menu releases the height with the existing query reset.

## Regression proof

The locked `src/features/chat/modelPickerSearchHeight.test.ts` fixtures cover seven source contracts:

- Capture the pre-filter height only on a blank-to-nonblank transition.
- Retain that height while refining the query, including a no-match query.
- Release on blank input and measure a fresh baseline for the next search.
- Attach the measurement ref and conditional height to the same inner wrapper.
- Wire the input to the shared query-change callback.
- Release query and height after keyboard or pointer selection.
- Release on Escape and menu close without changing the existing close paths.

The callback fixtures execute only OpenConductor's query-change body in automatic hosted CI. They supply a measured rectangle and record state updates. They do not mount React or measure browser layout. The wiring assertions are source checks, not mounted acceptance.

Automatic hosted `node --test "src/**/*.test.ts"` established RED on checkpoint `8a6d6d3ff117da6ce73d74d85af5d2a9698a25fa`. The [unit job](https://github.com/reason-machines/openconductor/actions/runs/42919522387/job/130190554067) reported exactly seven failures, all from the new height fixtures. The first failure was `the input shares a query-change callback that owns the measured height`. Typechecking passed; the separate frontend job stopped on the same regressions before building.

The locked fixture SHA-256 is `da4b7c76d081c1eb77d151c5d8f66e1428817f8d1ae6ab2d768bf7807f461c13`. The assertions remain unchanged through the correction. The minimal fix adds the optional height state, inner wrapper ref/style, and shared query transition. Hosted GREEN remains pending and is recorded in the pull request when verified.

## Verification limits

Local Node, tests, installs, builds, reference execution, browser, native app, provider launch, and new acquisition are excluded. No screenshot or mounted/native acceptance was run. Static source proof and callback fixtures do not establish rendered geometry, constrained-window behavior, or full native parity. Existing protected paths and other owners' scopes are unchanged.
