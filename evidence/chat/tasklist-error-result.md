# TaskList error-result details

Conductor Rebuild corrects `CHAT.TASKLIST-ERROR-RESULT-DETAILS`. Failed TaskList calls with parseable string results retain their counts, active-task summary, and task cards alongside the independent error disclosure. The only production change is `parseTaskList(output)` to `parseTaskList(result)` in the TaskList arm of `MoreRows`.

## Source evidence

The sealed BE7 archive `tasklist-error-result-source-be7.tar.gz` has SHA-256 `96a2dc03a0cfc956b3f75a441a1c082efd72e9bbae3190c505ef2d5cbb87cfdd`. Its 40 manifest members passed byte-size and hash readbacks. Both complete original assets and all nineteen exact retained spans matched their recorded identities. No complete proprietary asset is committed.

The recorded reference is Conductor 0.87.6, REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The companion index SHA-256 is `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The retained original registry and caller select `ipo` for TaskList. `ipo` calls `epo(toolResult?.content)` regardless of `is_error`. The parsed list determines the active-task summary and pending, in-progress, and completed counts. `X0o` and `J0o` render cards through `oUt`. Separately, nonempty failed content adds `AI`, the error disclosure. `epo` accepts bare arrays, tasks-wrapped JSON, and task-line text. `npo` provides a bounded TaskCreate negative control, not a reason to change TaskCreate.

Fresh main `bc2a476d70d0b731be243f0422d99013a96d39f3` contains merged #1155 at `5d182b1e374d1b8b2676b17da59c45b6e74834f8`. `python3 .oc-tmp/d7-tasklist-requalify.py` passed all 91 static checks. Thirteen of the fourteen source snapshots are byte-identical to the packet. The only difference in the fourteenth, ToolRows, is the already-merged TaskUpdate argument correction. The assigned branch retains its history and merges current main without switching or resetting.

The static producer and consumer checks cover local Claude string-result preservation, separately recorded failure status, Reason wire and frontend event handling, reducer, view, Transcript, parser, and production row. The mounted test starts at `applyReasonPayload`; it does not execute Rust or a real provider.

The original REA semantic renderer analysis exhausted heap and skipped the renderer. Retained complete shipped bytes and exact caller joins establish source behavior, not fresh installed identity, successful semantic execution, or native acceptance.

## Frozen regression

The test and input files are unchanged original-byte copies from the sealed packet:

- `src/features/chat/taskListErrorResult.test.ts` has SHA-256 `c95ebfc481610f722c98603bc1987e3fc930cbaa92bcd85922d7cec437421db6`.
- `src/features/chat/taskListErrorResult.inputs.json` has SHA-256 `47f39ff9f223727b932292e6b35fe2cb256fd9eb1f6d2a4a4c29f9d9ce7c003e`.

The twelve cases drive real `applyReasonPayload`, `applyChatEvents`, `buildRows`, and mounted production `ConductorToolRow`. Selection, parsing, task cards, and disclosure are not replaced. Unrelated Markdown, link, and file-opening dependencies throw if called. The test checks collapsed headers, expanded counts and cards, subjects, notes, statuses, empty state, unchanged result bytes, and independent error disclosure. It opens and closes the task disclosure, but does not test reopening.

Five failed-result counterexamples cover a mixed JSON array, wrapped JSON, task-line text, completed and deleted cards, and explicit and implicit pending cards. Seven controls cover successful encodings, an invalid error, pending without a result, empty error, and empty success.

## Actual sequential checks

All commands ran in the foreground on Reason Cloud 352 under the existing ordinary serialized slot. No dependency installation was needed. Node was 22.23.4, React and react-test-renderer were 18.3.1, and TypeScript was 5.9.3. The final preflight at 2026-11-12 09:39:37 UTC reported 28,218 MiB available memory, 46 GiB free disk, and load 8.18. Each executable check had a 120-second bound; none timed out.

Before any product edit, `timeout 120s node --test src/features/chat/taskListErrorResult.test.ts` exited 1 on branch commit `73c2cfe05ed1381a215db39291ba54e1a869e0fa`, whose relevant production sources match the qualified main. Exactly five rendered-detail assertions failed and seven controls passed. The first failed case showed `Task list`, `0/0 completed`, no counts or cards, and `No tasks`, instead of the returned active summary, three counts, and three cards. Raw-byte and independent-error assertions ran before the detail assertion. This was behavioral failure, not setup failure. The failing regression was committed before the fix as `019ff435409c98464161a3ea282bf016d6189ff6`.

```text
# tests 12
# pass 7
# fail 5
# cancelled 0
# skipped 0
```

After the one-argument correction, the identical `timeout 120s node --test src/features/chat/taskListErrorResult.test.ts` exited 0. Both frozen hashes remained unchanged.

```text
# tests 12
# pass 12
# fail 0
# cancelled 0
# skipped 0
```

`timeout 120s node --test --test-concurrency=1 src/features/chat/taskGetErrorResult.test.ts src/features/chat/taskUpdateErrorResult.test.ts src/features/chat/conductorTools.test.ts src/features/chat/toolErrorRetry.test.ts` passed all 49 adjacent cases with no skips, cancellations, or failures.

`timeout 120s npm run typecheck` passed once, running the existing `tsc --noEmit` configuration. Whole-file byte comparison confirmed ToolRows equals the qualified main plus only the TaskList argument replacement. `git diff --check` passed. Terminal logs remain in the Session's ignored `.oc-tmp/tasklist-{red,green,adjacent}.tap` and `.oc-tmp/tasklist-typecheck.log` files. The ordinary slot was explicitly released to ACC and the ledger after all commands terminated.

## Scope and verification gaps

The shared success-only output, parser, TaskGet, TaskUpdate, TaskCreate, RowShell, ErrorRow, labels, imports, transport, backend, and other tools remain unchanged. Frozen BE7 #847 and #1098 are untouched. Delivery is a separate ready PR against main, outside #1155 and the fixed #992 package cut. Every enabled exact-head automatic check must pass before protected merge; skipped manual-only jobs are not executions.

No browser, app, server, native, provider, E2E, Rust execution, local build, package dispatch, or manual workflow dispatch ran for this change. There is no screenshot because this lane performs only the admitted headless checks. Mounted component tests do not prove geometry, installed behavior, live provider emission, packaging, deployment, or native acceptance. Existing release and native owners retain their separate responsibilities; this change starts no duplicate package watcher.
