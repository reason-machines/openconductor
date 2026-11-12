# Prevent duplicate submission of a pending review-comment draft

Conductor Rebuild. Unit `SUBMIT-PENDING-IDENTITY-DE6-01`, existing ACC entry `b00314e2`.

## Change

`useReviewComments` keeps a per-draft in-flight `Set<string>` in a ref. The new-draft submit callback checks and adds the draft ID synchronously, before it starts `store.add`. A `finally` block releases that ID after settlement. Repeated clicks and accepted keyboard shortcuts cannot create two comments from the same unresolved draft. Other anchor drafts remain independent. Rejection permits retry, and the existing captured-body comparison preserves newer draft text.

Only the new-draft callback and its ref change. Generic `Composer`, existing-edit notification from #1167, whitespace normalization, IME, Cancel, draft retention, store, API, SQLite, native code, and workflows are unchanged. This prevents duplicate pending delivery. It does not reproduce Conductor's stable-ID backend UPDATE architecture.

## Source qualification

The assigned branch and HEAD stayed unchanged before the product edit. Local HEAD was `84a3153cbca1c25e210c3835ea9314f54e9f6c36`. A supported `git fetch --no-tags origin main` returned live default main `7d5c13c394e5599c32dd9678625202911f74ebf7`. There was no rebase, reset, merge, or branch switch. All nine qualified source files matched live main. The only change from the original packet was #1167's existing-edit catch, notification, and rethrow. Both package manifests, the root lock, and all six adjacent fixtures also matched live main.

The original stored packet, `submit-pending-identity-de6-01-source.tar.gz`, is 69,423 bytes with SHA-256 `989a7b297e72c18927ead156be9a74890cd6ad896b3c4ad5f6d814169183f54a`. Its 26 checksums passed. The original seven-case specification and executable fixture were frozen before the admitted run. The retained original REA assets were read as inert data, never evaluated. Both complete assets, 13 spans and aliases, and 23 static source checks passed. [Original source manifest](source-original.json) and [live-main requalification](source-requalification.json) retain the hashes and offsets. The original manifest is historical source-only evidence, not the status of this delivery.

The retained original route is patch view to `OMi`, annotation metadata to `wet`, and draft editor `SVo`. `OMi` creates the draft identity. `SVo` captures `n.id` and body, then calls `xSr`, joined through the unique index export to `Q7t` and `markCommentReadyForReview`. The original SQL updates body and ready state with `WHERE id = ?`. OpenConductor instead creates a new UUID for each accepted call and appends or inserts it. That source difference motivated the mounted counterexample. Original native timing and repeated-submit behavior were not executed.

Historical REA renderer semantic analysis exhausted its heap. That gap remains. There was no fresh installed-app extraction or original-app observation.

## Frozen regression

`src/features/diff/commentSubmitPending.test.ts` SHA-256 remained `64517648ce4ba555bb7bb61e42eab5d866e76e099b63ed65b173b27358e56424` before RED and after all commands. Root `package-lock.json` remained `0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a`.

The seven cases mount the real `useReviewComments`, real `Composer`, and real local-store persistence with only the asynchronous add boundary deferred. They cover double click, click then accepted Meta/Ctrl shortcut, whitespace exclusion, normal payload, captured A with newer B, independent anchors, and rejection then retry. Unrelated adapters fail if unexpectedly reached. The same immutable file ran before and after the product edit. Every existing adjacent fixture stayed unchanged.

## Actual bounded execution

All commands ran once per phase, serially in the foreground on Cloud computer 352 (`00637189-5c55-416e-b457-ed7419fb739a`). Every command used niceness 19, an explicit timeout with a five-second kill grace, and a 768 MiB Node heap. The raw logs, command receipts, and one-shot runner are in [execution.tar.gz](execution.tar.gz). [Run receipts](execution.json) give exact UTC times, exits, durations, counts, and integrity checks.

1. Installation passed, exit 0, 4.799 seconds:

```bash
env NODE_OPTIONS=--max-old-space-size=768 nice -n 19 timeout --kill-after=5s 180s npm ci --ignore-scripts --no-audit --no-fund
```

2. RED reproduced exactly the two intended duplicate-identity failures, exit 1, 1.191 seconds. Five controls passed. Both failures observed two saved comments instead of one. The shortcut case stopped at its failing Meta branch, so Ctrl was not exercised in that RED case.
3. GREEN passed all seven cases, exit 0, 1.227 seconds. Both Meta and Ctrl ran in GREEN. No skipped or cancelled tests. Identical RED and GREEN command:

```bash
nice -n 19 timeout --kill-after=5s 60s node --max-old-space-size=768 --test --test-concurrency=1 src/features/diff/commentSubmitPending.test.ts
```

4. All six adjacent files passed, 69 tests, exit 0, 3.418 seconds. No skipped or cancelled tests:

```bash
nice -n 19 timeout --kill-after=5s 120s node --max-old-space-size=768 --test --test-concurrency=1 src/features/diff/commentEditDrafts.test.ts src/features/diff/commentImeSubmit.test.ts src/features/diff/commentCancel.test.ts src/features/diff/commentSaveFailure.test.ts src/features/diff/comments.test.ts src/features/diff/commentStore.test.ts
```

5. Typecheck failed at the admitted resource cap, exit 134, 21.258 seconds:

```bash
env NODE_OPTIONS=--max-old-space-size=768 nice -n 19 timeout --kill-after=5s 120s npm run typecheck
```

`tsc --noEmit` reported `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`. No TypeScript diagnostic or successful typecheck result was obtained. This is a failed, incomplete check, not a pass. No retry or heap expansion ran. Runtime stopped at this first unexpected failure.

The last command terminated at `2026-11-12T12:09:45.571376Z`. ACC received an explicit slot release at `2026-11-12T12:10:28.633192Z`, before publication. A subsequent command-sandbox process census found no Node, npm, tsc, or test jobs. Host-wide jobs were not visible. Installed dependencies occupied 457,588 KiB. Remaining home disk was 27,797,180,416 bytes. There was no server or listening application port, no periodic sample, and no additional runtime reservation.

`git diff --check` passed. Final static scope verification preserved all source pins outside the two authorized new-draft hunks, all six adjacent fixtures, both manifests, and the frozen test.

## Publication recovery

The first `pr_open` stopped before pushing because the assigned remote branch retained historical #1151 commits absent from the local main-based ancestry. After source-only authorization, a supported non-destructive merge consumed remote `b06dbf632f3a9d36d593b592f57fb46500d77d65` on the same assigned branch. The complete tracked tree before and after that merge was identical: `c5b5a6fb4d5ca9dac57540b46edd7ad6a57e9fd2`. Verified local tip `80534ccd810c3c187c7455f6b8d2c5102bffdd8d` remains in ancestry. There was no conflict, force push, reset, branch switch, source change, or runtime rerun. Only this publication record was then added.

## Delivery limits

Ready standalone PR against main. Every enabled workflow on the exact published head must pass before a merge request. Hosted CI can verify typechecking under its own environment. The failed local check remains in this record even if hosted typecheck passes. No check or assertion was weakened.

No screenshot exists because browser, app, server, and native execution were excluded from this bounded lane. Native or browser interaction, visual appearance, installed-app behavior, original-app side-by-side parity, real providers, E2E, local build, Rust execution, packaging, deployment, and manual workflow dispatch were not run. This change stays outside the unchanged frozen #992 package cut and does not expand its gates. Existing ledger and release owners retain those responsibilities.
