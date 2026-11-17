# Independent command and section search lifetimes

Conductor Rebuild / `SECTION-QUERY-ISOLATION-SAME15`.

## Reproduced mismatch and minimal repair

At freshly fetched main `217498aae38dfd63b97919b1a0ab4097462c691e`, selecting **Move to section** erased the regular command query. The section filter then reused that same state. Returning with the back button, Escape or empty Backspace either lost the command query or replaced it with section text; immediate re-entry could lose the command result too.

Only production `src/palette/CommandPalette.tsx` changes, six additions and two deletions: keep separate `commandQuery` and `sectionQuery` state, derive the displayed query/setter from the existing section-mode predicate, and clear only the section query when entering the picker. The regular query is retained on Back, while every new picker entry starts empty. No Host, section component, shared resolver, keybindings, CSS, persistence, provider, native or package change is made.

## Complete retained real-app closure

`source.json` pins the already-held **11,600,457-byte** `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, and nine exact UTF-8 byte spans. Its retained REA artifact lineage is `ev_a4ce503a76a3198b2d2bec127c09bb6940b806849318ccc51523f40701751ab5`. No new acquisition or vendor-JavaScript execution occurred.

- Complete `h_a → qZ → Y5s/KV → P6` caller/wrappers retain the palette content. Complete `m_a` owns regular query `c/u` separately from section target `d/h`.
- `m_a`'s Move selection only calls `h(jn)` and returns. Its conditional `Jba` child receives workspace, section key and `x5` Back callback, not the regular query. `x5` only clears the section target with `h(void 0)`.
- Regular `kI` input remains controlled by `value:c,onValueChange:u`.
- Complete `Jba` owns independent initially empty `o/a`. Its own `kI` input uses `value:o,onValueChange:a`; button, Escape and empty Backspace all invoke the same Back callback. Returning unmounts that child without erasing parent `c`.
- Input wrapper `kI → B5s` and shared root alias are retained, not inferred from missing local code. `verify.cjs` parses the complete `m_a` and `Jba` declarations as inert ASTs and checks the exact joins.

Earlier real-app JavaScript-analysis worker heap exhaustion and bounded zero-file parsing remain **REA gaps**, not semantic or runtime passes. This increment reads exact already-retained compiled declarations; it did not invoke REA, native UI, a browser or a reference process and encountered no new REA failure.

## Frozen regression and correction history

The test mounts actual `PaletteHost → CommandPalette → MoveToSection`, through the real input and rendered row callbacks. The production query state and reducers are not reimplemented. Native/OS/filesystem/provider effects are inert or forbidden.

The initial fixture is retained under `initial-fixture/`: it produced five intended query failures plus one harness-only strict object-prototype comparison failure across the VM boundary. The final fixture replaces that one control with exact object-key and all field-value assertions, removes an unused import and corrects its comment. **All five target assertions are unchanged.** The original bytes, digest and log are preserved; the first run is not represented as a product result or a passing run.

Final fixture SHA-256: `bfe699c1a96bf4346fe4e92874affbf3a563cdf13453959315d8efe254328b8b`. Frozen before treatment:

- **Baseline reproduced:** 13 cases, **8 passing controls / 5 intended assertion failures**, no skips (`red.tap.gz`). Button, Escape, empty Backspace, initially empty command search and immediate re-entry expose the defect.
- **Treatment passed:** the same byte-identical 13 cases **13/13**, no skips (`green.tap.gz`).
- Controls preserve independent section filtering, editable nonempty Backspace, current-section disabled behavior, Enter assignment with exact action/target, footer recovery after clearing, regular tab-query retention, completed close/reopen behavior, composition and legacy keyCode 229.

## Checks run on Reason Cloud

```bash
node --test src/palette/sectionQueryIsolation.test.ts
node --experimental-strip-types --test --test-concurrency=1 $(find src/palette src/keybindings -name '*.test.ts' -type f | sort) evidence/palette/pointer-selection-scroll/pointer-transition-controls.test.ts evidence/palette/shift-navigation/section-controls.test.ts evidence/palette/group-navigation/binding-controls.test.ts evidence/palette/section-auto-scroll/pointer-controls.test.ts
npm run typecheck
npm run build
node evidence/palette/section-query-isolation/verify.cjs <already-retained-renderer.js>
git diff --check
```

- **Passed:** unchanged adjacent baseline **521/521**, then complete treatment command **534/534** including new13, with zero skips.
- **Passed:** explicit TypeScript check, branding and production build; only advisory bundle-size warnings. The first combined typecheck/build call reached Vite transformation but exceeded the 360-second call limit. That timeout log is retained separately; it is not a successful build. Running `npm run build` alone with a fitting foreground limit completed successfully.
- **Passed:** retained whole-parent identity, all nine raw byte ranges, complete declaration syntax, query/input/back joins, unchanged final fixture and existing fixture/adjacent production pins, and exact reconstruction of the minimal production patch.
- **Passed:** final refetch leaves main at the same `217498aae` used for reproduction and build; diff whitespace check passed.

The seven pre-existing optional historical VM failures in [#1442](https://github.com/reason-machines/openconductor/issues/1442) are separate and unchanged. The affected command above does not include that known-broken optional old fixture. This is **not a full-suite PASS**.

Logs are losslessly compressed; `log-identities.json` records raw/compressed digests and sizes.

## Acceptance limits and custody

Mounted source-unit callbacks are not browser event propagation, geometry, physical input, native accessibility, installed identity or package acceptance. These are **NOT_RUN**. No screenshot is available because there is no serialized browser/native admission for this increment. No runtime, native, browser, provider, package dispatch or duplicate watcher was started. Existing release custody must first identify a successor artifact containing the actual squash, then test regular query → section filter → Back/re-entry on that identified build; source and build passes do not establish installed acceptance.
