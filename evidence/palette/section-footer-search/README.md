# Searchable section-picker actions

Conductor Rebuild / `SECTION-FOOTER-SEARCH-SAME15`.

## Reproduced mismatch and scoped repair

Fresh main `2ada6e3e186391695cae1ce5694ac251a6323079` always removed New section and Remove from section for nonempty search. It also substring-matched only section names, without the value/keyword scoring used by the actual section picker. Typing `new`, `create`, `remove`, or `from` therefore hid the corresponding command rather than finding it.

Only production `src/palette/MoveToSection.tsx` changes. Its existing `sectionItems` boundary now uses the already-correct `search/score.filterScore` with the retained section ID/name and action values/aliases. It ranks enabled results within their groups and ranks groups by their best match, including disabled matches. Disabled current-section rows remain ahead of the enabled rows that cmdk appends during sorting; they are still unselectable. Empty query keeps the original sections/New/Remove order. The separator, like cmdk's separator, is hidden during search.

The shared scorer, Host, CommandPalette, resolver, keybindings, persistence and provider boundaries are unchanged. This does not reimplement the historical #1029 scorer repair. No cloud UI or runtime behavior is added.

## Complete retained REA closure

The already-held real-Conductor renderer is 11,600,457 bytes with SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its retained REA lineage is `ev_a4ce503a76a3198b2d2bec127c09bb6940b806849318ccc51523f40701751ab5`. `source.json` pins sixteen complete declarations/binding initializers by zero-based, half-open UTF-8 byte ranges and hashes.

- Complete `Jba` owns an initially empty query, controls `kI`, and renders section rows with explicit `value:section.id`, `keywords:[section.name]`, and the disabled current-section condition.
- Its separate footer group always registers `new-section` with `[create,new,section]`; `remove-from-section` with `[remove,from,section]` exists only when a current section exists. The New and Remove consumers are retained in that same complete declaration.
- `Jba → KV → P6=Xyi`, `ff → P6.Group=j5s`, and `$o → P6.Item=M5s` close the wrappers. `Zyi` registers trimmed values and keywords. `M5s` hides rows whose filtered score is zero and keeps disabled rows nonactionable.
- Root `B` uses the supplied `wUi` filter. Complete `wUi` returns `iRi`'s score only above 0.2. Complete `iRi → pSo → hRt` and its constants close the actual custom scorer; no substitute default scorer is inferred.
- Root `F` sorts enabled rows, then groups by maximum item score. Complete selectors show that `K` excludes `aria-disabled=true`; disabled matches still contribute to the separate group maximum. This distinction produced and fixed a supplemental candidate regression rather than being assumed from one passing case.
- `exi → P6.Separator=F5s` closes the rule hiding separators on nonempty search.

Vendor JavaScript was parsed as inert AST, never evaluated. No fresh REA acquisition or app operation occurred. Earlier REA analyzer heap exhaustion / bounded zero-file parse gaps remain limitations; retained source is not a fresh native observation, screenshot, or measured reference-input trace.

## Frozen mounted regression and adjacent preservation

`src/palette/sectionFooterSearch.test.ts` mounts actual React `PaletteHost → CommandPalette → MoveToSection`. It drives the production input's onChange/onKeyDown and actual visible row callbacks. App/native/provider effects are forbidden or recorded at synthetic boundaries. This is mounted source-unit evidence, not a pure surrogate for the query reducer and not browser input.

Frozen17 SHA-256: `71c8d038ebe5abdb7910c7921dd7c8ce5c23e5bb5989b98c1847179dca50d8b7`.

- **Baseline reproduced:** 7 passing controls / 10 intended assertion failures, zero skips or cancellations. All ten failures are `ERR_ASSERTION`, not a loader or stub failure (`red.tap.gz`).
- **Treatment passed:** byte-identical frozen17, 17/17 (`green.tap.gz`).
- **Baseline affected:** 538 tests, 528 pass / exactly the same 10 intended failures (`adjacent-before.tap.gz`).
- **Final affected passed:** 541/541, including separate three ranking controls, zero skips/cancellations (`final-affected.tap.gz`).

The seventeen cases cover New/create aliases and casing, Remove/from aliases and exact assignment, both footer aliases, first-section creation, section value/name matching and ranking, group ordering, disabled current-section protection, empty inventory, no current section, no match/clearing, and modern/legacy composition guards.

A separate frozen three-case pure-production-model supplement (`ranking-controls.test.cjs`, SHA-256 `1c750d60b60adfece14604e83ae25e915cb58625a1f0195d4456adc142bc77ba`) covers disabled ordering, disabled contribution to group score, and stable equal-score ordering. The first candidate reported 2 passing controls / 1 intended ordering assertion failure, retained with its complete candidate production snapshot. The final treatment reports 3/3. The original17 was not edited to hide that gap.

