# Repository-removal settlement ownership

Conductor Rebuild — `REMOVE-REPO-LATE-SETTLEMENT-6013`.

## Qualified mismatch

On default main `e6f9dfcb2eb9e12dc3b1c67c41baa268236f7269`, App's removal success callback unconditionally clears `removingRepoId`. A user may submit removal of repository A, dismiss its pending presentation through the existing permitted close callback, and open removal of repository B. A's later success then closes B, even if B has its own pending operation. The captured success callback correctly removes A from the store; only its presentation cleanup has the wrong ownership.

Unlike the rejected same-workspace restore-remount candidate, this sequence needs neither another request for the same workspace nor a second B mutation. Repository A and B are independent targets. No backend in-flight bypass or fabricated restore result is involved.

## Retained real-Conductor contract

The existing REA renderer and companion index were read as inert source data. No new acquisition, app run, code evaluation or whole-asset identity sweep occurred. `qualification.json` and `verify_source.py` bind six exact UTF-8 half-open source spans:

- Complete `Dra`, renderer `[10078590,10084752)`: each repository row owns its local `[h,m]` open flag. The removal mutation's per-call success invokes only that row's `m(false)`; root close requests also use `m`.
- Complete `dBi`, renderer `[10085016,10088805)`: repository rows are rendered under stable repository-ID keys. A's removal does not replace B's local dialog state.
- The renderer import `od as csi` resolves to index export `sQt as od`.
- Complete `sQt` and `D2t`: the mutation hook delegates deletion of the selected repository; its hook-level success emits `repository_deleted` analytics and does not globally close a removal dialog. Its route change, when applicable, occurs before awaiting deletion, not on late success.

All six source bindings and their local-ownership assertions passed. This establishes a retained-source expectation, not a fresh real-app observation.

```bash
python3 evidence/dialogs/remove-repository-late-settlement/verify_source.py \
  --renderer <existing-retained-renderer-archive> \
  --index <existing-retained-index>
```

## Frozen regression

Test-first commit `2759e32cd` contains the fixture and RED receipt before the production change. Fixture SHA-256 is `8e3285f0fc2effa0d4ef85ed928677c358878e47301a59847c1e55002567d3dc`.

The test mounts actual `RemoveRepositoryDialog`, `ConfirmationDialog` and the `repoMisc.removeRepository` adapter. It extracts App's exact state declarations, target lookup, menu-open handler, Sidebar callback binding, removal JSX and success callback using TypeScript's AST. It also executes the actual `removeRepo` reducer case. There is no direct request-state setter injected by the test.

Only native IPC, DialogFrame's DOM/focus boundary and the shortcut icon are stubbed. The synthetic Sidebar boundary calls the production callback; the frame boundary calls the actual shared close handler. No keyboard event, full Sidebar, whole App, browser, native service, real repository deletion or filesystem mutation is exercised.

```bash
node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap \
  src/components/removeRepositoryLateSettlement.test.ts
```

Baseline: **3 passed / 2 intended failures**, no setup failures, skips or cancellations. The failed assertions are `late A settlement must not close B's removal dialog` and `late A must not dismiss pending B`. The normal current-target success, late rejection and success after dismissal without replacement all passed. See `red.tap`.

## Narrow correction and current verification

The sole production change replaces App's unconditional success cleanup with an identity-guarded functional state update, following the existing target-registration cleanup pattern already used in App. A's successful deletion still removes A and emits the same notification. B's dialog and pending operation are left alone; B's own success still closes it. RemoveRepositoryDialog, ConfirmationDialog, the adapter, reducer and backend are unchanged.

On the qualified source baseline plus that correction:

- Unchanged five-case regression plus `src/settings/repoMisc.test.ts`: **9/9 passed**, no skips/cancellations. See `green-adjacent.tap`.
- `NODE_OPTIONS=--max-old-space-size=2048 npm run typecheck`: **passed**.
- `NODE_OPTIONS=--max-old-space-size=2048 npm run build`: **passed**, including branding and full TypeScript; existing import/chunk warnings remain. Logs are compressed alongside this report.
- Existing removal-pending and restore-pending source-handler probes: **passed** before the change; their production primitives remain unchanged.
- Frozen fixture checksum, four untouched component/adapter/reducer source pins, and diff hygiene: **passed**.

All checks ran serially in the foreground on Reason Cloud. A tool execution interruption occurred after the validation command completed; its recorded exit 0 and full result were recovered, not rerun or inferred.

## Fresh-main integration after #1436

PR #1436 actually merged at `73aa5579f97c9c90094314fb39c0dedd3b01237e`. Fresh default main `1b2d83e6c2e2b3fa2eb251fc25a56d96401d96f1` contains that merge. The isolated candidate was integrated only after this receipt; nothing from it was appended to #1436.

Before applying the correction on that main, the unchanged fixture again produced **3 passed / 2 intended failures**, no skips/cancellations (`red-fresh-main.tap`). Integrated test-first commit `f69f29bca` and fresh RED receipt commit `0779d5600` precede correction commit `8abe32266`; the original isolated commits remain `2759e32cd` and `25365ef99`.

After that same one-line correction:

- Frozen five-case regression plus all adjacent controls **passed 36/36**, no skips/cancellations (`green-fresh-main-adjacent.tap`). Command: `node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap src/components/removeRepositoryLateSettlement.test.ts src/settings/repoMisc.test.ts src/components/restoreWorkspaceReplacement.test.ts src/workspace/archiveModel.test.ts src/workspace/archivedList.test.ts src/components/motion/dialogMotion.test.ts src/components/renameWorkspacePendingBranch.test.ts`.
- `NODE_OPTIONS=--max-old-space-size=2048 npm run typecheck` and `NODE_OPTIONS=--max-old-space-size=2048 npm run build` **passed**, including branding, TypeScript and Vite. Existing static/dynamic import and chunk-size warnings remain. Fresh logs are retained compressed alongside the original logs.
- Six retained byte/hash joins and local-close ownership assertions **passed** (`source-fresh-main.txt`). The four unchanged component/adapter/reducer source pins, both this fixture and #1436's frozen fixture checksums, and `git diff --check` **passed**.

All validation ran serially in the foreground on Reason Cloud, reusing the isolated worktree's existing dependencies without a new install. `integration.json` records the baseline, fixture identity, checks and log hashes. The separate ready PR targets main; this does not establish package embedding or installed behavior.

## Acceptance limits

This is mounted source/component-boundary verification, not a full-App or browser test. Browser focus/keyboard behavior, visuals, installed persistence, actual deletion, native/package inclusion and final side-by-side acceptance remain unverified. No screenshot or recording exists because this source-only lease does not admit a UI runtime. E1, #1425, native/provider, package and runtime holds remain unchanged. No watcher or workflow was manually dispatched.
