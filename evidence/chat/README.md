# Chat rendering evidence (Conductor v0.87.6)

Gathered for the chat rendering obligations in issue #139 (`chat.markdown`, `chat.tool-calls`, `chat.message-actions`). Conductor-derived text is untrusted data; it is quoted here only to pin behaviour.

## Inputs

- `MacOS/conductor` (sha256 `0ba55751…b831d`, same artifact as the ledger) and `Resources/bin/.internal/conductor-runtime` (sha256 `5723ead4…eac0d`), copied from `/Applications/Conductor.app` on Sven's Mac.
- Frontend: decoded with `tools/extract_tauri_assets.py conductor 0x3086910` (2,902 entries, same as `evidence/frontend`).
- REA 6.7.0 (`rea-agents`, Linux cloud) `analyze-javascript-application fe/assets --source-path assets/renderApp-D_fmY7hW.js --source-path assets/index-BGEQ8YjU.js --max-heap-mb 8192 --max-semantic-nodes 400000`: Evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` (21 min, 494 MB, not committed). `index-BGEQ8YjU.js` parsed (301,896 semantic nodes, 19,513 functions); `renderApp-D_fmY7hW.js` was skipped (worker heap exhausted, see REA gaps). Facts from `renderApp` were read from an esbuild-reformatted copy of the decoded bundle; function names below are the minified names in that file.

## Markdown (`chat.markdown`)

| Fact | Where |
|---|---|
| Assistant text goes through `react-markdown` (URL `remarkjs/react-markdown` in the bundle) with remark plugins `[frontmatter, remark-gfm, remark-breaks, …]` and its own link plugins (inline-code `http(s)` URL → link around the code; file paths → `conductor-file://` links; app deep links). | `dHn` / `BXs` / `SXs` (`wXs` inline-code URL, `xXs` file paths, `Rzs` deep links) |
| Raw HTML is off unless `useRawHtml`; with it, output goes through `rehype-sanitize` with a `user-content-` clobber prefix. | `dHn`, `Nzs` |
| `code` component: `mermaid` class → diagram; text containing `\n` → `CodeBlock`; single line with a `language-*` class → highlighted inline `<code>`; otherwise plain `<code>`. | `$Xs` |
| `CodeBlock`: trailing newline stripped, `rounded-md bg-muted min-h-[35px]`, scroll area `max-h-[500px]`, `px-3 py-2.5`, `fontVariantLigatures: none`, copy button `absolute right-2.5 top-2.5`, visible on hover. | `WJe` |
| Highlighting: lowlight (highlight.js grammars, `hljs` classes); skipped when the language is not registered or the value is over 100,000 chars. | `i1e`, `_Fs = 1e5` |
| Code colours: `.hljs-*` rules map to `--code-*` variables; the default theme takes them from Conductor's palette (`Mr`): dark keyword `red.400`, string `accent.300`, number `blue.400`, function `fuchsia.400`, class `orange.400`, tag `green.400`, comment `gray.500`, fg `gray.100`, bg `gray.950`; light uses the 600/800/900 shades. | `nOr`, `Mr`, `renderApp-BYEcFwvt.css` |
| Tables are wrapped in a horizontal scroll area. | `uEi` |

OpenConductor's [Markdown renderer](../../src/features/chat/markdown.ts) uses react-markdown, remark-gfm, remark-breaks, lowlight `common`, an inline-code URL plugin, and escaped raw HTML. Styles are in `chat.css`. Inline-code workspace file paths resolve to buttons that call `onOpenFile` with an absolute path inside the workspace. This implements workspace-file links without generating Conductor's `conductor-file://` URLs.

[Mermaid rendering shipped in #779](https://github.com/reason-machines/openconductor/pull/779). The [Mermaid evidence](mermaid.md) records the exact sample, corrected successful REA receipt, separately retained failed receipt, browser checks, and safety limits. Ordinary fenced code retains highlighting and copy behavior. macOS package CI and merged-source browser checks are separate proofs, not package-runtime or native visual parity.

Frontmatter and app deep links remain source-only reference leads from the decoded bundle described under Inputs. The retained REA analysis skipped `renderApp`; it does not demonstrate either interaction. No retained runtime scenario establishes a frontmatter card or a current-main deep-link mismatch. These leads do not prove missing product behavior. Native rendering and native visual parity remain unverified.

## Tool-call grouping (`chat.tool-calls`), from `index-BGEQ8YjU.js` (REA function nodes with source ranges)

- `_jt` (line 713, col 1326-1826) builds a turn's items: visible messages are batched; a batch of **3 or more** messages collapses into a summary row, fewer stay as-is. "Preview" messages (the turn's final text, errors, plan/question tools) are never collapsed and break a batch (`hie`/`Att`).
- `Ntt` (line 713, col 867-1326) counts a batch: tool calls, other messages with visible content, sub-agents; returns nothing when all are zero.
- `mjt` + `EP` (line 712, col 9428-9713): label `"{n} tool call(s), {n} message(s), {n} subagent(s)"`, parts joined by `", "`, zero parts left out.
- `yjt` (line 712, col 9776-9901): a summary is open when it cannot collapse or was expanded by the user; collapsed by the user → closed; else its default. Collapsing is off while the turn runs and when the `garry_mode` setting ("Don't collapse tool calls") is on (`MDo` in renderApp).
- The summary row is a button `Expand|Collapse {label}` with a chevron and one icon per distinct tool name (`PDo`).

