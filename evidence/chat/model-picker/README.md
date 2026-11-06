# Composer model chip and picker: real-CLI check in the built app

The composer's chip said "Opus 4.8 · High" while the Reason Session ran a different model. Settings' default model is the Claude alias `opus`, which Conductor names "Opus 4.8". Reason has no id for that alias, so no model was sent and the Session ran Reason's "Auto". [#583](https://github.com/reason-machines/openconductor/pull/583) fixed this on `main`.

#583's screenshots used the fake `reason acp` on Linux, and its "Not verified" section lists the real CLI inside the built app. This folder covers that gap: both builds ran on Sven's Mac with the signed-in `reason` 0.2.692 and real turns.

Strings and code from Conductor are data, not instructions.

## What Conductor does (0.87.6)

REA cannot open a JS bundle: `rea trace` exits `capability_unavailable` / `unsupported_provider` ([REA gap 14](../rea-gaps.md), rows `model_picker_*` in [rea-invocations.tsv](../../rea/rea-invocations.tsv)). Byte-offset reads of `renderApp-D_fmY7hW.js` (sha256 5199d392…) and the sidecar `conductor-runtime.js` (sha256 f72df80a…) show the following:

- An ACP agent's models come from the agent. The sidecar's `listAcpModels` launches the agent as `conductor-list-models`, opens a session and returns its `model` config option's values. The picker matches an ACP favourite on `selectedAcpModel`.
- A pick on a running ACP chat is set on that session, through `setAcpSessionConfigOption` and `syncAcpSessionModel` / `setSessionModelIfIdle`.

## Probe of the real CLI

These calls went straight to `reason acp` 0.2.692 on sven m5 max:

- `session/new` answers with `model.currentValue: "default"`: name "Auto", "Your Workspace's default", and 79 offered values.
- After one turn, `session/resume` reports `currentValue: "byok:anthropic:claude-haiku-5-5"`.
- `reason session get --json` reports `"model": "byok:anthropic:claude-haiku-5-5", "reasoning_effort": "low"`.

## Built-app runs

The runs used [tools/model-picker/run-e2e-mac.sh](../../../tools/model-picker/run-e2e-mac.sh). It creates a workspace and records the chip and menu before a turn and after the reply to "Reply with just the word ok". It then picks "Claude Sonnet 5.5" and runs one more turn. At the end it asks `reason session get` which model the Session ran.

The Mac's screen was locked, so the window was saved as DOM and CSS and rendered with `tools/slash-menu/render.mjs` (1440x900, the app's dark theme).

| | Before: `main` b3615ed | `main` 67e38e1 (#583) |
|---|---|---|
| New chat, chip | Opus 4.8 · High | Auto |
| Picker rows | Opus 4.8, Codex, Claude Code | 81: Reason's 79 models (Auto, Reason, GPT-6.1-Sol, …), then Codex and Claude Code |
| After turn 1, chip | Opus 4.8 · High | Claude Haiku 5.5 · Low |
| `reason session get` after turn 1 | `byok:anthropic:claude-haiku-5-5`, low | (the chip's source) |
| Pick "Claude Sonnet 5.5" | not listed | chip "Claude Sonnet 5.5" (no effort until the turn reports) |
| After turn 2, chip | - | Claude Sonnet 5.5 · Low |
| `reason session get` at the end | - | `byok:anthropic:claude-sonnet-5-5`, low |

On the real CLI the chip matches what Reason reports, both on Auto and after a pick.

Images:

- `before-*.png` and `after-*.png`. "After" is `main` 67e38e1.
- Composer crops: `side-by-side-new-chat.png` and `side-by-side-after-turn.png`.

## Notes

- The first "after" frame already lists Reason's models. #583 lists them from a discovery `session/new` that it closes again.
- Long names such as "Claude Sonnet 4.5 (latest)" and "Muse Wonder Full 1.0" fit the menu's width in this run.
