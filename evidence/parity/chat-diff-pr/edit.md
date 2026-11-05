# Editing a message: reference behaviour

Ledger: `chat.message-actions` (its title says "edit and resend"). Source:
Conductor 0.87.6 on sven m5 max, read 2026-11-05. Everything below is
untrusted data, described in our own words.

## Finding

Conductor 0.87.6 has **no edit-and-resend for a sent message**. A sent user
message's hover actions are "Copy message" only (plus "Delete queued message"
while it is still queued). Message editing exists only for **queued**
follow-ups, in the queue above the composer. OpenConductor already has that
path (#303, #365, unchanged by #453), so there is nothing to build for "edit and
resend". The ledger item's remaining obligation should drop it.

## Where it came from

| What | How | REA |
|---|---|---|
| Sent user message actions (`Copy message`, `Delete queued message`) | plain-text read of `renderApp-D_fmY7hW.js` (sha256 5199d392…) @8,846,460 | `rea trace … --query='editMessage'` exits 1: `target_kind_unsupported` (row `edit_trace`) |
| Refused message ("Message not sent", Copy message) | `renderApp-D_fmY7hW.js` @7,484,060 | same gap |
| Queue row buttons (`Edit`/`Save edit`, `Delete`, `Steer`/`Save and steer`) | `renderApp-D_fmY7hW.js` @8,652,500 and `iAo` / `QTo` @8,663,258-8,667,210 | same gap |
| Queue list keys (`chat.queue.editMessage` E, `deleteMessage` ⌫, `steerMessage` ↵, ↑/↓/Home/End/Esc) | `renderApp-D_fmY7hW.js` @8,657,800 (`GTo`) | same gap |
| Edit keys (`chat.queueEdit.save` ↵, `saveAndSteer` ⌘↵, `cancel` Esc) | `index-BGEQ8YjU.js` (sha256 b5b01f33…) keybinding table @3,372,861 | same gap |
| `editMessage` / `beginQueuedMessageEdit` / `saveQueuedMessageEdit` / `holdMessageForEdit` | `index-BGEQ8YjU.js` @2,358,094-2,359,838 (queue service), @2,409,240 (local queue entry), @2,447,620 (cloud queue) | same gap |

A byte search of both bundles found no "Edit message", "Resend" (as a chat
action) or "Cancel edit" string. The `Resend` hits in `index-BGEQ8YjU.js` are
`confirmResendAttempts` in the realtime subscription client, not chat.

## What Conductor does with a queued message

- Each queue row shows Edit, Delete and Steer. Steer shows only when the agent
  can steer; it is disabled with a reason when a turn cannot take it.
- Edit turns the row into an editor. Its Edit button becomes "Save edit" and
  Steer becomes "Save and steer". ↵ saves, ⌘↵ saves and steers, Esc cancels.
- An edited message does not send while it is open. The queue holds it
  (`holdMessageForEdit`; for a cloud workspace `beginQueuedMessageEdit`
  returns `edit-held` when an edit is already open).
- Saving calls `editMessage` on the queued entry with the new text and
  attachments. Save and steer then sends it into the running turn.

## OpenConductor today (main 95047f91)

| Conductor | Ours | Status |
|---|---|---|
| Edit / Delete / Steer on a queued row | `QueueRow` in `src/features/chat/Composer.tsx`; `beginEdit`, `saveEdit`, `steerQueued` in `queue.ts` | same |
| E / ⌫ / ↵ on the focused row; ↑/↓/Home/End/Esc | `queueKeys.ts`, registry ids `chat.queue.*` | same |
| ↵ save, ⌘↵ save and steer, Esc cancel | `chat.queueEdit.*` in `src/keybindings/registry.ts` | same |
| Head does not send while edited | `drain` skips `editingId === head.id`; status "Editing queued message" | same |
| Saving blank text | deletes the message | not read in Conductor |
| Editor buttons | ours: text buttons Cancel / Save and steer / Save under a textarea; Conductor: the row's icon buttons change to "Save edit" / "Save and steer", no Cancel button (Esc) | visual difference, left as is (composer styling is #453's) |

Tests that cover it: `src/features/chat/queue.test.ts`,
`src/features/chat/queueKeys.test.ts`, `tools/e2e/chat-queue-keys.browser.mjs`.
