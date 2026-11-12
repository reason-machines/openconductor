# Workspace comment reads stay in their captured workspace

Conductor Rebuild fixes a late native list response replacing another workspace's rendered comments. `useReviewComments` now stores successful reads in a workspace-keyed map and selects the active workspace's bucket. The setter captures the request workspace. Same-workspace completion ordering and global errors are unchanged.

## Reference and source binding

The retained real-Conductor 0.87.6 REA asset is `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. This is retained shipped-byte source evidence, not a fresh installed-app observation.

- [Query](workspace-query.txt): `Svt.getWorkspaceComments` captures `localWorkspaceId`.
- [Result commit](workspace-result-commit.txt): `setWorkspaceComments` replaces `commentsByWorkspace[e]`.
- [Selector](workspace-selector.txt): `q7t` selects `commentsByWorkspace[currentWorkspace]`.
- [Original extraction binding](binding.json) records exact spans and hashes. Its OpenConductor source pin is historical. [Current compatibility](same275-current-main-compatibility.json) separately binds all five production modules to checked main `06500f5ef1230513090e42aebe0222fd4f83a72d`.

The assigned branch incorporated that main non-destructively before execution. The reviewed [candidate patch](candidate.patch.gz), retained with lossless gzip compression, applied without modification. The regression fixture retained SHA-256 `dffb8c0ec4cc77ebaa2916b856aced6a235ad1d63f1d5e5b27ead3ebc95cbfbd` before baseline, candidate, and controls.

## Actual baseline and candidate

The frozen two-case fixture mounts one real React hook, loads production `ReviewComments`, `commentsApi`, `commentStore`, `comments`, and `nav`, and defers the native `diff_comments_list` boundary. It checks rendered inline bodies and PR counts. It neither launches Tauri nor calls a real native provider.

Actual baseline on Cloud352 exited **1**, with **2 tests, 1 pass, 1 failure, no cancellations, skips, or todos**. Workspace B's inline body was correct after B's response. After A's older response settled, the same mounted hook displayed A's body instead. Only that retention assertion failed, at frozen fixture line 131. The unchanged-workspace control passed.

```bash
env DIFF_WORKSPACE_READ_REF=06500f5ef1230513090e42aebe0222fd4f83a72d nice -n 19 timeout --kill-after=5s 90s node --max-old-space-size=768 --test --test-concurrency=1 src/features/diff/workspaceCommentReadIsolation.test.ts
```

After the expected baseline failure, the exact reviewed patch was applied. The identical fixture then exited **0**, with **2 passes and no other counts**. Assertions, selectors, and inputs were unchanged. The baseline command reads only `ReviewComments.tsx` from the pinned main; its other four production dependencies matched main byte-for-byte.

```bash
git apply .oc-tmp/diff-workspace-read-census/candidate.patch
env -u DIFF_WORKSPACE_READ_REF nice -n 19 timeout --kill-after=5s 90s node --max-old-space-size=768 --test --test-concurrency=1 src/features/diff/workspaceCommentReadIsolation.test.ts
```

## Existing lifecycle controls

After the candidate passed, all **26 controls passed**, exit **0**, with no failures, cancellations, skips, or todos:

```bash
env -u DIFF_WORKSPACE_READ_REF nice -n 19 timeout --kill-after=5s 210s node --max-old-space-size=768 --test --test-concurrency=1 src/features/diff/fileCommentCountLifecycle.test.ts src/features/chat/reviewCommentHandoff.test.ts src/features/chat/desktopReviewHandoff.test.ts
```

The five existing frozen comment fixtures, package manifest, and lockfile were unchanged. Candidate `ReviewComments.tsx` was SHA-256 `e679a1986a3dc94f870be4173f0dabc92cce9dfb8923f1b158a996edd89a5a4d`. [Frozen source checksums](frozen.sha256) record the final bindings.

## Execution record and limits

[Terminal receipt](terminal-receipt.json), phase log, literal argument arrays, complete TAP, stderr, numeric exits, and before/after hashes are retained beside this record. Baseline TAP is losslessly compressed as `BASELINE.stdout.tap.gz`; its whitespace and original bytes are preserved. The existing serialized ACC grant was `07bb1609-1610-478d-a425-45a21cbb8b4a`. All three phases ran once, serially, within its new 480-second total bound. Actual total wall time was 207.084 seconds. Runtime was explicitly released at `2026-11-12T19:57:40.089964Z`, with owned jobs empty, before publication.

The dependency guard required this checkout's ignored non-symlink `node_modules`, canonical local package paths, the four locked versions, at least 1,536 MiB available memory, and 4 GiB free disk. No install or retry ran. Initial available memory was 23,548.98 MiB and free disk was 6.134 GiB.

Local typecheck, full frontend suite, build, browser, screenshot, Mac, native app, provider, package, and release verification were **not run** under this grant. There is no screenshot because browser and native execution were excluded. Node adapter checks do not establish native UI parity, real IPC behavior, or shipped-package inclusion. The older 90-second core timeout's cause remains unverified; the passing controls here do not explain it. DE6-03 and footer candidates remain unapplied. Every enabled exact-head hosted check must pass before merge.
