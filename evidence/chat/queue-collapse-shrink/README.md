# Queue collapse after a two-to-one shrink

Conductor Rebuild · `COMPOSER-QUEUE-COLLAPSE-SHRINK-135` · 2026-11-17

## Result and focused change

The actual mounted `Composer → QueuePanel → QueueRow` regression reproduces **five intended semantic assertion failures with 13 unaffected controls passing**, then **18/18 passing** with the identical fixture and command. No skips, cancellations, TODOs, setup failures or assertion edits occurred.

Only production `src/features/chat/Composer.tsx` changes: **11 insertions / 4 deletions in QueuePanel**. Derive `canCollapse` from the visible local queue count, show a singleton even if previous collapse state is retained, omit the singleton toggle, and clear collapse when unsupported so later growth remains expanded. Code before QueuePanel and QueueRow onward is byte-identical to the baseline. Queue actions/reducers, focus/drag, attachments and #1474 blank-save guards are unchanged.

Baseline default main: `5397204995280d90903e17dae3f391759bcde1d9`, the actual #1474 squash. The working branch was merged with that main before RED; its tracked tree equalled main. This is a sequential successor against main, not a stacked PR.

## Exact reproduction

Frozen fixture: [`src/features/chat/composerQueueCollapseShrink.test.ts`](../../../src/features/chat/composerQueueCollapseShrink.test.ts), 16,047 bytes, SHA-256 `948310bd9247754387556adc910acec1cc3174c26bdff38b2dff3b65e0d77cad`.

Both sides executed exactly once:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s env -u COMPOSER_QUEUE_COLLAPSE_SOURCE_REF NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 src/features/chat/composerQueueCollapseShrink.test.ts
```

- **RED — exit 1:** baseline Composer SHA-256 `8aca2474747054e9ed35885873c6ca9a5e21c76f276c6fd38fa0a090d3f5a3ad`; [complete lossless output](runtime/red-test.stdout.gz). All five `shrink/` cases fail with `ERR_ASSERTION`, and all 13 `control/` cases pass. The first failure renders no rows instead of surviving `q2` after collapsed completion 2→1.
- **GREEN — exit 0:** treatment Composer SHA-256 `5dde290a9c73845b334a4b0daa26733ae76ed06f037df770fdbee2062dcf238c`; [complete output](runtime/green-test.stdout). All 18 cases pass using the exact same fixture, test names, order and assertions.

For a clean checkout to replay the historical baseline without modifying its working Composer, the frozen fixture also supports the explicit source selector:

```bash
COMPOSER_QUEUE_COLLAPSE_SOURCE_REF=5397204995280d90903e17dae3f391759bcde1d9 node --test --test-concurrency=1 src/features/chat/composerQueueCollapseShrink.test.ts
```

That selector command is a documented replay route, **not an additional execution claimed here**. Dependencies and native-TypeScript-capable Node are prerequisites. The original frozen request and scripts retain historical `.qa` paths and source-only labels; they are provenance, not renewed runtime admission. Launcher and preflight scripts are retained as inert `.py.txt` files. RED output is losslessly gzipped to preserve its original assertion-diff whitespace without introducing trailing whitespace in the repository diff.

## Assertions and boundaries

The fixture transpiles the **complete actual exported Composer source** and mounts the actual QueuePanel/QueueRow with React test-renderer. It does not extract/copy the collapse implementation or replace its state. Real queue helpers seed, complete, remove, reorder, submit, pause/resume and edit. External completion updates the same mounted Host/Composer identity.

Five decisive cases cover collapsed completion 2→1; regrowth 2→1→2; initial singleton control visibility; expanded completion 2→1; and collapsed explicit deletion 2→1. Thirteen controls cover multi-row expansion/collapse/rerender/reorder, 3→2 stability, exact queued item/content/attachment preservation, zero/unmount/remount, Pause/Resume, ordinary edit/save, both #1474 blank-save buttons, intentional direct reducer deletion, and no-steer behavior. Disabled callbacks are never invoked.

The editor, tooltips, preferences and unrelated side boundaries are stubbed; unexpected side effects fail closed. Assertions concern rendered React host nodes, **not browser DOM, pixels, native events or installed-app behavior**.

## Retained real-Conductor source binding

No new reference acquisition was performed. Retained complete renderer `renderApp-D_fmY7hW.js`: 11,600,457 bytes; SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Five complete declarations and exact half-open UTF-8 spans are preserved in [the span manifest](reference/spans.json), inside the corrected historically REA-analyzed queue slice `[8599657,8761291)`, SHA-256 `e43f1cbced0bbad078e30162a1249c272d17e503215464a35115e73843572f88`.

- `JNi → AAo`: actual queue caller. AAo resets collapse when visible count is ≤1, derives `canCollapse` from count >1, and passes state/setter to GTo.
- `GTo → DTo`: forwards capability/state to the presentation and actual list consumer; the collapse intent invokes the parent setter.
- `DTo`: shows list children when not collapsed **or** collapse is unsupported.
- `PTo`: renders the collapse toggle only when `canCollapse` is true.

Original REA receipt: [`evidence/chat-queue/rea-queue-sites.json`](../../chat-queue/rea-queue-sites.json), retained untouched. The former directory-subject digest incorrectly interpreted as a slice-file digest remains **failed/superseded**, not silently passed. [Corrected binding](reference/corrected-binding.json) preserves that distinction and all 20 historical coordinate joins. Existing string/property seed no-match, graph-cap and unresolved native-consumer limits remain; this change establishes no new native claim.

## Slot evidence and cleanup

Execution was on Reason Cloud with fresh CPU0 affinity, ≥4-GiB disk, no own conflicting workloads, existing dependencies only and Node v22.23.3 native TypeScript capability. Every slot rechecked all frozen identities: fixture, Composer, 14 other source files, 217 dependency files and two complete package contracts.

- RED preflight **246 passed**. Test ran 21:56:22.686883Z–21:56:23.754619Z; actual release **21:56:23.754794Z**.
- GREEN treatment-aware preflight **249 passed**. Test ran 22:00:10.897003Z–22:00:11.915137Z; actual release **22:00:11.915308Z**.
- Both used one serialized CPU0 slot, 60-second timeout + 5-second termination grace + ≤30-second cleanup, 768-MiB heap and ≤16-MiB incremental evidence. Observed raw output totals were 9,946 bytes RED and 4,200 bytes GREEN, excluding their small final receipts.
- [RED receipt](runtime/red-receipt.json) and [GREEN receipt](runtime/green-receipt.json) record zero surviving live process-group PIDs. Child max-RSS readings (162,116 / 155,724 KiB) are per-child maxima, **not aggregate RSS verification**.

`python3 evidence/chat/queue-collapse-shrink/verify.py` verifies retained evidence identities, exact paired outcomes and unchanged fixture without invoking Node or product code. `git diff --check` passes.

## Explicit validation gaps and acceptance owner

**Not run locally:** full frontend typecheck/build, full adjacent test suite, browser/screenshots, native/Tauri, provider/backend, Mac/REA acquisition, packaging, installed-app or final side-by-side acceptance. There is no screenshot because browser/native execution was not admitted; component output is not a screenshot substitute. Exact-head hosted workflow results are recorded in the PR separately.

Root retains package/native follow-through through the existing sole E1 custody. This lane starts no duplicate executor, package dispatch or native retry. Its duplicate #1474 release-only watcher was cancelled after that custody was confirmed. A merged source change alone is not package inclusion or observed native parity.
