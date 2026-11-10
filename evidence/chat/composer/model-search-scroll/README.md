# Model search scroll reset

Conductor Rebuild owns `SEARCHSCROLL135-03`. This change resets the model-results scroll position when the search query changes. It leaves the pinned search height, matching, ordering, selection, and menu layout unchanged.

## Retained source chain

The retained Conductor renderer `renderApp-D_fmY7hW.js` has 11,600,457 bytes and SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its complete `A7o` definition occupies UTF-8 half-open byte interval `[8599657, 8601817)`, SHA-256 `e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce`. Both hashes and the complete retained excerpt were revalidated before editing. No new acquisition or reference execution occurred.

The owning Session retains the renderer at `.rea-work/reference-retained/renderApp-D_fmY7hW.js` and the complete source receipt at `.ara-state/composer-scroll/source-closed-receipt.json`. The complete same-build definition establishes every link:

1. `o` is the search query and `d` is the rows ref.
2. Callback `m` sets `d.current.scrollTop=0` when the ref is mounted.
3. Dependency array `g=[o]` is passed to `$.useLayoutEffect(m,g)`.
4. `D` is `grid min-h-0 content-start gap-1 overflow-y-auto`.
5. The returned results-or-empty wrapper receives `ref:d`, `className:D`, and the results children `L`. The scroll-reset callback and rows wrapper therefore share the same ref.

These are static source observations, not runtime observations of Conductor.

## Fresh-main mismatch and bounded mapping

After #951 merged, the checked default head was `94bab92ec9d56bc751207f45196e38de0fb7cc82`. Its `ModelPicker.tsx` has no query-keyed layout effect or scroll-position reset. Its `.oc-model-list` is the confirmed result viewport: the existing CSS gives it `display: grid`, `align-content: start`, `overflow-y: auto`, and `min-height: 0`.

The bounded correction uses the existing picker root ref to resolve only that picker's `.oc-model-list`, then resets its `scrollTop` in a layout effect keyed by the raw query. The raw query includes blank and whitespace changes, matching the retained `[o]` dependency. An unchanged query does not reset a user's later scroll. An absent root or list is harmless. The outer menu and sibling pickers are not reset.

The exact implementation scope is the React import and query-layout-effect hunk in `ModelPicker.tsx`, the new `modelPickerSearchScroll.test.ts`, and this receipt. No JSX, ref markup, CSS, matching predicate, ranking, height lifecycle, footer, Effort, Fast, configuration, or emoji change is included. Existing #947, #847, and #916 exclusions remain.

## Regression sequence

The test-only checkpoint precedes the product correction. Automatic hosted CI runs `node --test "src/**/*.test.ts"`. The new fixtures execute OpenConductor's extracted query-layout-effect callback against explicit scroll-state objects. They do not execute reference JavaScript.

Seven fixtures cover starting a search, refining it, replacing it with no results, clearing it with blank or whitespace input, retaining a user's scroll for an unchanged query, isolating the result viewport, and tolerating an absent picker or list. RED must be an executed scroll-state assertion, not a missing-ref string assertion. Hosted RED is pending at this checkpoint; the product correction has not been applied.

The eight mouse fixtures and seven height fixtures from #951 remain byte-identical to merged main. Their SHA-256 values are `45d080e56eb16052b9406df4685ae2fea95fb7b17c056451787e809332484b68` and `da4b7c76d081c1eb77d151c5d8f66e1428817f8d1ae6ab2d768bf7807f461c13`, respectively. Their assertions and `MODEL_PICKER_REGRESSION_REF` input are preserved.

## Verification limits

Local Node, tests, installs, builds, reference execution, browser, native app, provider launch, new acquisition, and manual workflow dispatch remain excluded. No mounted or visual acceptance ran, and no screenshot exists. Callback fixtures model observable scroll state but do not mount React, measure real scroll geometry, or prove native parity. All delivery checks must pass on the corrected exact head before merge. The owning Session retains consuming-main and package follow-through.
