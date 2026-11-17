# Palette group-heading reveal

Owner: Conductor Rebuild / SAME15. Unit: `PALETTE-GROUP-HEADING-REVEAL-SAME15`.

## Qualified behavior

When keyboard selection reaches the first option in a headed palette group, Conductor requests nearest scrolling for the heading before the option. A middle option requests only its own reveal; headless groups have no heading to reveal. Pointer changes must retain their separate no-scroll policy.

This is distinct from #1428's section-list reveal and #1435's pointer-source suppression. The candidate stayed in an isolated worktree while #1435 was open and was not appended to it. Fresh-main integration below occurred only after #1435's confirmed merge; this is a separate ready PR against main, not a stacked PR.

## Complete retained REA-source closure

`source.json` contains UTF-8 half-open byte ranges and hashes for 18 complete records from the retained real-app REA-subject renderer, parent SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, 11,600,457 bytes. No new reference acquisition or vendor-code execution occurred.

- Actual dialog: `h_a → qZ/Y5s → KV/P6=Xyi → m_a`.
- Actual headed groups: `m_a → ff → P6.Group=j5s`. `j5s` emits the optional `cmdk-group-heading` followed by `cmdk-group-items`; item children occupy the latter. The Workspaces caller `l_a → ff/aYe → $o` uses the same group/item path.
- Actual items: `$o → P6.Item=M5s`. Pointer value changes carry the third suppression argument; they are not keyboard evidence.
- Keyboard: root `Q/X/J → setState("value", …) → D(5,z)`, scheduled through `G5s/DJ`.
- Actual consumer `z`: if the selected option is its items container's first child, find its closest group using `Eve`, find its heading with `P5s`, and reveal heading before selected item. `L6/$5s` bind the actual list-inner ref used by root `G`.

The verifier checks complete-parent equality, every record's identity and these joins inertly.

## Frozen mounted regression

Baseline: fresh default-branch commit `1e483efabf7798579c72587365d3ae0c93bd689d`.

Fixture: `src/palette/paletteGroupHeadingScroll.test.ts`, SHA-256 `b6e82caba5fbd821d0669dd10c531229bf83b38b1b2c9cc51cf976d2b4ad2fac`.

The fixture mounts actual `PaletteHost → CommandPalette` with real workspace rows, search and keybindings. Synthetic host refs are derived from the mounted host/group/heading/option ancestry. They record scroll requests, not layout geometry. External operations are inert or throw.

```bash
node --experimental-strip-types --test src/palette/paletteGroupHeadingScroll.test.ts
python3 evidence/palette/group-heading-scroll/verify.py <retained-renderer.js>
```

RED: **8 passing controls / 10 intended assertion failures**, exit 1, no skips. Every failure first proves the keyboard selected the intended actual first option, then observes a missing heading scroll request. The selected-option request itself exists.

Failure cases cover Home/ArrowUp in All, Actions, Settings and Workspaces plus Option+ArrowDown/ArrowUp between headed groups. Passing controls cover nonfirst rows in all four headed modes, headless Projects, IME, disabled/empty results and absence of pointer-driven heading reveal. `red.tap` preserves the complete output.

## Minimal isolated repair and verification

Only the selected-scroll effect in `src/palette/CommandPalette.tsx` changes production behavior: **6 additions / 1 deletion**. Inside #1435's unchanged pointer-source guard, obtain the actual selected option and its closest existing group; only when that option is the group's first actual option, request nearest scrolling for the existing heading before the existing selected-item request. No CSS, markup, helper, WorkspacesTab or keybinding changes.

The optional ancestor lookup retains compatibility with existing partial host refs; it does not replace actual mounted group traversal in the new fixture. A missing list/selection/group is inert.

Isolated checks on the candidate containing #1435's exact production behavior:

- Frozen 18 plus unchanged predecessor 15 and 4 pointer-transition controls: **37/37 passed**, no skips (`green.tap`).
- `node --experimental-strip-types --test --test-concurrency=1 $(find src/palette src/keybindings -name '*.test.ts' -type f | sort) evidence/palette/pointer-selection-scroll/pointer-transition-controls.test.ts`: **470/470 passed**, no skips (`adjacent.tap`).
- `npm run build`: **passed**, including branding, TypeScript and production build; advisory chunk-size warnings only (`build.log.gz`, lossless archive).
- `git diff --check`: **passed**.
- Retained-source verifier: **passed** complete parent, all 18 records, full closure and frozen identity.

The identical frozen 18 also reproduces **8 passing controls / 10 intended failures** against #1435's published-equivalent component tree (`predecessor-head-red.tap`), confirming that this is not the pointer-source repair. These isolated checks are not fresh-main integration results; the separately recorded integration below confirms and incorporates #1435's actual merge.

## Fresh-main integration after confirmed #1435 merge

`pr_get` confirmed #1435 merged at **2026-11-17T13:29:24Z**, actual squash **`e6f9dfcb2eb9e12dc3b1c67c41baa268236f7269`**. Both executed checks on exact published head `09cccfbb4ab6c417eb4ccb91b362cd9d80d8ad85` passed; five conditional jobs skipped. That actual squash was fetched as fresh main and merged into this Session's assigned branch before replaying the isolated successor.

- On the integrated but unfixed main tree, `node --experimental-strip-types --test src/palette/paletteGroupHeadingScroll.test.ts` reproduced **8 passing controls / 10 intended assertion failures**, exit 1, no skips or loader errors (`integrated-red.tap.gz`).
- Applied the same isolated selected-effect change from `9bb141373`, without changing the frozen fixture.
- `node --experimental-strip-types --test src/palette/paletteGroupHeadingScroll.test.ts src/palette/palettePointerScroll.test.ts evidence/palette/pointer-selection-scroll/pointer-transition-controls.test.ts`: **37/37 passed**, comprising the unchanged 18-case regression, 15 pointer controls and 4 query/tab-transition controls (`integrated-green.tap.gz`).
- `node --experimental-strip-types --test --test-concurrency=1 $(find src/palette src/keybindings -name '*.test.ts' -type f | sort) evidence/palette/pointer-selection-scroll/pointer-transition-controls.test.ts`: **470/470 passed**, no skips (`integrated-adjacent.tap.gz`).
- `npm run build`: **passed** branding, TypeScript and production build; advisory chunk-size warnings only (`integrated-build.log.gz`).
- `python3 evidence/palette/group-heading-scroll/verify.py artifacts/section-auto-scroll/retained-renderer.js`: **passed** complete retained parent, all 18 complete records, closed source joins, frozen fixture and integrated evidence checks.
- `git diff --check`: **passed**. All **42 existing affected fixtures** remain byte-identical to fresh main; production scope is only `src/palette/CommandPalette.tsx`, 6 additions / 1 deletion.

`integration.json` pins fresh main, the confirmed predecessor squash, unchanged fixtures, tested production bytes and lossless integrated-log digests. The selected-effect pointer-source guard is unchanged, so the heading request is still suppressed for pointer selection. No markup, CSS, helper, keybinding or WorkspacesTab expansion occurred.

## Acceptance boundary

Qualification and mounted-source evidence only. Browser DOM/geometry and actual viewport visibility, physical input, native accessibility, installed application identity, provider execution and package inclusion: **NOT_RUN**. No screenshot: runtime/browser/native execution is excluded from this lane and the existing serialized campaign has no admission for another check. No app, native, package or E2E dispatch and no duplicate watcher occurred. Existing Home271/SAME992 release custody remains unchanged.
