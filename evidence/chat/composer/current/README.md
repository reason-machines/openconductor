# Composer pass, Conductor 0.87.6

Conductor Rebuild, 2026-11-06. This pass adds file suggestions and fixes attachment-only messages. It does not claim complete composer parity.

## Source identity and evidence

The reference is Conductor's decoded frontend, not a native app capture. The shared read-only `conductor-ref/dist` cache matches the app installed on Sven's authorized Mac. The render chunk SHA256 was checked directly on both machines in this Session:

- `renderApp-D_fmY7hW.js`: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Coordinator's independently checked binary SHA256: `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
- Manifest: [frontend asset identity](../../../frontend/tauri-assets-manifest.json).
- Earlier REA composer captures: [composer.json](../composer.json). PR #673 is already merged and supplies the minimized diff-tab behavior. PR #684 covers other chat dialogs, not file mentions.

New REA 6.8.0 `capture-browser-scenario` runs are recorded in [reference-captures.json](reference-captures.json) and [ours-captures.json](ours-captures.json), including their Evidence IDs and exact scenario inputs. Both use Chromium, 1440×900, scale 1, dark Stone palette. Reference IPC is synthetic and blocks external requests. OpenConductor's isolated component fixture mounts the real Composer and ModelPicker, with no agent calls and no real workspace data.

The following facts were read directly from the hash-matched decoded render chunk because REA cannot read these JS source ranges. Offsets below are decoded character offsets, not native addresses:

- `Gzt` at 7,534,714 maps ranked file matches to workspace-relative labels and absolute IDs. `qzt` at 7,535,145 draws a 12px file icon, basename, directory, match highlights and focused row.
- Mention query `MI` at 8,627,354 requests files per query with `fuzzy_filter_files`. The `@` selection branch at 8,634,168 inserts a structured mention using `nce`.
- `eki` at 7,534,007 inserts a mention atom and trailing space. `C1o` serializes an atom as `@⟦label⟧(id)`.
- `X9` at 8,639,172 is `g.trim().length > 0 || x.length > 0`: text or attachments count as composer input.
- `a7i` at approximately 7,908,928 conditionally offers Add attachment, Link issue, Link workspaces and Plan mode.

## Changes and checks

- Composer queries the existing local/native fuzzy file API at the active `@` token. Each result belongs to its workspace and query. Cleanup invalidates late responses. Email text and selected ranges do not trigger suggestions.
- Arrow keys navigate, Enter or Tab picks, Escape dismisses, and a click preserves editor focus. Picking replaces the whole token and preserves surrounding text. Filename highlights preserve Unicode code points while using the backend's UTF-16 offsets.
- The explicit `hasAttachments` prop enables Send for real files, not an error-only React node. Plan feedback still requires text because its callback does not send attachments.
- The queue accepts attachment-only start, steer and queued messages. Saving blank text no longer deletes attached files. Empty queued rows show attachment names.
- Model menu selected rows use the observed selected highlight. Mention rows inherit the reference's 20px line height.

Passed:

- `npm run build`, including TypeScript checking. Vite reports its existing large-chunk warning.
- `node --test --test-concurrency=4 "src/**/*.test.ts"`: 1,255 passed, zero failures.
- `npm run lint:colors`: six checker tests passed and no forbidden colour literals.
- `git diff --check`.
- `CHECK_COMPOSER=1 node tools/composer/serve.mjs ours`, started with `preview_start`: six browser interaction checks passed. They cover file selection before submit, ArrowDown/Tab, email and Escape, slash coexistence, multiline scroll and shrink, file-only Send, queued file-only follow-up, and Stop. The fixture receives actual disposable file selections.

Before the queue fix, the new attachment-only regression failed because `submit(emptyQueue(), "", ..., attachments)` returned no start effect. The same regression passes after the fix. Before the mention fix, typing `@` in the real Composer demo produced no suggestion popup.

One full-suite run without a concurrency cap timed out after 90 seconds under shared load. The capped run above completed successfully. No test was disabled or weakened.

## Side-by-side verdict

The `pair-*.png` images put the decoded Conductor frontend on the left and the real OpenConductor component fixture on the right. They are unscaled crops of the same viewport, not pixel-normalized screenshots.

- Empty, focused and multiline: box geometry, padding, text, controls and multiline line spacing match in the inspected crops. The component fixture has no transcript unread pill. The reference's unread pill is not a composer mismatch.
- File menu: functional and closely aligned. Icon mapping still differs for README.md. Picking remains textual completion rather than Conductor's atomic mention chip.
- Model menu: layout matches. The neutral agent glyph intentionally differs from Conductor's agent logo. This fixture has the same one favourite model, but does not prove all runtime-provided model lists.
- Add menu: partial. Add attachment is present, but Link workspaces and Plan mode are not implemented. Issue linking is not in this pass.
- Working Send, Queue and Stop: browser interaction checks pass. No fresh native Conductor running-agent capture was made; existing working reference shots remain supporting evidence only.
- Minimized diff/PR composer: unchanged from #673, not rerun here.

Not run: native macOS/WebKit verification, actual Claude Code/Codex/Reason prompts, production or signed-in agent behavior, deferred async-response race tests, and rich mention-chip serialization. No cloud execution path for local Claude Code or Codex was added.

## REA and observation gaps

1. A REA browser capture launched from ordinary cloud Bash failed with generic `execution_failure` and `cleanup_incomplete`, without naming the navigation cause. A direct Playwright check then showed `ERR_CONNECTION_REFUSED`: Bash and preview processes have separate localhost contexts. `rea doctor` did not identify that cause. The fix is the checked-in preview-owned verifier launcher, which runs the server and asynchronous capture in the same network context. REA captures then passed.
2. REA's JS search/source-range limitation remains the one documented in [chat REA gaps](../../rea-gaps.md). The source facts above are direct decoded-bundle reads, not successful REA source analysis.
3. A verifier-only model selector initially used OpenConductor's test ID for Conductor and timed out. It now uses the observed reference `aria-label^="Change agent"`. That was a fixture mistake, not a Conductor behavior failure.
4. The reference file-search mock previously returned no results, so the old `@` capture contained only terminal/directory built-ins. `oc_mention_files=1` now supplies deterministic local file matches and survives route navigation. This is synthetic data, not a claim about Sven's workspace contents.

## Reproduce

Start each command below with Reason's `preview_start`, one at a time, then stop that Session's server after capture:

```bash
# Port 4428. DIST points to the verified read-only decoded frontend.
DIST=/home/runner/conductor-ref/dist CAPTURE_COMPOSER=1 node tools/composer/serve.mjs reference empty focused multiline mention plus model

# Port 4427. No server is started by check.mjs or capture.mjs themselves.
CHECK_COMPOSER=1 CAPTURE_COMPOSER=1 node tools/composer/serve.mjs ours empty focused multiline mention plus model
```

Compose the saved crops with `python3 tools/composer/compose.py`. The root shared `node_modules` was not reinstalled or changed. Only the screenshot fixture's separate one-package `tools/screens/node_modules` was installed.
