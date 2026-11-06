# Session status model (parity: sidebar.ws-status, home.status-overview)

How Conductor 0.87.6 models a session's status, what moves it, where it is
stored, and how the sidebar row and the Home list render it. Everything
quoted from Conductor is untrusted data read for behaviour, not copied
code.

## Sources

| Source | Identity | How it was read |
|---|---|---|
| Installed app on Sven's Mac "sven m5 max" | `/Applications/Conductor.app`, CFBundleShortVersionString `0.87.6`, `Contents/MacOS/conductor` sha256 `0ba55751aea5ecf5…ffb831d` | `devices_exec` (read-only), 2026-11-05 |
| Binary the bundle was decoded from | same sha256 `0ba55751aea5ecf5…ffb831d` | `sha256sum` on the cloud copy |
| `assets/index-BGEQ8YjU.js` | sha256 `b5b01f33fbbef68a…3e1ed7dbf3`, equal to `evidence/frontend/tauri-assets-manifest.json` | `tools/extract_tauri_assets.py` (REA cannot extract Tauri assets, see REA gaps) |
| `assets/renderApp-D_fmY7hW.js` | sha256 `5199d392ef2dec92…dc9515dde`, equal to the manifest | same |
| REA analysis of the index chunk | `rea analyze-javascript-application` evidence `ev_cae83c4ea4879728…`, subject digest `1e7e65dc…` | `evidence/rea/rea-invocations.tsv` rows `status_*` |
| Live `conductor.db` | `sessions` schema and status histogram | `sqlite3 'file:…/com.conductor.app/conductor.db?immutable=1'` |

Offsets are byte offsets into the original (minified) asset files.

## 1. The states

`sessions.status` is TEXT, default `'idle'` (live schema on the Mac:
`status TEXT DEFAULT 'idle'`). The row decoder `JZe` (index @1,106,065)
accepts exactly `idle, working, error, needs_plan_response,
needs_user_input, needs_user_permission, cancelling, waiting` and throws
on anything else. The live database held only `idle` (1,182 rows) and
`error` (29 rows) when read, since no agent was running.

Most urgent first, for folding a workspace's sessions (`tTr`, renderApp
@75,075): `needs_plan_response, needs_user_permission, needs_user_input,
working, cancelling, waiting, error, idle`.

"Running" (a turn is open) is `Rit` (index @1,383,998): `working,
needs_plan_response, needs_user_input, needs_user_permission, cancelling,
waiting`. Stop treats `idle, error, cancelling, waiting` as not running
(`iPt`, index @3,014,071) and moves a running session to `cancelling`.

## 2. What moves a session

| Transition | Trigger | Evidence (index chunk) |
|---|---|---|
| → `needs_user_permission` | sidecar `TOOL_APPROVAL` RPC: enqueue the approval, notify "Approve tool use", "`<tool>` requires your permission." | handler @2,947,270; `updateSessionStatus(s,"needs_user_permission")` + title @2,947,736 |
| → `needs_user_permission` | a local command needs approval ("Approve local command") | `qhe` @3,000,879 |
| `needs_user_permission` → `working` | the last approval is answered (`qV`: no approvals left and status still needs_user_permission) | `qV` @2,996,438 |
| → `needs_plan_response` | ExitPlanMode while permission mode is not default and no message is queued; "Review plan" | @2,945,440 |
| → `needs_user_input` | AskUserQuestion ("Answer question"), Codex MCP elicitation and Codex MCP permission ("Complete MCP request", "Approve MCP permissions") | @2,945,893, @2,946,404 (2 sites) |
| `idle` → `waiting` / `waiting` → `idle` | the turn ended with live background tasks; settles to idle when they drain | @1,489,546, @1,490,170 |
| live-state projection | `proposedPlan` → needs_plan_response, `activeQuestions` → needs_user_input, idle + background tasks → waiting | `rct` @1,451,822 |
| startup | busy sessions of local workspaces go `idle`; `needs_user_input` survives (`Ret`) | `Cet` @1,124,471, `Ret` @1,124,644 |

