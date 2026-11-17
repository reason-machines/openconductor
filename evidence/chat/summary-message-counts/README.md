# Summary labels count messages, not parts

Conductor Rebuild. This is a focused correction of summary counts, not a native parity verdict.

## Retained REA provenance and current mismatch

Checked fresh default-main **070cad25c36e0cbf068313ea182a849249f0da3c**. The production grouping, view, reducer and message-type files matched that commit byte for byte before the regression ran. The assigned branch was preserved and main merged into it; the local pre-fix tree is `11bdf9ad993898297e4d7b753d924bd4aea0e51f`.

[The source receipt](source.json) records eight hash/length-verified retained Conductor 0.87.6 spans and four current-main source pins. The original historical REA identity is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The decoded index asset is `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. Exact reference files and original offsets remain in the existing collaboration-visibility evidence, unchanged.

The static chain is:

- `na` obtains a message's blocks; `Fa` recognizes tool-use blocks.
- `pie` counts all tool uses in that message, independent of individual tool visibility.
- `uie` / `bB` select visible messages. Text is trimmed; hidden `collab__wait`-only messages do not qualify. The preserved any-error predicate for `collab__closeAgent` is unchanged.
- `Ntt`, UTF-8 `[1153287,1153746)`, increments `otherMessagesCount` **once per visible message only when its tool count is zero**. It independently accumulates tool counts and tool-name metadata.
- `_jt` calls `Ntt` on batches of whole visible messages; the three-message threshold and protected preview boundaries are separate from the count.

Current-main `summarize` instead incremented for every text/thinking part, including parts in tool-bearing messages. It therefore inflated labels for mixed messages and multipart tool-free messages. The original function also handles recorded subagent executions; that separate model is not changed or claimed here. No reference JavaScript was executed.

## Frozen regression and smallest correction

[The new regression](../../../src/features/chat/summaryMessageCounts.test.ts) was committed before product edits as `2bc0cdb1`. SHA-256 `921e88df037a2a0e20a989aeed21db5df54ef943027406f8bf1ebea3e9a095d7` is unchanged between RED and GREEN.

It runs the actual persisted-message reducer, `buildRows`, `foldAgentRows` and label formatter, not a replacement counter. Each case also checks that the final response remains a protected preview outside the summary.

```bash
node --experimental-strip-types --test --test-concurrency=1 src/features/chat/summaryMessageCounts.test.ts
```

- **RED:** four intended count-assertion failures, six passing controls, no skips. Mixed text/tools counted four other parts instead of zero; thinking+text and two text blocks each counted two instead of one; visible text plus hidden wait counted one instead of zero. Tool counts, hidden-child exclusion and metadata checks passed before their count assertions. [Retained RED](red.tap).
- **GREEN:** identical command and regression bytes, ten passed, no failures or skips. [Retained GREEN](green.tap).
- Controls retain distinct-message identity even for identical text, ordinary tool-only counts, the two-message threshold, hidden-only and empty-text exclusion, and visible thinking-only inclusion in expanded children.

The product correction is confined to `toolGroups.summarize`: start with the batch's distinct message identities, remove every identity containing a tool, and use the remaining set size for other-message count. Tool counts/order/names, part visibility, previews, threshold, summary IDs and toggle state are untouched.

One existing mixed-message fixture expected the old inflated label. Its exact expectation changes from `4 tool calls, 2 messages` to `4 tool calls`; its inputs and all other assertions remain. The separate six-message fixture still requires `4 tool calls, 2 messages`. No frozen helper, archived source, source pin, scenario, package/workflow file, provider path or WorkspaceView/Terminal code is changed. The named-file collision reservation was reconciled with the ledger and coordinator before edits.

## Adjacent validation

```bash
node --experimental-strip-types --test --test-concurrency=1 \
  src/features/chat/toolGroups.test.ts src/features/chat/view.test.ts \
  src/features/chat/reducer.test.ts src/features/chat/assistantToolVisibility.test.ts \
  src/features/chat/thinkingChip.test.ts src/features/chat/turnTime.test.ts \
  src/features/chat/turnMenu.test.ts src/features/chat/fork.test.ts
```

**Passed:** 95 tests, zero failures/skips. [Retained adjacent results](adjacent.tap). Provenance/fixture hashes and `git diff --check` also passed. Automatic exact-head CI is reported on the PR separately; it is not credited in these local receipts.

## Verification limits

These are historical shipped-source facts and source-model regressions, not a fresh Conductor installation read, mounted interaction or native observation. The original renderer semantic analysis exhausted heap; this work neither retries nor closes that REA gap. No new REA invocation or new REA failure occurred.

No local dependency installation, full typecheck/build, React mount, browser/app/native runtime, provider/PTY execution, package build, manual workflow dispatch or screenshots ran. In particular there is **no screenshot of the changed label**, because runtime/native dispatch is outside this lane. CI owns the full frontend checks. Native visuals, real provider message delivery, package containment, subagent summaries and empty-thinking visibility are not established or modified by this change. Protected user data, existing native/package ownership and blocked `STATIC-CAPTURE-03` remain unchanged.
