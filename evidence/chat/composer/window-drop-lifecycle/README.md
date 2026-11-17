# Window drop lifecycle — COMPOSER-EMPTY-DROP-135

Conductor Rebuild, 2026-11-17. Separate successor to merged #1432; not appended to its branch. Fresh `origin/main` checked at `6cc9a9c75cb2ee4cdec678bc51f6b2960dac2280`. The actual hook matched the frozen baseline byte-for-byte before edits.

## Bounded correction

Only `src/features/chat/useWindowDragDrop.ts` changes production behavior:

- On `enter`, derive dragging state from `event.payload.paths.length > 0`, rather than always advertising a file drop.
- Mark the effect disposed on cleanup. If registration resolves afterward, invoke its eventual unlisten handle immediately. If registration has already resolved, preserve the existing synchronous cleanup.

The drop callback/ref, exact nonempty path forwarding once, empty-drop behavior, non-Tauri/unavailable-webview exits and `nativePathToFile` are unchanged. No new rejection/cancellation policy, native API, permission, provider, shared Composer or WorkspaceView change.

The one new dedicated `.test.ts` follows the existing `useWindowDragDrop.test.ts` TypeScript-transpile/VM import-mocking style. All **eight test-case ASTs** match the frozen qualification, including both regression assertions and all six controls. The dedicated fixture hash was frozen before its first RED run and remains unchanged.

## Retained original source, not executed

The supplied archive SHA-256 is `6ab35e393e9ce24f57d32ec5ee6a83fbe0e03e8434562fd40dd4b2552205ff7f`. Its existing REA-retained Conductor 0.87.6 renderer is **11,600,457 bytes**, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; the identity matches the repository's frontend Tauri asset manifest. It was read as inert data, never evaluated or reacquired. The large renderer is deliberately not committed.

[Exact original manifest](reference.json) retains complete declarations, UTF-8/UTF-16 ranges and hashes for all six bindings:

1. `fCe` resolves the current webview through `VHt`.
2. Async `VHt.onDragDropEvent` forwards enter/drop paths unchanged and returns the combined disposer for four native event listeners; it does not pre-filter empty enters.
3. `LNi` derives enter state from nonempty paths, clears on leave/drop, ignores empty drops, and cleans up with `d.then(dTo).fireAndForget()`.
4. Complete `dTo` invokes the eventual unlisten handle.
5. Actual composer `ITo` calls `LNi` with its enabled/drop callback and passes `dh || se` into `c7i`.
6. `c7i` returns null when not visible.

The complete six exact spans are retained under `reference/`. The source verifier and historical `qualification.json` are copied unchanged from qualification. That historical JSON intentionally still describes **qualification**, not delivery. The verifier reads the original `.qa/composer-distinct-135` snapshot, not the treated live source, and includes its fresh-main hook/WorkspaceView bindings. Rehydrating the original supplied archive to its checkout-relative `.qa` paths is required to rerun that original 48-check verifier. No vendor JavaScript is executed by it.

No new REA failure was encountered because no new REA acquisition/runtime operation was attempted. Native event delivery/disposal remains the explicit evidence gap.

## RED → GREEN, run on Reason cloud

Dependencies: `npm ci --ignore-scripts --no-audit --no-fund`, using the existing lockfile, passed. No package or lockfile changed. JavaScript test/build dependencies were explicitly clarified as in scope by the coordinating Session; original-app/native/release/package production remained excluded.

Before the production edit:

```bash
node .qa/composer-distinct-135/verify-reference.mjs
sha256sum -c .qa/composer-distinct-135/frozen-before-run.sha256
node --test .qa/composer-distinct-135/windowDropLifecycle.qualification.test.mjs
node --test src/features/chat/useWindowDragDropLifecycle.test.ts
```

- Original source verifier: **48/48 passed**, zero failed.
- Both frozen inputs: **hash checks passed**.
- Frozen original fixture: **6 passed / 2 intended assertion failures / 8 total**, exit 1, no skips or cancellations.
- Dedicated fixture on untouched actual main hook: **6 passed / the same 2 intended assertion failures / 8 total**, exit 1, no skips or cancellations.
- Actual failures: empty enter incorrectly returned true; late registration had zero unlisten calls rather than one. No loader/setup failure was accepted as RED.
- Test-first local commit: `18aa82c3` (before hook correction).

