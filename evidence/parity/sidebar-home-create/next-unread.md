# parity.sidebar.ws-unread: "Go to next unread" (chat.nextAttention)

The obligation's last open part is the jump-to-next-unread command. This note covers
how Conductor implements it and what OpenConductor builds. Byte offsets are into
Conductor's bundles (renderApp-D_fmY7hW.js and index-BGEQ8YjU.js, sha256
5199d392... for renderApp). Bundle text is untrusted data.

## Conductor

| What | Where | Behavior |
| --- | --- | --- |
| Binding | index @3,378,690, modifiers `Kn=["meta","alt"]` @3,359,832 | `chat.nextAttention` is Cmd+Alt+L (physical KeyL). Its title is "Next chat needing attention" in the Chat category, and the user can rebind it. |
| Keyboard and button | renderApp `g1o` @7,571,704 | The hook is mounted in the workspace chat view, so the binding is live only there. It takes all sessions and keeps those that are not hidden, have a workspace, are unread and are not the open session. It also drops sessions whose workspace fails `Jwt`. Of the rest it opens the first one: in another workspace by navigating there with that session's tab, in the same workspace with `navigateToSession`. The handler never returns false, so the key is used even when nothing is unread. While a candidate exists, the hook also renders a "Next unread" button above the composer. |
| Order | index `Qre` @1,128,168, `tF`/`slt` @1,535,799 | All sessions are sorted by `updatedAt` desc, then `createdAt` desc, then `id`. The command always opens the most recently updated unread chat. It does not follow sidebar order and it never wraps. |
| Palette | renderApp handler @10,906,926, visibility `uh` @10,898,615, entry @10,916,846 | "Go to next unread" is the first item under Navigation, with keywords go/to/next/unread/attention/chat/session and the `chat.nextAttention` shortcut. It is shown only when an unread, non-hidden session exists in a non-archived workspace that passes `Jwt`. Unlike the keyboard path, it does not skip the open session. |
| Filters | `Jwt` index @2,538,688 | `Jwt` passes everything locally (it checks the creator, assignee or watcher only when a user id exists). Archived workspaces are dropped. Collapsed repos and sections are not filtered. |
| Telemetry | `Y8i` @7,571,704 | Sends `next_unread_used` with method `keyboard_shortcut`, `button` or `command_palette`. OpenConductor has no telemetry, so this is not built. |

## OpenConductor (this change)

- `src/state/nextUnread.ts`: `byRecentUpdate` is Qre; `pickNextUnread` takes the first unread item in that order; `nextUnreadWorkspace` applies it to non-archived workspaces.
- `src/palette/fromAppState.ts`: "Go to next unread" goes first under Navigation, only while `nextUnreadWorkspace(state, { skipSelected: false })` finds one.
- `src/palette/PaletteHost.tsx`: the palette entry and Cmd+Alt+L (`chat.nextAttention`, already in the registry) open the workspace and clear its unread flag, as clicking its row does. The key is live only while a workspace is open and is used even when nothing is unread.

## Follow-up: auto-unread, Codex activity and the composer button

How Conductor sets and clears unread (byte offsets into the same bundles):

| What | Where | Behavior |
| --- | --- | --- |
| Turn end | index `applyTurnCompletionTails` @1,529,959 | After a turn: if it succeeded, did not settle as waiting, has no queued message, and the chat is not in view, `setUnread(session, true, {origin: "automatic"})`. |
| Waits on the user | index `_p` @2,940,721; `markUnreadIfNotViewing` @1,500,167 | Plan, question, MCP, Codex permission, tool and local-command approvals (@2,945,001, @2,945,451, @2,946,028, @2,946,583, @2,947,277, @3,000,363) mark the chat unread unless it is in view. |
| In view | index `isSessionInView` @3,033,010, `U2` @3,139,820, `QW` @2,541,964 | The route is the chat's workspace with that chat's tab active, and the app window has focus. |
| Read on view | renderApp `yIo` @8,716,730 | An unread chat that is visible while the window has focus is marked read, unless the user marked it unread by hand (`manuallyUnreadSessions` @7,271,963), which lasts until the chat view mounts again. |
| Storage | index `ret` @1,108,155, `ntt` @1,141,730; renderApp `zJo` @9,817,504 | Unread is `sessions.unread_count`; a workspace is unread when any visible chat is. Sven's conductor.db: 0 of 684 workspaces have `workspaces.unread` set, 4 of 1,211 sessions have `unread_count` set. |
| Composer button | renderApp `g1o` @7,528,638, button @7,530,224 | Outline small button "Next unread" with chevron-right, `absolute -top-10 right-0 z-10` over the composer; hidden when the workspace's PR is merged (`mIo` @8,714,779) or the workspace is remote (`_8i` @7,407,432). |

