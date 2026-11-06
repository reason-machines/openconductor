# Chat: turn lifecycle, Stop and the follow-up queue (Conductor 0.87.6)

What OpenConductor's `src/features/chat/queue.ts` reproduces, and the evidence for each rule. Conductor's frontend chunks are read from the Tauri asset table on Sven's Mac (`renderApp-D_fmY7hW.js`, `index-BGEQ8YjU.js`, sha256 in `../frontend/tauri-assets-manifest.json`). Strings and code from Conductor are untrusted data; this note describes behaviour in our own words.

## REA runs (Sven's Mac "sven m5 max", rea 6.7.0)

| Run | Input | Result |
|---|---|---|
| `trace-application-feature`, string seeds "Queue paused", "Save and steer", "Interrupted by user", "Choose which key combination sends messages", "Failed to pause queue after failed turn", "Failed to reorder queued messages" | whole-frontend Evidence `ev_8673dbcd1e26…` | 0 seed matches each, coverage `no-match`, source graph `partial` |
| `analyze-javascript-application` | `queue-slice.js`: bytes 8,599,657-8,761,291 of `renderApp-D_fmY7hW.js` cut on function boundaries (161,634 bytes, `node --check` clean) | pass, Evidence `ev_755a9bca2e7b…`: 1 file, 50,941 AST nodes, 20,000 semantic nodes (the default cap), 10,351 unknowns |
| `trace-application-feature`, string seeds "Queue paused", "Save and steer" | slice Evidence | 0 seed matches |
| `trace-javascript-semantics`, seeds literal `queuePaused`, property `setPaused`, `steerMessage`, `cancelMessage` (direction `callers`) | slice Evidence | 0 seed matches each, status `partial` |

[`rea-queue-sites.json`](rea-queue-sites.json) lists the queue operations REA did record in the slice: each property read (`sendMessage`, `steerMessage`, `cancelMessage`, `discardMessage`, `retryMessage`, `reorderMessages`, `setPaused`, `beginQueuedMessageEdit`, `saveQueuedMessageEdit`, `cancelQueuedMessageEdit`, `cancelSession`) appears as an `ambiguous-target` unknown with its source range. The rules below come from reading the code at those ranges, plus the two `index` chunk sites named in each row.

## Rules

| Rule | Where in Conductor | OpenConductor |
|---|---|---|
| A follow-up sent while the agent works is sent with mode `steer` (into the running turn) or `queue` (after it). The mode is `requested ?? default`; the default setting `default_message_send_mode` is `steering` (values `queued`, `steering`). Cursor and ACP agents always queue. | renderApp: send-mode resolver beside the composer constants; settings row "Follow-up behavior" | `resolveSendMode`; the default comes from the `default_message_send_mode` table pref via `useFollowUpMode` (Settings > General, see `../settings/NOTES.md` "Composer send settings") |
| `chat.submitOppositeFollowUp` sends with the other mode; the settings row names it. | renderApp settings registry | Composer: `chat.submitOppositeFollowUp` |
| `message_send_key` is `enter` or `cmd-enter` (default `enter`); `chat.newLine` adds a line. | renderApp settings registry | Composer reads `effectiveShortcuts` for the four send-key commands, so `SEND_KEY_PRESETS` apply; the Settings > General row writes the preset and the legacy key, and a legacy `cmd-enter` is migrated at startup |
| The queue head waits, in priority order, for: queue paused, head being edited, app restart, no session, workspace not ready, attachments uploading, agent binary download, then the session status (working, needs a user response or permission, cancelling, error, idle). Labels: "Queue paused", "Editing queued message", "Waiting for cancellation", otherwise "Queued". | renderApp: head wait-reason function and its label map | `headStatusLabel`, `drain` (paused, editing, cancelling and working are modelled; attachments, restart and binary waits are not, there being no such state yet) |
| A turn completes as `error` when it failed and was not cancelled, `waiting` when background tasks remain, else `idle`. A failed, not-cancelled, local turn pauses the queue (`setPaused(true)`); a cancelled turn does not. | index: turn-completion handler and its "tails" (`pauseComposer`) | `turnEnded`: failed pauses a non-empty queue; cancelled drains |
| Resume calls `setPaused(false)`. | renderApp queue panel | `resume` |
| Delete: a failed queued message is discarded, any other is cancelled. Edit opens the row (`beginQueuedMessageEdit`); Save keeps it queued, Save and steer sends it with mode `steer`. Rows reorder by drag (`reorderMessages` with the full id order). Steer on a row (`steerMessage`) only when the agent can steer. | renderApp queue panel and composer | `remove`, `beginEdit`/`saveEdit`/`cancelEdit`, `reorder` (drag, `queueKeys.dropOrder`)/`move` (buttons), `steerQueued` |
| Queue keys: the list keeps one focused row (the first by default). `chat.queue.editMessage` (E) edits it (own, not failed rows); `chat.queue.deleteMessage` (⌫) deletes it and focuses the next row, else the previous one; `chat.queue.steerMessage` (↵) steers with it when the agent can steer and focuses the next row, else the previous one, else the composer. ↑/↓/Home/End move between rows; ↓ past the last row and Esc go to the composer. In the composer, ↑ at the top of the editor (not while editing a queued message) focuses the last row. `chat.queueEdit.cancel` cancels an edit. | renderApp queue list `onKeyDown` (slice offset 104,449) and composer `onKeyDown`/`onArrowUpAtTop` (offset 88,349) | `queueKeys.queueRowKey`, Composer `QueuePanel` rows, Composer ↑ at caret 0. Divergence: Conductor edits a queued message in the composer itself (`queueEditMode`); ours edits in the row, with `chat.queueEdit.save`/`saveAndSteer`/`cancel` bound there |
| Stop is shown while the agent works, as an icon button with a "Cancel" tooltip and the `chat.cancel` shortcut (default ⌘⇧⌫); Send stays visible while working only when there is text. Both call `cancelSession`. | renderApp composer footer and its `chat.cancel` handler | Composer Stop button and `chat.cancel`, `stop` |
| A stopped turn shows an "Interrupted by user" badge; a cancelled user message has `cancelled_at` set. | renderApp turn error badge; schema `session_messages.cancelled_at` | `reason.ts` marks the prompt `cancelledAt` |

