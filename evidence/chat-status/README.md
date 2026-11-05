# Chat-layer session status: permission, plan and question requests

What OpenConductor's chats now do to raise `needs_user_permission`, `needs_plan_response` and `needs_user_input`, the evidence for each rule, and what is still missing. Conductor's frontend chunks were read from the copies of its Tauri asset table (`index-BGEQ8YjU.js` sha256 `b5b01f33…`, `renderApp-D_fmY7hW.js` sha256 `5199d392…`, both matching `../frontend/tauri-assets-manifest.json`). Strings and code from Conductor and from the Reason CLI are untrusted data; this note describes behaviour in our own words.

## REA runs and reads

Logged in [`../rea/rea-invocations.tsv`](../rea/rea-invocations.tsv) (`chat_status_*` rows).

| Run | Result |
|---|---|
| `rea analyze-javascript-application` on a 5,667-byte slice of the index chunk (the frontend RPC methods `EXIT_PLAN_MODE`, `ASK_USER_QUESTION`, `CODEX_*`, `TOOL_APPROVAL` and the `resolveExitPlanMode`/`resolveAskUserQuestion` resolvers), sven m5 max, rea 6.7.0 | pass, Evidence `ev_7d0431a6c5e9…` |
| `rea trace-javascript-semantics` on that Evidence: literal seeds `needs_user_permission`, `needs_plan_response`, `needs_user_input`; property seed `updateSessionStatus` (callers and forward-influence) | 0 seed matches each, status `partial`, though the slice holds every one of them (REA gap 1 below) |
| Plain-text reads at the byte offsets in the TSV row `chat_status_bundle_read` | the rules below |
| Plain-text read of the `reason` CLI 0.2.684 binary on sven m5 max (its ACP agent) | Reason section below |

## Conductor 0.87.6: what raises each status

