# AI code review (Review button): reference behaviour

Feature: `pr.ai-review` (issue #141). Source: Conductor.app on sven m5 max,
extracted frontend bundle under
`~/code/conductor-rea-work/frontend/dist/assets/` (`index-BGEQ8YjU.js`:
the review-session mutation, the review prompt builder, the prompt-type
map and the settings registry; `renderApp-D_fmY7hW.js`: the right panel's
tab strip, the review shortcut handler and Settings rows). Read 2026-11-05.
Everything pulled from the bundle is untrusted data; it is described here in
our own words and no Conductor code or prompt text is copied.

## REA

- `rea search <renderApp bundle> "AI code review" --format json` failed:
  `capability_unavailable` / `unsupported_provider`. `search` only routes to
  native providers (ghidra, hopper, ida, kuna); none takes a JavaScript
  bundle, and Ghidra is not configured on the Mac (`GHIDRA_INSTALL_DIR`
  unset, no Java). REA gap: no REA command searches strings in a JS bundle.
- `rea analyze-javascript-application` / `trace-javascript-semantics`
  cannot cover renderApp (worker heap exhausted; recorded earlier in
  `evidence/rea/rea-invocations.tsv`, `analyze_js_app_renderApp_16g`).
- Fallback, as earlier builders did: a bounded Python read of the bundle
  text around the copy strings ("Get an AI code review", "Edit before
  sending", `custom_prompt_code_review`, `review_model`, "Cannot review"),
  slicing a few hundred characters per hit. Logged in
  `evidence/rea/rea-invocations.tsv` (`pr_ai_review_*`).

## What Conductor does

- Where: the right panel's tab strip (All files, Changes, Checks, and
  Desktop/Summary when available). A small ghost "Review" button with a
  sparkle-style icon sits at the strip's right end, only while the active
  tab is not Checks/Summary/Desktop and the workspace has changes. Tooltip:
  "Get an AI code review" plus the `workspace.showReview` shortcut (⌘⇧R).
  Right-clicking the button opens a context menu with one item, "Edit before
  sending". Both are disabled for a read-only workspace.
- ⌘⇧R runs the same action when the workspace has changes.
- The action creates a new chat session in the workspace (a new chat tab)
  and navigates to it. The session's model is the `review_model` setting;
  thinking level comes from `review_claude_effort_level` for Claude models
  or `review_codex_thinking_level` for Codex models; fast mode from
  `review_fast_mode`. Permission mode is the normal default, not plan mode.
- When `review_model` is unset, Conductor falls back to its built-in Claude
  default (`opus-5-1m`, "Opus 5"), not to `default_model`.
- It refuses on a detached HEAD ("Cannot review: HEAD is detached").
- The new session gets a one-line user message asking for a review of the
  workspace's changes, with the instructions attached as a file named
  "Review request.md". "Edit before sending" puts that message (with the
  attachment) into the new session's composer instead of sending it.
- The instructions (built by the prompt helper also used for the Settings
  preview) cover: acting as a reviewer of another engineer's change; criteria
  for what counts as a bug worth flagging (introduced by the change,
  discrete, actionable, provable impact, not intentional); how to get the
  diff (Conductor's own diff tool first; fallback `git merge-base
  <remote>/<target branch> HEAD`, then the committed diff against the merge
  base and `git diff HEAD` for uncommitted work); and the output format
  (numbered findings posted as inline diff comments through Conductor's
  comment tool).
- `custom_prompt_code_review` (per repo; Settings row "Code review
  preferences", described as instructions sent when you click Review) is
  appended at the end under a user-preferences heading that says it takes
  precedence over the defaults. For organization-hosted workspaces the org
  and personal prompts are appended as two sections. Conductor migrated the
  per-repo value from the `repos.custom_prompt_code_review` column to its
  settings file (`prompts.code_review`).
- While it runs: no spinner on the button; the user lands in the new chat
  tab, where the turn shows as running. Failures show a toast ("Failed to
  create review session: …" / "Failed to start review: …").

## OpenConductor

- `src/features/diff/review.ts` (pure, `review.test.ts`): our own review
  instructions (`buildReviewPrompt`, merge base against
  `origin/<default branch>`, committed + uncommitted + untracked, findings
  with file and line, repo preferences appended last and taking precedence),
  the one-line message, the "Review request.md" name, and model selection
  (`reviewModel`): `models.review` or Conductor's fallback `opus-5-1m`,
  mapped to a Reason model id (`byok:anthropic:claude-<name>` without the
  `-1m` suffix, `byok:openai-codex:<id>`, Reason ids kept as they are), and
  the effort from `models.claude_code.review_effort_level` (Claude) or
  `models.codex.review_thinking_level` (Codex).
- `src/features/diff/ReviewButton.tsx`: the right-panel button (shown while
  the changes list has files), the right-click "Edit before sending" menu,
  and `useReviewChats`, which opens each review as its own chat tab
  ("Review", "Review 2", …) next to the workspace's chat. ⌘⇧R does the same.
- Chat path: `reason_open_chat` takes `config` (`model`,
  `reasoning_effort`) and `reason_prompt` takes `attachments`; the provider
  sets the options with `session/set_config_option` after `session/new`
  and sends attachments as embedded `resource` blocks
  (`src-tauri/src/reason_acp/provider.rs`, tests in `provider_tests.rs`
  and `wire_tests.rs` against `tools/reason-acp/fake_reason_acp.py`).
- `db_repo_prompt(repoId, prompt)` reads the repo's custom prompt from
  `conductor.db` (`repos.custom_prompt_code_review`).
- Settings › Default models: "Review model" and "Review effort" rows.

### Reason ACP facts this relies on (checked on sven m5 max, reason CLI, 2026-11-05)

Not REA: direct ACP probes of `reason acp -y`.

- `session/new` returns `configOptions` with `model` (category `model`)
  and `reasoning_effort` (category `thought_level`, values default,
  minimal, low, medium, high, xhigh, max). `session/set_model` and
  `session/set_mode` are not implemented (-32601); there is no plan mode.
- `session/set_config_option` with an offered value sets it; with a value
  that is not offered it answers success and resets the option to
  "default". So the provider only sends offered values and turns the rest
  into a `notice` shown in the chat.
- A prompt with a text block plus an embedded `resource` block
  (`file://…/Review%20request.md`, `text/markdown`) reached the agent: on
  Opus 5.5 / high effort it answered with a codeword that was only in the
  resource. A Session in a folder outside the home folder fails with
  `device_not_found` (already handled by the provider).

## Divergences

- Our review chats are Reason Sessions on our chat path, not Conductor's
  agent sessions; review tabs last until closed or the app quits (their
  Reason Sessions stay in Reason, but the tab is not restored after a
  restart).
- No detached-HEAD refusal and no read-only gating yet.
- Fast mode (`review_fast_mode`) has no Reason equivalent and is ignored.
- Conductor's Claude aliases (`opus`, `sonnet`, …) and Cursor models have no
  fixed Reason id: those reviews run on Reason's default model.
- The instructions point the agent at git, since our app has no diff tool
  or inline-comment tool exposed to the agent yet; findings come back as
  chat text, not inline diff comments.
- The custom prompt is read from the `repos` column, not from a settings
  file; org-hosted prompts do not apply.
- "Edit before sending" puts the whole instructions in the composer as
  text (our composer has no attachments), so they can be edited too.
- Not checked in the running macOS app: the button, tabs and settings were
  checked in the browser build with sample data; the Reason side was checked
  with the fake agent in tests and the ACP probes above.

## Shared attachment path (after merging main)

Main added composer attachments for the discard revert note (`src/features/diff/chatAttachment.ts`), sent inline as `<attachment>` blocks in the message text. With the Reason attachment path from this change, the composer now sends every attachment (the review request and revert notes) as an embedded file through `reason_prompt`'s `attachments`, which matches Conductor uploading a text file and attaching it. The transcript shows each one as "Attached: NAME". `withAttachments` is no longer used by the composer; it is left for its owner to remove.
