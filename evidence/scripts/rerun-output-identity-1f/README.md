# Keep replacement-run output scoped to its actual run ID

Author: Conductor Rebuild. Initially qualified on fetched main `00bf65f92c31a5d355f6767ea3258f6af187baa2`; requalified for publication on fresh main `a0ed68ce45257c6a4eecc3b0e09bf974fef8ccda` after #1422 actually merged. This is a separate source-only repair, not the earlier workspace-record cleanup (#1415) or cancelled-waiting idle correction (#1422).

## Retained reference contract

Previously acquired Conductor 0.87.6 REA frontend evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` closes the actual identity chain. Reference JavaScript is inert untrusted third-party data; no vendor code was evaluated and no new acquisition ran.

1. `useTaskRunId` reads a real process `runScriptRunId` or retained `lastRunIds` identity. The index exports the hook through `ARt as gU`, imported by the renderer as `gU as q_`.
2. The complete Run-panel consumer binds `Le=q_.useTaskRunId(...)` and `Ve=Le`. Its output arm passes `runId:Ve` to `OJs` **and keys that component by `Ve`**. This is more than a run-ID-presence gate: replacement identity remounts the output consumer.
3. The complete `OJs` declaration derives `surfaceId` from `vSe(runId)` and passes both actual run ID and surface ID to `xEi`. `EI as g6` / `g6 as vSe` binds the helper that produces `run:${runId}`.
4. The complete `xEi` declaration selects `upsertSurfaceConfig` through `AJs`. Its effect passes the actual run ID, task, workspace and derived surface ID; its dependency list includes both run ID and surface ID. A new run is therefore not the previous run's surface/effect identity.

`source.json` records eleven exact spans and both original asset hashes. Complete `OJs` and `xEi` boundaries were obtained by parsing retained JavaScript as inert data with TypeScript `createSourceFile` (zero parse diagnostics) and converting declaration start/end positions to UTF-8 offsets. The verifier checks these source bindings and original-byte ranges, not native execution or terminal serializer behavior.

## Actual mismatch and smallest fix

On the qualification main, `ScriptsPanel` cached raw output under `[workspaceId, shownTaskId]`. Starting the same task again changed the real backend run ID but left that cache key unchanged. While the replacement's asynchronous output read was pending, the mounted panel still passed the completed run's transcript to its output surface.

The fix moves the existing `shownStatus` lookup beside the output identity and adds its existing actual `runId` to `outputKey`. No synthetic identity is added. The existing workspace/task boundaries, disposed-read cleanup and legacy nonempty-output fallback remain intact. Same-ID refresh/completion keeps its output; another run ID immediately makes the old cached value ineligible. The same key already owns detected preview state, so old detections cannot be associated with the new identity. Preview presentation itself was not independently exercised by this focused fixture.

Only `src/components/ScriptsPanel.tsx` changes in production. No API, backend, task-selection algorithm, process stopping, package or native code changes.

## Frozen mounted regression

`src/scripts/rerunOutputIdentity.test.ts`, SHA256 `1cd934ec24dee5607e7aacceaa8f85b3aac956e5e6c38a3c016a77594c18909f`, mounts actual `ScriptsPanel` and `RunSplitButton`, with real source script API, body and selection helpers. The boundary controls IPC/events/held output promises and stubs terminal painting plus unrelated presentation/services. In-memory status replies copy values like serialized IPC; no application, process or PTY is launched.

Command, unchanged before and after the product edit:

```bash
NODE_ENV=development node --test --test-concurrency=1 src/scripts/rerunOutputIdentity.test.ts
```

- Baseline: **2 intended assertion failures / 5 passing controls**, zero skips. Both Dev and Test observe `previous transcript` rather than empty replacement output while the new real run ID's read is held.
- Treatment: **7/7 passed**, zero skips, unchanged fixture hash.
- Controls retain same-run refresh/completion output, reject obsolete previous-run reads, isolate equal run IDs across workspaces, preserve legacy output and completed empty output, and retain the prior run/error after a rejected replacement.
- `fixture-v1-not-product-red.log` is explicitly **not product RED**: its obsolete-read control initially reused an IPC array by reference, so no new output read was scheduled. Correcting the fixture's serialized-value shape preceded freezing the actual RED and all production edits.

## Checks run on Reason Cloud

- Frozen regression above: **passed after reproducing the two baseline failures**.
- `NODE_ENV=development node --test --test-concurrency=1 src/scripts/model.test.ts src/scripts/runTab.test.ts src/scripts/runSelectionHistory.test.ts src/scripts/runCompletion.test.ts src/scripts/setupContext.test.ts src/scripts/runOutputSelection.test.ts src/scripts/runningInput.test.ts src/scripts/runningResize.test.ts`: **59/59 passed**, zero skips. These include actual picked-task/history/completion and workspace/input/geometry controls within in-memory test boundaries.
- `npm run typecheck`: **passed**. The subsequent build command was reached through `&&` in the original check.
- `npm run build`: **passed**, with the existing large-chunk advisory; no threshold was changed. The first combined typecheck/build call exhausted its 180-second window during Vite transformation, not on an assertion or diagnostic (`build-first-timeout.log`). The standalone build completed with a longer foreground timeout.
- `python3 evidence/scripts/rerun-output-identity-1f/verify-reference.py <original-glob-archive>`: **passed**, including original archive, both complete assets, all eleven spans, complete consumer/effect identity joins, frozen fixture, and RED/GREEN counts. Without the archive it verifies retained bytes only.
- `sha256sum -c evidence/scripts/rerun-output-identity-1f/fixture.sha256` and `git diff --check`: **passed**.

Raw command output is preserved in each `*.raw.log.gz`; `source.json` binds the compressed and decompressed hashes as well as its display log. Display `*.log` files remove trailing whitespace only so the committed diff passes whitespace checks; no behavior comparison normalizes run IDs, task/workspace identity or transcript values.

## Fresh-main publication proof

`qualification.json` binds the baseline main, baseline/treatment ScriptsPanel hashes, unchanged fixture, exact commands and six fresh raw/display log hashes. The frozen test on fresh main still produces **2 intended failures / 5 passing controls**, then **7/7 passed** with only the output identity fix. The eight adjacent source suites plus the actual mounted #1422 regression passed **64/64**, zero skips. Fresh typecheck, the integrated production build and original archive/eleven-span source verification passed. The earlier fixture IPC mistake and build timeout remain labelled historical, not new product failures.

The final production diff only moves the existing status lookup and adds its actual run ID to the existing workspace/task output key. No #1422 predicate or other owner's product changes are reverted. Source/fixture hashes were checked again after integrating the isolated worktree onto this Session's assigned branch.

## Acceptance limits

Browser/native screenshots were **not run** because this continuation is source-only and does not admit application/browser/runtime dispatch. Mounted in-memory output assertions are not rendered xterm/macOS acceptance. Real process, setup, PTY, provider, installed-build/package containment and native behavior remain **not run/unverified here**. Rust suites were not rerun for this frontend-only cache-key repair. The native snapshot serializer and kill import/worker ABI remain separate unresolved evidence edges; no units or semantics are inferred.

#1422's actual merge `a0ed68ce45257c6a4eecc3b0e09bf974fef8ccda` was confirmed before integration. This repair is separately published against main, not appended to or stacked on #1422. Every executed workflow on the final exact PR head must pass before requesting merge; skipped/manual/native jobs are not acceptance. The existing release owner retains package custody; no duplicate watcher or runtime/package job is created.
