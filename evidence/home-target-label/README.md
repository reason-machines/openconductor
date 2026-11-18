# Home workspace-target labels

Conductor Rebuild / `HOME-TARGET-LABEL-271-01`. Baseline main: `eef01e9b287472280fb3f4a585bc697d5f1f8f51`.

## Source contract

The retained real-app REA renderer (`5199d392…`, Conductor 0.87.6, evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`) supplies `hi.intendedTargetBranch` to `$V` in Home's `UJo`. The display-name helper suppresses a branch equal to that target, falling back to the directory name. The archived path uses the stored branch rather than the live branch cache. The retained native decoder `w_` supplies `intended_target_branch ?? "main"`.

[reference.json](reference.json) retains nine exact renderer spans, the prior native decoder span, their byte ranges/digests, fresh-main source pins and the frozen test hash. The whole retained renderer and all nine original slices were freshly checked; the complete native index was not freshly rehashed. Its decoder span remains under the earlier [header-details custody](../header-local-details/source.json). No new REA acquisition or engine run occurred. The known REA semantic-renderer heap limitation remains; no new REA failure was encountered.

OpenConductor already retains this field through `DbWorkspaceRow.intendedTargetBranch` → `workspaceFromRow.targetBranch` → `archivedFromRows`. But `AllWorkspaces` → `homeRows` supplied the repository default to the existing formatter instead. An archived workspace on its explicit `develop` target therefore displayed `Develop` instead of `Cairo` when the repository default was `main`; the opposing case incorrectly hid `main`.

The correction changes only Home's target argument to `labelTargetBranch(workspace.targetBranch)` and imports that existing helper. This preserves the decoder's null/older-row `main` fallback without changing the shared formatter, persistence, branch-prefix handling, sidebar, header, settings or backend. Existing stored-name precedence, Home context menus and earlier regression files are untouched. Ledger collision reconciliation preceded the product edit.

## Frozen rendered regression

The new ten-case test renders production `AllWorkspaces` with the actual persisted-row conversion, archive conversion, `homeRows` and label formatter. Archive transport, settings/session state and decorative leaves use bounded fixtures; native I/O is not invoked. It locates the row by role before checking visible label, row title and repository context.

Inputs cover opposing repository/workspace targets in both directions, null and older-row fallback, matching targets, ordinary branch formatting, stored/PR/explicit-user names, and the same label while search is active. The file was frozen before the product edit; its hash in [fixture.sha256](fixture.sha256) is unchanged.

- **Actual RED:** five intended label/title mismatches and five passing controls; exit 1, zero skipped/cancelled tests. All ten cases reached a rendered row and retained the same repository context. [red.tap](red.tap)
- **Actual GREEN:** the identical ten cases passed after the two-line production correction. [green.tap](green.tap)
- **Adjacent checks passed:** 226 tests, including existing Home labels, keyboard/filter/context-menu tests, Home logic, shared label rules and persisted conversion. [adjacent.tap](adjacent.tap)
- **Typecheck passed:** complete `tsc --noEmit`, exit 0. [typecheck.txt](typecheck.txt)
- **Static checks passed:** 44 reference/baseline/frozen-fixture/unchanged-neighbor assertions, frozen SHA readback and `git diff --check`.

Commands run on this Session's Reason cloud computer:

```bash
timeout 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/homeTargetLabel.test.ts
# Before the fix: 5 pass / 5 intended fail. After: 10/10 pass.
timeout 120s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/allWorkspaces*.test.ts src/components/home*.test.ts src/home/*.test.ts src/components/sidebarLabel.test.ts src/state/persisted.test.ts
# 226/226 pass.
timeout 150s node --max-old-space-size=2048 node_modules/typescript/bin/tsc --noEmit
# Exit 0.
python3 evidence/home-target-label/verify_reference.py --renderer <retained-renderer>
# 44 checks pass; without --renderer it validates receipts, not original asset bytes.
sha256sum -c evidence/home-target-label/fixture.sha256
git diff --check
```

## Limits and existing custody

These are source and React test-renderer results, not browser pixels or installed macOS behavior. No screenshot is available because application/browser/native runtime is deliberately left with the existing serialized owners. A full local build, full unit suite, package, installation, native/provider actions and side-by-side visual acceptance were not run. Ordinary exact-head CI remains the merge gate; no manual job, package dispatch or watcher was added. The earlier package #1791 cannot contain this later fix. Existing release custody and acc3's hosted E2E boundary are unchanged.
