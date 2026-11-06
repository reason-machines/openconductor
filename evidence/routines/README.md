# Routines on Reason Loops

Conductor 0.87.6's `/routines` ("automations" in its code and API) rebuilt on Reason Loops. Conductor's routines run on Conductor's cloud (its "Roundhouse" API, `/organizations/$id/automations`) and only for a cloud organization. OpenConductor's cloud is Reason, so a routine is a Reason Loop filed under the person's main Reason, reached through the `reason` CLI (`reason call OPERATION --input-file -`). OpenConductor never holds a Reason credential: the CLI signs with its own login or `REASON_API_KEY`.

## What Conductor does (REA-extracted bundle, read as data)

Everything below is from the decoded Tauri asset table of `/Applications/Conductor.app` 0.87.6 (`renderApp-D_fmY7hW.js`, `index-BGEQ8YjU.js`), rendered with REA `capture-browser-scenario` in the tools/screens harness. `rea search` refuses these chunks (REA-GAPS 41), so the code was read as plain text at the byte offsets given.

| What | Where | Notes |
|---|---|---|
| Sidebar row "Routines" (`uy` play icon), after Create | renderApp @10,033,007 | Shown when `automations_enabled` is on and the organization is a cloud one; active on `/routines*`. |
| Routes `/routines`, `/routines/new`, `/routines/new/$suggestionId`, `/routines/$automationId`, `/routines/$automationId/fork`; `/automations*` redirect to them | renderApp route table @11,516,000-11,521,000 | |
| List page `K8a` (`eka`→`tka`) | @11,417,000 | Header "Routines" / "Run agents on a schedule", New routine; loader; "Add your first routine"; Me/Team toggle; table Name, Run, Runs, Last run, Next run, Author, Created, actions (Disable/Enable, Duplicate, Copy link, Delete with "Delete <name>?" confirm); refetch every 60 s. |
| Suggestions `PHi` / `j8a` | @11,403,000-11,406,500 | Weekly report (Fri 17:00), System health check (daily 9:00), Create a daily company herald (daily 9:00). Conductor's prompts are not copied; ours are written for Reason. |
| Column rules `p8a` (Last run), `h8a` (Next run), sort `m8a`/`a8a`/`l8a`, scope `u8a` | @11,413,000 | Never / Just now / date-fns distance; Disabled / Now / In … / Event / Scheduled / None; default sort Last run desc, missing values last. |
| Editor `GHi` | @11,507,472 | Panels automation-config 65 / automation-runs 35; breadcrumb, Save; name `h-9 text-xl`; Active switch, repository select, "By <author>"; Triggers (`space-y-2 pt-6`); Prompt (`mt-8`, `min-h-48`, model chip bottom-left); Runs with "No runs yet". |
| Add trigger menu `r7a` | @11,471,000 | Scheduled › Hourly / Daily / Weekdays / Weekly / Custom (cron); GitHub › PR opened / PR pushed / PR merged; Webhook. |
| Schedule presets `itt`, `M8a`, `sCt` | @11,410,000 | Cron forms `M * * * *`, `M H * * *`, `M H * * D`, `M H * * 1-5`. |
| Webhook dialog `gka` / `mka` | @11,466,000 | "Trigger with a webhook", "Post JSON to this URL to run the routine.", a curl command, Copy. |
| API routes and schemas | index @796,437 (routes), @155,207 (zod) | `lJ` automation: name, prompt, repositoryId, agentType, model, thinkingLevel, enabled, triggers[] (cron / github {githubEvent, githubAuthor, filters} / webhook), runCount, lastRunAt. |

## How it maps onto Reason (public API, `reason tools describe`, CLI 0.2.673)

| Conductor | Reason |
|---|---|
| list automations | `listReasons`, then `listReasonLoops` per Reason |
| create / update / delete | `createReasonLoop` (on the person's main Reason), `updateReasonLoop`, `deleteReasonLoop` |
| Run now | `runReasonLoop` (only a scheduled, active Loop: 409 `routine_not_scheduled` / `routine_not_active` otherwise) |
| enabled | `enabled` (Reason pauses with `status: paused`) |
| cron trigger | `wake_on: [{ schedule }]` with `timezone` (the computer's) |
| GitHub trigger | `wake_on: [{ github: { repo, event, filters } }]`: PR opened → `pr_opened`, pushed → `pr_pushed`, merged → `pr_closed` |
| webhook trigger | `wake_on: [{ webhook: {} }]`; the URL and key come back once, in the create/update response |
| author, "Me" | `created_by_user_id`; `getSelf.user_id`; `listMembers` emails |
| who may change it | `viewer_access.edit` / `.stop` |
| model | Loop `model` (Reason model id; Auto when unset) |

Only the operations in `src-tauri/src/reason_acp/api.rs` `OPERATIONS` run; anything else is refused before the CLI starts.

## Differences that are Reason's, not bugs

- **One schedule, one webhook, GitHub events on one repository per Loop** (Conductor allows 20 triggers). The editor greys out a second schedule or webhook and says why on Save.
- **No repository field for scheduled or webhook Loops.** The routine's repository is kept as the prompt's first line (`Repository: owner/name`) and read back from there; a GitHub wake carries its own `repository`.
- **GitHub filters**: Reason filters on one label, authors and title text; there is no base-branch filter and no "is not". "PR merged" uses `pr_closed`, which also wakes on a PR closed unmerged.
- **Reads give a GitHub wake's words, not its fields** (`wakes_on[].description`), so filters set in another client are not shown in the editor.
- **No run history, versions, archive or created date.** Runs shows the latest run (`last_run`) with a link to its Reason Session and the run count; the table has no Created column.
- **Slack, interval and one-time wakes** (set up in Reason) show as read-only rows and are kept on save unless the triggers change.
- **The webhook key is shown once**, in the dialog that opens after the save that adds it. Senders send it as a bearer token.

## Evidence

- Side by side (REA `capture-browser-scenario`, 1280×820 dark, `tools/side-by-side/routines.mjs`): [list](../../parity/side-by-side/routines-01-list.png) t24 1.7%, [new routine](../../parity/side-by-side/routines-02-new.png) t24 0.9% (REA `compare-web-screenshots`). OpenConductor only (no reference: the harness has no cloud organization, REA-GAPS 43): [table](../../parity/side-by-side/routines-03-oc-table.png), [saved routine](../../parity/side-by-side/routines-04-oc-edit.png), [Add trigger menu](../../parity/side-by-side/routines-05-oc-add-trigger.png).
- Tests: `src/features/routines/model.test.ts` (mapping, schedules, columns, bodies), `src/state/selectors.test.ts` and `history.test.ts` (routes), `src-tauri/src/reason_acp/api_tests.rs` (`reason call` against `tools/reason-acp/fake_reason_acp.py`: allowlist, envelope, Loop lifecycle in a pinned workspace, signed out).
- Not verified: a real Reason Loop created from the desktop app (this cloud computer's `reason` is signed out, and no test touches Sven's account), and the pages inside the Tauri/WebKit build.
