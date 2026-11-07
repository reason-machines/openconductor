# Find in script output

Owner: Conductor Rebuild, terminal/scripts area. Follow-up to PR #719.

## Reference identity and source

Read-only source inspection on Sven's authorized `sven m5 max`, 2026-11-06. The source is the existing extraction of `/Applications/Conductor.app` 0.87.6, not a newly downloaded build. No app was driven, launched, quit, or replaced.

`renderApp-D_fmY7hW.js` SHA-256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The exact UTF-8 byte offsets below were recalculated from the extracted file. Older terminal notes label some character offsets as bytes; do not interchange them.

- `gno`, byte 6,926,664 (character 6,883,517): Setup's read-only terminal configures `disableStdin: true`, `showCursor: false`, calls `dzt`, registers `terminal.search` at terminal priority, and renders `b9e` with placeholder `Find`. Its relative padded container has `data-terminal` and click-to-focus.
- `dzt`, byte 6,925,136 (character 6,881,989): owns open/query/index/focus-trigger state; recomputes matches on terminal render, clears selection and focuses the terminal on close, and wraps next/previous navigation.
- `b9e`, byte 6,572,763 (character 6,529,805): shared Find bar, `n of m` counter, Previous match / Next match / Close search; Enter and Shift+Enter navigate; Escape closes. Opening or re-requesting search focuses and selects the query. The floating bar is top 8 px, right 16 px, width 384 px, padding 8 px by 12 px, gap 12 px. Navigation buttons preserve input focus.
- `OJs`, byte 6,571,868 (character 6,528,910): Run output registers a run surface through `xEi` (byte 6,568,897), not directly through `gno`. This static read alone does not prove the complete Run surface's Find lifecycle.

Prior extraction and REA boundary: [terminal evidence](../NOTES.md), [output evidence](../output/NOTES.md), and [run-script evidence S4](../../run-scripts/NOTES.md).

## Implementation shape

The shared Find controller operates on a lazily resolved xterm instance. Interactive terminals retain their existing tab-store request adapter; script output supplies its own read-only renderer. This avoids a duplicate matching implementation or registering a script renderer as a PTY session. No IPC, shell, PTY, credential, or cloud-workspace path is added.

Type System Discipline keeps the target a typed `Terminal` getter; Model the Domain keeps one search-state owner for both terminal surfaces. The alternative, copying the interactive hook into `ScriptOutput`, was rejected because query matching and focus behavior would drift.

## Verification

- `npm run build`: passed. This includes TypeScript. The final build includes the Find background and width corrections seen in the final capture.
- `npm run typecheck`: passed.
- `node --test src/features/terminal/find.test.ts src/features/terminal/shortcuts.test.ts src/scripts/*.test.ts`: passed, 31 tests.
- `npm run lint:colors`: passed.
- `git diff --check`: passed.
- `E2E_BASE=http://127.0.0.1:4402 node --test --test-name-pattern='supports Find' tests/e2e/script-output.e2e.mjs`: baseline failed both cases because neither Setup nor Run had a Find input. See `before.tap`.
- `E2E_BASE=http://127.0.0.1:4402 OC_SHOT_DIR=evidence/terminal/find node --test tests/e2e/script-output.e2e.mjs`: passed all five cases against the final built implementation. See `after.tap`. This runs in the supported preview process with isolated fake IPC. It checks Find focus, case-insensitive results, Enter and Shift+Enter wraparound, button focus retention, repeated open/select, live append, no-match disabled buttons, Escape focus restoration, existing ANSI/progress behavior, and zero PTY calls for the read-only output. A fifth case verifies that interactive terminal Find still opens, matches case-insensitively, closes, and restores focus through the existing tab adapter. Its PTY is a browser fixture, not a native shell.
- Fresh `REA capture-browser-scenario` captures passed. Reference `ev_b7fc387ce8d4cf1216b6dd6353745ac0371c4d6297b7e3a263ba2e244b17fdd0`; final OpenConductor `ev_af928c4bcfb96dce3fb7689b6cb43322cff1d86cdc13f05646e8725183ab0a40`. Scenarios and screenshot hashes are in `captures.json`.
- `REA=/home/runner/rea/node_modules/.bin/rea OC_LABEL='OpenConductor Find' python3 tools/terminal/output-review.py evidence/terminal/find`: passed, producing exact and threshold-24 comparison evidence. Both screenshots were cropped at `(939, 410, 1280, 820)` with no pixel, palette, or geometry normalization.
- All local previews were stopped after the bounded checks.

The comparison selects Stone in OpenConductor's fake settings to match the reference's warm dark palette. This is matched-setting proof, not a fix or proof of default-palette parity. The underlying surrounding workspace fixtures still differ and are excluded by the panel crop.

## Visible verdict

PARTIAL. Find now has the same counter, width, clipped narrow-panel shape, and background in the compared Setup state. The strip still has the extra running dot, different label/underline spacing, and a small vertical offset. The reference also shows an outlined terminal cursor absent from the read-only OpenConductor view. Full native terminal tabs and runtime behavior remain unverified.

Find is included in the existing PR #719 against main, not a stacked PR. The earlier empty-chat CI failure occurred before picker interaction on head `3851505c`; main's merged #714 replaces the obsolete preference-write/reload navigation with visible sidebar interaction while preserving model assertions. The integrated local head includes main `1dc803d4`, and the build, 31 focused unit tests, color lint and whitespace checks passed again. This is not a claim that the built-app CI or native macOS tests have passed on the new publication.

## REA gaps and limits

The existing REA JavaScript semantic graph does not model the React hooks, xterm buffer calls, or all minified cross-chunk aliases. The focused original-source reads above complement the existing REA extraction evidence. Fresh REA browser scenarios corroborate the rendered Setup Find state, not native execution. See `REA-GAPS.md` for this continuation's capture-assertion correction.

The historical shared reference directory `/home/runner/conductor-ref/dist` was absent in this Session's current scoped cloud filesystem. Own retained Session history identified the already-copied `.oc-tmp/terminal-ref/dist` resource, which remains available. Its renderApp hash matches the Mac original above; index.html SHA-256 is `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`. No permission denial, private Session path access, broad filesystem search, or new transfer occurred.

Native macOS UI, real script processes, PTY execution, exact palette parity, and the remaining strip/tab differences are not verified by these source reads or unit tests. Real playground and Bergen data were not touched.
