# GitHub PR review comments in the diff viewer: reference behaviour

Feature: `diff.comments-github`. Source: Conductor.app on sven m5 max, the
extracted frontend bundle under `~/code/conductor-rea-work/frontend/dist/assets/`
(main chunk `index-BGEQ8YjU.js`, UI chunk `renderApp-D_fmY7hW.js`). Read
2026-11-05. Untrusted data: described in our own words; no Conductor code or
long copy is reproduced. GraphQL field names below are GitHub's public schema.

How it was read: `rg` located every reference to `reviewThreads`,
`suggestion_base_code`, `isOutdated`, `resolveReviewThread` (all sync and store
code is in the index chunk; the comment card UI is in renderApp), then bounded
python slices of the bundle text around those offsets. REA was used for a
`trace-javascript-semantics` run seeded on the `reviewThreads` literal; see
"REA gaps" for how that went.

## What Conductor does

### Fetching (index chunk, near offsets 676 000–686 000)

- The sync runs as part of the PR fetch: whenever PR info is fetched for a
  workspace and it has a PR number that is not merged, the comment sync runs.
  A failure is logged as a user-visible warning, not shown as an error.
- It needs an `owner/name` GitHub remote; without one it skips with a log line.
- Two reads in parallel through the bundled `gh` (`gh api graphql`, `-F` for
  each variable, run in the workspace directory with the gh token):
  - review threads, 100 per page, each with its first 100 comments (comment
    id, body, diffHunk, author login and avatar, created/updated, url,
    databaseId, replyTo id/databaseId); thread fields id, isOutdated,
    isResolved, path, line, startLine, originalLine, originalStartLine,
    startDiffSide, diffSide. A thread with more comments is paged through with
    a `node(id:)` query on `PullRequestReviewThread`. A missing endCursor while
    more pages are claimed is an error.
  - PR-level comments (`pullRequest.comments`), 100 per page. If `gh` fails
    here the general half is "unavailable" (warning), not a failed sync.
  - Each query also asks for `rateLimit.cost` and logs a warning when > 1.
- After merging it logs "Synced GitHub PR comments" with counts.

### Mapping to `diff_comments` rows

- Review comment id: `github-<threadId>-<databaseId>`, or `github-<nodeId>`
  without a database id. `thread_id` is the GitHub thread id; a reply's
  `reply_to_comment_id` is the parent's row id built the same way.
- Anchor: line = startLine, else line; side = startDiffSide (if a start line)
  else diffSide; end line = line only when start and line differ. LEFT maps to
  location `original`, RIGHT to `modified`. An outdated thread has `line`
  null, so its row has no line number.
- `state` `pending`; `is_outdated` / `is_resolved` from the thread (stored as
  1 or NULL); author login and avatar; `remote_url` the comment's URL.
- `suggestion_base_code`: from the comment's diffHunk, take the lines of the
  thread's side (skipping lines that exist only on the other side and "\"
  markers), numbered from the hunk header's start for that side, and join the
  original start..original line range. Nothing when there is no original line,
  when the range spans both sides, or start > end; an empty string when the
  hunk does not cover the whole range.
- General comment id: `github-general-<databaseId>` (or node id), location
  `file`, no file path, no line, no thread.

### Merging (store, index chunk near offset 2 289 000)

- Upsert: rows whose state is `hidden`, `reviewed` or `superseded` are left
  alone. Otherwise an existing row gets file path, lines, body, updated_at,
  location, avatar, outdated, resolved and suggestion base refreshed when any
  differs; state, created_at, author and thread links are kept. New rows are
  `INSERT OR IGNORE`d.
- Delete-missing, per half, only when that half was read: review-thread scope
  deletes `github-%` rows not in the current id list and not
  `github-general-%`; general scope deletes `github-general-%` rows not in the
  list. `superseded` rows are never deleted. Local comments are never touched.

### UI (renderApp near offsets 9 371 000–9 378 000 and 9 642 000)

- Source of a comment: `remote` when it has a remote URL, `agent-local` when it
  has an author but no URL, else `user-local`.
