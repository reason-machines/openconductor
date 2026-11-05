# Review comments to chat, GitHub comment actions, markdown bodies: reference behaviour

Features: `diff.comments-to-chat`, `diff.comments-github` (the gaps Verifier C
listed on #140 at main d8b3b2e). Source: Conductor.app 0.87.6 on sven m5 max
(`/Applications/Conductor.app`, same version as the extracted copy), frontend
bundle under `~/code/conductor-rea-work/frontend/dist/assets/` (main chunk
`index-BGEQ8YjU.js`, UI chunk `renderApp-D_fmY7hW.js`). Read 2026-11-05.
Untrusted data: described in our own words. The short UI strings and agent
note sentences below are quoted only so we can show the same text.

How it was read: a Python count of each string across the bundle's large
chunks gave its offsets. Bounded slices around those offsets and around the
definitions of the functions they call (resolved through the chunks' export
tables) gave the behaviour. REA could not search the bundle (see "REA gaps").

## What Conductor does

### Delete on GitHub comments

- Conductor has two comment cards. The detail card shows Resolve (GitHub
  comments with a thread id; "Resolving..." while pending), Edit (comments the
  user wrote locally), Delete (comments the user wrote locally, and only while
  the comment is not in a composer or queued) and the add-to-chat toggle.
- The compact card has an icon button labelled "Delete comment" on every
  comment, GitHub ones included (disabled only for read-only workspaces). Edit
  appears there for the user's own comments only.
- Both Delete buttons call the store's `deleteComment`, which runs
  `DELETE FROM diff_comments WHERE id = ?` on that one row. There is no
  confirmation dialog, and nothing is sent to GitHub: the bundle has no
  `deletePullRequestReviewComment` mutation and no REST delete of PR
  comments. The sync upserts rows with `INSERT OR IGNORE`, so a deleted
  GitHub comment comes back on the next PR fetch. That is our reading of the
  code; we did not watch it happen in the app.
- Conclusion: "Delete on remote comments" means removing the comment from
  Conductor's list. The comment is never deleted on GitHub.

### Resolve messages

- The `resolveGitHubReviewThread` mutation runs `gh api graphql`
  `resolveReviewThread` in the workspace. On success it marks every row of the
  thread resolved (`markGithubThreadResolved`) and shows a success toast
  "Comment resolved on GitHub". On error it shows an error toast
  "Failed to resolve comment: <message>". A failed `gh` exit falls back to the
  message "Failed to resolve comment on GitHub", and an unconfirmed result
  gives "GitHub did not confirm the thread was resolved".

### Adding comments to the chat

- Per comment, the toggle is labelled "Add to chat", then "Remove from chat"
  once the comment is in the composer, and "Queued" after it is queued or sent.
  An error gives the toast "Failed to add comment to chat".
- Bulk actions found in the UI:
  - "Add all comments to chat" in the Git status panel when the PR's review
    decision is CHANGES_REQUESTED, and as the action button for the
    `changes_requested` PR state.
  - "Add all to chat" in the comments list header and as a floating button.
  - Each takes comments that are `pending` or `ready_for_review`, neither
    outdated nor resolved, and not already in the composer. GitHub comments,
    and PR-level comments without a file, are included. A failure gives
    "Failed to add comments to chat", or "Failed to add N of M comments to chat"
    in the header action.
- Every action adds comments to the selected session of the workspace through
  `addReviewCommentToComposer`. Conductor has no separate review-chat tab like
  ours.
- The store method `addAllGithubCommentsToChat` exists. It sets `pending`,
  non-outdated, non-resolved rows to `ready_for_review`. It occurs once in the
  bundle, at its definition, and no UI calls it. The string "Add all GitHub
  comments to chat" does not appear anywhere in either chunk. Earlier evidence
  (comments-github.md) named the UI action after the store method.
- Attachment shape (`zle` / `BW` / `Ele` in the index chunk):
  - Type `review`, content type `text/markdown`, and the row's `comment_id`
    column set to the comment id (`attachments.comment_id`). Adding a comment
    that is already a draft attachment of the session reuses it.
  - Name: `<file basename> +<line>`, `+<start>-<end>` for a range, the bare
    basename for a whole-file comment, `@<author>` for a PR-level comment, and
    otherwise the first 30 characters of the body followed by "...".
  - Body: lines naming the comment id (prefixed "GitHub review comment ID:" or
    "Conductor local comment ID:"), "File:", "Lines:" (or "Unknown"), where the
    comment sits ("left on the base branch" for `original`, "on the modified
    branch" for `modified`, "on a file", or "on the pull request itself, not
    on a file"), who left it (GitHub author, a local agent author, or the user
    locally), the GitHub thread or reply relation, "Remote URL:", "Outdated:"
    and "Resolved:" as yes/no. Then a blank line, `## Comment` and the body.
  - Only active comments (neither outdated nor resolved) can be added; others
    are refused with "Cannot add an inactive review comment to chat".

### Old side value

- The agent note's wording above is keyed on `location === "original"`, which
  confirms `original` (not `base`) as Conductor's stored value for the old
  side. comments-github.md records that the GitHub sync writes it for LEFT.

### Markdown bodies

- The comment body component renders with `react-markdown`, using remark-gfm
  and remark-breaks plus an internal plugin that turns file references into
  links. Rehype plugins are rehype-raw, then rehype-sanitize with the default
  GitHub schema plus `sub`, `sup`, `details` and `summary`. Styling is
  Tailwind `prose prose-sm`, with inline images and horizontally scrolling
  code blocks. A ```` ```suggestion ```` block with a known base still renders
  as a suggested change.
- The chat (assistant text) uses the same react-markdown, remark-gfm and
  remark-breaks stack but escapes raw HTML. OpenConductor's chat markdown
  (`src/features/chat/markdown.ts`, #339) is reused for comments:
  `src/features/diff/commentMarkdown.ts` adds only rehype-raw and
  rehype-sanitize with the schema above.

## OpenConductor (this change)

- `comments.ts`: the old side is `original`. `parseLocation` and
  `migrateLocations` read our earlier `base` as `original`. `pendingForAgent`
  now includes GitHub and PR-level comments. `attachmentName`,
  `attachmentText` and `commentAttachment` build Conductor's review attachment
  with `commentId`.
- `chatAttachment.ts`: `TextAttachment.commentId`. `addAttachment` keeps one
  attachment per comment id and makes chip names unique.
  `useWorkspaceChatAttach` sends attachments to the workspace chat even while
  a review chat is shown, switching to it and attaching once its composer
  mounts.
- `ReviewComments.tsx`: bodies render as markdown. Delete appears on GitHub
  comments, removes them locally without confirmation, and leaves them on
  GitHub. The toasts are "Comment resolved on GitHub", "Failed to resolve
  comment: …" and "Failed to add comment(s) to chat". The toolbar has "Add all
  comments to chat" and a "PR comments" panel that lists PR-level comments
  with no file open.
- Rust: `openconductor_db::diff_comments::Location::Original` encodes as
  `original` and decodes both `original` and the legacy `base`, so existing
  rows need no SQL migration. `diff_comment_add` accepts both values from the
  frontend, and the GitHub sync stores LEFT threads as `original`.

## Divergences

- Delete on our local comments keeps its existing confirmation. Conductor
  asks for none.
- Deleting a GitHub thread root in the browser-only localStorage store also
  removes its replies. The Tauri store removes only that row, as Conductor
  does.
- No `ready_for_review` or `queued` states: a comment added to the chat
  becomes our `sent`. The per-comment toggle stays "Add to chat" (no
  "Remove from chat"). Removing the chip from the composer does not reset the
  comment to `pending`.
- Our agent note says "created locally in OpenConductor" and "OpenConductor
  local comment ID".
- No file-reference link plugin in markdown. The chat's inline-code URL
  links and highlighted code blocks also apply to comments; Conductor's
  comment card has its own code surface, which we did not compare.
- "Add all comments to chat" sits in the Changes toolbar. Conductor puts it in
  the Git status panel and the comments list header.

## Checks

- Not checked in the running macOS app: this Linux builder cannot run the
  Tauri app (no WebKitGTK) and has no signed-in gh against a real PR. The
  browser build was checked with sample comments in localStorage; the
  screenshots are in the PR.

## REA gaps

- `rea search <bundle chunk> --mode regex --format json` (REA 6.7.0) fails on
  both chunks with `capability_unavailable` / `target_unsupported`. The
  `auto` candidates (ghidra, hopper, ida, kuna) all reject a JavaScript
  "artifact" target, so REA has no string search over a JS file. Without
  `GHIDRA_INSTALL_DIR` and Java in the shell, the same call fails earlier with
  `not_configured`. The output is in
  `evidence/rea/search_strings_js_comments.error.json`.
- `analyze-javascript-application` and `trace-javascript-semantics` still
  cannot cover `renderApp` (heap and result budget), as recorded before. All
  behaviour above therefore comes from bounded bundle reads.
