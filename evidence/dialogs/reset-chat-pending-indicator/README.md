# Reset chat pending feedback

Conductor Rebuild owns this source-only candidate after ledger message `bb5da51d-27cc-4bc8-9f2f-08be43c8071f` cleared the exact pending-button hunk and dedicated regression. Default main was fetched and reread at `a66b72e9fc3790a0c93ac614a901da727929c5d9`, after #1205 merged. This is not runtime intake, a queue position, admission or native acceptance.

## Finding and minimal candidate

The complete retained Conductor Reset-chat declaration renders its working indicator beside `Resetting...`. Current OpenConductor changes the text and suppresses the shortcut but omits the indicator.

[candidate.patch](candidate.patch) adds only a pending-gated decorative 16px SVG inside the existing destructive button. It follows the three-dot precedent in `RunSplitButton.tsx` and reuses its loader animation class. Local inline width, height, border, border-radius and shrink declarations prevent the global pending-workspace loader CSS from forcing a 14px ring. No new abstraction, export, dependency, shared CSS or motion primitive is added. The patch is applied on the assigned branch. The source preparation below records its original unapplied stage; current executed results are in [validation.md](validation.md).

The retained implementation selects a `working-loader` sprite, not this literal SVG. This candidate restores the missing pending feedback. Its appearance and animation are not claimed to match the sprite. Browser/native comparison remains necessary for visible parity. The mounted regression does not load CSS or prove the CSS cascade, animation, layout or actual pixel size.

The existing `busy` state alone controls indicator presence. Busy text, shortcut suppression, confirmation payload and single-flight guard are unchanged. So are Cancel, Escape, dismissal, focus, preferences, backend behavior, original focus/dismissal regressions, shared Modal and every other owner's files. The count-while-unchecked hypothesis is source-closed as matching and has no patch.

## Retained real-app source

[source.json](source.json) binds seven complete spans to the retained Conductor 0.87.6 renderer, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, REA lineage `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. UTF-8 ranges are zero-based and end-exclusive.

- Complete `dDo` `[8909638,8912447)` renders `ri` with `type:"working"` and `h-4 w-4 mr-2` in its pending branch.
- Complete `ri` `[1946250,1946886)` delegates to `Kss` `[1946886,1947094)`, which selects `working-loader`.
- Complete `SEe` `[1779466,1779679)` chooses normal `KJr` or static `GJr` rendering. Both return an indicator element. Their complete declarations and the static flag/sprite registry are retained separately.
- Current primary button is at `src/features/chat/ResetChatDialog.tsx:103`. Its stylesheet has no pseudo-element generating a pending indicator.

Historical whole-renderer semantic analysis exhausted heap. This investigation checks retained bytes as data, without executing vendor code or claiming a new analyzer success. Current installed Conductor identity and runtime behavior are unverified.

## Deferred-confirmation regression target

The new [two-case test](resetChatPendingIndicator.test.ts) copies the existing isolated Reset-chat mounting pattern, with a deferred synthetic confirmation. It uses the actual component, preference helper, menu icon and motion hook. An in-memory storage boundary prevents real persistence. It imports no backend, dialog opener or app shell. React test renderer receives no DOM motion-ref node.

Both cases assert idle-to-pending feedback, label, disabled confirmation, shortcut suppression, preserved reset-files payload and the duplicate-confirmation guard. Failure restores the idle action and leaves the dialog open. Success requests one parent close, rather than incorrectly assuming that the fixture unmounts on that callback.

The test deliberately lives under `evidence`, outside automatic `src/**/*.test.ts` discovery. Preparing this source candidate must not add an unvalidated test or product change to ConfigSync's separately deliverable snapshot. After matching execution and independent delivery allocation, move the unchanged fixture to `src/features/chat/resetChatPendingIndicator.test.ts` with the product patch. No stacked or mixed PR is intended.

Only during a matching ACC grant, use this unchanged command for baseline and candidate, selecting the admitted source tree through `RESET_CHAT_PENDING_SOURCE_ROOT`:

```bash
node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap evidence/dialogs/reset-chat-pending-indicator/resetChatPendingIndicator.test.ts
```

`RESET_CHAT_PENDING_DEPS`, when needed, selects the existing approved dependency project directory containing `package.json`. No dependency or browser installation is requested. Baseline and candidate must use identical test bytes. An unrelated import, harness or dependency failure is not RED reproduction. Adjacent checks are the existing `resetChatFocus.test.ts` and `resetChatDismissal.test.ts`, without edits.

ACC retains serialization and allocation. No runtime grant, new intake/row/ordinal, workflow dispatch, preview, native request or provisioning is created by this target. This owner's ConfigSync and original8/org3/SectionV3/QuickStart13/Icons6 remain separate and unchanged.

## Original source-preparation verification

Passed on Reason Cloud 352:

```bash
python3 evidence/dialogs/reset-chat-pending-indicator/prepare_source.py
node --experimental-strip-types --check evidence/dialogs/reset-chat-pending-indicator/resetChatPendingIndicator.test.ts
git apply --check evidence/dialogs/reset-chat-pending-indicator/candidate.patch
git diff --check
```

The Python check verifies the full retained renderer, all seven exact span hashes, actual current-main source identities, six protected counterparts and the unapplied baseline. The other checks prove syntax, patch applicability and whitespace only. A read-only helper found the global loader-style collision; the candidate now isolates those declarations. No application imports or tests executed.

At the original source-preparation stage, baseline RED, candidate GREEN, adjacent tests, typecheck, build, browser, packaged app and native acceptance were not run. See [validation.md](validation.md) for the subsequent executed checks and remaining build and visual gaps.
