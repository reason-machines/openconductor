# Pinned workspaces: newest pin first

Conductor Rebuild. Unit `SIDEBAR-PINNED-NEWEST-FIRST-271-01`.

## Source and defect

Baseline: main `6cc9a9c75cb2ee4cdec678bc51f6b2960dac2280`, which includes the selected-project numbering fix #1441. The assigned branch was merged with that main; its tracked source was identical before this repair.

The retained, unexecuted Conductor 0.87.6 REA extraction identifies renderer `renderApp-D_fmY7hW.js` (11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`) and index `index-BGEQ8YjU.js` (SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`). Historical parent REA evidence is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.

The 17 exact inert spans, half-open UTF-8 byte ranges, byte lengths and hashes are in [source.json](source.json) and [reference](reference/). Complete argument order is retained, not inferred from a minus sign:

```js
function jia(t,e){return e.pinnedAt-t.pinnedAt}
function bsa(t,e){return e.pinnedAt-t.pinnedAt}
```

`hBi` mounts `Pia` on its non-cloud arm. `Pia` selects eligible pins, maps `Fia`, sorts `jia`, maps `Mia`, and renders `v.map(Lia)`; `Lia` forwards the selected id to `Qj`. The same sidebar's numbered sequence uses descending `bsa`. `Xh` imports `Afe` from the retained index, applies the supplied selector and stabilizes by array position. The `u5 → OSr → EA → NO` structural-sharing path also preserves the new array's positions. No post-selector reversal is hidden in those receivers.

Current `pinnedEntries` instead sorted ascending timestamps, and `Sidebar` rendered that sequence unchanged. Local one-project witness: workspaces pinned at 100/200 display oldest/newest, while retained source requires newest/oldest. The production pin action assigns `action.at ?? Date.now()` and hydration restores `pinnedAt`; repository activity is a separate field.

## Exact correction and lease

The ledger collision acknowledgment granted only:

- `src/state/sidebarOrder.ts`: reverse the `pinnedEntries` comparator; update its matching comment.
- `src/state/sidebarOrder.test.ts`: migrate the existing pin-order expectations and test title only.
- New `src/components/sidebarPinnedOrder.test.ts` and this evidence directory.

The previous sidebar writer explicitly released its lease after #1441. The #1441 selected-project predicate and every other byte of `sidebarOrder.ts` remain unchanged; [verify.py](verify.py) reconstructs the baseline hash after reversing only the two authorized edits. Full old legacy test bytes/hash are retained in [legacy-sidebarOrder.test.ts.txt](legacy-sidebarOrder.test.ts.txt); the verifier permits only the exact pin-order expectation migration, with no cases/assertions removed or skipped.

Archive-filter keyboard qualification is parked, not implemented. No palette fallback, shared menu, Home component, membership filter, collapse, status, persistence or native code changed.

## Frozen regression

The new test mounts production `Sidebar`, production `SidebarSections` and the real `pinnedEntries` projection. Leaf workspace rendering and unrelated adapters are inert; this tests component-boundary row order, not a browser DOM or real drag/keyboard dispatch.

Twelve cases cover latest pin first, cross-project ordering, a subsequent pin update, independence from updated/created sort, stable equal-timestamp order, unpinned/archived-unpinned exclusion, section precedence, collapsed and empty Pinned, Status grouping and an unrelated hidden repository.

- **v1**, SHA-256 `611ebc8bf5bfe6f3cfd440144565f4e89819969dac7e3e7661f03ff0fc6f24f6`: baseline **7 pass / 5 intended ordering failures**, comparator correction **12 pass**. Full bytes, both logs and the first failed build are retained in [frozen-v1](frozen-v1/).
- The first build failed with `TS6133`: an unused destructured parameter in the inert `RepoWorkspaceList` mock. The ledger accepted removing that parameter only; the mock still returns null. No test or assertion changed.
- **v2**, SHA-256 `908182954bbbe26d07315b6e139feced0d5fef44d9d7ba1af60875f29ce38644`: the same v2 bytes were replayed on isolated baseline main and corrected source: **7 pass / 5 intended failures → 12 pass**, zero harness errors/skips/cancellations. v2 is not byte-identical to v1. The verifier checks their single helper-only difference.

## Checks run on Reason Cloud

- RED: `node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 scratch/home-gap-qualification/main/src/components/sidebarPinnedOrder.test.ts` — **7 pass / 5 intended assertion failures** against isolated baseline source. [Exact compressed log](red.tap.gz).
- GREEN: `node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/sidebarPinnedOrder.test.ts` — **12/12 passed**, unchanged v2 fixture. [Log](green.tap).
- Adjacent preservation: the command below — **205/205 passed**, rerun after the v2 correction. [Log](adjacent.tap).
- `npm run build` — **passed**, including branding, full TypeScript and Vite. [Log](build.log.gz). The initial harness-only failed build is retained separately, not reported as a pass.
- `npm run lint:colors` — **passed**, six lint tests and 1,248 files. [Log](lint-colors.log).
- `python3 evidence/sidebar-pinned-newest-first/verify.py` — **74 checks passed**: 17 span identities/extents, local and positional joins, v1/v2 freeze, RED/GREEN counts, exact legacy migration, production boundary and selected-project predicate preservation.
- `git diff --check` — **passed**.

```bash
node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 \
  src/components/sidebar*.test.ts \
  src/state/{sidebarOrder,sidebarGroupBy,navigationSections,persisted,repoOrder,store}.test.ts \
  src/palette/{shortcutOrder,sectionAutoScroll,moveToSection,createSection}.test.ts \
  src/home/{repoFilter,sidebarSort,sidebarGroupBy}.test.ts \
  src/sidebar/sidebarProjectFilterNumbering.test.ts
```

## Acceptance limits

This is retained-source plus mounted component-boundary proof. Hidden/archive controls cover an unrelated hidden repository and unpinned archived rows, not full hidden/archived pin-membership parity. The fix preserves existing membership byte-for-byte rather than claiming to requalify it.

Browser/screenshot, full App, native geometry/appearance, real pin persistence, OS shortcuts, provider and installed package behavior were **not run**. Existing exclusive runtime/native custody was neither acquired nor duplicated; that is why no screenshot is attached. No new REA execution or REA gap occurred. A build artifact is not an installed release. Actual merge identity, containing-package inclusion and native/per-repair behavior must remain separate receipts in the existing release-custody route.
