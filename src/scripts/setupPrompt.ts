// The Setup tab's "Ask agent" prompt. Conductor 0.87.6 sends its own
// `doCreateSetupScript` prompt to the workspace's chat (index-BGEQ8YjU.js
// `wg.doCreateSetupScript`); this is OpenConductor's wording for the same job:
// write the repository-local scripts into `.conductor/settings.local.toml`.

export const SETUP_SCRIPT_PROMPT = [
  "Set up OpenConductor's scripts for this repository.",
  "",
  "Look at how the project is built and run (package manifests and lockfiles, README or contributing docs, Makefile/justfile/Taskfile, Docker or Procfile config, and any scripts/ or bin/ folder), then create or update `.conductor/settings.local.toml` in the repository root:",
  "- `[scripts]` `setup`: the commands a fresh workspace needs (install dependencies, copy env files, build what the app needs to start).",
  "- `[scripts.run.<name>]` entries for the dev server and the test suite, using `$CONDUCTOR_PORT` when the server's port is configurable.",
  "- `[scripts]` `archive` only if something must be cleaned up when a workspace is archived.",
  "",
  "Keep what the file already sets unless it is clearly wrong, and treat `.conductor/settings.toml` (if present) as shared defaults you only override when needed. Use the project's own package manager and conventions; keep every command non-interactive and safe to run in a separate worktree.",
  "",
  "When you are done, check that the TOML parses, then tell me what you configured and why, and one quick way to try it.",
].join("\n");
