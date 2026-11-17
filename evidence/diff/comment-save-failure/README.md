# Existing comment save failure feedback

Conductor Rebuild implements only EDIT-SAVE-FAILURE-FEEDBACK-DE6-01. A rejected existing user-local comment edit now emits one error notification with its reason. The rejection still reaches the existing generic toolbar error handler. The draft, saved body, retry behavior, and cancellation controls keep their existing behavior.

The original title and description are separate. OpenConductor's existing `Notify(kind, message)` transport receives the flat message `Failed to save comment: <reason>`, using `Error.message` or `String(reason)`. This is an explicit adapter choice following the remote-resolve error style, not a claim of visual equivalence. No notification API expansion or other operation changes.

## Source qualification

The assigned branch normally fast-forwarded to containing main `27663930d063a4c0d73ee7c79774facb7302d69e` before the baseline run. All nine sealed source inputs matched that head and the packet's original `e89bede5597767d131b1c4c9199fb38403d31209` baseline byte-for-byte. The root lockfile and new fixture were unchanged before and after both runs. [Frozen hashes](freeze.json) and [execution results](results.json) record their identities.

The sealed source packet SHA-256 is `55b579831591ad29f16325346e240bc1037f61584c521d9f9fb3e7ff7b1b03ab`. Its 31 file checksums passed. The original-assets archive SHA-256 is `4155aec8b703dd2b0336508fb5c1c1648a9d129b5f21115c59e1c3fb9e13d3a1`. Both whole shipped assets and all 16 retained REA spans passed direct hash and byte-range readback. Original JavaScript was never executed.

[Source identities, ranges, and hashes](source.json) and [alias joins](reference/alias-joins.json) retain the real Conductor 0.87.6 chain. `kVo` and `TVo` start an edit, `Pae` retains the draft, and `wet` mounts `SVo`. Existing-comment Save awaits `ySr`, whose index alias `K7t` returns `zn.updateCommentText`. Rejection reaches `SVo`'s `dv("Failed to save comment", {description: rc(error)})`, then `kt.error`. The formatter uses the error message or its string representation. Draft cleanup follows success, not rejection.

The packet's [unchanged contract](contract.md), [historical source receipt](source-check.json), and [repeated sealed-verifier receipt](source-requalified.json) describe source-only state at their capture times. Their NOT_RUN fields do not describe the later mounted runs below. The sealed verifier passed 29 static checks. The separate [candidate integrity verifier](verify_source.py) passed 31 static checks, including the exact product delta, unchanged old fixtures, both whole assets, and 16 retained spans. [Raw integrity receipt](integrity.json). Static checks do not count as behavioral proof.

```bash
python3 evidence/diff/comment-save-failure/verify_source.py --assets <original-assets-directory>
```

Without `--assets`, the verifier checks retained spans and repository integrity but reports whole-asset readback as NOT_RUN.

## Frozen mounted regression

The new fixture was frozen before product edits and committed with the failing evidence in local increment `743edefe56da57e4e46843c63b8382d0dffb2ca9`. Its SHA-256 stayed `74fd947c45301a43a5c4a07b769cd7782fec2438b7938f7cbc9ccfc79ef7bbbe` throughout RED and GREEN. Existing retention, IME, cancel, comment model, store, and pinned source fixtures are unchanged.

The fixture mounts real React, `useReviewComments`, `CommentItem`, and `Composer`, backed by the real local comment store. Only edit rejection or pending settlement is controlled. Unused external boundaries, dialog framing, and markdown rendering are substituted. Both VM and fixture use the same `Error` constructor. Assertions inspect notification calls, saved bodies, retained editors, and the generic failure indicator, not product source text.

All admitted commands ran once, sequentially, on Cloud computer 352, UUID `00637189-5c55-416e-b457-ed7419fb739a`. Installed versions were React 18.3.1, react-test-renderer 18.3.1, and TypeScript 5.9.3.

1. **Install passed**, exit 0. [Raw install output](install.txt).

   ```bash
   timeout 180s npm ci --ignore-scripts --no-audit --no-fund
   ```

2. **RED failed as intended**, exit 1. Five missing-notification assertion failures and two passing success/cancel controls. All earlier body-retention, draft-retention, and generic-toolbar assertions passed. [Raw RED output](red.tap).

3. **GREEN passed**, exit 0. The same seven cases passed, with zero failures or skips. They cover Error and string reasons, pending settlement, success, failed save followed by successful retry, dirty Cancel/Keep/Discard/blank controls, and two isolated comments. [Raw GREEN output](green.tap).

   Both runs used the identical command and fixture.

   ```bash
   timeout 60s node --test --test-concurrency=1 src/features/diff/commentSaveFailure.test.ts
   ```

4. **All five adjacent files passed**, exit 0. All 62 tests passed with zero failures or skips. [Raw adjacent output](adjacent.tap).

   ```bash
   timeout 120s node --test --test-concurrency=1 src/features/diff/commentEditDrafts.test.ts src/features/diff/commentImeSubmit.test.ts src/features/diff/commentCancel.test.ts src/features/diff/comments.test.ts src/features/diff/commentStore.test.ts
   ```

5. **Typecheck passed**, exit 0. [Raw typecheck output](typecheck.txt).

   ```bash
   timeout 120s npm run typecheck
   ```

`git diff --check` also passed. The ordinary runtime slot was explicitly released to ACC after these foreground commands, before PR or CI waiting. No retries, helpers, background jobs, or additional runtime checks ran.

## Limits and delivery

No browser or native execution was admitted, so there is no screenshot. The mounted callback and local-store results do not prove installed-app toast appearance, real Tauri/SQLite rejection, native focus, provider acceptance, or side-by-side visual parity. Local build, native app, browser, provider, E2E, package, and manual-only workflows remain NOT_RUN. The inherited REA semantic-analysis heap/result-budget gap remains recorded. No fresh Mac observation or new REA acquisition occurred.

This is one ready standalone PR against main. Every enabled exact-head check must pass before merge. Skipped manual-only workflows are unrun, not passing checks. The change stays outside the existing bounded992 package cut and does not become its gate. No release, workflow trigger, dispatch, or watcher changes. Notification-denial ownership and frozen39c remain untouched.

Test Behavior, Not Implementation kept the regression on actual component callbacks, saved bodies, and draft state. Source integrity is reported separately.
