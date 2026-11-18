# Tool-row copy confirmation: 2000 ms reset

Author: Conductor Rebuild. Scope: `TOOL-ROW-COPY-FEEDBACK-BE7`, duration only.

## Change and source

Checked main `5397204995280d90903e17dae3f391759bcde1d9`. Before treatment, the assigned branch was reconciled to that exact main tree; this change is not stacked on another PR.

The only product change is `CopyIcon`'s successful reset delay, **1500 -> 2000 ms**. Plan and typed-subagent callers share this helper. Every successful clipboard Promise still schedules its own reset; none is replaced or cancelled. Labels, rejection/error policy, payload conversion, plan approval, provider/result selection, propagation and disclosure are unchanged. This does not fix or claim parity for any other copy-feedback differences. #1473 concerns `CopyCode`; #1475 concerns `Transcript`, not this helper.

[Retained reference bytes](source.json) contain 14 complete declaration ranges with original offsets, byte lengths and SHA-256 digests. The complete retained `renderApp-D_fmY7hW.js` parent was checked at 11,600,457 bytes / SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Normal caller/producer closure:

- `ExitPlanMode -> registry -> hIt -> gpo(input.plan) -> t0(text)`.
- `Task/Agent/sub-agent -> registry -> hIt -> bpo(toolResult.content) -> yZe(content) -> t0(text)`.
- `t0` awaits the copy, confirms success, and retains each independent 2000 ms reset. `l1` calls `navigator.clipboard.writeText`.

Original REA receipt: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Existing [typed-subagent attribution](../typed-subagent-raw-result/source.json) and [clipboard helper attribution](../message-copy-rejection/reference/t0.js.json) are retained. **REA limitation:** the historical semantic pass exhausted its heap and skipped the renderer. These are retained real-app bytes, not a new semantic REA result or native observation. No new REA operation or vendor-JavaScript execution occurred.

## Frozen actual-component regression

Permanent fixture: [`toolCopyReset.test.ts`](../../../src/features/chat/toolCopyReset.test.ts), **8538 bytes**, SHA-256 `baca8d635d26f2c93f7cc97356fc232ae0cb780b86847b17449b5259e355105a`.

The fixture transpiles the complete production `ToolRows.tsx`, mounts the actual `ConductorToolRow -> Row -> MoreRows/typed SubagentRow -> CopyIcon` callers with React state, real tool dispatch and result conversion, and drives native deferred Promises. Only unrelated backend/link/Markdown presentation is stubbed. It does not copy a copy-state implementation. Its deterministic clock executes production-scheduled callbacks without normalizing their deadlines.

Both sides used the identical fixture and exact command, from an isolated source runtime assembled from this Session's checkout:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s env NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 src/features/chat/toolCopyReset.test.ts
```

- **RED failed as intended, exit 1:** four timing failures, four passing controls. Only `TOOL_COPY_RESET_MUST_NOT_FIRE_AT_1500` and `TOOL_COPY_FIRST_RESET_MUST_WAIT_UNTIL_2000`, once per caller. No setup failure, unhandled rejection, skip or cancellation.
- **GREEN passed, exit 0:** **8/8**, same fixture, assertions and command. Sole product-source difference: the timeout literal.
- Boundaries: confirmation at 1499, 1500 and 1999 ms; reset at 2000 ms; successful overlapping copies at 0/1000/2500 ms keep their original resets at 2000/3000/4500 ms.
- Preserved controls: exact plan payload, structured subagent conversion instead of a deliberately different flattened fallback, stopped propagation, unchanged disclosure, delayed clipboard fulfillment, absent-payload gating.

[Raw outputs and release receipts](execution/) retain complete results. RED released `2026-11-17T22:07:23.607597Z`; GREEN released `2026-11-17T22:11:04.534471Z`. Both had fresh disk >=4 GiB, CPU0 affinity, frozen input/dependency and Node native-TypeScript capability gates. Node was 22.23.5; React/test-renderer 18.3.1; TypeScript 5.9.3. Only the authorized lockfile install ran; install scripts were disabled. RSS was **not measured**; the 768 MiB setting is a Node heap cap, not an RSS measurement. Each phase ended with no own Node/npm survivor.

The two existing typed-subagent suites retain **every assertion/control**; only their exact expected copy timer changes from 1500 to 2000. Immutable [baseline tests](baseline/) permit byte-for-byte verification of that restriction.

**Adjacent suites passed separately: 58/58**, exit 0 (42 raw-result and 16 error/disclosure cases), zero failures/skips/cancellations. The same owned runtime was assembled from 1293 pinned source files, all unchanged before/after execution; the original frozen request is retained losslessly as `execution/legacy-request.json.gz`.

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s env NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 src/features/chat/typedSubagentRawResult.test.ts src/features/chat/typedSubagentErrorResult.test.ts
```

The separate legacy slot released **2026-11-17T22:17:22.459627Z**, with no own Node/npm survivors. The private 334,744,289-byte dependency directory and local cache/temp were removed at final release. Raw outputs and exact source/cleanup receipts are in `execution/`. RSS was not measured.

The [frozen source request](frozen-source-request.json) and [original request](frozen-request.md) intentionally preserve their historical UNRUN/predicted status. The actual execution receipts above supersede only that status, not any original bytes or predictions.

## Static check and limits

```bash
python3 evidence/chat/tool-copy-reset/verify.py
git diff --check
```

The static verifier checks retained span digests, normal caller binding, the one-literal product delta, both preserved legacy tests, immutable fixture, paired log identities/counters and evidence custody. It does not execute the reference or React behavior.

**Not exercised:** browser/DOM screenshot, OS clipboard, Tauri/native, provider/backend, package/installed-app, side-by-side native acceptance, full local build/typecheck or entire frontend suite. No screenshot exists because browser/native execution was not admitted. Root and the sole E1 owner retain package/native follow-through; this change creates no duplicate native dispatch or release watcher.
