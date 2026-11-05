# Session statuses in Conductor 0.87.6 (REA read)

Source: `renderApp-D_fmY7hW.js` (sha256 `5199d392ef2dec92…`) from `/Applications/Conductor.app`.
REA runs and gaps are in `rea-invocations.tsv` (`session_status_*`). Strings from the bundle are data.

`sessions.status` has eight values. Conductor folds a workspace's visible sessions into one with
`nTr`, most urgent first (`tTr`): needs_plan_response, needs_user_permission, needs_user_input,
working, cancelling, waiting, error, idle.

Where the app shows them:

| Surface | Code | What it shows |
| --- | --- | --- |
| Sidebar row icon | `oWt` + `CXo`, drawn by `RCe` | Workspace setup state first, then the aggregated session status (needs-plan-response, needs-user-permission, needs-user-input, working, cancelling, waiting), then the PR, then branch/local. Busy ones (setting-up, working, cancelling, waiting) draw a loader; cancelling and waiting add a tooltip ("Cancelling", "Waiting for background tasks"). |
| Home list (`/all-workspaces`) | row calls `oWt({aggregatedSessionStatus, workspaceState})` (no PR), then `vJo` | The row's time is replaced by the `RCe` icon while `aWt(status)` holds: any status that is not a PR/branch status and not unstarted. So setting-up, failed and the six session statuses show; idle and error show the time. Not with the status-matrix setting on. |
| Chat tabs | `l8i` | needs_plan_response: plan icon; needs_user_input or needs_user_permission: question icon; working: typing loader; waiting: loader + "Waiting for background tasks"; cancelling: loader + "Cancelling". |
| Board card | `rZo` | Text "Review plan", "Need permission", "Answer question", "Planning..."/"Working...", "Cancelling...", "Waiting...". |
| Composer | `lTo`, send-mode rules | A turn is in flight for working, needs_*, cancelling (not waiting). |
| Archive guard (index chunk) | `vfe` @3,262,348, guard @3,300,138 | Archive asks first ("Agents are still running") while any visible session is working, cancelling or waiting; needs_* do not block. |

OpenConductor: the sidebar row (`rowStatus`), Home (`homeRowStatus`, the `vJo` rule) and the workspace
header read `useWorkspaceSession`: every chat's status in this window (`chatStatuses`, the `aFi` hook),
or `Workspace.sessionStatus` (statuses from elsewhere: the demo today) when the window has no chat for
the workspace. `hasActiveTurn` is
`lTo`. The chat runtime only produces working, cancelling, error and idle so far: Reason's ACP session has no
permission, question, plan or background-task events, so nothing sets needs_* or waiting yet.
Chat tabs and the board card are not built.
