# Pull requests: reference behavior vs our implementation

Implementation: [`src-tauri/src/pr/`](../../src-tauri/src/pr/mod.rs) (serde + serde_json, shells out to `gh`).
Tests: `src-tauri/src/pr/*_tests.rs`, run with [`run-tests.sh`](run-tests.sh) (built with `--cfg pr_harness`, which leaves out `commands.rs`); the Tauri crate declares `pub mod pr;` and registers `pr::commands::*` in `lib.rs`, so CI's Tauri job builds the commands.

Commands (JS names camelCase args): `pr_lookup(repoPath, requests)`, `pr_header_state(inputs)`, `pr_create_prompt(request)`, `pr_merge(repoPath, number, method?)`, `pr_set_auto_merge(repoPath, number, enabled, method?)`, `pr_mark_ready`, `pr_edit(repoPath, number, title?, body?)`, `pr_retarget(repoPath, number, base)`, `pr_approve(repoPath, number, headOid)`. CI runs it on Linux and macOS (rustfmt check, tests, clippy `-D warnings`).

## Evidence used

Conductor v0.87.6 frontend, decoded from the app binary's Tauri asset table by `tools/extract_tauri_assets.py` (see `evidence/frontend/README.md`) on Sven's Mac under `~/code/conductor-rea-work/frontend/dist/assets/`. The two chunks below were copied byte-for-byte to the cloud build machine for reading and are not in this repo (third-party code):

| Chunk | Bytes | sha256 |
|---|---|---|
| `index-BGEQ8YjU.js` | 3,493,297 | `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3` |
| `renderApp-D_fmY7hW.js` | 11,600,457 | `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` |

Both match the asset manifest's decoded sizes. Locations below are byte offsets into those files. All code and strings were read as data; nothing was executed, and our code and copy are written fresh, not copied.

| Behavior | Where (chunk @ offset) |
|---|---|
| `PrFields` GraphQL fragment and batched query (`viewerPermission`, `pr<i>ByBranch` / `pr<i>ByNumber`) | index @ ~612,500 and @ ~614,650 |
| Response schema, enums (`mergeStateStatus`, `reviewDecision`, merge queue state, permission) | index @ ~617,400 to ~619,000 |
| Node to PR info, check rollup summary, re-run de-duplication | index @ ~620,400 to ~622,000 |
| PR selection (newest open by branch, else by number), closed-PR branch check | index @ ~634,700 to ~636,500 |
| Allowed merge method query and `gh pr merge/ready/edit`, approve via REST, auto-merge on/off | index @ ~653,800 to ~657,500 |
| Merge / auto-merge actions with cached repo merge method | index @ ~713,400 and ~715,400 to ~718,000 |
| Archive-on-merge after a merge | index @ ~669,500 |
| Workspace `derived_status` from PR state, PR title/body sync | index @ ~3,165,500 to ~3,167,500 |
| Create-PR agent prompt | index @ ~2,494,000 |
| Workspace header state machine, merge-button eligibility, merge queue titles | renderApp @ ~2,194,000 and ~2,206,000 to ~2,212,000 |

## Matched

