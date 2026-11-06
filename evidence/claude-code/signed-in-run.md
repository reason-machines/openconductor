# Claude Code: signed-in run in the built app

Run 2 on Sven's Mac ("sven m5 max", macOS 26.4, arm64), 2026-11-05 16:00 UTC,
with `tools/claude-code/run-e2e-mac.sh` against the signed debug bundle.
Summary: [signed-in-run.json](signed-in-run.json).
**Result: blocked by the account's usage limit**, not a pass.

![OpenConductor Claude Code chat on sven m5 max](https://api.reasonmachines.com/media/pr-screenshots/50bea920-1058-4e50-a855-cc623b7a259a/20dd700020152e3cfc1bc9475b47b854/efb3635f-8afe-41a0-9b44-12712f2eeb51.png#w=2560&h=1640)

The image is a render of the window's DOM and stylesheets as the driver
captured them, in Chrome: the Mac's screen was locked, so no window
screenshot was possible. A `<select>`'s live value is not part of serialized
HTML, so the Claude Code option was marked selected for the render; the
driver read `claude` from the live element.

| Step | Observed |
|---|---|
| CLI | `/Users/sven/.local/bin/claude` 2.1.318, `loggedIn: true`, `claude.ai`, Max |
| Open project, Create workspace | fixture repo added; worktree created (renamed after the first message to `run-bash-tool-then`) |
| Agent picker | Claude Code; empty-state note "Claude Code runs this chat with your signed-in claude CLI." |
| Session | `sessionStarted` `ea6983d4-...`, saved under `openconductor.claude.session.<chat>` |
| Turns 1-4 | each `error` `usage_limit_reached` (429) then `turnEnded` `failed` with "You've hit your weekly limit · resets Nov 11 at 1am (America/Los_Angeles)", shown in the turn footer with Retry, not as a reply |
| Stop (turn 3) | not exercised: the turn failed before a tool ran |

## Driver note

Run 1 stalled: with the screen locked, WKWebView throttled the driver's
timers so far that it never reached Send in 13 minutes. The driver's waits
now also wake on DOM mutations, and it writes `claude-turn-progress.json`
after every step; run 2 finished in 6 seconds.

## Not covered (needs quota on the login)

A completed reply, tool rows (`Bash: pwd`, `Write: claude-check.txt`), the
file in the worktree, Stop on a running `sleep 120`, and a turn after Stop.
