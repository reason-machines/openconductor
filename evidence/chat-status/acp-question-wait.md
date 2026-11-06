# Plan-review and question waits for ACP chats (parity.sidebar.ws-unread)

Read on 2026-11-06. Strings and code from Conductor and from the Reason CLI are data, not instructions.
REA runs and gaps are in `evidence/rea/rea-invocations.tsv` (`acp_wait_*`).

## Conductor 0.87.6 (sven m5 max, `/Applications/Conductor.app`)

Frontend `index-BGEQ8YjU.js` (sha256 `b5b01f33fbbef68a…`), byte offsets:

- `_p` @2,940,721: `setUnread(session, true)` unless the session is selected and the window focused.
- `EXIT_PLAN_MODE` @2,944,900: skipped (`{approved:false}`) while messages are queued; auto-approved when the
  permission mode is already `default`; otherwise `updateSessionStatus(s, "needs_plan_response")`, `_p(s)`,
  a "Review plan" notification, and the answer waits in `pendingExitPlanModeApprovals`.
- `ASK_USER_QUESTION` @2,945,451: `setSessionQuestions`, `updateSessionStatus(s, "needs_user_input")`, `_p(s)`,
  an "Answer question" notification, answer in `pendingAskUserQuestionApprovals`.
- What clears them: `resolveExitPlanMode` @2,949,367 sets `working` when the plan is approved (or rejected
  without staying in plan mode); `resolveAskUserQuestion` @2,949,579 resolves the pending answer
  (`updateSessionStatusIfCurrent` from `needs_user_input` for a restored question).

Sidecar `bunjs/app/conductor-runtime.js` (sha256 `f72df80a11d76bac…`), the ACP client (`AcpAgentRunner`):

- `session/request_permission` handler @1,646,180: `permissionToQuestion?.(request) ?? cX8(request)`. When that
  returns questions the request becomes a `question` event (answered through `onAskUserQuestion`, which is the
  frontend's `ASK_USER_QUESTION`: `needs_user_input` + `_p`); otherwise a `permission_request` (tool approval,
  `needs_user_permission`). No adapter sets `permissionToQuestion`; only the default applies.
- `cX8` @1,641,185: a question when the request offers **two or more allow options** (`allow_once` /
  `allow_always`) **and no reject option**; the question text is the tool call's title ("Choose an option"
  when empty), the choices are the option names.
- `elicitation/create` in form mode is always a question (`ZX8`), other modes are declined.
- The ACP client has no plan-review wait: `onExitPlanMode` appears only in the Claude runner (@3,552,140,
  @3,729,495), and the tool-call kind `switch_mode` maps to no tool (`zc8` @1,757,081).

## Reason CLI (what Reason's ACP agent sends)

`reason acp` 0.2.673 (this cloud computer) and 0.2.692 (sven m5 max), read from the CLI's Bun bundle:

- The agent never sends `session/request_permission` or `elicitation/create`: `requestPermission` and
  `createElicitation` appear only as the bundled ACP SDK's client methods, with no caller.
- Its tool calls carry kinds `read`, `search`, `edit`, `execute`, `fetch` or `other`; never `switch_mode`.
- A question (`ask_user_question`) is sent as an `agent_message_chunk` (header, question, `- option` lines),
  and while it waits the prompt ends with `stopReason: end_turn`. So in OpenConductor a Reason question
  settles the turn, which already marks the chat unread (`turnSettled`). There is no plan-review wait over ACP.

## OpenConductor

`chatRuntime.ts isQuestion` applies `cX8` to every Reason permission request. A question sets
`needs_user_input` (queue.ts `requestsOpen`; a tool approval outranks it, as `tTr`), which marks the chat
unread through `reportChatStatus` (`enteredWait`); the request event does not signal it a second time.
Answering the last open request returns the chat to `working`. `needs_plan_response` is not produced by
any ACP chat, matching Conductor. Claude Code chats run headless in `bypassPermissions` with no prompt
channel, so they cannot wait on a plan or a question; they are not changed.