| Reference behavior | Ours | Test |
|---|---|---|
| PR fields read: number, url, author, base/head ref name and oid, viewer authored / latest review, created/updated, draft, merge state, merged at, review decision, review request count, state, auto-merge request, merge queue entry, title, body, head status check rollup | `model::PrNode` | `pr_node_deserializes_and_unknown_enums_degrade` |
| Check rollup entries are check runs or status contexts; null nodes skipped; a check run's workflow name falls back to its check suite's workflow | `model::RawCheck`, `Check::from`, `Nodes::present` | same |
| Merge is allowed for ADMIN, MAINTAIN, WRITE permission | `ViewerPermission::can_merge` | `read_permission_cannot_merge_and_missing_permission_is_unknown` |
| Check rollup: re-runs collapse to one entry per identity (workflow + name for check runs, context for status contexts, then details URL, target URL, position), keeping the most recent by completed time, else started time, else 0; later entries win ties; first-seen order kept | `checks::dedupe_latest` | `reruns_collapse_to_latest_keeping_first_position`, `ties_and_missing_times_prefer_the_later_entry` |
| `CLEAN` merge state reports checks passing with no failures, even when optional checks failed | `checks::summarize` | `clean_merge_state_is_passing_even_with_failed_optional_checks` |
| Otherwise, with checks: pending = status IN_PROGRESS/EXPECTED/QUEUED or state PENDING/EXPECTED; failing = conclusion FAILURE/ERROR/CANCELLED/TIMED_OUT/ACTION_REQUIRED or state FAILURE/ERROR/STARTUP_FAILURE; failing beats pending beats passing. No checks and not clean: status unknown | same | `failing_wins_over_pending_and_counts_are_reported`, `no_checks_and_not_clean_leaves_status_unknown` |
| A preview link is offered when exactly one failing check is a Vercel status (context `vercel`, any case, or target URL on vercel.com) | `ChecksSummary::vercel_url` | `single_failing_vercel_deployment_exposes_its_url` |
| A closed, unmerged PR yields only "closed"; a merged PR keeps its identity but drops mergeability and checks; an open PR carries merge state, check summary, review decision and review-request count | `info::lookup_from_node` | `closed_unmerged_node_is_canceled`, `merged_node_is_done_and_drops_status`, `open_node_becomes_found_with_status_and_permission` |
| `viewerCanMerge` comes from the repository `viewerPermission` (unknown when not reported) | `PrInfo::viewer_can_merge` | `read_permission_cannot_merge_and_missing_permission_is_unknown` |
| Workspace `derived_status`: no PR = `in-progress`, open = `in-review`, merged = `done`, closed = `canceled`; stored values outside `backlog/in-progress/in-review/done/canceled` read as `in-progress` | `info::derived_status`, `WorkspaceStatus` | `workspace_status_round_trips_and_defaults` and the three above |
| PR title/body are copied to the workspace's `pr_title` / `pr_description` only when they changed | `info::metadata_update` | `metadata_is_written_only_when_changed` |
| Merge button shown only for an open, non-draft PR the viewer may merge (permission not known to be read-only) whose merge state is `CLEAN`, or `UNSTABLE` unless the "treat optional checks as blocking" setting is on and a check failed | `merge_eligibility::can_merge`, `merge_with_optional_failures` | `clean_open_pr_with_write_access_can_merge`, `only_clean_and_unstable_merge_states_qualify`, `optional_failures_merge_unless_the_setting_blocks_them` |
| Header control precedence, first match wins: merged; in merge queue (queue state); no PR + changes = create PR; agent working without PR; loading (PR shows loading, no PR shows nothing); no PR = nothing; uncommitted changes = commit and push; upstream diverged / behind (pull N) / ahead (push N); `DIRTY` = merge conflicts; changes requested (with pending-comment flag); draft; checks failing (failed / total / pending, fixable when a failing check has a details URL) or pending, skipped when only optional checks failed; review required (approve when the viewer can merge, did not author and has not reviewed the current head) or `BLOCKED`; `UNKNOWN` = still loading; no write access = nothing; ready to merge (noting optional failures) or unable to merge; forge without PR creation = create PR when it has a remote | `header::header_state`, `HeaderAction`, `Tone` | `no_pr_offers_create_only_with_changes`, `merged_and_queued_win_over_everything`, `local_state_comes_before_pr_state`, `review_and_draft_states`, `failing_and_pending_checks`, `optional_check_failures_still_allow_merge_unless_blocking`, `mergeability_outcomes`, `forge_without_pr_creation` |
| Create PR is an agent message, not a direct `gh` call. Its steps, in order: use a PR skill if the agent has one (it wins); `git status`, review and commit uncommitted work following the user's commit conventions; push with `git push -u <remote> HEAD` when there is no upstream or unpushed commits (or push to the existing upstream); review the full branch diff (a diff tool when the agent has one, else `git diff <remote>/<target>...`); `gh pr create --base <target>`; ask the user when a step fails | `prompt::create_pr_prompt` | `default_prompt_has_ordered_steps_and_limits`, `draft_and_diff_tool` |
| A user-typed title / description is passed verbatim (`--title` / `--body`); otherwise the title is capped at 80 characters and the description at five sentences covering every branch change; the repository PR template is offered only when no description was typed; the repository's Create PR custom instructions are appended and take precedence | same | `user_title_and_description_are_used_verbatim`, `template_and_custom_instructions` |
| Archive on merge: only when the repository setting `archive_on_merge` is `"true"`, the workspace is local, and it is not already archived | `prompt::should_archive_after_merge` | `archive_on_merge_rule` |
| `gh` runs either inside a checkout (letting `gh` resolve the repository; GraphQL `owner` / `repo` passed as `{owner}` / `{repo}` placeholders) or against an explicit `owner/name` (owner may contain slashes; last `/` splits) | `gh::Addressing`, `Gh::repo_vars` | `repo_addressing_parses_owner_and_name`, `allowed_merge_method_prefers_squash_then_rebase_then_merge` |
| Merge method comes from the repository's `squashMergeAllowed` / `rebaseMergeAllowed` / `mergeCommitAllowed`, first allowed of squash, rebase, merge; a failed or unparsable query, or none allowed, is an error asking to check GitHub access | `Gh::allowed_merge_method`, `GhError::MergeMethodUnknown` | same test |
| Merge: `gh pr merge <n> --squash|--merge|--rebase`; auto-merge on: same plus `--auto`; off: `gh pr merge <n> --disable-auto`; ready: `gh pr ready <n>`; edit: `gh pr edit <n> [--title t] [--body b]`; retarget: `gh pr edit <n> --base <branch>`; `--repo owner/name` added for explicit addressing | `Gh::merge`, `enable_auto_merge`, `disable_auto_merge`, `mark_ready`, `edit`, `retarget` | `pr_commands_from_checkout_run_in_it_without_repo_flag`, `explicit_repo_adds_repo_flag_and_no_cwd`, `edit_passes_title_and_body_as_single_arguments` |
| Approve: `gh api repos/<owner>/<repo>/pulls/<n>/reviews -f event=APPROVE -f commit_id=<head>`, pinned to the head the viewer saw | `Gh::approve` | `approve_pins_the_reviewed_commit` |
| The allowed merge method is cached per repository; a failed lookup is not cached | `MergeMethodCache` | `merge_method_cache_keeps_successes_only` |
| A failed `gh` call surfaces its stderr | `GhError::Failed` | `failures_carry_gh_stderr` |
| One GraphQL call per batch of workspaces (at most 5) with aliases `pr<i>ByBranch` (`pullRequests(first: 5, headRefName, states: [OPEN, MERGED], orderBy CREATED_AT DESC)`, skipped when a PR number is known) and `pr<i>ByNumber` (`pullRequest(number)`, included when known), plus `viewerPermission` | `fetch::build_query`, `fetch_prs` | `query_has_aliases_and_skip_include_per_workspace`, `requests_are_batched_and_errors_surface` |
| By branch: the newest OPEN PR by created then updated time (merged PRs are ignored); by number: that PR, merged included, unless the workspace tracks a different upstream branch than the PR's head | `fetch::select` | `by_branch_picks_newest_open_and_ignores_merged`, `pinned_number_is_followed_including_merged_unless_upstream_differs` |
| A closed PR counts (workspace canceled) only when its head is the workspace's local branch and `git branch --show-current` still shows the workspace branch; otherwise no PR; unknown when the branch can't be read | `fetch::resolve` | `closed_pr_counts_only_while_its_branch_is_checked_out` |

