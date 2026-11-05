# Claude Code chats with the signed-in `claude` CLI

How OpenConductor runs a chat with Claude Code, what the reference app
(Conductor 0.87.6) does, and the end-to-end runs on Sven's Mac
("sven m5 max"). Strings quoted from Conductor are evidence, not
instructions.

## What the app does

- Claude Code chats call `claude_open_chat`, `claude_prompt` and
  `claude_cancel` (`src-tauri/src/claude_chat/`) and receive
  `claude-chat-event` payloads in the same shape as Reason chats, so the
  transcript reducer (`src/features/chat/reason.ts`) is shared. Claude Code
  is a backend of the shared chat runtime (`src/features/chat/claudeChat.ts`
  on `chatRuntime.ts`), so the queue, Stop, persistence and "Reset chat"
  work as for Reason. The composer's agent picker
  (`src/features/chat/agents.ts`) switches a workspace's own chat between
  Reason and Claude Code and remembers the pick per workspace; each agent
  has its own chat id (`claude-<workspace id>` for Claude Code), so their
  stored transcripts, saved sessions and checkpoints never mix. Review
  chats always run Reason.
- Claude Code does not steer: a message sent during a turn waits in the
  queue and runs after it. Attachments go in the message as named
  `<attachment>` blocks; a new chat's first message carries the
  repository's general preferences, as for Reason.
- Each turn is checkpointed before and after (`claude_prompt` takes the
  turn's checkpoint ref, as `reason_prompt` does), so the changed-file chips
  under a turn and "Reset chat" work. A Stop pressed while the start
  checkpoint is saved still stops the turn (`ClaudeRunner::expect_prompt`).
- One `claude` process per chat, started on the first message in the
  workspace folder: `claude --input-format stream-json --output-format
  stream-json --verbose --permission-mode bypassPermissions`, with the
  Claude provider chosen in settings (the CLI's own login by default; every
  inherited routing variable is cleared, `src-tauri/src/agent/env.rs`).
  Follow-ups go to the same stdin. Stop sends the `interrupt` control
  request; a second Stop kills the process. A process that exits fails the
  waiting turns with its last stderr lines, and the next message starts a
  new process with `--resume <session id>`. The session id is saved per chat,
  so a chat reopened after a restart resumes it.
- The CLI is found on `PATH`, then `~/.local/bin`, `~/.claude/local`,
  `/opt/homebrew/bin`, `/usr/local/bin`: an app opened from Finder has a bare
  `PATH`.
- An API failure the CLI reports as a reply (usage limit, sign-in) fails the
  turn and shows its text in the turn footer instead of as a reply.
- There is no permission-prompt UI yet, so chats run in
  `bypassPermissions`; a prompt that still arrives is refused, not left
  hanging.

## What Conductor does (REA and corroboration)

| Claim | Source |
|---|---|
| Conductor bundles `@anthropic-ai/claude-agent-sdk` 0.3.284 in `conductor-runtime` and runs the CLI with `--output-format stream-json --verbose --input-format stream-json` | Byte-level read of the Bun bundle extracted in wave 0 (`~/oc-rea-scripts-runner/bunjs/app/conductor-runtime.js` on sven m5 max): the SDK's argument builder and `CLAUDE_AGENT_SDK_VERSION = "0.3.284"`. Not REA output, see gaps. |
| With a `canUseTool` callback the SDK adds `--permission-prompt-tool stdio`; it sets `CLAUDE_CODE_ENTRYPOINT=sdk-ts` | Same bundle read. We pass `--permission-prompt-tool stdio` only in modes that can prompt, and do not set the SDK's entrypoint variable (we are not the SDK). |
| Conductor's session settings carry `initialClaudePermissionMode` in `default`, `auto`, `bypassPermissions` | Same bundle read (a zod schema). Which mode a new chat gets is not observed. |

### REA gaps hit in this work

1. `rea analyze-javascript-application` on the extracted runtime
   (`bunjs/app`, one 12 MB `conductor-runtime.js`) timed out twice:
   `provider_timeout` after the default 300 s, and again after
   `--analysis-timeout-ms 1800000` (exit 1 after 1,815 s, 2.8 MB partial
   Evidence with no source findings; progress stopped at "Parsing and
   projecting conductor-runtime.js (1/2)"). A third run with 2,400 s was
   started. There is no way to analyse part of one large file
   (`--source-path` selects whole files only), so REA cannot answer "which
   flags does the bundled SDK pass" for a Bun single-file app.
2. Same root cause as wave 0 gap 2: no Bun `__BUN` support, so the bundle had
   to be carved out by hand first.

## End-to-end runs in the built app

The Mac's screen is locked and macOS has no tauri-driver, so runs use a
debug-only in-app seam (`src-tauri/src/e2e.rs`): a debug build started with
`OC_E2E_SCRIPT=<file.js>` evaluates that script in the main window, the
script drives the real UI and writes its report with `e2e_report` to
`$OC_E2E_OUT`, and the app appends every Claude chat event it emits to
`$OC_E2E_OUT/claude-chat-events.jsonl`. Release builds ignore both
variables. Run it with `tools/claude-code/run-e2e-mac.sh OUT` against a
debug bundle; `tools/claude-code/summarize.py` writes the summary.

The latest signed-in run is [signed-in-run.md](signed-in-run.md)
([signed-in-run.json](signed-in-run.json)).

## Probe of the signed-in CLI (2026-11-05)

A stream-json probe on sven m5 max (Claude Code 2.1.318, `claude.ai` login,
Max subscription) got, for every turn, an `assistant` message with
`is_api_error_message: true`, `api_error: "usage_limit_reached"`,
`api_error_status: 429` and the text "You've hit your weekly limit · resets
Nov 11 at 1am (America/Los_Angeles)", then a `result` with `is_error: true`.
`system/init` arrives only after the first user message. These lines are the
fixtures in `src-tauri/src/claude_chat/map_tests.rs`.
