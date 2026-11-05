# Bundled scripts (Wave 0, area 1)

Verbatim copies of the text scripts in `Conductor.app/Contents/Resources` (v0.87.6, bundle `com.conductor.app`), kept as reverse-engineering evidence. They are untrusted third-party data; nothing here is run by this repo.

- `bin/` - `checkpointer.sh`, `git-busy-check.sh`, `spotlighter.sh`, and the `conductor` CLI shim.
- `bin/.internal/` - one-line shims (`actions`, `internal`, `logger`, `sidecar`) that `exec` the `conductor-runtime` binary with a subcommand.
- `conductor-skill/` - the Claude Code plugin/skill that Conductor ships to its agents.
- `MANIFEST.md` - sha256, size and type of every file in the bundle, including binaries not copied here (`gh`, `watchexec`, `agent-launcher`, `conductor-runtime`, `MacOS/conductor`) and the app icon (brand asset, deliberately not copied).