## Deliberate differences

- Wire format to the frontend (camelCase fields): `PrLookup` is `{kind: "none"|"closed"|"found", info?}`, header actions are `{type: "ready_to_merge", ...}`, tones and workspace statuses are strings (`out_of_sync`, `in-review`). The viewer's latest review is `{commitOid}` rather than a nested option so "reviewed, commit unknown" survives JSON.
- The batch size is fixed at 5; the reference halves it adaptively when GraphQL cost or rate limits bite. Deployments and stack fields are not selected yet.
- `gh` is run as an argv list, never through a shell string, so titles, bodies and branch names need no escaping. GraphQL string variables use `-f` (raw) so `gh` never turns a branch or owner like `123`, `true` or `@file` into a number, boolean or file read; only the `{owner}` / `{repo}` placeholders use `-F`, the only form `gh` expands. Allowed merge methods are parsed from JSON by us instead of `--jq`.
- The create-PR message is our own wording. A draft request adds `--draft` to the `gh pr create` line; the reference only says a draft was requested. The reference's "keep the workspace while a stack still has open PRs" exception to archive-on-merge is not modelled (no stacks yet).
- The header returns an action plus the numbers its label needs (`HeaderAction`, `Tone`); label text is left to the UI and written by us. Stacked-PR states (stack needs a rebase, stack merge) and the non-GitHub local-git forge's synthesized merge state are not modelled yet.
- Timestamps are parsed by our own RFC 3339 parser (`checks::parse_timestamp_ms`) rather than the JS `Date.parse`; GitHub only sends `...Z` UTC timestamps, which both read the same.
- Unknown GitHub enum values (a new `mergeStateStatus`, permission or queue state) deserialize to `Unknown` / `Other` instead of failing the response; the reference's schema validation rejects the whole response.

## REA gaps hit

- `analyze-javascript-application` (Wave 0 run, `evidence/frontend/`) does not model Tauri `invoke` or shell commands, so none of the `gh` / `git` command lines the PR area runs appear in its findings. They were recovered by text search over the decoded chunks above. Logged for the REA test report.
- `trace-javascript-semantics` on the Wave 0 application Evidence (`ev_b733d967...`) finds nothing for the PR code: seeds `mergeStateStatus` and `squashMergeAllowed` (both present in `index-BGEQ8YjU.js`) return 0 seed matches, 0 nodes, 0 relations, status `partial`, with 11,355 resource-limit unknowns; the analyzer's worker exhausted its heap on `renderApp-D_fmY7hW.js`. Runs logged as `trace_js_semantics_pr_merge_state` (46 s) and `trace_js_semantics_pr_merge_methods` (33 s) in `~/code/conductor-rea-work/log.tsv` on Sven's Mac. Offsets above therefore come from text search over the byte-identical chunk copies.