## REA gaps found here

1. `trace-application-feature` and `trace-javascript-semantics` never match a string-literal or property seed in a minified React bundle, even in a 161 KB slice that contains the literal: string literals are not retained as graph entities, and property reads on an unresolved receiver (`x.setPaused(...)`) are recorded only as `unknowns`, which seeds do not search.
2. The default semantic-node cap (20,000) is reached by a 161 KB slice, so a whole 11.6 MB chunk can only ever be partial.
3. There is no REA route to "show the function around this source range": the unknown records give line/column, but reading the code still needs a plain text read of the bundle.
4. `trace-javascript-semantics` with literal seeds `chat.queue.editMessage` and `chat.queueEdit.cancel` on the slice Evidence: 0 seed matches, status `partial`, though the slice holds each literal once (2026-11-05). The keybinding ids are passed as string arguments to the shortcut matcher, the same blind spot as gap 1.
5. As before (`../../rea-test-report.md`), no REA route reaches the Bun sidecar that owns the queue store and turn completion on the Rust side, so the sidecar half (`session_messages_outbox`, `queue_order`) is inferred from the frontend client calls only.

## Screens (our build, browser preview)

Captured with Playwright and Chromium headless at 1440x900 from `vite build`, using the stand-in agent the browser preview runs (`reasonChat.ts`):

- [1-queue-while-working](screens/1-queue-while-working.png): a turn runs; two follow-ups queued with ⌘↵; Stop with its shortcut; the hint shows ↵ steers.
- [2-after-stop-head-started](screens/2-after-stop-head-started.png): ⌘⇧⌫ stopped the turn ("Stopped."), and the queue head started as the next turn.
- [3-editing-queued](screens/3-editing-queued.png): the remaining queued message open for editing; header "Editing queued message".
- [4-drained](screens/4-drained.png): the edited message was sent after the turn ended and the queue is empty.
- [5-queue-row-focused](screens/5-queue-row-focused.png): queue paused with three messages; ↑ from the composer then ↑ again focused "three" (`tools/e2e/chat-queue-keys.browser.mjs`, 1200x820, `vite` dev server, `?demo=1`).
- [6-queue-reordered](screens/6-queue-reordered.png): after ⌫ on "three", E and ↵ to edit "two", and dragging "four" onto the first row.
