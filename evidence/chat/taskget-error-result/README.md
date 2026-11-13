# TaskGet failed-result details

Conductor Rebuild owns `CHAT.TASKGET-ERROR-RESULT-DETAILS`. The product change is confined to the `task-get` arm in `ToolRows.tsx`: its existing parser receives `result` instead of the shared success-only `output`.

## Retained source evidence

BE7 supplied the original-byte TaskGet packet with SHA-256 `f7be4925a278ec427e101cc1b013f3452a8c8a480a517403ea2be92026fec9cb` and the complete renderer/index packet with SHA-256 `991f15ebf130ccb8e705fc74f612dbb46095bd6d73b420fbced1ffbcd94165bc`.

[BE7's unchanged source receipt](be7-source-receipt.json) records the app identity, full asset hashes, nine exact UTF-8 function spans, and BE7's historical source checks. Those checks are not behavioral tests. This implementation independently checked both complete asset hashes, all nine spans against their complete renderer bytes, the TaskGet dispatch registry, and the frozen fixture hash.

The retained `lpo` renderer passes result content to `jki` without gating it on `is_error`. It uses the parsed task for the header and expanded `oUt` details. A separate `AI` error row depends on the error flag and nonempty result. These are static observations of retained Conductor 0.87.6 source, not fresh runtime observations.

REA evidence: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The app binary identity is historical. Whole-renderer semantic analysis previously exhausted its heap. This change adds no new REA runtime observation or semantic-analysis success.

## Current producer and consumer

The regression baseline was main `6f7f11fbb734743796996e06f98af439aaf2d9db`. All nine joined source files in BE7's receipt were byte-identical to its checked main `fc5215e8b6e7fd5e12767155fdbb9d0bcc1e82f1`.

The native mapper accepts a matching string `tool_result` with `is_error: true`. It preserves the string as output and sets failed status. The frontend preserves that output through `applyReasonPayload`, `applyChatEvents`, and `buildRows`. `Transcript` supplies the result and error status to `ConductorToolRow`. No transport or provider change is required.

The mounted regression executes the real frontend functions and production row. It does not execute the Rust mapper, a provider, or a native app. Unrelated browser/backend leaves throw if called.

The change was then rebased onto main `85ec32f94664d4bb46b0b70d45ff5355595517c9`, which adds independent Edit-result metadata. This change does not modify that metadata or its consumers.

## Behavioral checks

The [six frozen cases](cases.json) retain BE7's exact bytes and SHA-256 `b8a1e09a13afdbbcf2eb1d2012ed2519cd57754ca3989e60e16fa634f0072b02`. The test checks this hash before running.

Baseline command:

```bash
node --test src/features/chat/taskGetErrorResult.test.ts
```

[RED output](red.tap): two intended failures and four passing controls. Failed JSON and text task results incorrectly showed the Task ID and `Loading task...`, with no subject, description, or owner. The controls cover the identical successful JSON, an unparseable error, a genuinely pending call without a result, and an empty failed result.

The same test also checks raw result bytes, mapped error/running/completed status, the collapsed header, opened production `TaskLine` text, and independent task/error disclosure toggles.

Focused GREEN command:

```bash
node --test src/features/chat/taskGetErrorResult.test.ts src/features/chat/globResultLines.test.ts src/features/chat/grepResourceLabel.test.ts src/features/chat/toolErrorRetry.test.ts src/features/chat/conductorTools.test.ts
```

[GREEN output](green.tap): all 65 tests pass. `npm run typecheck` and `git diff --check` also pass. The fixture bytes and test expectations are unchanged between RED and GREEN.

## Verification limits

No browser preview or screenshot was produced because this task has no new browser/runtime lease. Mounted rendering proves the selected text and disclosure behavior, not CSS layout or native parity.

Native launch, Rust mapper execution, provider execution, installed-app behavior, packaging, and deployment were not run. The separate package workflow is manually disabled; its actor and intent are unresolved. Existing package follow-through remains with this Session, without another watcher or dispatch.

TaskList, TaskUpdate, TaskCreate, shared output suppression, parser behavior, RowShell, ErrorRow, Edit, Glob, file actions, and backend code are unchanged by this patch. Frozen #847 and paused #1098 are untouched.