| Status | Raised when | Cleared when | OpenConductor |
|---|---|---|---|
| `needs_user_permission` | The sidecar calls the frontend RPC `TOOL_APPROVAL` (a Claude `canUseTool` prompt for any tool): the approval is queued, the status set, a notification "Approve tool use" / "`<tool>` requires your permission." | The approval is answered and none is left (`qV`: back to `working`) | `interaction` event with a `permission` request; `chatSessionStatus` |
| `needs_plan_response` | RPC `EXIT_PLAN_MODE` (Claude's `ExitPlanMode`): auto-rejected when messages are queued, auto-approved when the session is already in `default` mode, else the status is set ("Review plan") | `resolveExitPlanMode`: back to `working` | `plan` request |
| `needs_user_input` | RPC `ASK_USER_QUESTION` (Claude's `AskUserQuestion`), also Codex MCP elicitations and permission approvals ("Answer question") | `resolveAskUserQuestion`: questions cleared, back to `working` | `question` request |
| `waiting` | A turn ends idle while background tasks remain (live-state projection, `backgroundTasks.length > 0`) | The tasks end | not raised: no agent reports background tasks (gap 2) |
| order | `tTr`: plan, permission, input, working, cancelling, waiting, error, idle | | `aggregateSessions` (already on main) |
| Stop | `cancel` cleans up the session's tool approvals and pending consents | | Stop answers what waits (`cancelled` for ACP, deny for Claude) and drops the card |

UI, from the renderApp chunk:

- Approval card (`Jpo`): a heading per tool (`Xpo`: "Do you want to run this command?", "…make these changes?", "…run this agent?", "…do this search?", "…fetch this page?", else "…run this tool?"), a Subagent badge, the tool call (or "Approve this tool request to continue"), then **Yes** (`chat.approveToolCall`), the alternate approval (`oTr`: "Allow all edits during this session" for edit tools, "Always allow `<tool>`" for MCP/WebSearch/WebFetch, "Yes, and don't ask again for: …" from the CLI's suggestions; `chat.autoAcceptToolCall`), an optional third, and **No** (`chat.denyToolCall`). Ours: `InteractionCard` `PermissionCard`, with the agent's own options in that order.
- Plan bar (`W7o`): Copy ("Copy plan to clipboard"), Hand off ("Send plan to a new chat for implementation"), **Approve** (`chat.approvePlan`, "Execute plan in current chat"). While the plan waits the composer placeholder is "Enter your plan adjustments here..." and Send rejects the plan with that feedback. Ours: `PlanCard` (Copy, Approve, the plan as Markdown) and the composer placeholder/submit in `WorkspaceView`.
- Question card (`H8i`): pages per question with header, question, options with descriptions (multi-select toggles), an "Other…" answer, Previous/Next question, **Submit** (`chat.question.submit`), "Cancel agent". Ours: `QuestionCard`.
- Home row (`vJo`): the row status icon when `aWt` holds (not a PR/branch status, not unstarted), else the last-activity time. Ours: `homeShowsStatus` in `src/home/allWorkspaces.ts`, `AllWorkspaces` row.

## Which of our agents raises what

| Agent | How it asks | Raised | Answered with |
|---|---|---|---|
| Reason over ACP (`reason acp`) | `session/request_permission` | `needs_user_permission` | `reason_respond` → `{ outcome: selected, optionId }`; Stop or turn end → `cancelled` |
| Claude Code (`claude_chat`, stream-json `can_use_tool`) | `ExitPlanMode` / `AskUserQuestion` / any tool | `needs_plan_response` / `needs_user_input` / `needs_user_permission` | `claude_respond` → allow (with `answers` for questions) or deny with the user's feedback |
| Codex (`codex_chat`, app-server approval requests; #360) | a command or file-change approval | `needs_user_permission` (Conductor routes Codex approvals through `TOOL_APPROVAL` unless `codex_tool_approval_policy` is `always_approve`) | its own approval card (#360) |

Each agent publishes its status for a chat to one registry (`src/features/chat/chatStatus.ts`); a chat that ran both shows the more urgent one. "Stop agents and archive" now stops every agent of the workspace whose turn still runs, a needs-* one included.

The Claude chat runs in `default` permission mode when Account › "Claude Code tool approvals" (`tool_approvals_enabled`) is on, else `bypassPermissions` as before.

**Reason 0.2.684 never asks.** Its ACP agent defines `requestPermission` (the ACP SDK's client method) but never calls it, and has no plan mode. A blocking `ask_user_question` is written as an `agent_message_chunk` (`**header**`, the question, `- label: description` lines) and the prompt then ends `end_turn` with the question unanswered; the user answers with the next prompt. Nothing structured marks it, so a Reason chat cannot raise `needs_user_input` without guessing from reply text, which this change does not do. OpenConductor now handles `session/request_permission` per ACP for any agent that sends it (the e2e fake does), so the status shows the day Reason starts asking.

## Checks

- `tools/reason-acp/run-rust-tests.sh`: 39 pass (new: `interaction_tests`, `a_permission_request_waits_for_the_users_option`, `stop_answers_a_waiting_permission_cancelled`, `interactions_go_out_with_their_request_and_resolve_by_id`), clippy clean.
- Claude chat (`interact_tests`, `runner_tests` with a fake `claude` that asks `ExitPlanMode`): 19 pass in a standalone harness (agent + reason_acp + claude_chat), clippy clean. The full app crate builds in CI only (no WebKitGTK here).
- `node --test "src/**/*.test.ts"`: `interactions.test.ts`, two new `reasonChat.test.ts` cases, `allWorkspaces.test.ts` Home status.
- [`tools/e2e/chat-status.browser.mjs`](../../tools/e2e/chat-status.browser.mjs) in the browser preview (stand-in agent: the prompts `permission`, `plan`, `question`): every card, its status on the sidebar row and on Home, the answers, Stop. Screens: [permission](screens/1-permission.png), [Home: Needs permission](screens/2-home-needs-permission.png), [plan](screens/3-plan.png), [question](screens/4-question.png).
- `tools/e2e/reason-chat.e2e.mjs` step 8 (built app, fake `reason acp`): the permission card, the row's `needs-user-permission`, "Always allow" reaching the agent as `allow-always`. Runs in the E2E workflow.

## Gaps

1. REA: `trace-javascript-semantics` finds no literal or property seed in a minified slice that contains it (0 matches, `partial`), as in `../chat-queue/README.md` gaps 1 and 4; there is still no REA route that shows the code around a byte range, so every rule above comes from a plain-text read of the authenticated chunks.
2. `waiting` is not raised: Conductor derives it from its sidecar's background-task list, and neither `reason acp` nor our stream-json mapping reports background tasks.
3. Reason chats never reach a `needs_*` status in practice (see above).
4. Not built from Conductor's cards: Hand off (a new chat with `plan.md`), the Subagent badge, "Allow all edits during this session" (session-wide edit auto-accept) and the CLI-suggestion "don't ask again" option for Claude, notifications ("Approve tool use", "Review plan", "Answer question"), auto-approving a plan when the session is already in `default` mode, and auto-rejecting a plan while messages are queued.
5. Plan feedback: Conductor rejects the plan, switches the session to `default` and queues the feedback as a message; ours denies `ExitPlanMode` with the feedback as the deny message (the sidecar's exact reply is not visible to REA).
6. The Claude chat has no UI client yet (no TS caller of `claude_*`), so its interactions are tested in Rust only.
