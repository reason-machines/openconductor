# Message-copy rejection feedback — paired result

Conductor Rebuild reproduced and fixed `MESSAGE-COPY-REJECTION-BE7` in the actual mounted Transcript component. This is retained-source-attributed component verification, **not native parity**.

## Change

Only production `src/features/chat/Transcript.tsx` changes:

- Pass its existing `notify` callback through ordinary user-message actions and the final-message footer into their shared `CopyButton`.
- Report rejected clipboard requests through the established error-notification seam: title `Failed to copy`, description `Please try again.`.
- Leave successful confirmation unchanged on rejection and schedule the 2000-ms reset only on fulfillment. A rejected request creates no timer.

Clipboard payloads, labels, final-text selection and other chat behavior are unchanged. Existing fenced-code copy feedback is a separate path, already delivered by #1473.

## Source and fixture identity

The original frozen [README](README.md), [manifest](source-manifest.json), [static preparation result](static-verification.json) and lossless reference spans remain historical preparation evidence. Their `NOT_RUN` statements describe that frozen stage, superseded only by the specific receipts below. `verify.py` checks a pre-RED tree; it is not a post-treatment current-file verifier.

The complete retained Conductor renderer is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, associated with REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. REA semantic analysis skipped the renderer after heap exhaustion. The five complete decoded spans establish the ordinary user/final-text callers, shared copy button, awaited clipboard boundary and error request; they are retained shipped-byte evidence, not new semantic REA nodes or new app observations.

Frozen fixture SHA-256 for **both runs**: `9a60c39ee956463257d6c35dd184923e6a35802179851cb21624470eb2b4a7d1`.
Lock SHA-256: `2203faf80f07760a020cb1c4aa3ef55e2c25db72a887c5c02808b0d2c2621992`.

Before RED, CPU0 affinity, fresh ≥4 GiB free disk, both hashes and installed React/React DOM/test-renderer 18.3.1 plus TypeScript 5.9.3 passed their gates. No install ran in the paired slot.

## Paired component check

Exact command, unchanged between runs:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s \
  env NODE_OPTIONS=--max-old-space-size=768 \
  node --test --test-concurrency=1 src/features/chat/messageCopyFeedback.test.ts
```

- **RED — exit 1:** exactly six intended semantic failures and two ordinary-success controls passed. For both actual user/final-message buttons, rejection omitted the error request; rejection after success changed the icon from `check` to `copy`; rejection without a notifier changed the tooltip from its idle label to `Couldn't copy`. No setup failure, cancellation or skip.
- **GREEN — exit 0:** identical fixture **8/8 passed**. Both notification requests, idle/success icon and tooltip states, success-only timer counts, original 1999/2000-ms reset deadline, exact payloads and optional-notifier handling passed. No assertions or controls changed.
- Raw TAP and actual timestamps/exits are preserved in [runtime](runtime/). Node emitted an experimental proxy-agent warning in both runs; it did not cause a test failure.

The fixture mounts production `Transcript → Row → MessageActions → CopyButton` and `Transcript → TurnFooter → CopyButton` with real React hooks/test-renderer, reducer-generated rows, independent clipboard promises and a deterministic copy clock. It does not copy the implementation under test. Presentation-only tooltip/icon stubs expose content and selected icon; unrelated bodies/turn-detail presentation are not covered.

## Fresh-main reconciliation and static checks

After the paired slot, fresh main was fetched at `3e54efdd71f44ab888ebd18d8fe37870e806a4ba` (#1473). Its Transcript bytes still match the RED baseline SHA-256 `b543001eeb48ab956140a164646554862ad314ae3511bda7abdfd5238d7eeac0`. Every other baseline dependency remains byte-identical except `copyCodeFeedback.test.ts`, which #1473 expanded from the four historical controls to its five-case fixture. That independent newer fixture is preserved on delivery, not reverted or normalized. Its historical snapshot remains explicitly pinned to `c22e27d48a0940c5793842cfddc023b7e5f838c5`.

The treatment product SHA-256 is `4ba9fe4df5a852934890e19ac7de61f14fe8cdcbcf3652e60bbd18e925b271b4`. Static source/baseline/fixture and paired-receipt integrity is recorded in `runtime/static-treatment-verification.json`. `git diff --check` passed. Delivery copies the executed fixture/product bytes without another behavioral run.

## Resource release and limits

Actual serialized release: **2026-11-17T21:23:26.041574Z**. One CPU0-affined check ran at a time. Own generated dependencies/cache/temp were removed and no own Node/npm process remained; free disk was 14,177,689,600 bytes (about 13.2 GiB). See [release receipt](runtime/release.json). Peak RSS was **not measured**; 768 MiB old-space is not a hard RSS cap.

**Not run:** build, typecheck, broader test suite, browser, OS clipboard, native/Tauri, providers, package or installed-app/full side-by-side acceptance. Browser/native execution was not admitted, so no screenshot or recording exists. Error-toast layout and original notifier runtime are unverified. All exact-head CI workflows must finish successfully (or legitimately conditionally skip) before merge. Package/native acceptance stays with the existing release owner; no duplicate native dispatch is implied.
