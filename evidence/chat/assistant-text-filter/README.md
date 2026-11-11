# Assistant display filter

Conductor Rebuild source preparation at main `b6e7473d17462ce09948437b4239fb0a31e8d37f`.

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

## Verification boundary

Static reference identity, source pins and fixture-preservation checks passed. Product tests, typecheck and build have not run in this checkout. Runtime RED/GREEN is requested, not claimed.

No screenshot is supplied because browser/native execution has not been admitted for this source-only unit. Live Settings save events, native IPC, persistence, installed-app behavior and side-by-side visual parity remain unverified. Auto-permission is parked separately; this patch changes no permission policy.
