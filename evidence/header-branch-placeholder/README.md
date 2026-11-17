# Header placeholder branch label

Conductor Rebuild / Home271 owns `HEADER-PLACEHOLDER-LABEL-271`. The ledger granted an exclusive source lease for `WorkspaceBranchHeader.tsx`, `workspaceBranchPrefix.test.ts`, and this evidence directory before edits. No product runtime or native lease was requested.

## Revalidated source gap

Freshly fetched `main`, independently resolved through the repository provider, was `f60b6e365395ceb62b2b2ec6e1542a16a5b0d0ee`. Its header formats only `workspace.branch`, even though `placeholderBranchName` is a separate existing field:

- `src-tauri/src/persistence/mod.rs` maps nullable database `branch` to an empty string and forwards `placeholder_branch_name` separately.
- `src/state/persisted.ts:workspaceFromRow` preserves those two values independently.
- `src/components/WorkspaceView.tsx` passes that workspace directly to `WorkspaceBranchHeader`.

The retained real-Conductor 0.87.6 REA source contract is historical, not a fresh installed-app observation. Parent evidence is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`; the retained renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The existing [prefix reference packet](../header-branch-prefix/reference.json) retains these exact UTF-8 half-open spans:

- `bro` `[7206225,7209202)`: actual branch first, otherwise `placeholderBranchName`; format either with `zce`.
- `yoo` `[7302745,7303279)`: the same branch/placeholder precedence for the archived label.
- `zce` `[2153685,2153763)` and `zcs` `[2153599,2153685)`: remove a configured prefix only when it matches.

The [local-details packet](../header-local-details/source.json) also retains index `w_` `[862181,865564)`, which reads branch and placeholder independently from the database. All five retained excerpt SHA-256 values and byte lengths were reverified without executing reference JavaScript. [This receipt](reference.json) pins their packet hashes, asset identities, ranges, and measured-main implementation files. This check rehashes retained excerpts, not either complete original asset. No new REA invocation, error or acquisition was made; existing REA extraction/partial-graph limits remain unchanged.

Before publication, main advanced to `8e3c9e02bdb11817066c3d03c7a2fa13354dd3c7` through the unrelated #1378 diff-shortcut correction. That main was merged into this assigned branch. All four source pins and the missing-dependency import remain unchanged, with no composer-file delta.

## Minimal correction

Choose `workspace.branch || workspace.placeholderBranchName || ""` for **display only**, then apply the existing prefix formatter. Both active and archived text/title now use the placeholder when the actual branch is absent. The actual workspace and controller still receive the original branch. Copy and Rename therefore remain unavailable for a missing actual branch; no placeholder is fabricated into Git state. This does not alter the existing no-label rendering behavior, persistence, menu ownership, or other header controls.

## Checks actually run on Reason Cloud

The same mounted source-unit fixture was executed before and after the one-line product correction. Native operations are mocked; production header, prefix hook, and branch controller execute with React test renderer. This is not browser or native UI acceptance.

```bash
timeout 90s node --max-old-space-size=512 --experimental-strip-types --test --test-concurrency=1 src/components/workspaceBranchPrefix.test.ts
```

- **RED:** 15 passed, 6 failed, exit 1 ([raw output](red.txt)). Only active/archived placeholder cases failed, for matching, unmatched and absent prefixes.
- **GREEN:** 21 passed, 0 failed, exit 0 ([raw output](green.txt)). The test file was unchanged between runs. Controls cover null/empty placeholders, actual-branch precedence, no placeholder-driven Copy/Rename I/O, existing real-branch Copy/edit behavior, and live prefix refresh for actual branches. Placeholder-specific live refresh was not separately exercised.
- **Adjacent passed:** 40/40, exit 0 ([raw output](adjacent.txt)):

```bash
timeout 90s node --max-old-space-size=512 --experimental-strip-types --test --test-concurrency=1 src/components/workspaceBranchHeader.test.ts src/components/workspaceBranchTitle.test.ts src/state/persisted.test.ts
```

- **Typecheck failed locally, environment-limited:** the initial `tsc --noEmit` with a 768 MiB V8 heap exhausted that limit ([receipt](typecheck.txt)). Retrying with 2048 MiB completed with exit 2: `TS2307`, existing dependency `@tauri-apps/plugin-fs` is absent from this checkout's `node_modules` ([candidate receipt](typecheck-2048.txt)). A direct source export of the measured main, with its referenced fixture inputs, produces the same sole missing-module diagnostic with those same dependencies ([main receipt](typecheck-main-complete-inputs.txt)). No dependencies were installed or declarations fabricated. Automatic exact-head CI remains the full installed-dependency typecheck/build gate.
- **Integrated source-unit checks passed:** all 61 focused and adjacent cases passed after merging main `8e3c9e02b` ([receipt](integrated.txt)); the test inputs were unchanged.
- **Whitespace passed:** `git diff origin/main --check` and `git diff --check`. Trailing spaces were removed from the diagnostic log excerpts only; assertions, results, and fixture bytes were not altered.

No local build, product/browser runtime, provider turn, install, native app, package, release, workflow dispatch or rerun occurred. Exact-head hosted checks must finish before merge; skipped jobs are not passed tests.

## Deferred native acceptance

**NATIVE_NOT_RUN.** The existing sole native executor retains its isolation and admission prerequisites. On an admitted disposable profile and identified consuming build, check active and archived local workspaces whose actual branch is absent but whose placeholder exists: label and hover title should show the placeholder with matching/unmatched/no prefix settings. With no actual branch, Copy must remain disabled and Rename must not enter editing. A real branch must take precedence without altering its full Copy/edit value. Null/empty placeholders must not invent a branch. Capture side-by-side evidence through that existing owner only.

There is no screenshot because this lane has no browser/native runtime admission. Source-unit results do not establish installed identity, WebKit title timing, native focus, pixels, or final Home/sidebar/header parity.
