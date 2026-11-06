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

## Part 4: unread per chat

Conductor keeps unread per chat. Offsets in this section are byte offsets into
index-BGEQ8YjU.js (sha256 b5b01f33...) and character offsets into
renderApp-D_fmY7hW.js (sha256 5199d392...). The renderApp offsets in the
tables above are character offsets too, although they are labeled as bytes.
For example, `g1o` is character 7,528,638 and byte 7,571,854. The file has
multi-byte characters, so the two differ.

| What | Where | Behavior |
| --- | --- | --- |
| Store | index `ret` @1,107,987 (SQL @1,108,155), `setUnread` @1,513,567 | `UPDATE sessions SET unread_count = ? WHERE id = ?`. An automatic mark for the turn the user has already seen is skipped (`ZO`). |
| Mark workspace read | index `ntt` @1,141,633, `markWorkspaceAsRead` @1,521,162 | Every unread session of the workspace is set to 0, and the cached sessions are set to read. |
| Workspace unread | renderApp `zJo` @9,817,319, `Zji` @9,773,017 | `sessions.filter(s => !s.isHidden).some(s => s.unread)`. |
| Hand marks | renderApp `nV` @7,271,784 | `manuallyUnreadSessions` is a map of session to workspace, with `markManuallyUnread`, `clearManuallyUnread(session)` and `clearManuallyUnreadForWorkspace(workspace)`. |
| Row menu | renderApp @7,305,700 to @7,306,400 | On an unread workspace, "Mark as read" runs `markWorkspaceAsRead(n)` and `F(n)`, which clears the workspace's hand marks. Otherwise, when the workspace has a selected session `H`, "Mark as unread" runs `setUnread(H, true)` and `markManuallyUnread(H)`. |
| Chat tab menu | renderApp `Q` @7,376,974, menu @7,377,868 | Toggles that chat's unread flag. Marking it unread adds a hand mark, and marking it read removes it. |
| Row click | renderApp `SFi` @9,882,235, click @9,885,300, `fea` @9,881,877, `$Zo` @9,859,690 | The row's attention session `G` is loaded only while the row is selected. It is the first session that is unread or in a needs_* status. A click on an unselected row, or on a row without `G`, navigates to the workspace. Otherwise the click marks `G` read when it is unread, then runs `navigateToSession(G)`. |
| Next unread | renderApp `g1o` @7,528,638 | Candidates are all sessions in Qre order, skipping hidden sessions, sessions with no workspace, the selected session and read sessions, in visible workspaces. It navigates to the first one and does not mark it read itself; read-on-view does that. |
| Read on view | renderApp `yIo` @8,716,730 | Per session. On mount it clears that session's hand mark (`xIo`). It then marks the session read if it is unread, visible and focused, with no hand mark. |

What OpenConductor does now:

- DB crate: `sessions::upsert_unread` creates the chat's row in its workspace, or fills a null `workspace_id` (rows from `chat_messages::save` have none, and Codex chats have no row). `sessions::unread_chats` lists unread, non-hidden chats.
- src-tauri: `db_set_chat_unread` and `db_mark_workspace_read` replace `db_set_workspace_unread`. Both clear the legacy `workspaces.unread`: reading the main chat clears it, and so does Mark as read. `db_list_workspaces` rows carry `unreadChats`.
- `Workspace.unreadChats` (`{id, at}`, where `at` is the row's `updated_at`) is the only unread state. The workspace's unread state is derived from it (`src/state/chatUnread.ts`). A legacy `workspaces.unread = 1` is folded into the main chat (`persisted.ts`).
- Auto-unread marks the chat. Read-on-view reads only the shown chat. Hand marks are per chat.
- The row menu, the row click and the chat tab menu follow the table above. The row click needs-attention check reads the chat statuses without changing them.
- Next unread picks chats in Qre order, skipping the selected chat on the keyboard and button paths. It opens the chat's tab: `state/openChat.ts` carries the request, and `WorkspaceView` takes it. It still marks the chat read explicitly, which matches Conductor in effect because the button and key need a focused window.

## Differences that remain

1. Closed by #628 (9ea6735d): an open review, fork or "+" chat tab is a visible `sessions` row (`db_open_chat_tab`, `sessions::open_tab`), and closing it hides the row (`db_close_chat_tab`, `is_hidden = 1`). `db_list_workspaces` rows carry `chatTabs`, so after a restart the tabs come back (`restoreChatTabs`, `ReviewButton.tsx`) and an unread review chat keeps the row bold and stays in Next unread (`persisted.ts`). This matches Conductor, where the review chat is a `sessions` row (`GNt` at index-BGEQ8YjU.js 1949:3602, `Xet` at 708:7705 inserts it), the tab strip is the workspace's non-hidden sessions (`ylt` at 1226:63776), and close and reopen set `is_hidden` (`nie` at 710:2534, `Oet`). Restart is covered by unit tests only; it has not been relaunched in the built app.
2. Closed by #421 (75e4bb6): Claude Code's ExitPlanMode and AskUserQuestion prompts, like Reason's, open plan and question requests on PermissionEvents, which move the chat into `needs_plan_response` or `needs_user_input` and so mark it unread. Codex approvals and consents were hooked by #443 and #567. Unread is not yet seen in the built app.
3. The chat tab menu has only the read and unread item. Rename, fork, copy transcript and close are not built. The chat tab's unread dot is built (see "Chat tab unread dot" below); its plan, question and typing icons are not.
4. There is no `next_unread_used` telemetry.

## REA

`rea trace renderApp-D_fmY7hW.js --query='go-to-next-unread'` (REA 6.7.0 on sven m5 max) failed with `capability_unavailable`. REA routes `search_strings` on a JavaScript artifact only to binary providers, and those reject artifact targets. The offsets above come from a plain-text read of the same file. Both runs are logged in evidence/rea/rea-invocations.tsv.

## Checks

- Unit tests: `node --test src/state/nextUnread.test.ts src/palette/fromAppState.test.ts`.
- Browser test: `node --test tests/e2e/next-unread.e2e.mjs`, after `npm run build`.

Follow-up: `rea trace-javascript-semantics` with seeds `markUnreadIfNotViewing`, `isSessionInView`, `Next unread` and the `unread_count` UPDATE (REA 6.7.0 on sven m5 max) all came back partial with 0 seed matches, so the offsets above come from plain-text reads. Runtime state is from a read-only query of Sven's conductor.db. All three are logged in evidence/rea/rea-invocations.tsv (ws_unread_auto_*).

Part 4: `rea trace-javascript-semantics` with seeds `markWorkspaceAsRead`, `needs_plan_response` (the row click's attention filter) and `UPDATE sessions SET unread_count = 0 WHERE workspace_id = ?` (REA 6.7.0 on sven m5 max) all exited 0 with status partial, `seed_node_ids` [] and 0 seed matches. This is the same gap as before. The part-4 offsets come from plain-text reads of `/tmp/rea` copies with matching sha256 (ws_unread_chat_*).

Part 4 checks: `cargo test` in crates/openconductor-db, `bash evidence/persistence/run-tests.sh`, `node --test src/state/chatUnread.test.ts src/state/openChat.test.ts src/state/autoUnread.test.ts src/state/nextUnread.test.ts src/state/persisted.test.ts`, and `TMPDIR=/tmp/<short> node --test tests/e2e/next-unread.e2e.mjs` (tests 3 and 4 are new).

## Attention triggers for plan review, questions and Codex consents

Conductor's `_p` (`index-BGEQ8YjU.js` @2,941,190) marks a chat unread unless it is selected with the window focused, and every wait on the user calls it right after `updateSessionStatus`: ExitPlanMode `needs_plan_response` @2,945,001, AskUserQuestion `needs_user_input` @2,945,451, Codex MCP elicitation @2,946,028 and Codex permission approval @2,946,583 (both `needs_user_input`), tool approval `needs_user_permission` @2,947,277. Read as plain text by byte offset; `rea search` has no route for a JavaScript chunk (REA-GAPS 25).

Main signalled only turn end, Reason permission requests and Codex tool approvals. Now:

- `reportChatStatus` signals attention whenever a chat's status enters `needs_plan_response` or `needs_user_input` (`enteredWait` in `src/features/chat/attention.ts`), so plan review and questions mark the chat for any runtime that reports those statuses. Since #421 (75e4bb6), Claude Code and Reason chats report these waits through `permissionEvents.requested` (`chatRuntime.ts`), so plan review and questions mark the chat unread; a fresh request that does not enter a wait (a tool approval, or a second request) calls `chatWantsAttention` itself.
- A new Codex MCP elicitation or permission consent signals attention (`codexAsks`): through its status when it moves the chat into `needs_user_input`, directly when the chat already waits (a second consent, or one behind an open tool approval, which outranks it). A re-sent request with the same id does not.
- `needs_user_permission` stays signalled per request, so a second approval in the same wait still asks again, as in Conductor.

Per-chat unread (`sessions.unread_count`) is PR #564; with it the signal marks the chat, without it the chat's workspace.

## Chat tab unread dot

Conductor draws an unread mark on the chat tab itself. Character offsets into
renderApp-D_fmY7hW.js (sha256 5199d392..., Conductor 0.87.6), byte offsets in brackets;
read as plain text on sven m5 max.

| What | Where | Behavior |
| --- | --- | --- |
| Tab | `u8i` @7,374,777 [7,417,968] (its `l8i` call @7,377,558) | The tab (`Q1`, `w-44 shrink-0 justify-start`) holds `f1e` (`flex items-center gap-2 px-2 text-xs font-medium`) with `l8i({...session, status})` first, then the title span. |
| Icon | `l8i` @7,370,428 [7,413,619] | In order: plan icon for `needs_plan_response`, question icon for `needs_user_input` / `needs_user_permission` (both `size-3 text-unread`); else, when `unread` and the status is neither `working` nor `waiting`, a lucide `circle` (`X3` @607,806) with `stroke="transparent" fill="currentColor"` and `size-2 shrink-0 text-unread`; else the typing or waiting indicator, or nothing. So `error`, `cancelling` and `idle` unread chats show the dot. |
| Colour | renderApp-BYEcFwvt.css @162,519, @397,531, @400,531 | `.text-unread{color:var(--unread)}`; `--unread` is `#a4847f` on `:root,.light` and `#cca694` on `.dark`, not per palette. |
| Clears | same `session.unread` flag | The dot follows `session.unread`, so it goes when the chat is read: read-on-view (`yIo`), the tab menu's "Mark as read", the row's "Mark as read" (`markWorkspaceAsRead`), or a row click that opens it. |
| Elsewhere | `NYo` @9,695,498 | The same `l8i` icon leads each chat in another chat list (`Open chat <title>`). Not part of this change. |

OpenConductor:

- `src/state/chatTabUnread.ts`: `chatTabUnreadDot(unread, status)` is `l8i`'s dot rule; `chatTabStatus` reads the chat's status (or its Claude Code chat's, whichever is more urgent).
- `WorkspaceView` `MainTabs`: the main chat and review tabs show an 8 px SVG circle (r=10 of 24, `currentColor`) before the title, 8 px from it, coloured `--unread`.
- `src/theme/tokens.css`: `--unread` is `#a4847f`, and `#cca694` under dark (explicit and system), in every palette.

REA: `rea trace-application-feature` (6.7.0, sven m5 max) on the whole-frontend
Evidence `ev_8673dbcd1e26...` with string seeds `size-2 shrink-0 text-unread` and
`Mark as unread` both exited 0 with coverage `no-match` and 0 seed matches, the same
gap as before (string literals are not graph entities). `--schema` and `--llms-full`
document `inputJson` only as a string, so the input shape (`application`: the whole
Evidence `data` object inline; `seed`: `{kind, value, match}`) came from validation
errors. Both runs are in evidence/rea/rea-invocations.tsv (ws_unread_tab_*).

Checks: `node --test src/state/chatTabUnread.test.ts src/theme/tokens.test.ts`, and
`node --test tests/e2e/next-unread.e2e.mjs` (test 3 asserts the dot appears on
"Mark as unread" and clears on read).