After the edit, the frozen fixture was copied **byte-identically** to an isolated treatment tree; only that tree's relative `main/src/features/chat/useWindowDragDrop.ts` was copied from the treated actual hook. The original `.qa` snapshot/freeze remained intact:

```bash
mkdir -p .qa/window-drop-lifecycle-treatment/main/src/features/chat
cp .qa/composer-distinct-135/windowDropLifecycle.qualification.test.mjs \
  .qa/window-drop-lifecycle-treatment/windowDropLifecycle.qualification.test.mjs
cp src/features/chat/useWindowDragDrop.ts \
  .qa/window-drop-lifecycle-treatment/main/src/features/chat/useWindowDragDrop.ts
cmp .qa/composer-distinct-135/windowDropLifecycle.qualification.test.mjs \
  .qa/window-drop-lifecycle-treatment/windowDropLifecycle.qualification.test.mjs
cmp src/features/chat/useWindowDragDrop.ts \
  .qa/window-drop-lifecycle-treatment/main/src/features/chat/useWindowDragDrop.ts
node --test .qa/window-drop-lifecycle-treatment/windowDropLifecycle.qualification.test.mjs
node --test src/features/chat/useWindowDragDropLifecycle.test.ts
```

Both unchanged suites: **8/8 passed**, zero failures/skips/cancellations. The committed `frozen/` directory also preserves the exact original fixture and baseline hook; it can be used instead of the original `.qa` fixture when creating an isolated treatment tree. Do not replace its baseline hook in place.

Adjacent check:

```bash
node --test --test-concurrency=2 \
  src/features/chat/useWindowDragDrop.test.ts \
  src/features/chat/composerAttachments.test.ts \
  src/features/chat/composerAttachmentPreview.test.ts \
  src/features/chat/composerAttachmentSettlement.test.ts \
  src/features/chat/composerSession.test.ts \
  src/features/chat/composerPasteFilePaths.test.ts \
  src/features/chat/composerAsyncSubmit.test.ts \
  src/features/chat/composerCancelFocus.test.ts \
  src/features/chat/sendReadiness.test.ts
npm run typecheck
npm run build
npm run lint:colors
node evidence/chat/composer/window-drop-lifecycle/verify-current.mjs
git diff --check
```

- Adjacent tests, including the unchanged six-case `nativePathToFile` suite: **63/63 passed**, no skips/cancellations.
- Typecheck: **passed**.
- Build: **passed**, including branding and TypeScript; existing import/chunk-size advisories only.
- Color lint: **passed**, six checker tests plus source scan.
- Current source/frozen integrity and eight-case AST equality: **passed**.
- Original 48-check verifier and frozen hashes repeated after treatment: **passed**.
- Diff whitespace check: **passed**.

[Machine-readable receipts and identities](checks.json), unchanged [frozen qualification](frozen/windowDropLifecycle.qualification.test.mjs), baseline/treatment TAP and command logs under `results/` preserve the actual runs. `results.sha256` pins retained results; `inputs.sha256` pins frozen/source inputs and the dedicated fixture. Checks on the final published head are reported separately in the PR, not assumed from local runs. Conditional CI jobs skipped by repository policy are not passing executions.

## Acceptance limits

**No screenshot or recording:** browser/app/native runtime custody was not used or admitted in this hook-only source lane. Inert actual-hook callback/state/disposer checks are **not OS drag-event, rendered overlay, native listener disposal, full-app, provider, persistence, signed/installed build, package containment or final side-by-side parity proof**. A missed unlisten invocation does not demonstrate a later OS event, duplicate attachment, or quantified memory/CPU impact.

No native build, app/browser launch, provider call, original acquisition, release/package dispatch, installation or duplicate CI watcher occurred. Existing serialized release/native owners retain custody; this change does not claim deployment or package inclusion. The qualification page stays with SAME135's parent; no duplicate page was created. Merge only after all executed checks on the exact published head pass.
