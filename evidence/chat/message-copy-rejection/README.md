# Message-copy rejection feedback — frozen preparation

The paired run has since completed: see [TREATMENT.md](TREATMENT.md) for observed RED/GREEN, cleanup and limits. The original frozen preparation below is retained as historical evidence, not current runtime status.

Conductor Rebuild retains `MESSAGE-COPY-REJECTION-BE7`. This is a source-qualified hypothesis pending actual-component RED/GREEN, not behavioral or native parity. The frozen increment contains a new regression and evidence only; no product file changes.

## Retained original attribution

The complete retained decoded Conductor 0.87.6 renderer is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. It is associated with existing REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. REA's semantic analysis skipped this renderer after heap exhaustion; these claims come from its retained decoded shipped bytes, not new semantic REA nodes or new app observations. The original checkpoint attachment lineage is recorded in `source-manifest.json`; no Conductor acquisition or execution occurred here.

Five complete declaration spans, with half-open original UTF-8 offsets and per-span digests, are preserved losslessly as JSON `raw_utf8` fields:

- `WOo [8888340,8895883)`: nonempty ordinary user content supplies `t0` with `text:Bwr(Nt)` and `tooltip:"Copy message"`. The mouse-enter/mouse-leave wrapper controls visibility, not copy-success state; the call supplies no custom copier, disabled flag, or copied-tooltip override.
- `TDo [8919506,8927404)`: nonempty selected final text `G` supplies the same `t0` with `text:G` and `tooltip:"Copy final message"`. It supplies no custom copier, disabled flag, or copied-tooltip override. This candidate does not change final-text selection or clipboard payloads.
- `t0 [1793169,1794797)`: local success starts false. A normal click stops propagation, waits for `l1`, sets success and independently schedules false after 2000ms only on fulfillment. Rejection goes to `hZr`, not a failure-state setter. The button's icon reads success; the provided tooltip reads `success ? "Copied!" : tooltip`. A rejected second request therefore cannot erase an existing successful confirmation or introduce a reset timer.
- `l1 [739306,739397)`: awaits the clipboard write, using navigator clipboard outside Tauri or the existing native clipboard bridge inside it. The rejection distinction is supported across that awaited boundary; this fixture does not exercise OS clipboard or Tauri.
- `hZr [1794797,1794905)`: requests `kt.error("Failed to copy",{description:"Please try again."})`. The test contract is this error request and local state, not logging, toast layout, hover presentation, or original global-notifier runtime behavior.

Both caller→button→awaited producer→success/rejection state→icon/tooltip/error-request joins were reread in full against the same parent identity. User clipboard normalization is outside this candidate; the existing original `Bwr` and local `userMessageCopyText` contracts are preserved.

## Fresh-main comparison and dedupe

Fresh `origin/main` was fetched and checked at `c22e27d48a0940c5793842cfddc023b7e5f838c5`. `Transcript.tsx` SHA-256 is `b543001eeb48ab956140a164646554862ad314ae3511bda7abdfd5238d7eeac0`.

Its real `Row → MessageActions → CopyButton` and `TurnFooter → CopyButton` paths reach an awaited `navigator.clipboard.writeText`. `CopyButton` currently catches rejection with `setState("failed")`, then unconditionally schedules idle after 2000ms. Neither caller passes the already-available `ctx.notify`. Thus the predicted differences are a missing error notification, an extra reset timer, and an existing success changing immediately to a local failure tooltip.

The established error-notification seam already exists: `App.useToasts().show → WorkspaceView.notify → ChatPanel.notify → Transcript.notify → ctx.notify`. `useToasts.show` keeps `description`, and `Toast` renders errors as alerts with title and description. Full fresh-main file snapshots are retained; no new notification policy or UI surface is proposed.

GitHub PR-title search `is:pr copy in:title` returned 26 results with no next page. #978 changes fenced-code `CopyCode` only; #952 changes user payload labels; #1203 changes final-text selection; #1473 changes code-copy overlapping resets. None changes this shared message-copy rejection branch. Main `Transcript.tsx` history was also reread. Existing frozen cancellation, Composer, queue, context/cost, dialogs, diff/changes, palette, Home/sidebar and native seams are excluded.

## Frozen actual-component fixture

