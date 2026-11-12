# TaskUpdate error-result details

Conductor Rebuild owns this focused correction for `CHAT.TASKUPDATE-ERROR-RESULT-DETAILS`. The only production change is the TaskUpdate arm in `MoreRows`, passing `result` rather than success-only `output` to the existing `parseTask`.

## Retained source and fresh-main qualification

The original-byte BE7 packet `taskupdate-error-result-source-be7.tar.gz` has SHA-256 `f6320f6f8dfe36bd2e632cb020f9f66bbd075310a0c2b20c1d4b87256927d904`. All 29 manifest member hashes and sizes passed readback. No complete proprietary asset is committed.

Reference identity is recorded Conductor 0.87.6, retained REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The complete renderer hash is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; the complete companion index hash is `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

All nine retained renderer spans were checked against their exact original UTF-8 half-open byte ranges and SHA-256 hashes. The actual dispatch is `hIt` → `L1o`/`D1o` → `Qpo` → `cpo`. `cpo` passes `toolResult?.content` to `jki` regardless of `is_error`; `jki` parses bare or wrapped JSON and falls back to `tpo` for task text. The parsed card uses `oUt` and `Q0o`. Dependency summaries retain precedence, and a nonempty failed result independently adds the `AI` error row.

Fresh main `7dc8bbd014ccfeb2202fdd153c33aa3e9060dcb3` passed all 57 static qualification checks using `python3 .oc-tmp/d7-qualify.py`. The copied packet verifier changes only its input locations, checked commit, and output receipt location. All thirteen source snapshots remain byte-identical to the sealed packet. This checks the local Claude string-result mapper, frontend Reason event handling, reducer, view, Transcript caller, task parser, row, icons, and existing TaskGet fixture. The local producer preserves string output and records failure independently; no live provider emission is claimed.

The original REA semantic renderer analysis exhausted heap and skipped the renderer. These are complete retained-byte and caller joins, not a new semantic pass or fresh installed/native identity.

## Frozen regression

The adjacent test and input files are copied unchanged from the sealed packet. Test SHA-256 is `e1acd1e4641ef808c2e2b47795610ec8f5643710366ce1bc432f4ef1070ff001`; input SHA-256 is `f05666e03720ab1321aacb6ac6a44b5510827c42ce1bb4f33cc37effc048eab3`.

The fixture uses real `applyReasonPayload`, `applyChatEvents`, `buildRows`, and mounted production `ConductorToolRow`. It does not stub tool selection, parsing, RowShell, TaskLine, or error disclosure. Unrelated Markdown, links, and open-file dependencies throw if invoked. The Rust mapper is source-checked, not executed.

Five counterexamples cover failed bare JSON, wrapped JSON, task text, blocked-by summary priority, and blocks summary priority. Seven controls cover successful encodings, an unparseable error, pending without a result, empty error, and empty success. Assertions cover header, task details and status, input fallback, collapsed/open/collapsed disclosure, independently open error content, and unchanged raw result bytes. The fixture does not exercise reopen.

The fixture's original `scope` metadata describes its source-author stage. Executed publisher results belong below, not in the immutable expectations.

## Execution receipt

On Reason Cloud 352, the fresh resource preflight at 2026-11-12 09:10:26 UTC reported 29,460 MiB available memory, 29 GiB free disk, and load 1.41. The existing serial slot admitted one `timeout 120s npm ci --ignore-scripts --no-audit --no-fund`; it passed in five seconds, with the lockfile unchanged. Node version was 22.23.4.

Before any product edit, `timeout 120s node --test src/features/chat/taskUpdateErrorResult.test.ts` exited 1 on main `7dc8bbd014ccfeb2202fdd153c33aa3e9060dcb3`. Exactly five `TASKUPDATE_RENDERED_DETAILS_*` assertions failed for `error-json-bare`, `error-json-wrapper`, `error-task-text`, `error-blocked-by`, and `error-blocks`. All seven controls passed. For bare JSON, the mounted row showed `Input fallback`, no parsed subject/notes/status, and input-only fields instead of the expected `Returned activity`, returned task details, and completed status. Error disclosure and raw-byte assertions ran before the detail assertion.

```text
# tests 12
# pass 7
# fail 5
# cancelled 0
# skipped 0
```

This is actual behavioral RED, not a setup failure. The verified baseline was committed locally as `1a70f65` before the production edit.

After the single TaskUpdate argument correction, the identical `timeout 120s node --test src/features/chat/taskUpdateErrorResult.test.ts` passed all twelve cases with no skipped or cancelled tests. Both frozen hashes above were unchanged. The test drives collapsed/open/collapsed task disclosure and separately toggles the real error row, checking that closing the task leaves the error open and raw result bytes unchanged.

```text
# tests 12
# pass 12
# fail 0
# cancelled 0
# skipped 0
```

The focused sibling pass `timeout 120s node --test --test-concurrency=1 src/features/chat/taskGetErrorResult.test.ts src/features/chat/conductorTools.test.ts src/features/chat/toolErrorRetry.test.ts` passed all 37 cases, with no skips or cancellations. `timeout 120s npm run typecheck` passed, executing the existing `tsc --noEmit` configuration once. Every check ran in the foreground, sequentially, on Reason Cloud 352. No timeout was reached.

`git diff --check` passed. The product scope check compares the whole current `ToolRows.tsx` against qualified main with exactly the TaskUpdate `parseTask(output)` → `parseTask(result)` replacement. No other production bytes change. The ordinary check slot is released after these checks; automatic exact-head CI and protected merge remain the publisher's responsibility.

## Limits and ownership

No browser, server, native app, provider, E2E, Rust execution, heavy local build, or manual workflow dispatch is admitted for this correction. There is no screenshot because no app or browser was launched. Headless mounted assertions are not visual or native acceptance. Manual-only checks under the #1144 cost policy remain explicit gaps, not passes or additional merge holds.

The shared output suppression, parser, TaskGet, TaskList, TaskCreate, labels, RowShell, ErrorRow, transport, backend, and unrelated tools remain unchanged. Frozen source-owner #847 and #1098 are untouched. The ledger is coordinated with DDFC; consuming-package inclusion remains with sole owner `992a715e-aafd-49b0-88ba-9cabca1a3126`, without another package watcher. Native acceptance remains separately owned.
