# Icon Open in mouse-movement focus

Conductor Rebuild applies the retained SAME15 pointer12 correction against main `c79a81086c3a0e5ba81f1a9a53ec63a4f4dde7ba`. The icon menu focuses a different app or Copy path row when the mouse moves over it. Keyboard navigation then starts from that row. WebKit events with zero movement on both axes remain ignored. Split-menu behavior is unchanged.

## Source evidence

This is retained static REA evidence from Conductor 0.87.6, not fresh native observation. Renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, with retained evidence lineage `ev_338577609e67c31212d529d59606e90597850528ea9a2f9559d23a4876c960d1`. [Reference spans](reference.json) bind the renderer's UTF-8 offsets and hashes to the unchanged excerpts in `reference/`. Extracted JavaScript was not evaluated.

The icon branch of `P9` renders app and Copy path rows through `cFn`, `Yc`, `Pu`, and the `eXe` wrappers. `h2` forwards root properties to `oF`. Its `highlightItemOnHover` default is true, passed to `SLt.focusItemOnHover`. `SLt.item.onMouseMove` filters `iRn`, finds the current target in registered row order and updates the active index. Its effect calls `qze` synchronously with `preventScroll: true`. `iRn` filters zero movement only when `CSS.supports('-webkit-backdrop-filter:none')` identifies WebKit.

At checked main neither row site has a mouse-movement handler. The source-derived counterexample starts with Finder focused, moves over Cursor, then presses ArrowDown. Checked main retains Finder as the navigation origin. The retained Conductor source predicts Cursor as the origin instead. This is not a measured failure.

## Small correction and preservation

The product diff imports React's mouse-event type, adds one component-local handler and attaches it at the two icon-row sites. It uses the existing DOM focus state rather than introducing another active-index state. The native document `MouseEvent` type remains unchanged.

The correction preserves open effects, refs, existing keys, blur policy, original Home/End fixture, Escape controls, split menu, app preferences, IPC, Tab, Reveal and palette behavior. Pointer leave, touch policy and arbitrary hidden or disabled inventory are not qualified by this unit.

[Source binding](source-binding.json) records exact product and fixture identities. The original typeahead24 `d3550db8` and closed-trigger15 `e41c6b30` packets remain frozen and are not applied here. Standalone and all three explicit after-packet source applications passed. Those source checks do not prove composed behavior.

Laziness Protocol keeps this to one callback and two row properties. Type System Discipline uses React's button-targeted event type without conflating it with the existing native document listener.

## Verification actually run

On Reason Cloud 355, source checks passed:

```bash
python3 evidence/open-in/icon-menu-pointer-focus/verify_source.py \
  --renderer .oc-tmp/refill-1240/reference/renderApp-D_fmY7hW.js
git diff --check
```

The verifier checks the bound main baseline, exact candidate, exact original 12-case fixture, frozen behavioral specification, original 14-case Home/End fixture, all 20 retained spans and full renderer bytes. Removing only this correction restores the checked main product byte for byte. It does not execute application code. Without `--renderer`, it verifies the committed reference excerpts but not the full external renderer.

The [original behavioral specification](behavior-spec.json) and regression fixture remain byte-identical to the retained packet. The twelve declared cases predict six intended baseline assertion failures and six passing controls. Those are predictions, not results.

## Unrun acceptance

RED, GREEN, adjacent tests, typecheck, build, browser, native input, package inclusion and installed behavior are **NOT_RUN**. No application, dependency install, provider action or dispatch was started. No screenshot exists because browser and native execution require the existing ACC allocation.

The remaining dependency is ACC's existing finite serialized admission for this same pointer12 unit. It has no verified runtime token, budget or ordinal. No new row, runner, watcher or helper was created. A future matched admission must run the identical original12 against baseline and candidate, distinguish assertion failures from setup failures, require zero skips/cancellations/TODOs, and exercise original14 and admitted adjacent tests. Typecheck, build and native behavior are separate checks. Publication must not be mistaken for any of these results.

Delivery is a small ready standalone PR against main, never stacked. Merge only after every enabled exact-head workflow passes and the admitted regression is verified. Existing ACC/992/E1 owners retain package and native follow-through, including #1211. That earlier PR is merged as `d759560938edf608e30b4a9779422349ee00a6ff`; this unit does not claim its release or native acceptance.
