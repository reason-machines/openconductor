# Home's archived-only empty-state action

Conductor Rebuild / `HOME-ARCHIVED-EMPTY-ACTION-271-04`.
Qualification baseline: main `51e6b1be397ebd294a11f5c827a68abbb7f57c3f`.

## Contract and actual local path

Retained Conductor 0.87.6 renderer identity is SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its normal `/all-workspaces` route mounts `UJo`. `Xh` imports `cb`, whose retained index export is `Afe`; `Afe` reads `YBt` and applies `QBt`/`J$`. Those index spans are historical retained source, with literal hashes checked in this qualification, **not** a fresh full-index asset rehash.

`YBt` includes all cached workspace rows. The local `QBt` scope does not exclude archived rows. `UJo` limits them to linked repository IDs, and for a local organization its owner-filtered `it` list is the complete pre-archive-filter list. Default filters `LJo` have owners undefined, no projects, and active state. The `Or` Create predicate requires `it.length === 0`. When linked archived rows exist, the active filter hides the rows but **Clear filters**, not **Create a workspace**, is offered. `MJo` clears to all archives without changing the text query.

The current local persistence path is different internally: `reposFromDb` excludes archived rows from sidebar workspace arrays, while `listArchivedWorkspaces` supplies them separately through actual `archivedFromRows` / `workspaceFromRow`. The component already uses this separate list for Home rows and project choices, but its empty-state predicate receives only the sidebar arrays. The old archived-only empty-action test manually placed an archived row in those arrays and did not exercise this real persisted-row split; its fixture and expectations remain unchanged.

[The source receipt](reference.json) records eleven retained source spans, exact ranges/hashes, six baseline source pins, and the new frozen fixture digest. Full renderer identity and renderer spans were freshly verified without evaluating any original app code. Existing index-span identity custody comes from `evidence/home-project-eligibility/reference.json`.

## Frozen rendered regression

Fixture SHA-256: `37caa4d8c61faf7d1755b990094d946d93cbecb2cc63c532dc9ed683a3ee32ba`.

```bash
node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/homeArchivedEmptyAction.test.ts
```

Qualification **RED: 5 controls passed / 5 intended assertions failed**. Each failure is the actual rendered `Create a workspace` instead of `Clear filters`, not an import or infrastructure failure. [Original RED log](red.tap.gz) is retained losslessly.

Witnesses cover empty/matching/nonmatching text queries, two linked archived-only repositories, and clearing to reveal the persisted row with the same query/name and no create/unarchive dispatch. Controls preserve true-empty Create, unlinked archived rows, active-row query miss, all-mode empty state, archived-mode empty state, independent header Create, and nonmutation of persisted inputs.

## Minimal repair and verification

Ledger exact-path deduplication passed before product edits. The component now forwards its existing `archivedRows` to `emptyAction`; the helper accepts that optional list and reuses the existing `reposWithWorkspaces` predicate. No matcher, archive/project filter semantics, shared formatter, sidebar, header, state store or backend changes.

- **GREEN 10/10:** the exact frozen test above, unchanged; [log](green.tap).
- **PASS 236/236:** `timeout 150s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/allWorkspaces*.test.ts src/components/home*.test.ts src/home/*.test.ts src/components/sidebarLabel.test.ts src/state/persisted.test.ts src/workspace/archivedList.test.ts`; [log](adjacent.tap.gz). This includes #1413's original fixture and old empty-action assertions, not the separately pending #1419 fixture on this main baseline.
- **PASS:** `timeout 180s npm run build` (branding, full TypeScript and Vite production build); [log](build.txt.gz). Existing bundle-size advisory only.
- **PASS 34 checks:** `python3 evidence/home-archived-empty-action/verify_reference.py --renderer <retained-renderer>` checks original renderer ranges, retained index literals, exact two-file change boundaries, unchanged adjacent sources and frozen RED fixture. `sha256sum -c evidence/home-archived-empty-action/fixture.sha256` and `git diff --check` also passed.

## Fresh-main delivery integration

PR #1419 was independently confirmed merged at `7b2ed2475cec621ff1c934612375dd6bbfeb3e22` before this separate unit was integrated. On that exact main baseline, the unchanged frozen fixture again produced **5 passing controls / 5 intended failures** ([fresh RED](integrated-red.tap.gz)), then **10/10 GREEN** ([fresh GREEN](integrated-green.tap.gz)) after the bounded repair. The test's complete SHA-256 is unchanged.

The same adjacent command passed **246/246**, now including #1419's ten unchanged Unicode cases ([fresh adjacent log](integrated-adjacent.tap.gz)). `timeout 180s npm run build` passed full TypeScript and Vite again ([fresh build](integrated-build.txt.gz)). All **36** retained-source/freeze/boundary checks passed; the source receipt preserves the original qualification pins separately from the fresh integration baseline. No existing fixture or product logic outside the leased helper and call changed.

This is a separate ready PR against main, not appended to or stacked on #1419.

## Limits

No browser, native, installation, package, runtime or provider action was run, and no workflow or watcher was dispatched. No screenshot: browser/native execution remains with serialized owners and was not admitted here. React test-renderer is not pixel parity or installed macOS acceptance. Full application suite and full index asset rehash were not run. Existing serialized execution custody is unchanged.
