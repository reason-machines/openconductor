# Overlapping fenced-code copy resets: executed regression

Conductor Rebuild. Candidate `CHAT-CODE-COPY-OVERLAPPING-RESET-BE7`.

## Result

The frozen actual-component regression reproduced the predicted mismatch, then passed after changing only `CopyCode` success/reset scheduling. The same mounted production `Transcript → Markdown → CodeBlock → CopyCode` callback path and deterministic fixture clock ran in both checks. No copy/reset implementation is duplicated in the fixture.

- **RED:** exit 1; four pre-existing controls passed, the new overlapping-success case failed on its captured **3000 ms** observation (`Copied` instead of `Copy`). The case had already visited 4500 ms before that assertion. Start/end: 2026-11-17 21:03:25–21:03:27Z; shell elapsed 2.806 seconds.
- **GREEN:** exit 0; **5/5 passed**, with zero failures, cancellations or skips. Start/end: 21:03:48–21:03:50Z; shell elapsed 2.114 seconds.
- **Identical fixture SHA-256:** `720e650d15b131230353f0673cb307fe1a935e0d8ece4415379ef8df96de91c2`.
- **Unchanged lockfile SHA-256:** `2203faf80f07760a020cb1c4aa3ef55e2c25db72a887c5c02808b0d2c2621992`.
- Product SHA-256 before: `06354820fa6722b771c0e626a3dffc2cee5f34f0917366ca25ec47cdddab17b4`; after: `35c81f7d5094d4b4bf8c5b7dc85db4666ae9aed21a3be177471dfa69309698cb`.

Raw, unedited TAP and shell timing, exit codes and timestamps are in [execution/](execution/). The RED log is losslessly gzip-archived to preserve the assertion formatter's trailing spaces without a whitespace-diff violation; [log-encoding.json](execution/log-encoding.json) binds both compressed and original bytes. Earlier static-only claims in `source-manifest.json` and `static-verification.json` describe the freeze, not the final execution state. The original frozen README and SHA256SUMS are preserved under `baseline/frozen-README.md` and `execution/frozen-SHA256SUMS.txt`.

## Why this fix

Retained shipped Conductor renderer `renderApp-D_fmY7hW.js` (11,600,457 bytes; SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`) contains complete `t0` at raw UTF-8 bytes `[1793169,1794797)`. Its successful clipboard fulfillment sets success and schedules an independent 2000 ms reset **every time**; no prior timeout is cancelled. The complete ordinary non-Mermaid multiline fenced-code caller chain and all nine exact literal/digest/range bindings remain in [source-manifest.json](source-manifest.json) and [reference/](reference/).

OpenConductor scheduled its timeout in `useEffect([copied])`, so a second successful copy while already true created no timer. With successful fulfillments at 0, 1000 and 2500 ms, it therefore incorrectly held the third confirmation at 3000 ms instead of applying the second success's reset. The fix schedules the reset directly in every existing success callback and removes the now-unused effect/import. Payload, rejection handling, notifier feedback, button labels, unrelated chat surfaces and dependencies are unchanged.

The oracle is **retained REA-extracted shipped source**, not a new observation of the installed app. `WJe` supplies no tooltip; the retained confirmation is icon-only. Existing OpenConductor labels merely observe its success Boolean, not label or tooltip parity. The no-disabled/no-remount guard and full source-attribution limits are retained in the original freeze.

## Exact paired command

From the isolated worktree, for both checks:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s env NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 src/features/chat/copyCodeFeedback.test.ts
```

Ledger reservation `BE7-COPY-PAIR-20261117-210304` was explicitly confirmed at 21:03:04.641Z. Fresh gates passed: CPU 0 was allowed (set 0–3), 8,760,270,848 bytes free exceeded 4 GiB, exact fixture/lock/baseline product hashes matched, and the worktree was clean. The fetched main remained `c22e27d48a0940c5793842cfddc023b7e5f838c5`; its relevant baseline files matched the snapshots.

One CPU affinity is a coordinator allocation, not host exclusivity. Peak RSS was **not measured**; 768 MiB old-space is not a hard RSS bound. No time/RSS claim is inferred from other runs.

## Cleanup and release

Actual slot release: **2026-11-17T21:04:10Z**, after both foreground commands ended. Own generated `node_modules` was deleted; provisioning cache/temp were already removed. Provisioning receipts were moved into `execution/provisioning/`, then the remaining scratch directory was removed. Final checks found no remaining Node/npm processes and no dependency/cache/temp directory. Final free disk was 9,259,876,352 bytes, a point-in-time shared-disk observation, not a capacity reservation.

The provisioning receipts record the earlier missing timing executable and its shell-timing substitution; npm itself ran once and exited 0. No installation occurred in the paired slot.

## Verification scope and delivery

`python3 evidence/chat/code-copy-overlapping-reset/verify.py` verifies the unchanged fixture, baseline identities, nine decoded source spans, four unchanged control bodies, product identity, exact recorded RED/GREEN outcomes and current evidence checksums. `--parent <retained-renderer>` additionally rechecks full-parent identity and every literal byte range. These are static integrity checks, not another behavioral run.

**Not run:** build, typecheck, color audit, browser, OS clipboard, native/Tauri, provider, packaging, installed-app replay or full side-by-side acceptance. There is no screenshot/recording because no browser/native execution was admitted. Hosted exact-head workflows are separate from the local component proof and must all pass before merge. No cancellation/SAME49/Composer or source-blocked work was touched.