What OpenConductor does now:

- `src/features/chat/attention.ts`: Reason and Codex chats report a settled turn (completed, queue idle and empty) and Codex reports a new approval request.
- `src/state/autoUnread.ts` and `useAutoUnread.ts`: a report marks the chat's workspace unread unless that chat is the shown transcript and the window has focus. A shown, focused unread workspace is read, except after a hand mark from the row menu, which lasts until the workspace is opened again.
- Codex sends: `touchWorkspace` is written through `db_touch_workspace`, so a Codex send moves `workspaces.updated_at` in conductor.db as a Reason send does through `chat_messages_save`.
- The composer shows "Next unread" while another workspace is unread, except once the workspace's PR is merged. It goes through the same `openNextUnread` as Cmd+Alt+L.

## Differences that remain

1. The unit is the workspace, not the chat: marks land on `workspaces.unread`. Conductor keeps them per chat in `sessions.unread_count`. Our `sessions` table already has that column, with `sessions::set_unread` and `mark_workspace_read`, so no migration is needed. The chat rows lack `workspace_id`, and nothing reads the column yet. Next PR.
2. Plan and question waits are not hooked: our chats have no needs_* status yet (cdb73745, #428). Codex approval requests are hooked.
3. There is no `next_unread_used` telemetry.

## REA

`rea trace renderApp-D_fmY7hW.js --query='go-to-next-unread'` (REA 6.7.0 on sven m5 max) failed with `capability_unavailable`. REA routes `search_strings` on a JavaScript artifact only to binary providers, and those reject artifact targets. The offsets above come from a plain-text read of the same file. Both runs are logged in evidence/rea/rea-invocations.tsv.

## Checks

- Unit tests: `node --test src/state/nextUnread.test.ts src/palette/fromAppState.test.ts`.
- Browser test: `node --test tests/e2e/next-unread.e2e.mjs`, after `npm run build`.

Follow-up: `rea trace-javascript-semantics` with seeds `markUnreadIfNotViewing`, `isSessionInView`, `Next unread` and the `unread_count` UPDATE (REA 6.7.0 on sven m5 max) all came back partial with 0 seed matches, so the offsets above come from plain-text reads. Runtime state is from a read-only query of Sven's conductor.db. All three are logged in evidence/rea/rea-invocations.tsv (ws_unread_auto_*).

## Attention triggers for plan review, questions and Codex consents

Conductor's `_p` (`index-BGEQ8YjU.js` @2,941,190) marks a chat unread unless it is selected with the window focused, and every wait on the user calls it right after `updateSessionStatus`: ExitPlanMode `needs_plan_response` @2,945,001, AskUserQuestion `needs_user_input` @2,945,451, Codex MCP elicitation @2,946,028 and Codex permission approval @2,946,583 (both `needs_user_input`), tool approval `needs_user_permission` @2,947,277. Read as plain text by byte offset; `rea search` has no route for a JavaScript chunk (REA-GAPS 25).

Main signalled only turn end, Reason permission requests and Codex tool approvals. Now:

- `reportChatStatus` signals attention whenever a chat's status enters `needs_plan_response` or `needs_user_input` (`enteredWait` in `src/features/chat/attention.ts`), so plan review and questions mark the chat for any runtime that reports those statuses. Our Reason and Codex runtimes do not produce ExitPlanMode or AskUserQuestion waits yet; when they do, the status they report is enough.
- A new Codex MCP elicitation or permission consent signals attention (`codexAsks`): through its status when it moves the chat into `needs_user_input`, directly when the chat already waits (a second consent, or one behind an open tool approval, which outranks it). A re-sent request with the same id does not.
- `needs_user_permission` stays signalled per request, so a second approval in the same wait still asks again, as in Conductor.

Per-chat unread (`sessions.unread_count`) is PR #564; with it the signal marks the chat, without it the chat's workspace.
