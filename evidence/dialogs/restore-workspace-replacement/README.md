# Restore-dialog workspace identity

Conductor Rebuild — `RESTORE-DIALOG-REPLACEMENT-6013`.

## Reproduction and source contract

Two ordinary local unarchive operations may be outstanding for different workspaces. `store.ts` invokes `startUnarchive` independently for each action; there is no global single-request gate. If A returns a restore scenario, its dialog opens. Starting A's new-branch restore sets that component's local `pending` state. If the already-outstanding B operation then returns its restore scenario, the actual App event handler replaces `restoreRequest` with B.

Fresh main `1e483efabf7798579c72587365d3ae0c93bd689d` renders the restore component without a React key. The new B props therefore inherit A's `pending=true`. B's actions are disabled despite no B restore having been submitted; the completion event for A is correctly filtered out by B's workspace ID and cannot clear that stale state.

The retained Conductor source instead renders `m6a` with key `workspace.localId`. Its `BYe` import resolves through index export `hG` to `HYt`, which creates `Be(...)`. `Be` constructs a new `Zqe` observer in `useState`; the constructor has no current mutation and reads `Ute()`'s idle state. Replacing the workspace identity thus creates nonpending content, whereas refreshing the same identity retains its existing mutation.

`qualification.json` records eight exact UTF-8 byte ranges and hashes for the keyed consumer, mutation hook/import/export, observer and idle initializer. The whole-asset identities come from already-authorized retained custody, not a new acquisition or whole-asset resweep:

- Renderer: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Companion index: `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- The complete `HYt` body also matches the existing Home owner's #1429 receipt at `evidence/home-archived-context/spans/HYt.txt`.

The verifier reads those original bytes as data and never evaluates vendor JavaScript:

```bash
python3 evidence/dialogs/restore-workspace-replacement/verify_source.py \
  --renderer <existing-retained-renderer-archive> \
  --index <existing-retained-index>
```

Result: **all eight byte/hash bindings and keyed idle-observer assertions passed**.

## Frozen regression

`src/components/restoreWorkspaceReplacement.test.ts` mounts the actual `RestoreWorkspaceDialog` and `ConfirmationDialog`, and compiles the exact restore JSX mount expression and event-to-request branch read from production `App.tsx`. It drives the real `startUnarchive`, event bus and `restoreRequestFor` with two deferred synthetic backend results. It does not inject request state directly. The same-workspace refresh control uses an event, not a setter.

Only the DOM/focus `DialogFrame` boundary and shortcut icon are stubbed. This is a mounted source/component boundary test, **not a mount of the whole App, a browser interaction or native observation**. No backend, provider, filesystem operation, app launch, install or package run occurs.

The fixture SHA-256 is frozen in `fixture.sha256` before the first production edit. The original qualification on main `d14e1307fe225f4bf9128545551ae36709b1b4cd` and the fresh-main rerun both produced **3 passed / 1 intended failed assertion**, no skips or setup failures:

> workspace B must not inherit workspace A's pending mutation — `true !== false`

`red.tap` and `red-fresh-main.tap` preserve those runs. An earlier scratch setup attempt omitted the snapshot of `ConfirmationDialog.tsx`; that setup failure was corrected before this fixture was frozen and is not counted as the regression RED.

```bash
node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap \
  src/components/restoreWorkspaceReplacement.test.ts
```

The qualification runs used an isolated scratch installation of React and react-test-renderer 18.3.1 and TypeScript 5.9.3, resolved through `NODE_PATH` for the fresh-main run. The first run used `DIALOG_SOURCE_ROOT` pointing at pinned main source files; the fresh-main rerun read the actual checkout after a non-destructive merge. No package or lock file changed.

Controls preserve:

1. Pending state for a refreshed scenario of the **same** workspace.
2. Late A completion not closing the displayed B request.
3. Unrelated unarchive completion without a scenario not replacing A.
4. After the targeted correction: B can dispatch its own restore, then only B completion closes it.

The existing pure archive-model suite also passed **16/16** before the production change (`archive-model-before.tap`). Subsequent verification is recorded with the delivered correction, not implied by this test-first evidence.

## Delivered correction and verification

Test-first commit `92f0344f` contains the frozen fixture and RED receipts before any production edit. The correction changes only the existing restore mount in `App.tsx`, adding `key={restoreRequest.workspaceId}`. DialogFrame, the restore component, event model, backend and every other dialog remain unchanged.

On the same integrated main, after that one-line correction:

- The unchanged four-case regression **passed 4/4**; fixture SHA-256 remains `4fa1b255afc493e1620c88ec8742f1e6758447450652b5ace5217360c732cc88`.
- Combined regression plus `archiveModel.test.ts`, `archivedList.test.ts`, `dialogMotion.test.ts` and `renameWorkspacePendingBranch.test.ts` **passed 27/27**, no skipped or cancelled tests. Command: `node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap` followed by those five files; see `green-adjacent.tap`.
- `NODE_OPTIONS=--max-old-space-size=2048 npm run typecheck` **passed**. The first 768 MiB attempt exhausted that deliberately small heap; its log is retained separately and is not counted as a type-error result.
- `NODE_OPTIONS=--max-old-space-size=2048 npm run build` **passed**, including branding, full TypeScript and Vite output. Vite emitted its existing dynamic/static-import and large-chunk warnings.
- The eight retained source checks, frozen-fixture checksum and `git diff --check` **passed**.

All checks ran serially on Reason Cloud with low-priority foreground processes. The first combined neighboring run had 24 passes plus a `react` ESM-resolution setup failure because only scratch dependencies were installed. A normal `npm ci --ignore-scripts --no-audit --no-fund` resolved that setup; the complete combined run above then passed. No package or lock change was needed, and the failed setup is retained as `adjacent-before-install.tap` rather than reported as a product regression.

## Limits

This source contract does not prove installed Conductor behavior, full-App integration, DOM focus, pixels, browser keyboard handling, persistence, native/package inclusion or a real restore operation. Those are not acceptance claims here. Existing E1/native holds and other source owners are unchanged. The dirty-title Cancel/focus evidence dependency is separate and is not exercised by this fixture.