The independently preserved increment changed eleven existing test-loader adapters by adding only an actual score namespace import and one exact require allowlist branch (one adapter already imported the scorer). At that base, #1448 `sectionQueryIsolation.test.ts` was absent and **NOT_APPLICABLE**. After #1448 actually merged, fresh main `d90bed88174656d577adfa793d3850d28eaea7e2` includes it; its now-applicable twelfth adapter adds only the real score import and one loader-map entry. `loader-before` archives all originals, including the original #1448 frozen13 bytes. `loader-changes.json` enumerates additions, and the verifier removes them to reproduce exact original hashes while comparing every test/assertion AST and count. No assertion is weakened, skipped, deleted, or replaced.

## Checks run on Reason Cloud

```bash
node --test src/palette/sectionFooterSearch.test.ts
node --test src/palette/sectionFooterSearch.test.ts evidence/palette/section-footer-search/ranking-controls.test.cjs
node --experimental-strip-types --test --test-concurrency=1 $(find src/palette src/keybindings -name '*.test.ts' -type f | sort) evidence/palette/pointer-selection-scroll/pointer-transition-controls.test.ts evidence/palette/shift-navigation/section-controls.test.ts evidence/palette/group-navigation/binding-controls.test.ts evidence/palette/section-auto-scroll/pointer-controls.test.ts evidence/palette/section-footer-search/ranking-controls.test.cjs
npm run typecheck
npm run build
node evidence/palette/section-footer-search/verify.cjs <already-retained-renderer.js>
git diff --check
```

- **Passed:** frozen17 and focused20, final affected541, explicit TypeScript, branding and production Vite build. Vite completed in 47.85 seconds, with only advisory bundle-size warnings.
- Typecheck then build ran sequentially in the ledger's explicit heavy-check slot; no concurrent test/build/tsc was started. The slot was explicitly released with an empty own-process receipt.
- **Passed:** full parent, sixteen spans, complete AST parses, source joins, frozen fixtures, original loader/test assertions and protected source pins. The final verifier count is recorded in delivery metadata and its own output.
- `log-identities.json` records raw/compressed log hashes and byte lengths; logs are losslessly compressed so diagnostic whitespace is preserved without adding diff whitespace errors.

The seven pre-existing optional historical VM failures in [#1442](https://github.com/reason-machines/openconductor/issues/1442) remain separate and unchanged. The affected command excludes that known-broken optional old fixture. This is **not a full-suite PASS**.

## Fresh-main integration after #1448

The verified increment was preserved as isolated commit `e547eede31c5` on main `2ada6e3e`, never appended to #1448. GitHub then confirmed #1448's actual squash `ee7bb510506906a08e2acff5e196a484bffb1480`; only afterward was the footer increment integrated onto fresh main `d90bed88174656d577adfa793d3850d28eaea7e2` for a separate PR against main.

- **Fresh baseline reproduced:** byte-identical frozen17 against main's unmodified `MoveToSection.tsx`: **7 controls pass / 10 intended assertion failures**, no loader failure or skip.
- **Integrated treatment passed:** focused20 and **554/554 affected checks**, including #1448's thirteen query-lifetime cases. The sole production delta remains the byte-identical footer fix; CommandPalette, Host, scorer, resolver and keybindings equal the integrated main.
- **Passed:** integrated `npm run typecheck`, then `npm run build` including branding and TypeScript, sequentially in the explicit ledger slot. Vite completed in **51.02 seconds**, only advisory bundle-size warnings. The slot was explicitly **RELEASED** with `ownHeavyProcesses=[]`.
- **Passed:** full retained parent and **256 source/AST/join/freeze/preservation checks** before final integration logs were added. The current verifier output includes additional lossless-log checks.
- `integration.json` pins the actual main, original commit, actual #1448 squash, unchanged upstream CommandPalette identity and twelfth adapter's original identity. The original `source.json` and historical logs/pins are unchanged. The pre-#1448 CommandPalette original is also archived and checked against its original pin; the upstream change is not silently accepted by replacing historical hashes.

## Publication and acceptance limits

This is a separate ready PR against main, not stacked on #1448 and not appended to that now-merged change. Publication and exact-head workflow/merge state must be reported separately from these source checks.

Browser event propagation, viewport geometry, physical input, VoiceOver/native accessibility, installed identity, persistence and package acceptance are **NOT_RUN**. No screenshot exists because this lane has no serialized browser/native admission. No app, provider, browser, native, package, workflow-dispatch or duplicate watcher was started. Existing release custody must identify an artifact containing the actual eventual squash and retest section query → New/Remove alias → exact action on that build; neither a successful build nor a merge proves packaged behavior.