`src/features/chat/messageCopyFeedback.test.ts` mounts the production `Transcript`, `Row`, `MessageActions`, `TurnFooter`, and shared `CopyButton` declarations with real React hooks and test-renderer. Actual reducer/view/grouping code produces the rows from user/assistant messages and a completed turn. Clipboard promises settle independently; only the copy callback's clock is deterministic. No copied copier, fake React state, hand-built row, or manufactured event outcome is used. Presentation-only Tooltip/Lucide stubs expose the tooltip content and selected icon; unrelated message body/turn-detail presentation is not under test.

Four cases run for each real user and final-message copy button (eight total):

1. Rejection before any success must request the exact title/description, preserve idle icon/tooltip and schedule no reset.
2. Fulfillment at 0ms followed by rejection at 1000ms must preserve success through 1999ms and reset at its original 2000ms boundary; no second timer.
3. Ordinary success control must confirm only after fulfillment, reset at 1999/2000ms and request no notification.
4. No-notifier rejection must remain handled, preserve idle and schedule no timer.

The predicted RED is six semantic failures with two success controls passing. This is a prediction, not an observed result. A setup failure does not qualify as RED and permits no product edit. Existing `userMessageCopy.test.ts`, `finalMessageCopy.test.ts`, and `copyCodeFeedback.test.ts` are unchanged, with baseline digests retained.

## Requested serialized resources — not admitted

Same isolated worktree `.ara-state/tmp/message-copy-rejection`, no `node_modules` or verified shared mount exists. Lock SHA-256 `2203faf80f07760a020cb1c4aa3ef55e2c25db72a887c5c02808b0d2c2621992`; React/test-renderer 18.3.1, TypeScript 5.9.3. Development dependencies are required; optional packages and lifecycle scripts are not needed for this isolated fixture.

Dependency-only plan, after explicit allocator admission and assigned allowed CPU plus fresh ≥4GiB disk gates:

```bash
# From the same isolated worktree. BE7_CPU is assigned by the canonical ledger.
mkdir -p .ara-state/be7-deps/{cache,tmp}
timeout --signal=TERM --kill-after=5s 300s \
  env NODE_OPTIONS=--max-old-space-size=768 UV_THREADPOOL_SIZE=1 TMPDIR="$PWD/.ara-state/be7-deps/tmp" \
  nice -n 10 taskset -c "$BE7_CPU" \
  npm ci --include=dev --omit=optional --ignore-scripts --no-audit --no-fund \
    --registry=https://registry.npmjs.org --cache="$PWD/.ara-state/be7-deps/cache" \
    --maxsockets=1 --fetch-retries=0 --fetch-timeout=30000 --loglevel=error
```

Provisioning request: one CPU, estimated ≤1.5GiB RSS and 2GiB incremental peak disk, 300s + 5s termination + 30s cleanup. Old-space is not an RSS bound. The preceding same-lock install took 45.441s and retained 396MiB of dependencies; that is historical evidence, not a timing guarantee or proof this install ran. Verify package identities and tracked hashes afterward; remove cache/temp. On failure remove only newly generated dependencies/scratch; no retry.

Separately admitted paired command, unchanged for RED and GREEN:

```bash
taskset -c "$BE7_CPU" timeout --signal=TERM --kill-after=5s 60s \
  env NODE_OPTIONS=--max-old-space-size=768 \
  node --test --test-concurrency=1 src/features/chat/messageCopyFeedback.test.ts
```

Paired request: one CPU/one Node at a time, estimated ≤1.5GiB RSS, 60s/check + 5s termination grace, five-minute total including gated minimal edit. Qualified semantic RED must precede any product change. Proposed later product scope is only message-copy error notification plumbing and success/rejection scheduling in `Transcript.tsx`; clipboard payloads, success labels/timing, final-text selection and all other seams stay fixed. On release terminate own Node/npm, remove own generated dependencies/cache/temp, and reread hashes/status/disk. No build/typecheck/browser/native/provider or publication is included in these requests.

## Verification limits

Static source identity/baseline/fixture checks and whitespace may be run without the serialized product-workload slot. Node, dependencies, tests, typecheck, build, browser, OS clipboard, native/Tauri, providers, package and full-app/side-by-side acceptance have NOT RUN for this candidate. The fixture is frozen but unexecuted. Existing #1473 delivery is independent and retains its own CI subscription.
