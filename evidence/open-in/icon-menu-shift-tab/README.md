# Icon Open in Shift+Tab dismissal qualification

Conductor Rebuild / `ICON-MENU-SHIFT-TAB-DISMISS-SAME15`.

## Identity and scope

Qualification default-branch head: `c1e74c56f6bb7455bb59311797515138adc4a235`, the actual #1457 squash. Qualification was isolated and preserved as `5680ce02845deba8ede6f560a3366ece15188541` without production edits. The subsequently authorized treatment below changes only OpenInButton's local key handler.

The already-retained real Conductor 0.87.6 renderer is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; retained REA lineage is `ev_338577609e67c31212d529d59606e90597850528ea9a2f9559d23a4876c960d1`. The whole parent was rehashed and parsed as inert syntax. The 38 complete AST declarations/initializers in `source.json` have exact UTF-8 byte ranges and hashes. No reference JavaScript was evaluated, no new REA acquisition/capture occurred, and no physical/native behavior was observed.

## Actual icon route, not an SLt-only analogy

- `P9`'s actual `size="icon"` branch creates `h2` plus `Tm`, with `cFn` supplying ordinary app rows and Copy path. `h2` creates `oF`.
- `oF` calls `Oli({popupStore:D,...})` and `SLt` without setting `virtual`, whose default is false. It supplies enabled state and the menu's actual item DOM refs. `Oli` binds its floating element to the positioner. `LVe` selects the marked popup element, otherwise the element itself; `Op` retains that reference.
- `oF` merges `SLt.floating` into published `popupProps`. `Tm → m2` reads those same popup props and applies them to the popup. Complete event merger declarations are retained; `preventBaseUIHandler()` can cancel the base callback, not an inferred native default.
- `Tm` cancels non-Escape events from a target outside its own popup. For a normal row or the popup itself, the actual `SLt.floating.onKeyDown` handles **Shift+Tab while open and nonvirtual** before its generic list-navigation/legacy-229 guard. Forward Tab does not enter this branch.
- It obtains the native origin using `jf`: the first composed-path item when available, otherwise `target`. A non-null origin outside the popup is ignored. `oo` first checks ordinary containment and also follows shadow-root host ancestry. The source therefore does not license dismissing an unrelated event.
- An admitted Shift+Tab calls `Z_` (both prevent-default and stop-propagation), closes with the `focus-out` reason, then explicitly focuses the actual DOM trigger if it is an HTMLElement, including another window's HTMLElement. This is a direct key-handler focus call, independent of `Tm`'s default final-focus callback, which returns false.
- Item wrappers `cFn → Yc → Pu → eXe/r0i` do not replace this with a split-popover behavior. The default split route is still separate. No new forward-Tab, general focus-out, click-close, native launch, clipboard or broad focus-manager behavior is inferred.

## Actual baseline result

The new test mounts the actual current production `OpenInButton` and actual apps adapter with React test renderer. It drives rendered callbacks, with synthetic focus nodes and native IPC/preferences recording. Presence is reduced to the open state; this is not a real DOM, browser event propagation, animation or native input test.

Frozen17 SHA-256: `994bb96693dcb54c21af2b3168a9b7b6ab1d66b095d0bd45c9dadc406a0dda51`.

On unchanged fresh main, **9 controls pass / 8 intended ERR_ASSERTION failures**, zero skips, cancellations or TODOs. Ordinary Shift+Tab from first/middle/Copy path rows, explicit consumption, legacy-229 ordering, native-target fallback, reopening and the menu container fail as intended: current main ignores Tab and leaves the menu open.

Passing controls cover forward Tab for both variants, split Shift+Tab, already-prevented policy, Escape, arrow/end-point navigation, two foreign-origin guards and an exact positive copy-adapter boundary. The foreign controls exercise the actual current callbacks; source containment/retargeting is additionally bound statically, not claimed as browser shadow-DOM proof.

Initial scratch14 had one extra failed positive control because deepStrictEqual compared a VM-origin object prototype. That diagnostic and original fixture are archived in `prefreeze/`. JSON boundary recording corrected that fixture error before the first freeze. The preserved frozen14 then reported 7 pass / 7 intended failures. Adding the requested boundary controls produced the frozen17 above, before any production edit. Both versions and raw logs remain preserved. Only frozen17 is the intended treatment oracle.

## Checks run on Reason Cloud

```bash
node --experimental-strip-types --test src/features/openIn/iconMenuShiftTab.test.ts
node --experimental-strip-types --test --test-concurrency=1 \
  $(find src/features/openIn -maxdepth 1 -name '*.test.ts' ! -name 'iconMenuShiftTab.test.ts' | sort) \
  src/dragRegion.test.ts
node evidence/open-in/icon-menu-shift-tab/verify.cjs <already-retained-renderer.js>
git diff --check
```

- Frozen regression: **9 pass / 8 intended assertion failures**; no setup failures, skips or cancellations.
- Selected existing Open in and drag baseline: **107/107 pass**, no skips/cancellations. This is the exact fresh-main selection, not a repetition or renaming of historical #1457 totals.
- Source/frozen integrity: **219 checks pass**, including 38 complete declarations, actual icon caller/consumer/guard joins, whole parent identity, unchanged current-main product, exact fixture and baseline counts.
- Whitespace and unchanged production diff: **pass**.

## Authorized treatment and fresh-main integration

After the complete source closure and unchanged RED were delivered, root explicitly authorized the narrow product treatment. Only `OpenInButton.onMenuKey` changes: **12 additions, no deletions**. While the icon menu is open, Shift+Tab checks the native origin and composed path belong to the menu, consumes default/propagation, closes and focuses the existing trigger. Ordinary containment and composed-path membership retain the shadow-host containment boundary. No new shared menu abstraction, split-popover policy, general blur/focus-out rule or native operation is added.

The exact same frozen17 passes **17/17**. All current Open in plus drag checks, including the new test, pass **124/124**, with zero skips/cancellations. Existing source/tests/loaders stay byte-identical to the qualification base. The expanded source/frozen/guard/baseline/protected-file verifier passes **245 checks**. `qualification-verification.json` preserves the original 219-check qualification receipt; `verification.json` records treatment verification. Raw GREEN logs are retained beside the unchanged RED.

Fresh main checked before integration: `74c004a95d7b10072f54f71ca611f22c50944f64`. `git diff` confirms no scoped Open in or drag-test change since the qualification base; `integration.json` retains both identities. Publication is a separate ready PR against main, not stacked and not appended to merged #1457.

Local heavy typecheck/build awaits serialized admission or the exact hosted full pipeline; it has **NOT_RUN** for this increment. Hosted publication/CI are pending at this preservation milestone. Browser/native/package acceptance and actual clipboard/focus behavior remain **NOT_RUN**. No screenshot exists because no browser/native runtime was admitted. Existing release custody retains #1457 separately; neither its merge nor a source-unit pass is package acceptance. After this increment merges, existing sole release custody must prove the actual squash's embedded inclusion and replay real icon Shift+Tab from app and Copy path rows, forward/split/foreign-origin controls, trigger focus, reopen and no unwanted launch/copy.

Seven historical optional failures tracked in #1442 remain separate and are not claimed repaired or passing here. No new REA failure was encountered. Earlier analyzer and native-capture gaps remain in their original packets.