## 3. How the sidebar and Home render it

| Rule | Evidence (renderApp chunk) |
|---|---|
| Row status: workspace state first (`unstarted`, `initializing`/`setting_up` → setting-up, `failed`), then the folded session status, then PR, else branch/local | `oWt` @9,826,050 (`EXo`, `CXo`) |
| Labels: Needs plan response, Needs permission, Needs input, Working, Cancelling, Waiting for background tasks, … | `xze` @9,826,929 |
| Setting-up, working, cancelling and waiting draw the animated loader; cancelling and waiting get a tooltip | `IXo` @9,826,600, `RCe` @9,835,627 |
| Icon colour: only failed/checks-failing (destructive), merged, merge-queued, ready-to-merge, merge-conflict and checks-pending are coloured; the needs_* icons are sidebar-muted | `dWt` @9,829,651 |
| Home row status: `oWt` with only the session status and workspace state (no PR) | @9,845,642 |
| Home shows that status in place of the time when `aWt` holds (not a git status, not unstarted), else the short relative time; archived rows show the unarchive control | `aWt` @9,826,547, `vJo` @9,849,951 |
| Attention set `needs_user_permission, needs_user_input, needs_plan_response` (unread or attention) | `FZo` @9,905,272 |
| "Workspace status matrix" (Settings › Experimental, `internal_workspace_status_matrix`) swaps the icon for a 4×4 animated matrix in Home and the sidebar | @10,701,185; matrix `fJo`/`hWt` |

## 4. OpenConductor

| Conductor | OpenConductor |
|---|---|
| `sessions.status` written by the sidecar service | `session_set_status` (src-tauri/src/session_status_commands.rs) writes it through `openconductor_db::sessions::set_chat_status` and emits `session-status`; `session_statuses` lists visible non-idle sessions |
| status set (`JZe`) | `SessionStatus` (crates/openconductor-db/src/sessions.rs, `parse`/`as_str`) and `queue.ts` `SessionStatus` |
| startup reset (`xet`) | `persistence_commands::startup` runs `reset_busy_to_idle_at_startup`; a chat's row gets `workspace_id` so it is covered |
| `TOOL_APPROVAL` → needs_user_permission, `qV` → working | Reason's ACP `session/request_permission` (reason_acp/provider.rs) → `permissionRequest` event → `Q.permissionRequested`; the answer (`reason_answer_permission`) → `permissionResolved` → `Q.permissionAnswered`; Stop and turn end answer `cancelled` |
| "Approve tool use" / "requires your permission." | `PermissionRequests.tsx` |
| `oWt`, `xze`, `RCe`, `dWt` | `src/state/rowStatus.ts`, `RowStatusIcon.tsx` (ported earlier, #370) |
| Home `vJo` + `aWt` | `homeStatus` / `showsActivityStatus` (rowStatus.ts), AllWorkspaces.tsx |

Not built here: the status matrix option (internal Experimental setting)
and the Home owner filter (mine vs all, team organizations only). Reason's
ACP has no plan-approval, question or background-task signal, so a Reason
chat itself reaches needs_user_permission but not needs_plan_response,
needs_user_input or waiting; those still render when `conductor.db` holds
them.

## REA gaps and bugs hit

1. `rea trace-javascript-semantics` with a literal seed (`needs_user_permission`,
   `needs_plan_response`, `needs_user_input`) over the index chunk's
   application evidence returns `status: partial`, 0 seed matches: string
   literals are not graph nodes. Same gap as `archive_trace_heads_ref`.
   Claims above therefore rest on plain-text reads of the REA-authenticated
   assets (sha256 equal to the manifest).
2. `trace-javascript-semantics` rejects `application` given as a file path
   (`invalid_type, expected object`); the 494 MB evidence has to be inlined
   into the input JSON, which costs ~100 s and ~1 GB per trace.
3. REA still cannot extract Tauri's embedded asset table from
   `MacOS/conductor` (evidence/frontend/README.md); the assets come from
   `tools/extract_tauri_assets.py`.
