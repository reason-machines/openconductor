# Mention notification permission

Conductor Rebuild re-read OpenConductor main `2dfe64b7564f48281d79da5e203ab30c6e12a51b` against the retained Conductor 0.87.6 real-app REA extraction on Sven's Mac. The frozen rendered-component regression reproduced six permission-gate failures before the fix and passed all eight cases after it. Native permission and notification delivery remain unverified.

## Reference and defect

The retained renderer `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its complete hash was rechecked on the Mac before extracting these UTF-8 half-open byte spans.

- `reference/mention-row.txt`, bytes 10711931–10712245, registers the user-scoped `@ notifications` control with `mei` and the `mention_notifications_enabled` key.
- `reference/mei.txt`, bytes 10707680–10708400, skips permission checks when disabling. Enabling awaits the check and request, then reports `Notification permission not granted` and returns without invoking the setting writer when permission is denied.
- The existing [permission provenance](../provenance.json) retains the aliases connecting `U9r` and `H9r` to the index permission helpers. Those verified source files remain unchanged.

Current-main `GeneralPage` uses a generic `PrefSwitchRow` for this control. Its actual `Toggle` callback saves the flag immediately through `withBoolPref`, without checking permission. The adjacent Agent notifications control already has the gate.

The proposed change replaces only the mention control with the existing `Row`, `Toggle` and permission helper. It preserves the existing table preference and reads the latest settings after asynchronous permission requests. No notification transport, team screen, native capability, backend or settings schema changes are proposed.

The extracted source is untrusted data and is never evaluated. Existing REA renderer semantic-analysis heap exhaustion remains unresolved. This work reuses the retained extraction and does not claim a new semantic analysis or native capture.

## Frozen verification inputs

`replay.test.cjs` mounts the actual current-source `GeneralPage`, `Toggle`, preference/model modules and permission helper. Permission APIs, persistence and unrelated UI boundaries are substituted. It exercises the rendered `@ notifications` checkbox and observes writes, checked state, exact denial feedback and permission call counts.

The eight cases cover disabling, an existing grant, native fallback grant, request grant, default-state denial, previous denial, pending denial and pending grant. The two pending cases supply an unrelated parent settings change. They also check that the Agent notification flag and unknown settings are not replaced by a stale snapshot.

`fixture.json` and the replay are frozen before baseline execution. Existing Agent notification, denial, concurrency, delimiter and root-lock proofs remain unchanged. `source-freeze.json` records the production pins, 32 original notification evidence files and new inputs. `runtime-request.json` records exact commands and stop conditions for the existing ACC queue.

Measured baseline: six intended assertion failures and two passing controls, exit 1. After the exact prepared import and mention-row change, the identical eight cases passed, exit 0. No cases were skipped. The test-only wrapper adds ordinary CI discovery without changing the eight cases.

## Executed verification

The existing ACC request `6238a3c9` received direct admission in message `7fafef23-325f-435b-952a-292306e7535a`. All commands ran once, sequentially in the foreground on Cloud352 with `NODE_OPTIONS=--max-old-space-size=1024`, nice 19, and the retained 60-second test or 90-second typecheck timeout. Installed dependency versions matched the unchanged lock; no install ran.

- RED reproduced: frozen `replay.test.cjs` produced six intended failures and two passing controls.
- GREEN passed: the identical command and frozen inputs passed all eight cases.
- Adjacent passed: retained Agent notification gate, concurrency and denial-feedback replays passed all 16 cases.
- Typecheck passed: `nice -n 19 timeout --kill-after=5s 90s node node_modules/typescript/bin/tsc --noEmit` exited 0.
- Source-integrity checks passed: all 32 previous evidence files, all four frozen new inputs, eight untouched production pins and the exact prepared candidate content hash match.

See `execution.json`, the `*.command.txt` and `*.exit` files, and raw TAP for actual commands, results and hashes. The raw baseline TAP is losslessly gzip-compressed to retain its original whitespace. `source.json`, `source-freeze.json` and `runtime-request.json` are immutable pre-execution records; their historical pending status is superseded only by this execution record. Runtime was explicitly released before publication with no own jobs, servers or generated build output.

## Verification limits and ownership

The rendered React checks substitute permission APIs and persistence. They prove checkbox behavior, exact denial feedback and preservation of concurrent settings under those inputs, not macOS permission prompts, disk persistence, notification delivery or visual parity. No browser, server, native prompt, provider, local build, package or screenshot ran because those operations were outside this grant.

The ledger cleared sole ownership in receipt `a7f4d3b4-fca8-4175-8f02-6e68730d4ea1`; `ownership.json` records the scope. Toast files and the Agent handler remain untouched. No additional executor or watcher exists. The fixed #992 package cut and existing release/E1 ownership are unchanged. A later authorized containing artifact and native acceptance are still required.
