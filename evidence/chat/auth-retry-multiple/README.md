# Failed sign-in messages continue in their original turns

Conductor Rebuild owns this change. Source comparison used main `d8f6bdfd26370491295f38ffecd7090c71a2a6db` on Reason Cloud.

## Source finding

Two sequential signed-out submissions can fail in `backend.open`. An empty failed queue does not pause the next submission. Each failed user message gets a sign-in card. On a connected notification, each card consumes its once-only callback before calling `retryUnsent`. The current busy guard refuses the second continuation while the first is running. That card has no later automatic retry trigger.

This is a source-qualified failure hypothesis. No behavioral failure or native sign-in was observed during source preparation.

The candidate will carry the original failed turn ID through the existing message queue. It must keep the existing ordering, pause, failure, edit and stop controls, rather than maintaining a separate hidden retry queue. The original user turn must reopen, not be copied into a new transcript turn. Authentication, sign-in controls and their callers are unchanged.

## Retained real-app evidence

The five literal spans and their offsets, asset identities and hashes are retained in `source-receipt.json`. They came from shipped Conductor 0.87.6 JavaScript extracted with REA from the real app. The credential-retry caller loops through failed message IDs. The local route calls the outbox's retry mutation, which marks each entry ready and schedules the existing drainer without replacing its delivery payload.

These declarations support accepting more than one failed-message retry. They do not prove that Conductor uses the same automatic browser-pairing UI, or establish native runtime behavior. The original uploaded archive was unavailable at its advertised path after recovery. This delivery verifies the retained exact-byte spans, not the original archive or whole assets. No new reference-app acquisition or native verification is claimed.

## Frozen regression

`fixture/authRetryMultiple.test.mjs` is byte-identical to the prepared two-case fixture, SHA-256 `9b3d03de095956357d3e81e0290e2f4b214b849b5620dedc60f42d3bf245efcc`.

- The single-message control must send once despite repeated connected notifications.
- Two failed messages must both reach the backend exactly once in their original turns after the first continuation completes.

The fixture mounts real React card effects and executes the complete production chat-runtime graph. Its sign-in external store, display-only controls and provider are synthetic. Production Transcript and WorkspaceView are source-pinned, not mounted. The adapter matches their callback mapping. The test does not authenticate, pair a browser, invoke a real provider, run Tauri or prove local-to-cloud behavior.

`src/features/chat/authRetryMultiple.test.ts` runs the unchanged fixture as part of the existing frontend unit suite. Its result contract requires the exact fixture hash, zero process errors, zero signals, exit zero, a complete two-test TAP plan, both named successes and explicit passing totals with no failure, cancellation, skip or todo. Script completion without those results fails closed. The standalone `verify_tap.py` retains the more specific expected-RED profile as well as the matched-GREEN profile.

```bash
node --test src/features/chat/authRetryMultiple.test.ts
```

## Verification record

- Passed on Reason Cloud: source comparison of all 17 baseline inputs against current main, five retained literal-span identities and unchanged fixture bytes. See `publication-source.json`.
- Passed: `git diff --check`.
- Not run locally: Node, product tests, typecheck, build, browser, authentication, provider or native execution. The existing serialized E1 runtime queue is unchanged.
- The first hosted frontend check on `6a7e1186c1169d796bdafdf01482990a4e109098` failed at the wrapper, not the product. Its child inherited Node's `NODE_TEST_CONTEXT`, so Node refused the nested test runner and returned no TAP. The complete-result gate rejected that empty result. The wrapper now removes that runner-local environment key before starting the isolated child. Fixture bytes and product source are unchanged.
- Hosted behavioral RED and matched GREEN remain pending. The baseline predicts one single-message pass and one failure at `second failed message is not lost when the first retry was working`. Import/setup failures, timeouts and different assertions are not that intended RED.
- No screenshot is supplied because app or native execution has not run. This is not visual acceptance.

This first publication adds the immutable regression and source evidence before the product candidate. It is not a completed fix and must not merge while the regression fails. The candidate and its hosted results will follow on the same pull request.

## Scope and integration

Ledger reconciliation `3f44a19b-9f34-4067-b9ba-40059cde4bd6` reserves the minimal `queue.ts` retry ID carrier, drain and steer propagation, narrow retry enqueue helper and the existing `chatRuntime.ts` retry guard. No broader queue refactor is included.

The separate attachment-body fix and its frozen candidate are not applied or changed here. PINNED V2, badge, attachment retry and all older E1 priorities retain their existing order and assertions. Source receipts are not runtime admission.

Auth initiation, deep links, provider accounts, credentials, Composer producers, Transcript, WorkspaceView, sign-in card product code, persistence, parser changes, cloud UI and cloud Claude/Codex execution are excluded. Durable restart of unsent work is not established by this regression.
