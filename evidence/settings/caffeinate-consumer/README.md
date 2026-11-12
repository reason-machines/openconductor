# Caffeinate status-feed prerequisite

Conductor Rebuild checked default-main `bbdca3e984f5b80183703daa9f9bb27bbaf0f47c`. The original retained REA assets and exact UTF-8 spans are recorded in [source.json](source.json).

The original Caffeinate predicate accepts every store-resident session whose status is `working` or `waiting`. It does not filter hidden sessions. Successful full hydration reads `SELECT * FROM sessions ORDER BY updated_at DESC` and unconditionally upserts each row, including rows without an existing workspace. Hiding changes visibility without settling an agent. Exact startup hydration timing was not established.

Before this change, OpenConductor returned from `reportChatStatus` before `persistStatus` when a chat was hidden. Subsequent hidden queue transitions never reached the existing `session_set_status` native boundary. Its default initial `session_statuses` query remains visible-only.

## Regression-first publication

[src/features/chat/caffeinateStatusFeed.test.ts](../../../src/features/chat/caffeinateStatusFeed.test.ts) calls the existing whole canonical runtime exports, with an inert native status-persistence boundary. No future consumer is imported. It checks:

- Visible publication retains ordering, duplicate suppression and the review chat's workspace identity.
- Hidden `working`, `waiting` and settlement still reach the same native boundary in order.
- Hidden publication never restores sidebar/Home presentation rows or requests attention.
- Closing a visible chat does not suppress its later settlement publication.

Hosted baseline head `2db8326f73d9a19b5440446267d5a0c36ab71b48` reproduced both intended hidden-publication failures. The visible-publication and hidden-presentation/attention controls passed. The full unit job reported 3,289 passes and exactly those two failures, with no skips. [The receipt](hosted-feed-baseline.json) identifies both failing jobs and [the assertion excerpt](hosted-feed-baseline.log). This is canonical status-boundary proof, not power-management proof.

The candidate persists canonical statuses before the existing hidden presentation guard. It also drains owned write echoes before applying the hidden visibility return, so hidden acknowledgements cannot suppress later external status updates after reopening. An explicit `includeHidden: true` on the already registered initial-status command selects the new hidden-inclusive query. Omitted and false values use the existing visible-only SQL unchanged. Actual SQLite tests cover all three options, hidden rows, idle exclusion and rows without an existing workspace. [Hosted candidate results](hosted-feed-candidate.json) at `d0f8cced` pass the unchanged four frontend cases and the actual persistence and option-boundary tests on both Linux and macOS. [The frontend excerpt](hosted-feed-candidate.log) retains all four results. Full frontend typecheck, build, Rust checks and packaging also passed on that head. These results do not substitute for final-head checks after integrating the companion fixture.

No native registration, schema, sidebar/Home filtering, attention policy or deletion policy changes. Native power management is not part of this prerequisite. The unchanged four frontend cases also passed in an inert Node process on Reason Cloud. Static syntax and diff checks passed. Local Rustfmt was unavailable; hosted Rust formatting and persistence tests passed after applying its exact formatter correction.

## Echo guard regression

The separate `caffeinateStatusEcho.test.ts` companion adds six cases without changing the original four. The combined ten pass in an inert Node process on Reason Cloud, with no skips. Cases cover hidden acknowledgements followed by reopening and external updates, pending writes during close, visible write ordering, invalid statuses, hidden presentation and attention.

[The echo receipt](echo-regression.json) records both fixture hashes. Its original-byte compressed TAP comes from the companion owner's isolated guard-order reversion on `d0f8cced`. Exactly the two intended external-update assertions fail, and eight controls pass. No import or loader failures count as regression proof.

## Other evidence and limits

The browser host experiment mounted the real index/main/providers/App/GeneralPage graph with synthetic native replies and no unexpected IPC or page errors. The actual Caffeinate switch saved successfully and a synthetic native status event reached the runtime map. However, that fixture did not establish a stored session record. The observation proves host viability only, not a qualified missing-inhibitor regression. Its expected inhibitor count remains conditional; it is not a hosted baseline receipt.

The experiment's own preview server was stopped. No native shell command, provider, real credential or workspace was used. All apparent shell outputs were synthetic IPC replies. Installed application behavior, battery observations and macOS sleep inhibition remain **NOT_RUN**.

The original REA semantic renderer analysis exhausted its heap. This source closure uses hash-verified extracted bytes; original JavaScript was never evaluated. The complete Caffeinate consumer and automated whole-main browser regression remain separate pending work.
