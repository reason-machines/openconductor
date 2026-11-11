# Assistant display filter

Conductor Rebuild prepared the source at main `b6e7473d17462ce09948437b4239fb0a31e8d37f` and reconciled delivery with main `9522a783`. The candidate source pins are unchanged.

## Reference contract

The retained Conductor 0.87.6 renderer contains complete `kKn`, `ROo` and `GOo` spans. `kKn` conditionally chains five start-anchored, case-insensitive replacements. `ROo` applies it to assistant text and thinking, then omits a trimmed-empty result. `GOo` supplies assistant message blocks. Tools do not use the transform.

[The original source packet](source-v1/source-packet.json) records whole-asset sizes and SHA-256 identities, exact UTF-8 half-open spans and the original REA evidence identity. The renderer analysis hit a heap-exhaustion gap; the extracted byte ranges establish static source only, not execution.

## Product change

`Transcript` reads the existing false-default `not_absolutely_right` preference and forwards it in its internal row context. Only assistant text and thinking pass through `assistantDisplayText` before rendering. Empty display blocks are omitted. The stored transcript, user/report/system text, tool payloads, shared Markdown, copy-final source and fork source are unchanged.

The domain remains the existing `PartView` union, per Model the Domain. A display-only helper avoids rewriting shared message or Markdown data. Test Behavior, Not Implementation keeps the new assertions on rendered text, preserved payloads and mounted off/on/off updates.

## Versioned qualification

`source-v1` preserves the original discovery packet without rewriting its historical status. `qualification-v2.json` pins the current baseline and each candidate source. `baseline` retains all six original extracted fixtures and the original Transcript. Existing assertions remain unchanged. The new context supplies a false-default hook in all six fixtures and the real helper only where `Part` is extracted.

This is a new source/context qualification. It does not replace the immutable BE7-11 or 17-case replay that pins Transcript `533b97a4f656a6bb6e72953c1a7809a82871fbfa5dbc8578d204b96ddc85e06e` at `12a805ed`.

Version 3 adds only an explicit no-op CSS import binding in the `userText.test.ts` loader for `./userTextExternalIcon.css`. The UserText owner confirmed this exact future import and no additional dependencies. Original V2 archive SHA-256 `34f2ebc5057c82a971c7ee91a0172c3cc5b21ebaa11df1bd1c987a5eb90292a7` stays immutable. All assertion bodies and filter product sources remain identical between V2 and V3. The pinned baseline does not import this CSS, so this unit does not verify the separate link-glyph change.

## Requested serialized verification

Use the existing executor only. No install, provider launch, native acquisition or duplicate runner is part of this request.

1. Verify every input digest. On baseline Transcript, overlay the candidate helper, helper tests and all six fixture adaptations. Run the same focused tests. Enabled display cases must fail on unfiltered output, not setup or missing bindings. The pure helper tests and existing fixture controls must pass.
2. Overlay only the candidate Transcript. Run the identical focused tests again. Every case must pass without assertion changes, skips, cancellation or limit hits.
3. Run exact candidate typecheck if the existing executor has the required whole-app dependencies. Record an unavailable typecheck as a gap, not a passing check.

The original commands and bounds are in `execution-request-v2.json`. The active request is `execution-request-v3.json`, with source identities in `qualification-v3.json`. Retain full output and source identities for both runs.

## Actual serialized verification

The existing executor ran the frozen V3 request on Cloud computer 300 and released it at `2026-11-11T11:34:37.924601Z`. [The complete immutable handoff](actual-v3/MANIFEST.json) includes both full TAP outputs, source inventories, receipts, classification and release. Original archive: 131,266 bytes, SHA-256 `ab534d7ab36ad9eb81eda060b654616f353735a7c16260367c61684359cf9fd5`.

- **RED failed as intended:** 109 cases, 17 enabled assistant text/thinking display assertions failed with `ERR_ASSERTION`; all 92 other cases passed. There were no setup/import failures. [Classification](actual-v3/red-qualified.json), [full TAP](actual-v3/red.tap) and [receipt](actual-v3/red-receipt.json).
- **GREEN passed:** changing only Transcript from SHA-256 `533b97a4…` to `7b98c1ab…` made the same 109 cases pass, with zero failures, skips, cancellations or todos. All eight other overlay files, 17 dependency pins, root manifests and Node binary remained unchanged. [Full TAP](actual-v3/green.tap) and [receipt](actual-v3/green-receipt.json).
- Both phases used `NODE_OPTIONS=--max-old-space-size=384` and the exact command below. No tests were replayed during publication.

```bash
nice -n19 timeout --kill-after=5s 120s /usr/local/bin/node \
  --experimental-strip-types --test --test-concurrency=1 \
  src/features/chat/assistantText.test.ts \
  src/features/chat/transcriptAgentSummary.test.ts \
  src/features/chat/copyCodeFeedback.test.ts \
  src/features/chat/thinkingLinks.test.ts \
  src/features/chat/thinkingToolLinks.test.ts \
  src/features/chat/todoMixedRows.test.ts \
  src/features/chat/userText.test.ts
```

`python3 evidence/chat/assistant-text-filter/verify-delivery.py` passed after integrating current main. It checks every handoff digest, TAP totals, the sole phase delta, all 21 current candidate source pins, pinned baseline blobs and seven retained reference spans. [Delivery verification](delivery-verification.json) records that static check; it does not claim a new runtime run. Historical request/qualification statuses remain immutable.

The raw RED TAP contains whitespace-only diagnostic lines. Those bytes remain unchanged to preserve the original digest. `git diff --cached --check -- . ':(exclude)evidence/chat/assistant-text-filter/actual-v3/*.tap'` passes for the other staged files; the unfiltered whitespace check reports those raw TAP lines.

## Verification boundary

The executed tests cover fixture-controlled assistant display and mounted off/on/off updates. Whole-app typecheck/build and hosted CI are not part of the serialized receipt and are tracked separately on the delivery PR.

No screenshot is supplied because this unit has no browser/native execution admission. Live Settings save events, native IPC, persistence, installed-app behavior and side-by-side visual parity remain unverified. Auto-permission is parked separately; this patch changes no permission policy.
