# Return to the surviving queued row after editing

Conductor Rebuild · `COMPOSER-QUEUE-EDIT-RETURN-FOCUS-135` · 2026-11-17

## Result and minimal change

The complete actual mounted `Composer → QueuePanel → QueueRow` regression produced **six intended assertion failures with 14 unaffected controls passing**, then **20/20 passing with the identical frozen fixture and command**. No assertions changed, and neither execution had setup errors, skips, cancellations or retries.

Production changes are **10 inserted lines, only in QueuePanel** in `src/features/chat/Composer.tsx`. Keep the preceding edit identity in the existing panel and, on edit exit, use its existing exact-row focus callback only if that row still exists. Update the identity before requesting focus so ordinary rerenders cannot repeat restoration. No global focus manager, reducer change, dialog/menu change, editor-entry change or cross-session state is introduced. All source before QueuePanel and QueueRow onward is byte-identical to the baseline; the original #1474 blank-save and #1476 collapse-shrink guards remain unchanged.

The historical RED source was baseline Composer SHA-256 `5dde290a9c73845b334a4b0daa26733ae76ed06f037df770fdbee2062dcf238c` with fetched main `d435e2baba6552de85b12cac2544579d20c14ce1` bound before execution. Before GREEN the branch incorporated current main `6792a09a2d4826a57d8afd7c7e4243de052529bf` (#1478, settings-script rows only): all 15 subject source and two package identities remained unchanged. This unit follows actual #1476 merge `1e2500a959f68411be54cdca5c0473d0010b0559` and targets main, not another PR branch.

## Exact paired execution

Original executable frozen fixture: 21,078 bytes, SHA-256 `e275647b5174feb78281ff3ae2c0a5c3c735ccf2207da9815e66a3d965bf86be`; retained unchanged as [inert text](baseline/composerQueueEditReturnFocus.test.ts.txt). Oracle SHA-256 `d9f1d9b1a11764422c57ad3dbba7331c09d2b90edcf4dc5b0f21b7368f840979`.

Both baseline and treatment ran exactly once:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s env -u COMPOSER_QUEUE_EDIT_RETURN_FOCUS_SOURCE_REF NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 .qa/queue-edit-return-focus-135/composerQueueEditReturnFocus.test.ts
```

- **RED, exit 1:** [complete lossless TAP](runtime/red-test.stdout.gz), six `return-focus/` assertion failures, 14 controls pass. Cancel, Escape, Save and Enter on the middle row, plus Cancel and Save on the head row, expected a single surviving-row focus call and instead received none.
- **GREEN, exit 0:** [complete TAP](runtime/green-test.stdout), all 20 pass on treatment SHA-256 `60484a0072e816fe61f4abbc19f236c3d5c9e1bc4807fe3d4bcd69bbf2a5d6c8`. Same case names, order and assertions; the frozen fixture remains byte-identical.
- The earlier GREEN reservation expired before execution resumed: it is explicitly retained as [NO_RUN](green-slot-no-run-20261117T224909714Z.json), **not** a failed test, semantic GREEN or extra invocation. Only its separately renewed slot executed GREEN.

The permanent regression is [`src/features/chat/composerQueueEditReturnFocus.test.ts`](../../../src/features/chat/composerQueueEditReturnFocus.test.ts). The [exact port manifest](permanent-port.json) lists only import/type-lookup path replacements and three comment changes; all remaining executable and assertion bytes match the frozen original. The verifier checks exact transformation output, not just normalized assertion counts. The `.qa` paths above are historical invocation provenance, not clean-checkout replay paths.

For a clean checkout with installed dependencies and native-TypeScript-capable Node:

```bash
node --test --test-concurrency=1 src/features/chat/composerQueueEditReturnFocus.test.ts
```

The permanent fixture also retains `COMPOSER_QUEUE_EDIT_RETURN_FOCUS_SOURCE_REF` as an explicit historical-source selector. Neither the clean-checkout command nor a selector replay is an additional execution claimed by this record.

## Contracts exercised and boundaries

Six decisive cases cover ordinary enabled edit completion on head/middle rows through actual Save/Cancel buttons and Enter/Escape handlers. The host renders the complete real exported Composer and uses the actual queue reducer/action routes. Its explicit editor and DOM-focus ports track entry caret placement and the existing rendered-list exact-row selector; they cannot invent missing or duplicate rows. Attachments/content/effects are asserted alongside focus.

Fourteen controls preserve entry caret-at-end; no repeated exit focus; no-edit mount/rerender; editing rerender; switching directly between edits; Save-and-steer removal; deletion; idle head drain; session-key switch; same-ID session remount; disabled blank Save buttons; blank Enter/meta-Enter; collapse/shrink/regrowth; and re-entry after Cancel. Removed rows and previous-session rows must never be queried or focused. Disabled callbacks are never invoked.

These are **component/reducer outcomes at explicit test ports**, not browser DOM, keyboard event integration, native focus, screenshot, pixel or installed-app parity. The source-backed reference contract concerns list selection/focus; OpenConductor realizes that through its existing exact-row focus callback, not a claim of identical reference DOM structure.

## Retained real-Conductor source and REA history

No new app acquisition, REA run or native observation was performed. The retained source qualification binds four complete renderer declarations (`JNi → AAo → GTo → DTo`) and the normal save/cancel producer/store path, with [exact renderer ranges](reference/spans.json), [producer ranges/import/export aliases](reference/producer-spans.json) and [171 historical closure checks](qualification-v2.json).

The reference GTo effect reads the previous queued-edit identity, requires edit exit and a surviving row, restores that row's selected identity and focuses the list ref actually consumed by DTo. The retained normal `saveQueuedMessageEdit`/`cancelQueuedMessageEdit` producer closure clears edit state and preserves the ordinary surviving item; steer/drain/removal differ and are explicit negatives. This is source qualification, **not a freshly observed native defect**. #1251 covers editor-entry caret placement, while first-visual-line and queue-navigation work cover other focus transitions; this unit is edit-exit restoration.

The complete renderer identity is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Declarations bind inside the historically REA-analyzed UTF-8 slice `[8599657,8761291)`, SHA-256 `e43f1cbced0bbad078e30162a1249c272d17e503215464a35115e73843572f88`. The original [REA receipt](../../chat-queue/rea-queue-sites.json) is untouched; [corrected historical binding](reference/corrected-binding.json) retains all 20 coordinate joins and explicitly preserves the superseded directory-subject/file-digest interpretation as failed/superseded. Seed no-match, graph-cap and native-consumer uncertainties are not upgraded into successes.

## Serialized execution and cleanup

Both runs used Reason Cloud, CPU0 affinity, at least 4-GiB free disk, no own conflicting workload, existing pinned dependencies only, a 60-second test timeout + 5-second termination grace + at most 30-second cleanup, 768-MiB heap **per Node process**, and at most 16-MiB incremental retained output. The RSS estimate is not an aggregate process-group cap.

- RED: 261 static preflight gates passed; test 22:39:16.397881Z–22:39:17.516598Z, actual release **22:39:17.518943Z**; child high-water RSS 162,528 KiB, not aggregate RSS.
- GREEN: 267 treatment-aware preflight gates passed; test 22:58:01.828726Z–22:58:02.946573Z, actual release **22:58:02.948924Z**; child high-water RSS 161,752 KiB, not aggregate RSS.
- Both [receipts](runtime/green-receipt.json) record zero live process-group survivors. GREEN post-run readbacks verified fixture, oracle, 15 source files, 217 installed dependency files and two package contracts unchanged. TAP output hashes and a second process-group readback are in [the post-run receipt](runtime/green-result-and-drift.json).

## Permanent regression and focused adjacent validation

**Passed: 155/155 tests**, exit 0; no setup error, failure, cancellation, skip, TODO or retry. One separately admitted invocation ran the permanent regression and all five unchanged legacy suites:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s \
  env -u COMPOSER_QUEUE_EDIT_RETURN_FOCUS_SOURCE_REF \
  -u COMPOSER_QUEUE_FOCUS_SOURCE_REF -u COMPOSER_QUEUE_EDIT_EMPTY_SOURCE_REF \
  -u COMPOSER_QUEUE_COLLAPSE_SOURCE_REF NODE_OPTIONS=--max-old-space-size=768 \
  node --test --test-concurrency=1 \
  src/features/chat/composerQueueEditReturnFocus.test.ts \
  src/features/chat/composerQueueFocus.test.ts \
  src/features/chat/composerQueueEditEmptySave.test.ts \
  src/features/chat/composerQueueCollapseShrink.test.ts \
  src/features/chat/queue.test.ts src/features/chat/queueKeys.test.ts
```

Breakdown: return-focus **20**, focus/navigation **43**, blank-edit guards **51**, collapse-shrink **18**, queue reducers **18**, queue keys **5**. All twenty permanent case names/outcomes match the original GREEN. The legacy test files and every frozen assertion are unchanged.

[Full TAP](runtime/permanent-adjacent-test.stdout), [stderr](runtime/permanent-adjacent-test.stderr), [actual release receipt](runtime/permanent-adjacent-receipt.json) and [frozen request](request-permanent-adjacent.json) are retained. Tests ran **23:10:42.006019Z–23:10:49.387805Z** on 2026-11-17; actual cleanup/release **23:10:49.569952Z**, group 81 with no live survivors. The relative-start reservation imposed the same 60+5+30-second bound, CPU0, 768-MiB heap per Node process and 16-MiB output ceiling. Child high-water RSS **226,544 KiB** is not aggregate process-group RSS or a group cap. Stdout: 28,788 bytes, SHA-256 `f0a04691f493bec1cec1918d33e5edf611b3ac3ffb2bb988bff26b3d269c3514`; stderr: 175 bytes of an experimental proxy warning only. All **244 pre/post pin checks passed**, including source, frozen fixture, dependency/package and Node executable identities. Outside-QueuePanel prefix/suffix equality passed. No install, additional Node capability call or other runtime occurred.

`python3 evidence/chat/queue-edit-return-focus/verify.py` checks all retained artifact identities, paired TAP outcomes, source boundaries, the exact permanent port and the focused-adjacent receipt without invoking Node or product code.

## Validation limits and release custody

Full frontend typecheck/build, full suite, browser/screenshot, native/Tauri/provider/backend execution, fresh Mac/REA acquisition, packaging, installed-app behavior and final side-by-side acceptance are **not run here**. There is no screenshot because browser/native execution was not admitted. Component focus ports are not a substitute for native focus evidence. Hosted exact-head check outcomes belong in the PR separately.

Root retains release/package/native follow-through through sole E1; this lane starts no duplicate executor, acceptance watcher, package dispatch or native retry. E1 is currently unavailable. Source merge, containing-package inclusion and observed native behavior remain separate claims.
