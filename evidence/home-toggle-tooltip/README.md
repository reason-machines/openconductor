# Home hidden-sidebar app tooltip

Conductor Rebuild isolated this change on main `b35aeedc5ff71381e2f740367233462b500810c9` on Reason Cloud 352. The original source increment is `a171586a7`. Earlier keyboard/search commits and unpublished scratch remain preserved separately; neither is part of this standalone change.

## Source and correction

The retained Conductor 0.87.6 renderer has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` establishes its artifact provenance. The original [Home caller receipt](../home-sidebar-hint/reference-caller.json) and shortcut resolver receipts remain unchanged. [The reference receipt](reference.json) binds five exact UTF-8 ranges and the original inspected-main inputs.

`Gls` admits a hidden-sidebar state and constructs tooltip root `Jn`, trigger `Xn` wrapping the button, and content `ni` containing “Toggle left sidebar” and `Ss` for `view.toggleLeftSidebar`. `Ss` includes primary and additional shortcuts. Main instead puts the hint in a native `title`.

The correction reuses the existing Tooltip around the same button and effective shortcut string. It removes the competing native title. The fragment-based wrapper adds no layout element. Bindings, hydration, live updates, callback, accessible label, icon, visibility gate, cards and footer stay intact. Shared Tooltip, styles, provider, command dispatch and other screen toggles are unchanged.

Ledger disposition `631580ca-322d-4999-b21b-004d9d2d3abb` clears this presentation increment. Pending Target14, keyboard24, branch-search, status-color inquiry and other owners' work are excluded.

## Regression and fixture repair

The six original native-title-based controls retain their names and behaviors: defaults and click dispatch; delayed primary/additional hydration; live edits and reset without parent rerender; single-key replacement; malformed-setting fallback; and absence while the sidebar is visible. Assertions now read rendered app-tooltip text rather than the removed title. Four cases add title removal, pointer-leave dismissal, touch suppression and Escape dismissal.

The fixture mounts actual HomeScreen, KeybindingsProvider and Tooltip. Parser, formatter, dispatcher, listeners and placement helper remain real. Portal transport is projected inline and window timers are flushed deterministically. This does not prove browser geometry, portal accessibility, hover timing, animation, native focus or macOS behavior.

The first matched run exposed a missing fixture DOM capability when real Escape dispatch probed active dialogs. The source-only repair adds a bounded FixtureDocument element collection and models both selectors used by `activeDialogIdFromDom`: presence of `data-dialog-id` in document order, and the first modal dialog by role/aria-modal attributes. Home has no dialog elements. Unsupported selectors fail explicitly, rather than receiving blanket empty responses. The real dialog traversal, dispatcher and Escape listener remain active; no case or assertion changes. The original exact ten-case bytes and raw results remain in [validation](validation/).

## Actual first allocation result

ACC admission `ACC_271_HOME_TOOLTIP10_20261113T0246` ran one sequential foreground driver, concurrency 1, nice 19, with finite timeout/heap limits. [The receipt](validation/receipt.json) records exact argv, environment limits, exits and durations.

- Dependency setup passed: unchanged-lock `npm ci --ignore-scripts --no-audit --no-fund`, exit 0.
- Baseline RED: actual main HomeScreen plus original exact candidate test hash `cf209ea9f3d1d3fad6c9b0824a904aa7d8519d4e95903c4d1c80742ca46ce592`; exit 1, ten collected, eight expected assertion failures, two passing controls, no skips. Seven failures were absent app-tooltip content; one was the retained native title.
- Identical fixture with only candidate HomeScreen applied: exit 1, nine passed and Escape failed with `doc.querySelectorAll is not a function`. This is a fixture/setup failure, **not passing GREEN**.
- The driver stopped immediately, restored the candidate and preserved test/lock hashes. No automatic retry ran. Owned child commands were reaped and a process check found no node/npm/typecheck/build worker. Terminal RELEASE was sent to ACC at 2026-11-13T02:49:20Z.
- Adjacent tests, typecheck and build did not run after that failure. The revised fixture hash is `d1c833003f89e3ff475f12ccdb3f72387387c7b418cf12b786b2115bf44859ce`; it requires a new matched disposition of the existing allocation, not an unapproved retry.

## Completed matched continuation

Conductor Rebuild ran `ACC_271_HOME_TOOLTIP10_FIXTURE_V2_20261113T0300` on fresh main `e6836acf258d6b526b5fb1a6d057aa8ee017dc2e`. Only the CI workflow and a Rust test fixture changed since the first baseline; HomeScreen, its dependency closure and the lockfile were unchanged. The candidate was rebased in the assigned checkout without adding keyboard, search, Target14 or colour work.

The [continuation receipt](validation-v2/receipt.json), [sequential driver](validation-v2/run.py) and raw phase logs preserve the actual commands, heap limits, timestamps, exits and durations. Runtime lasted 113.767 seconds within the new inclusive 1,800-second allocation. Existing own-root dependencies matched the unchanged lockfile, so no installation ran.

- Baseline RED passed its expected-failure classification. Actual-main HomeScreen plus corrected fixture `d1c833003f89e3ff475f12ccdb3f72387387c7b418cf12b786b2115bf44859ce` collected ten cases: two controls passed and eight intended assertions failed. Seven required absent app-tooltip content; one rejected the native title. No fixture or import error occurred.
- Candidate GREEN passed all ten cases with the identical corrected fixture and only candidate HomeScreen applied. No cases were skipped, cancelled or marked todo.
- Adjacent tests passed all 18 cases with no skips: `tooltipPlacement.test.ts`, `keybindings/overrides.test.ts` and `allWorkspacesSidebarHint.test.ts`.
- `npm run typecheck` passed, exit 0, in 30.737 seconds under the 180-second limit and 1,536-MiB heap.
- `npm run build` passed, exit 0, in 76.988 seconds under the 480-second limit and 1,536-MiB heap. Existing Vite mixed-import and large-chunk warnings remain warnings, not failures.
- Candidate HomeScreen, the corrected test and lockfile were unchanged after execution. The driver and child commands exited. A fresh process-name check found no node, npm, tsc, Vite or validation worker. Generated `dist` was removed; terminal RELEASE was sent at 2026-11-13T03:05:01Z.

Original ten-case bytes, the initial eight-failure RED and nine-of-ten fixture failure remain unchanged in [the first allocation record](validation/). The corrected fixture models document queries only; all original ten case bodies and real Escape handling remain intact.

## Matched regression command

The identical command ran against actual-main HomeScreen and the unchanged tooltip candidate:

```bash
NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --signal=TERM --kill-after=5s 90s node --test --test-concurrency=1 src/components/homeSidebarHint.test.ts
```

The continuation also completed the original adjacent, typecheck and build commands recorded above. Publication remains standalone against main. Merge waits for every enabled exact-head check; local proof is not the CI result.

Browser, screenshot, native, package and release acceptance remain **not run**. No screenshot is supplied because this allocation excludes browser/native execution; existing owners retain those surfaces. No new REA operation failed. The historical acquisition gap remains: REA confirmed executable identity but did not enumerate embedded Tauri assets. Retained bundle spans are source evidence, not an installed-app observation.
