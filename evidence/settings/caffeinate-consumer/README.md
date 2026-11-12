# Caffeinate status-feed prerequisite

Conductor Rebuild checked default-main `bbdca3e984f5b80183703daa9f9bb27bbaf0f47c`. The original retained REA assets and exact UTF-8 spans are recorded in [source.json](source.json).

The original Caffeinate predicate accepts every store-resident session whose status is `working` or `waiting`. It does not filter hidden sessions. Successful full hydration reads `SELECT * FROM sessions ORDER BY updated_at DESC` and unconditionally upserts each row, including rows without an existing workspace. Hiding changes visibility without settling an agent. Exact startup hydration timing was not established.

OpenConductor currently returns from `reportChatStatus` before `persistStatus` when a chat is hidden. Subsequent hidden queue transitions never reach the existing `session_set_status` native boundary. Its initial `session_statuses` query is also visible-only.

## Regression-first publication

[src/features/chat/caffeinateStatusFeed.test.ts](../../../src/features/chat/caffeinateStatusFeed.test.ts) calls the existing whole canonical runtime exports, with an inert native status-persistence boundary. No future consumer is imported. It checks:

- Visible publication retains ordering, duplicate suppression and the review chat's workspace identity.
- Hidden `working`, `waiting` and settlement still reach the same native boundary in order.
- Hidden publication never restores sidebar/Home presentation rows or requests attention.
- Closing a visible chat does not suppress its later settlement publication.

The two hidden-publication assertions are expected to fail on the unchanged production runtime. That expectation is **not an executed failure**. Automatic hosted CI must demonstrate those intended failures before the production fix is applied. Local test execution was not run under the current resource constraint.

The proposed production scope is limited to persisting canonical statuses before the existing hidden presentation guard, plus an opt-in hidden-inclusive mode on the already registered initial status query. The default query and presentation filtering remain unchanged. Native power management is not part of this prerequisite.

## Other evidence and limits

The browser host experiment mounted the real index/main/providers/App/GeneralPage graph with synthetic native replies and no unexpected IPC or page errors. The actual Caffeinate switch saved successfully and a synthetic native status event reached the runtime map. However, that fixture did not establish a stored session record. The observation proves host viability only, not a qualified missing-inhibitor regression. Its expected inhibitor count remains conditional; it is not a hosted baseline receipt.

The experiment's own preview server was stopped. No native shell command, provider, real credential or workspace was used. All apparent shell outputs were synthetic IPC replies. Installed application behavior, battery observations and macOS sleep inhibition remain **NOT_RUN**.

The original REA semantic renderer analysis exhausted its heap. This source closure uses hash-verified extracted bytes; original JavaScript was never evaluated. The complete Caffeinate consumer and automated whole-main browser regression remain separate pending work.