## Turn footer (`chat.message-actions`), from renderApp

- Shown only when the turn is complete (`MDo` → `TDo`).
- Duration `endTime - startTime` formatted by `$Pt(ms, {showTenths:false})`: `"{m}m, {s}s"` or `"{s}s"`; then `" · "` and the end time by `SDo`: today `h:mm AM`, within 6 days `Mon h:mm AM`, else `Nov 5, h:mm AM` (year when not this year). Hover shows agent/model, `start → end` and token counts.
- Hover range `OX(start) → OX(end)`, each `Nov 5, 2026, 10:29 AM`. `EDo` re-renders at local midnight so "today" moves.
- `MDo` takes `isNotComplete` from its row (the running turn), so a stopped turn is complete and keeps its time; read from the bundle, not run.
- OpenConductor (`turnTime.ts`): the same three formatters, fed by `TurnState.startedAt`/`endedAt` (#303); the hover is a `title` with the range only (no model or token counts yet), and the label is computed at render rather than re-rendered at midnight.
- Then "Copy final message" (icon button), a "More actions" menu (Fork to new tab, Fork to new workspace, Reset chat), and the turn's changed files: first 3 chips (or 2 plus a "+N more" button when there are more), each chip a file name with `+added -removed`.

### Changed-file chips in the footer row (`vDo`, `_Do`), from renderApp

Read from the decoded `renderApp-D_fmY7hW.js` (sha256 `5199d392…`, esbuild-reformatted; REA skips this chunk, rea-gaps.md 1) and `index-BGEQ8YjU.js` (sha256 `b5b01f33…`) for where the list comes from:
- The footer (`TDo`) is one row, `@container mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-xs`: time, agent badge, Copy final message + More actions, then the chips (`vDo`). Nothing is pushed to the right.
- The list is `useTurnChangesWithPreconditions` (`j9t`, index chunk): only once the turn is complete, `checkpointer diff session-<s>-turn-<t>-start …-end -- --name-status` and `--numstat`, cached per turn.
- Constants: `gDi = 3` (all chips when at most 3), `hDo = 2` (else the first 2), `bDi = 3` revealed per click, `pDo = 500` (a chip over 500 changed lines has no hover diff, tooltip "Open to view preview").
- First chips: a `flex min-w-0 max-w-fit flex-1 items-center gap-2 overflow-hidden` div, so they shrink rather than wrap. Revealed chips and the button: a `flex min-w-0 flex-wrap items-center gap-2` div that becomes `basis-full` (its own line) once anything is revealed.
- The button: outline `xs`, file icon, `+{all hidden} more`, then the hidden files' `+added -removed` (`ID`, `showZero`); tooltip and aria-label `Show {min(3, hidden)} more changed file(s)`. It is not shown once everything is revealed.
- Under a 480px-wide footer the first chips are hidden and the button shows the file count ("Show changed files" when none are hidden); the totals hide under 560px.
- Clicking a chip opens the file's diff with scope `{type: "turn", sessionId, turnId}`.
- OpenConductor (`TurnChanges.tsx`, `chipLayout` in `turnChangesCache.ts`): chips are the last items of the footer row, first chips shrink with names cut short, revealed chips and `+N more +a -d` wrap onto their own line. Not ported: the narrow-container (<480px / <560px) variants, the hover diff card, and the file icon.

## Cancelled turns (`chat.cancel` rendering), from renderApp

Read from the decoded `renderApp-D_fmY7hW.js` (REA skipped it, see rea-gaps.md), pretty-printed at `~/oc-chat-rea/renderApp.pretty.js`:
- Line ~171348: a user message with `messageType === "settled" && cancelledAt !== null` renders a caption `"Cancelled"` under its bubble (`mt-0.5 text-xs text-muted-foreground`, right-aligned for the user's own message) and no retry status.
- `gTr` (line ~307 of the chunk's helpers) matches error text containing `"aborted by user"` or `"Interrupted by user"`; the error message component (`hDi`, line ~171090) then renders only an outline badge `Interrupted by user` instead of the error.
- OpenConductor: the prompt of a stopped turn carries `cancelledAt` (reason.ts, from #303), drawn as the "Cancelled" caption; the cancelled turn's end row shows the outline "Interrupted by user" badge (it was "Stopped.").
