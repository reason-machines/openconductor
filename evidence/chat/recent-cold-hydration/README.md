# Recent transcripts after cold hydration

Conductor Rebuild owns `CHAT.RECENT-COLD-HYDRATION`. Ledger granted the narrow lease for the recent-transcript subscription in `WorkspaceView.tsx`, the new `recentColdHydration.test.ts`, and this evidence directory. Composer, ResetChatDialog, queue durability, diff, providers and native state are outside the change.

## Reference contract

The retained Conductor 0.87.6 REA identity is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Renderer SHA-256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; index SHA-256: `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

This pass independently checked the original-byte identity archive, its 21 source spans, the 25 closed-chat spans and seven disclosure spans: 54 archive/span checks passed. Full original assets and the installed app were not reacquired or rehashed. The retained full-renderer REA analysis exhausted its heap; these renderer facts are the already-recorded decoded-byte fallback, not a new semantic-analysis or native observation.

The relevant retained chain is:

- `RIo` renderer UTF-8 `[8768553,8770589)`, SHA-256 `a6c6ab107d56f48e2af9fd63eccf0d2dd15c9a740c62727fefb06e65338944ef`, filters source sessions by non-null `lastUserMessageAt`, orders newest first, and uses source-ID attachment names independently of readable titles.
- The all-workspace hook (`h9t`, imported as `$ri`) index `[3145108,3145550)`, SHA-256 `4abe9a8fca42931ba493b558eafe4dab0e7fbdb9697d7f64b0e64b4b796d4f9e`, combines the visible and hidden session queries.
- Stored-session decoder `pB`, index `[1106458,1107437)`, SHA-256 `6b5cc4915f6f95bba176355d49168cd15cbfa9ba727784b9992af4536d475b42`, derives eligibility metadata from persisted `last_user_message_at`, not from whether that source transcript has already been visited in this process.

Original spans and their complete source joins remain in the existing [closed-chat evidence](../recent-closed-chat/original-source.json) and [identity packet](../recent-transcript-identity/source-packet.tar.gz). No vendor JavaScript was executed.

## Current-main source finding

Fetched main `b22fa9adaf67fa79fc3dddf72914cae01f352b08` was rechecked before publication. The five relevant source files are byte-identical to the earlier source-unit baseline `f60b6e365395ceb62b2b2ec6e1542a16a5b0d0ee`; hashes are in [qualification.json](qualification.json). The assigned branch was integrated with main and its net tree was confirmed identical before adding the test.

`otherChat()` derives source eligibility from `agentSnapshot()`. In the actual shared chat runtime, that snapshot starts asynchronous `chat_messages_load`. A nonempty restored source invokes only its own listeners; an empty target load returns without notification. The caller's existing effect subscribes only to the active target `runId`. Therefore a closed source can finish loading without invalidating the empty target's eligibility projection. An unrelated later render can mask the missing subscription.

The existing recent-identity and closed-chat mounted regressions preload source transcripts. They do not exercise this ordering. Module-lifetime tool disclosure already matches the retained reference; this work does not change its key scope or state lifetime.

## Regression first

A dependency-free source-unit investigation loaded the 14 complete current pure TypeScript runtime/projection modules and evaluated the exact current caller's `otherChat` helper and active subscription effect. It did not mount React. Command:

```bash
node --experimental-vm-modules --test artifacts/workspace-chat-candidates-current/cold-hydration.source.test.mjs
```

[Source-unit TAP](source-unit-red.tap): **one intended assertion failure, two passing controls**. The source transcript is confirmed restored before `COLD_SOURCE_HYDRATION_DOES_NOT_INVALIDATE_TARGET` fails. Active-target hydration notifies correctly; a genuinely empty source remains ineligible. This is caller/runtime source-unit RED, not mounted UI/native parity. Exact scratch fixture and TAP are retained as Session attachments with hashes recorded in qualification.json.

The new automatic-glob fixture loads the actual complete `WorkspaceView`, `ChatEmptyState`, Composer, attachment projection and per-target composer sessions with React's real test renderer. The agent snapshot/subscription boundary starts source transcripts empty and later supplies the retained source plus notifications to its real subscribers. This models the independently checked production runtime boundary; it does not replace the caller or eligibility reducer. Providers/native transport and unrelated decoration remain disposable boundaries.

The three mounted cases require a cold retained source to become visible and attach its exact body without an unrelated target update; preserve an assistant-only source as ineligible; and preserve hydrated eligibility plus target attachment isolation across a target round trip. Production source remains unchanged in the first publication. The unchanged fixture must reach its intended missing-chip assertion before the subscription repair is published; a loader, dependency, type, transport or mount failure is not qualifying mounted RED.

```bash
node --test src/features/chat/recentColdHydration.test.ts
```

Mounted RED/GREEN and exact-head automatic workflows are **PENDING** at test-only publication. Fixture SHA-256 is pinned in qualification.json.

## Checks and limits

Passed locally on Reason Cloud: 54 retained archive/span identity checks; current-main source-byte reconciliation; new TypeScript fixture parse using the already-installed Bun transpiler; scoped `git diff --check`; unchanged production `WorkspaceView` before the regression publication.

Local React tests/typecheck/build were not run because this checkout has no dependencies and this lane does not authorize installation. No product/browser/native/provider run, queue/reference dispatch, manual E2E dispatch, executor retry, provisioning, or protected Mac access occurred. No screenshot is available under the source-only execution scope. Ordinary hosted mounted tests are not installed-app, visual, or native acceptance. Sole runtime/native executors remain unchanged; allocator occupancy remains UNVERIFIED and native acceptance NOT_RUN.
