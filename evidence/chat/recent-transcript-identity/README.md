# Recent-chat transcript source identity

Conductor Rebuild owns `CHAT.RECENT-TRANSCRIPT-SOURCE-IDENTITY` in this delivery. Two source chats with the same title must retain separate transcript attachments in one target composer. The readable labels may coincide, but their storage identities must not.

## Source

The byte-identical [retained source packet](source-packet.tar.gz) is attachment `249545de-d345-4b66-ac7a-7df45e1b26d3`, SHA-256 `00088ead476e92f357aa3bb056fafab20a2cda85c98705b9c71b047379e102f1`. It includes 21 complete original spans, import/export aliases, source snapshots, and the prepared acceptance case. Its original REA evidence ID is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` for retained Conductor 0.87.6 assets. This delivery did not acquire or run Conductor anew.

Original `RIo` separates `session-transcript-${sourceId}.md` from `Transcript of <title>.md`. Its `FO` alias joins `Bf` and `gpe` to the `k1t` text attachment factory, which reserves storage using `fileName` and keeps the human `displayName` separately. The packet retains the full chain, not just a search excerpt. Static evidence does not prove native behavior.

Re-read default-branch head `e752f6cdd53cb235762d8392377c3c608b8b8789` before the fix. The six relevant source files remain byte-identical to the packet's snapshots at `524c598b34157483e669167ed1f9032cc02fff18`. Baseline `WorkspaceView` sends `forkAttachmentName(c.title)` as the attachment identity. Existing `addAttachment` replaces non-comment attachments by name. Existing `ComposerAttachment.label` and restore logic already support separating identity from its label, so no shared primitive change is needed.

## Frozen regression

[The new fixture](../../../src/features/chat/recentTranscriptIdentity.test.ts) loads the complete production `WorkspaceView`, `ChatEmptyState`, `Composer`, and `ReviewButton` modules. It uses real React hooks, the real transcript formatter, attachment deduplication, and per-target composer sessions. Clicks invoke the real rendered transcript-chip handler. The editor, agent snapshots, draft persistence, native transport, and unrelated surfaces have disposable boundaries. No callback is copied into the test and no helper replaces the producer.

The three cases cover:

- Same-title source chats in one target, distinct exact source-ID names and bodies, unchanged sources, readable rendered labels, and independent removal.
- Distinct-title sources retaining both bodies and readable rendered labels.
- Another empty target remaining isolated, independent attachment there, and the original target retaining both attachments across a round trip.

Initial fixture SHA-256 was `3192bf5f922283695507ee459b3699c84a79c24355675611bb9cbaf2c635dc29`. Automatic hosted `node --test "src/**/*.test.ts"` supplies executable RED and GREEN. On published test-only head `80f89542d848ff9039467cfa09c496d83e1084f3`, [unit job 130752700024](https://github.com/reason-machines/openconductor/actions/runs/43086658246/job/130752700024) reached the intended same-title retention assertion: actual one attachment, expected two. Both distinct-title and target-isolation controls passed. The full suite had 3,040 passes and this one failure. The typecheck/build job reached the same intended test failure. [The retained RED receipt](hosted-red.json) records the exact run and assertion.

## Fixture boundary correction

Candidate `4ace4b883978ee8a025b1a5a86b267be0afea516` passed the retention, exact identity, readable-label, source-immutability and both control assertions, but the same-title case then failed its zero-native-calls check. [Hosted unit job 130762987583](https://github.com/reason-machines/openconductor/actions/runs/43089640121/job/130762987583) recorded one call versus expected zero at fixture line 189. This is not GREEN. The complete WorkspaceView mount has an existing `db_select_chat` effect before any chip interaction. The fixture incorrectly included that setup call in attachment activity.

Revision two asserts the exact one-command mount bookkeeping sequence, then clears that setup record before interactions. Every product and no-native-attachment assertion remains unchanged. Revised frozen fixture SHA-256 is `dd2b22dd7e562329144e92fe3da10d870ba65c63cce3a1c19d5b948db9c5e022`. The producer fix is temporarily reverted in this test-only revision so automatic hosted CI must reproduce intended RED again with the corrected boundary before publishing candidate GREEN. No production lifecycle effect was changed or disabled.

The intended repair remains producer-only: `name` uses `session-transcript-${c.chatId}.md`, while the existing optional `label` retains `forkAttachmentName(c.title)`. Static provenance and scope checks pass. Revised hosted RED, unchanged-fixture GREEN, protected merge and consuming-package proof remain pending.

`python3 evidence/chat/recent-transcript-identity/verify.py` checks packet files, retained spans, source joins, the frozen fixture, and the exact permitted producer-only delta. It does not execute JavaScript.

## Limits

No local Node, React, browser, native app, provider, CLI, install, or E1 admission is run. There is no screenshot because native and browser execution are excluded from this lease. Hosted mounted behavior is not installed or geometric acceptance. Real filesystem staging, genuine provider delivery, selected-chip toggling, overflow behavior, and process-restart retention are not covered. Frozen #847 and unrelated #1020 stay untouched. Shared attachment APIs, Composer, bridge, backend, and styles are outside this patch.
