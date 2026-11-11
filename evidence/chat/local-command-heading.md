# Local-command permission heading

Conductor Rebuild, 7 November 2026. Source-only correction based on main `e7ab5573db98bcff0a95e948e55fc119822c6c0d`.

## Retained REA reference

Conductor 0.87.6's decoded `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The retained decoded asset was rehashed and its `Xpo` function inspected for this correction. Extraction provenance is in [chat status evidence](../chat-status/README.md) and the [asset manifest](../frontend/tauri-assets-manifest.json). This does not establish the identity of a freshly installed app.

`Xpo` maps the exact tool name `mcp__conductor__RunLocalCommand` to “Do you want to run this command on your Mac?”; `Jpo` uses `Xpo(toolCall?.name)` for the approval heading. Other MCP tools take the generic fallback. OpenConductor omitted this exact-name case.

## Regression

Command: `node --experimental-strip-types --test src/features/chat/permissionPrompts.test.ts`.

Before the implementation change, the new regression failed: expected “Do you want to run this command on your Mac?”, actual “Do you want to run this tool?” (4 passed, 1 failed). After adding the exact-name case, all 5 tests passed. The regression also preserves Bash, BashOutput, ACP execute and a different MCP namespace's existing headings.

`node --experimental-strip-types --test 'src/**/*.test.ts'` passed all 1,359 tests, with zero failures or skips. `git diff --check` passed.

## Limits

Only heading selection changed; permission delivery, tool mapping, authorization options and execution are unchanged. Browser screenshots, runtime rendering, packaging, live providers and native macOS checks were not run in this source/test assignment. No runtime capture admission was consumed. This is not native or whole-screen parity evidence.
