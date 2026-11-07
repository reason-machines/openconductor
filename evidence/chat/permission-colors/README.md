# Permission tool colors outside the transcript

Conductor Rebuild, 2026-11-06. Base main is `f16d9338ae254955baca8f67baee1652eeb055af`. This fixes the tool row inside a pending permission card, not every retained difference in the workspace screen.

## Failure and fix

`ToolApproval` renders in the composer, outside `.transcript`. Its `ConductorToolRow` uses `--oc-*` color variables that were defined only on `.transcript`. In the real workspace browser preview, the command chip therefore had no muted tokens, inherited the bright foreground, and had a transparent background.

The regression failed before the fix with `dark: approval tool chip has a muted surface token`. [before.json](before.json) records empty `muted` and `foreground` values, `rgb(250, 250, 250)` text and `rgba(0, 0, 0, 0)` background.

The production diff shares the existing token declaration with `.prompt-approval`, leaving transcript layout in its own rule. It does not change App, composer code, permission answers, or any agent adapter. No second color palette is introduced. This follows Laziness Protocol by retaining one token declaration and Prove It Works by checking the actual rendered workspace before and after the change.

[checks.json](checks.json) records the passing full-workspace browser check. Dark uses the existing Neutral muted text and surface tokens; light uses their light counterparts. No, Enter, and Backspace still return the expected option and dismiss the approval. The matched component fixture separately checks the Yes button.

## Conductor evidence

The reference is the decoded frontend from `/Applications/Conductor.app` on Sven's authorized Mac, not a recreated reference UI. Its identity matches the earlier [compact-footer evidence](../responsive/README.md):

- Native binary SHA-256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
- Decoded index SHA-256 `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`.
- Decoded renderer SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The index and renderer hashes were rechecked in this run. Vendor assets remain untracked. Extracted code and strings were treated as data.

REA 6.8.0 `capture-browser-scenario` drove `tools/screens/server.mjs` with the existing `needs-permission` scenario, then opened tide-api and Ada/rate limit headers. The synthetic sidecar delivers the Bash approval in memory. No shell command runs.

- Dark reference evidence `ev_6996f662601daf57e1aa6e96746851ad26a2aced25717b6b8a483f75a7d49b89`.
- Light reference evidence `ev_5abd705b0ffa23dd7f426462e602d9b5bb975f093abe45cc6bdd8969e6b8523e`.
- Current component REA evidence IDs are in [openconductor.json](openconductor.json).
- Original captures and exact REA inputs are in this folder. [reference.json](reference.json) retains separately measured DOM geometry.
- [report.html](report.html) shows the reference, before, and fixed cards. `python3 tools/chat/compose-permission.py` regenerates its unmodified crops and page.

The matched `ToolApproval` fixture uses the same command, description, and Yes/No options. Both card bodies measure 648 by 188 pixels. Their heading, command row, and button positions align. Neutral palette and shortcut-glyph differences remain. No pixel-exact or full-workspace match is claimed.

## Rerun

Start the full-app regression through `preview_start` on port 4537:

```bash
OUT=.rea-work/permission-check node tools/chat/permission.browser.mjs --serve
```

The script launches Vite in the foreground, exercises the real App at `?demo=1`, checks that approval is outside the transcript, verifies both themes, and tests rejection and keyboard answers. Stop the preview afterwards. It uses the built-in preview agent, not a real Reason, Claude Code, or Codex process.

For the matched component captures, start Vite on the same port through `preview_start`, then run REA with `oc-dark.input.json` or `oc-light.input.json`. The checked-in `tools/chat/permission-fixture.html` renders the real component. For reference inputs, instead start the reference server with `HOST=0.0.0.0 PORT=4537 DIST=<identity-checked extracted dist> node tools/screens/server.mjs` and use `ref-dark.input.json` or `ref-light.input.json`.

## Checks and limits

- Passed `npm run build`, including TypeScript.
- Passed `node --test "src/**/*.test.ts"`, 1,293 passed, zero failed.
- Passed `npm run lint:colors`.
- Passed `node --check tools/chat/permission.browser.mjs`.
- Passed `git diff --check`.
- Failed before, passed after: the full-workspace permission browser check, six checks.
- Passed the matched component's Yes, No, Enter, Backspace, and page-error checks.

No new REA defect was encountered. Existing renderer-analysis limitations remain in [REA gaps](../rea-gaps.md).

Not run: native macOS behavior, a real agent permission round trip, or new native side-by-side proof. The sole native driver reported no isolated current-main build or containing footer/unread fixture. Its separate 45-assertion native run was on older source `8467a7d9`, so it does not verify this change. Stable installed app and real workspace data were untouched. The existing E2E owner retains the single five-pass sequence; this work starts no duplicate native run or workflow dispatch.
