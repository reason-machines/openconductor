# Home Projects menu keyboard qualification

Conductor Rebuild — `HOME-FILTER-MENU-KEYBOARD-271`.

## Qualification and correction

At freshly read default-branch commit `1e483efabf7798579c72587365d3ae0c93bd689d`, Home's Projects menu had pointer toggles but no arrow-opening, roving keyboard navigation, Home/End or typeahead handlers. The test-first qualification was committed as `12e60b2b5f` before any production edit. PR #1433 is the separate, merged startup-hydration change, actual squash `a5642f15442e177b0409b3bb6a44036d4efb859f`.

After ledger confirmation of the precise Projects-only lease, fresh main `e6f9dfcb2eb9e12dc3b1c67c41baa268236f7269` reproduced **3 controls passed / 9 intended assertion failures** with the unchanged frozen fixture (`integrated-red.tap.gz`). The correction adds opt-in keyboard handling to the existing local Menu and enables it only for Projects. ArrowDown/Up opens and focuses first/last; popup arrows wrap, Home/End jump, and case-insensitive label-prefix typeahead moves focus without selecting. Pointer multi-select, callback/storage behavior, Escape and native Space/Enter activation remain intact. Archive has no opt-in; no imports, shared primitives, global/search handlers or archive paths changed.

## Reachable source contract

The previously REA-retained Conductor 0.87.6 renderer is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. It is tied to retained REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. No new acquisition, renderer execution or REA behavior observation occurred.

The 37 exact declaration/initializer spans in `source.json` close the Projects-menu producer and keyboard consumers:

- `nFi` renders Projects through `h2`, `Sg`, `Tm`, and `i4e`. Its 4,094-byte function SHA-256 `e8064ef68babed91e936ed903442e09407fa15cef1ff3031f15d0aecfee61263` is **not** the regression hash.
- `h2` renders `oF`; `oF` wires `SLt` with vertical navigation, default looping and arrow-key opening. `Sg` renders `Ede`, which receives the root's trigger props through `JSe`.
- `SLt` opens with ArrowDown/ArrowUp and chooses first/last enabled items, then handles arrow looping and Home/End. Its constants and direction helpers are retained, not guessed. `Z_` prevents default and propagation; `qze` invokes element focus.
- `Tm` forwards to `m2` and `b2`. The positioner joins `Sde` to the same root's item elements/labels, and the popup receives root navigation props. `Sde` takes explicit labels or actual element text. `wD` registers item labels through `YBr`.
- `oF` connects `$li` to those labels. It matches case-insensitive prefixes without Ctrl/Meta/Alt and updates the active index, which `SLt` turns into focus.
- `i4e`/`wde` preserve multi-select with `closeOnClick:false`. `eXe`/`r0i`/`O6`/`LX` retain the keyboard-to-click boundary. This qualification does not edit these shared primitives.

Verification passed **127 source/fixture checks across 37 spans**:

```bash
python3 evidence/home-filter-menu-keyboard/verify-source.py <retained-renderer>
(cd evidence/home-filter-menu-keyboard && sha256sum -c fixtures.sha256)
```

## Frozen mounted regression

Fixture SHA-256: `99b46ce7b6cfabce10cd13cf4e0c6f79c4d68354abf5b07a70b645e075c09b86`.

The actual default-head source was isolated with `git archive` under `.ara-state/home-filter-keyboard-main`. The new test mounts production `AllWorkspaces` and the real Home filter/label helpers. Outward archive and preference adapters are supplied; unrelated visuals are inert. A small DOM adapter supplies only host focus/query behavior to `react-test-renderer`; no vendor code is executed.

```bash
node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 \
  .ara-state/home-filter-keyboard-main/src/components/homeFilterMenuKeyboard.test.ts
```

Actual RED result, retained in `red.tap.gz`: **3 passed, 9 intended assertion failures, zero skipped/cancelled**. The failures reach two real trigger arrow-opening assertions, six menu navigation/wrapping/Home/End focus assertions, and one checked-item typeahead focus assertion. Passing controls preserve pointer multi-select/All projects clearing, Escape dismissal, and an unrelated trigger key. No setup error is accepted as a mismatch.

## Boundaries

This establishes a mounted OpenConductor defect against retained source, not an observed Conductor interaction, browser focus behavior, native input delivery or side-by-side parity. Browser and native execution are not run in this qualification. Archived-select keyboard behavior, global/search shortcuts, backend/provider, storage schema/path, installed persistence, first paint and containing-package acceptance are outside the correction lease. Existing REA gaps are inherited unchanged; no new REA operation ran.

## Correction verification on Reason cloud

- **Frozen 12/12 passed**, unchanged fixture SHA-256 above, after the fresh-main 3-pass/9-failure reproduction.
- **Nine supplemental mounted guards passed** in `keyboard-controls.test.ts`: Ctrl/Meta/Alt, composition and keycode 229, native Space/Enter and unrelated keys, accumulated prefixes/repeated-letter cycling/reopen reset, open-trigger refocus, and Archive remaining opted out. These reuse the frozen harness declarations without altering the regression or evaluating vendor code.
- **374/374 affected checks passed, zero skipped/cancelled**; exact command and results in `qualification.json`, retained log `affected.tap.gz`.
- **Passed:** `npm run build` (branding, full TypeScript and Vite production build; existing chunk-size advisory only), supplemental fixture typecheck, 127 retained-source checks/37 spans, frozen manifest integrity and `git diff --check`.

Browser proof and screenshot are **NOT_RUN** for this unit: the ledger's serialized browser campaign is closed and explicitly did not admit a new server/restart/runtime slot. The existing `browser.html`/`browser.tsx` are an unexecuted fixture, not evidence. Source/component focus mocks are not actual browser/native focus delivery. Installed persistence, first paint, native/provider, full-app and package/embedding/runtime acceptance remain unverified or not run. Package #1791 remains unchanged and excludes successors; existing canonical Part 4 release custody remains responsible for a future containing-build and behavior check. No new runtime, native/provider job, package dispatch or watcher was created.