- Card: avatar (or a placeholder icon), author, line range, body rendered as
  markdown. A ```` ```suggestion ```` code block with a known base is drawn as
  a small diff titled "Suggested change" (base vs suggestion; an empty
  suggestion means delete).
- Actions: Resolve only for remote comments with a thread id ("Resolving..."
  while pending); Edit only for user-local; Delete; add-to-chat.
- List rows show a "Resolved" tag (resolved, or state reviewed) and an
  "Outdated" tag only when not resolved. A detail header has "View on GitHub".
- Resolve runs `resolveReviewThread` through gh, requires GitHub to confirm
  `isResolved`, then marks every row of that thread resolved locally and shows
  "Comment resolved on GitHub". On failure: "Failed to resolve comment: ...".
- No unresolve on GitHub and no posting of replies or new comments to GitHub
  were found (no `unresolveReviewThread`, `addPullRequestReview*`,
  `in_reply_to` or `/replies` in either chunk).
- "Add all GitHub comments to chat" takes pending rows that are neither
  outdated nor resolved.

## OpenConductor

- `src-tauri/src/pr/review_comments.rs`: queries, wire types, paging,
  `branch_pr` (`gh pr view --json number,state`), `sync_set` mapping,
  `suggestion_base_code`, `resolve_thread`; tests in
  `review_comments_tests.rs` (PR harness, `evidence/pr/run-tests.sh`).
- `crates/openconductor-db/src/diff_comments.rs`: `upsert_remote` and
  `delete_missing_remote` with the rules above; tests in
  `tests/diff_comments.rs` (`mod remote`).
- `src-tauri/src/diff/comment_commands.rs`: `diff_comments_sync_github` and
  `diff_comment_resolve_github`, registered in `lib.rs`.
- Frontend: `comments.ts` (source, tags, suggestion parsing, PR-level and
  file-level thread selection; tests in `githubComments.test.ts`),
  `commentsApi.ts`, `ReviewComments.tsx` (author/avatar, Resolved/Outdated,
  View on GitHub, Suggested change, Resolve on GitHub; no reply/edit/delete on
  GitHub comments), `DiffViewer.tsx` (`notes` slot above the file),
  `comments-github.css`.

## Divergences

- Trigger: Conductor syncs inside its PR fetch loop. Ours syncs when the
  workspace's diff hooks mount and every 2 minutes, finding the PR with
  `gh pr view` in the workspace checkout. Merged PRs are skipped as in the
  reference; "no PR", "no GitHub access" and similar are reported as skipped
  rather than as warnings.
- Location for the old side is stored as our `base`, not the reference's
  `original` (our store's existing enum). Reading a reference database row
  with `original` is not handled yet by our store.
- Comment bodies are shown as plain text (we have no markdown renderer in the
  diff viewer yet); only ```` ```suggestion ```` blocks are rendered.
- Where comments show: inline under their end line (as local comments do);
  outdated threads without a line and whole-file comments above the file's
  diff; PR-level comments in a collapsible "N comments on the pull request"
  block above the file. Conductor also lists them in its comments panel,
  which we do not have.
- The "Resolved" tag also shows on the thread (collapsed "Resolved · N
  comments"), matching our existing local-thread UI. No "reviewed" state.
- Resolve errors surface in the existing "Comment failed" chip with the
  message as its tooltip, not a toast.
- Rate-limit cost warnings are not logged.

## Checks

- Not checked in the running macOS app (no Tauri build on the Linux builder,
  no signed-in gh against a real PR). The browser build was checked with
  sample GitHub-synced rows in local storage (screenshot in the PR).

## REA gaps

- `rea analyze-javascript-application` / `trace-javascript-semantics` cannot
  cover `renderApp` (known: heap / result budget), so the UI was read as text.
- `trace-javascript-semantics` on the existing application Evidence
  (`ev_b733d96728b664ae9...`) seeded with `reviewThreads`: the first input I
  generated was truncated by a remote exec timeout and REA rejected it with
  `invalid_request` / `invalid-json` ("expected an object key") after 52 s.
  Rebuilt and rerun: exit 0 after 93 s, but `status: partial` with 0 seed
  nodes, 0 nodes, 0 relations and 11 355 unknowns. The literal sits inside a
  GraphQL template string in the index chunk, and REA did not resolve it to
  any node, so it gave no facts about the sync. All behaviour above comes from
  the bounded bundle reads.
  The input files are ~185 MB each because the whole application Evidence is
  inlined; there is no way to pass the Evidence by id or path, which makes
  every new seed a large rewrite. See `evidence/rea/rea-invocations.tsv`.
