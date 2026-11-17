# Node REPL result truthiness — fresh-main delivery

Author: Conductor Rebuild. Source-only successor to #1423.

## Fresh base and exact delta

`pr_get` confirmed #1423 merged at `2026-11-17T12:42:59Z`, actual merge `810a79d40a7205a52e730ae5cc6da2f84401c063`. This delivery is based directly on that fresh default-main commit, not #1423's head. The prior isolated candidate `e560de7944c5b882cbf43a5524fc0054bf710f5b` was replayed; the assigned branch name is retained, but its finished predecessor is not reused as an open PR.

Only the Node REPL arm of `src/features/chat/ToolRows.tsx` changes production behavior (3 additions / 2 removals): choose raw content unless undefined, preserve verbatim strings, stringify only truthy structured values, and gate disclosure using original content truthiness or nonempty input. Null/false/zero/empty-string cannot revive a flattened fallback. Truthy empty objects/arrays retain JSON output.

Shared InputOutput, resultText, GenericRow, McpRow, SubagentRow, maps, adapter/reducer/view, backend/provider paths, styles and existing fixtures are unchanged. The only new fixture is `src/features/chat/nodeReplResultTruthiness.test.ts`.

## Retained real-app qualification

Historical qualified source packet and logs remain intact in this directory; `QUALIFICATION.md`, `verification.json` and `qualification.html` describe that earlier isolated stage, not the latest delivery state.

Full retained Conductor renderer SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` (11,600,457 bytes), all seven complete byte-bound declarations and the 100,000-character limit binding passed fresh readback. Exact registry/dispatch `Qpo/hIt → Kpo → V9e → H9e/Mu` joins establish selected-content conversion, output/disclosure truthiness and real consumer behavior. No vendor JavaScript executed.

## Fresh RED → GREEN on Reason Cloud Linux

Verified production/test source commit: `ce9dcf7b89b0e64f43728cd8aae3f93cf7d1bd12`. This receipt-only follow-up does not change any exercised source or fixture.

- **RED reproduced before the product edit:** `node --test --test-concurrency=2 src/features/chat/nodeReplResultTruthiness.test.ts` on untouched `810a79d4` — **16 PASS / 8 intended ERR_ASSERTION failures**, exit 1, zero skips/cancellations.
- **GREEN passed, same command and frozen fixture:** **24/24**, exit 0, zero failures/skips/cancellations.
- **Adjacent passed:** `node --test --test-concurrency=2 src/features/chat/typedSubagentRawResult.test.ts src/features/chat/genericStructuredResult.test.ts src/features/chat/prefixMcpStructuredResult.test.ts src/features/chat/subagentFallbackStructuredResult.test.ts` — **106/106**, zero failures/skips/cancellations. This includes all merged typed V3 cases.
- **Full chat passed:** `node --test --test-concurrency=2 src/features/chat/*.test.ts` — **1,849/1,849**, zero failures/skips/cancellations, on committed source `ce9dcf7b8`.
- **Typecheck passed:** `npm run typecheck`, exit 0.
- **Production build passed:** `npm run build`, exit 0, in independent worktree `.ara-state/tmp/node-build-current` at the identical committed source `ce9dcf7b8`; existing large-chunk advisory only. A tool interruption left the first build dispatch unconfirmed without a completion log, so no success is attributed to that command. The isolated build avoided any shared output collision and has an explicit `BUILD_EXIT=0` receipt.
- **Source/integrity passed:** `python3 evidence/chat/node-repl-result-truthiness/verify-source.py --renderer .ara-state/tmp/chat-next-gap/renderApp-D_fmY7hW.js --root . --baseline 810a79d40a7205a52e730ae5cc6da2f84401c063` — full parent, seven complete declarations and limit binding; frozen24; exact Node-only hunk and seven unchanged controls.
- **Passed:** fixture digest readback and `git diff --check`. Every new `fresh-main-*.gz` log was round-trip checked lossless.

Unchanged Node24 SHA-256: `20b169940ed2f18c0ecb29918c5f1a1172fc08646e55b9858fe755dbde8de117`.

Unchanged merged typed V3 SHA-256: `dea7a1df1432b2b325944f1bd9243ac056ea59aec9e7be2a00ccd23e6107ae79`. Disqualified typed V2 is not substituted.

The fixture mounts the actual Reason payload adapter → event reducer → row builder → production ConductorToolRow/MoreRows/RowShell/InputOutput path. It tests header interactivity/roles, open/close/reopen, output bytes, error labels and truncation. External/native/link/Markdown dependencies are throwing boundaries, not simulated successful providers.

## Delivery and acceptance boundary

A separate ready PR against main carries this delivery. Every executed exact-head hosted workflow must pass before requesting merge; skipped conditional/manual jobs are not passing execution. Existing ledger and package/release owners retain serialized acceptance custody, including #1423's actual merge receipt.

**Browser/native/provider/package acceptance: NOT_RUN / UNVERIFIED.** No app screenshot exists: this source-only lane excludes app/browser/native execution. Unit mounting is not browser pixels, native side-by-side parity, provider compatibility, package containment or installed identity. Historical REA semantic analysis exhausted heap; byte qualification is not a new semantic pass or native observation. No new REA acquisition, native action, server, provider invocation, package dispatch, installation or watcher was created.
