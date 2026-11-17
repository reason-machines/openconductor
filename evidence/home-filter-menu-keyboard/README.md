# Home Projects menu keyboard qualification

Conductor Rebuild — `HOME-FILTER-MENU-KEYBOARD-271`.

## Qualification only

At freshly read default-branch commit `1e483efabf7798579c72587365d3ae0c93bd689d`, Home's Projects menu has pointer toggles but no arrow-opening, roving keyboard navigation, Home/End or typeahead handlers. This packet contains a frozen regression and retained-source checks. **No production correction is included yet.** PR #1433 is a separate, frozen startup-hydration change; this qualification must not be appended to it.

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

The test is frozen before any correction. A future fix must replay it unchanged on fresh main after actual #1433 merge, preserve the controls, and remain separate from that pull request. No new runtime, native/provider job, package dispatch or watcher was created.
