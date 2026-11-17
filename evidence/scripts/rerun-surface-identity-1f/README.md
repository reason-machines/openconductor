# A replacement run owns a fresh terminal and Find surface

Author: Conductor Rebuild. Initial source-only qualification used fetched main `93b9d53ce02970967a831b0ac93ecdbf17bdea31`. Frozen baseline/treatment were replayed after #1427's actual merge `5284779b7cb8705170b64968cc92eefd3a4740a0`; final affected tests, typecheck and assigned-branch production build include main `08be22cfcb0034e23171fe9b5f3b0a5df93585f3`. The three existing touched files are identical between those two main pins. This is distinct from #1427's raw output-string cache isolation: the actual output component's lifetime still used only workspace/task identity.

## Retained real-app contract

Previously acquired Conductor 0.87.6 REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`, original archive SHA256 `991f15ebf130ccb8e705fc74f612dbb46095bd6d73b420fbced1ffbcd94165bc`. Vendor source is inert untrusted data, never evaluated. No new acquisition ran.

`source.json` binds both complete original assets and 22 exact byte spans. Complete declarations were located with TypeScript's parser (zero diagnostics); positions were converted to UTF-8 byte offsets. `verify-reference.py <original-glob-archive>` checks original bytes and this full chain:

1. Actual process/last-run identity -> `useTaskRunId` -> `Le/Ve`; the Run-panel consumer both passes `runId:Ve` and keys `OJs` by `Ve`.
2. `OJs` -> `vSe/EI` derives `run:${runId}` -> `xEi` upserts that run/surface configuration through `AO(AJs)`.
3. `K2 as g5` / `g5 as AO` closes the exact surface-store binding. `K2` stores configurations by `surfaceId`; the `d$t`/`js.subscribe` path removes the predecessor's surface when its last-run identity changes.
4. `aSa` selects that store's configurations through `uSa`, then maps `lSa`. `lSa` keys the wrapper containing the actual run terminal `rSa` by `config.surfaceId`.
5. `rSa` uses that same ID as `terminalKey`, owns local selection state and renders visible `iSa`. `iSa` owns `dzt`, whose Find-open state starts false and query starts empty, then passes those values to the Find view. A replacement run therefore cannot inherit the predecessor's Find component state.

This closes the surface/consumer/local-Find path, not any native terminal serializer or kill ABI.

## Actual mounted reproduction

The new `src/scripts/rerunSurfaceIdentity.test.ts` fixture, frozen SHA256 `1a5da8c156c3d15f191ff7b98e27879e91c2615f47b9d89084bf9786e6be7091`, mounts actual ScriptsPanel, ScriptOutput, FindBar, useBufferFind and find helpers, plus the real API/selection/body helpers. Only IPC/events, terminal painting/geometry and unrelated services are boundaries. Status replies copy values like serialized IPC; rejected commands use serialized strings. No app, browser, process or PTY is launched.

```bash
NODE_ENV=development node --test --test-concurrency=1 src/scripts/rerunSurfaceIdentity.test.ts
```

Baseline: **2 intended failures / 5 passing controls / zero skips**. Both Dev and Test leave the predecessor's Find bar open after actual run identity changes from `run-1` to `run-2`. This checks real rendered FindBar state, not the presence of a run-ID prop or a mock output component.

The passing controls retain the same run's terminal/search through refresh and completion; isolate equal IDs in different workspaces; retain the terminal/query/error after a rejected replacement; keep completed-empty output searchable; and preserve a stable legacy output fallback without a run ID. The terminal fixture explicitly clears selection on RIS: **no stale xterm-selection claim** is made.

Before the freeze, the optional error-preservation assertion exposed a cross-VM Error-object fixture mismatch; the IPC boundary was corrected to serialized rejection strings. That preparation failure is not a product regression. The frozen baseline has only the two intended Find-state failures.

Before product edits, nine adjacent suites passed **77/77**, zero skips:

```bash
NODE_ENV=development node --test --test-concurrency=1 \
  src/scripts/runOutputSelection.test.ts src/scripts/outputCursor.test.ts \
  src/scripts/outputCopy.test.ts src/scripts/runningInput.test.ts \
  src/scripts/runningResize.test.ts src/scripts/runCompletion.test.ts \
  src/scripts/runSelectionHistory.test.ts src/scripts/cancelledWaitIdle.test.ts \
  src/scripts/runActionErrorContext.test.ts
```

`npm run typecheck` passed. Original archive/full assets/22 spans/frozen fixture verification passed. Qualification command outputs and compressed hash bindings are retained here.

## Delivery and acceptance limits

The successor is separate from merged #1427 and targets main, not a stacked base. The only production change reuses the existing run-aware `outputKey` as the ScriptOutput JSX key. Workspace and task identity, actual run ID and the stable legacy fallback are preserved. No global Find, ScriptOutput internals, API/backend/process or native changes.

### Fresh delivery checks

- `NODE_ENV=development node --test --test-concurrency=1 src/scripts/rerunSurfaceIdentity.test.ts`: unchanged frozen fixture on main `5284779b` produced **2 intended failures / 5 passing controls → 7/7 passed**, zero skips. Full terminal/Find state is mounted, not a mock output component.
- Adding #1427's seven output-cache controls to the nine adjacent suites initially produced **82/84 passed**. The two failures asserted cross-run same-screen lifetime in `runningInput.test.ts` and `runningResize.test.ts`, contrary to the complete retained run/surface/consumer contract. The original files and original failing log are retained, hashed and explicitly identified in `publication.json`.
- Exactly those two test cases were migrated: same-run running→stopping/stopped remains mounted and read-only; a replacement run has a different terminal, disposed predecessor and zero predecessor subscriptions; stale input/resize cannot dispatch; exact current-run input bytes and measured geometry still reach run-2. No tests were skipped or removed, and no production workaround was added.
- The ten adjacent suites plus the unchanged seven-case frozen fixture on main `08be22cf` passed **91/91**, zero skips. Command: the nine-suite command above plus `src/scripts/rerunOutputIdentity.test.ts src/scripts/rerunSurfaceIdentity.test.ts`.
- `npm run typecheck`: **passed** after the test migrations on current main. `npm run build`: **passed** on the integrated assigned branch. Existing large-chunk/dynamic-import advisories remain; no threshold changed.
- The first combined typecheck/build command exhausted its 240-second command budget during Vite transformation. Typecheck had completed successfully; the partial build log is retained as **timeout**, not a pass. A separate longer build passed, and the final integrated build passed independently.
- `python3 evidence/scripts/rerun-surface-identity-1f/verify-reference.py <original-glob-archive>`: verifies original archive, both complete assets, 22 exact spans/full identity closure, immutable fixture, fresh before/after and all publication receipt hashes. `sha256sum -c evidence/scripts/rerun-surface-identity-1f/fixture.sha256` and `git diff origin/main --check`: **passed**.

Compressed raw logs are retained with exit results and hashes in `publication.json`. The initial two assertions that encoded predecessor lifetime are preserved separately; the seven-case frozen regression was never edited.

Browser/native screenshots, rendered xterm/macOS behavior, real-process/PTY/provider execution and package/installed-build embedding acceptance are **not run/unverified** under the source-only boundary. The mounted terminal is a controlled buffer model, not an emulator fidelity test. Native snapshot serializer and kill ABI remain unresolved; no new semantics or units are inferred. No runtime/package/native dispatch or duplicate watcher is created.
