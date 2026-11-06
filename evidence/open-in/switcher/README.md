# Held Open in chooser

## Source and behavior

Conductor 0.87.6's embedded `renderApp-D_fmY7hW.js`, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, was checked directly on Sven's authorized Mac. The shared decoded copy has the same hash. [Provenance](provenance.json) records the bounded slice, not a claim that static analysis observed execution.

REA 6.8.0 analyzed that inert slice as `ev_2ad26c30f6d0bd29b3f130ef325972040151b8e069e6d0e6832dfd1d66e92c4a`. [Summary and limitations](rea-static-summary.json). The relevant functions are `o9`, `Eco`, `WVn`, `Rco`, and `Nco`. The imported key-release function is index chunk `xQt`, exposed as `Oxr` to renderApp. The decoded index's `UBe` and `HBe` encode and read the `|local` and `|remote` MRU suffixes.

Observed source rules:

- Activating the chooser selects index zero. The overlay appears after 300 ms; cycling reveals it immediately.
- Available apps follow saved MRU order, then catalog order. A final Close entry fits within the viewport. Each column is 110 px; the surface has 24 px horizontal and 28 px vertical padding and is 144 px high.
- Command+O cycles forward. Shift+Command+O cycles backward while active; otherwise it opens the numbered menu.
- Releasing a bound modifier opens the selected app. An unmodified override opens on key release. Escape release and window blur cancel. Choosing Close cancels.
- Pointer clicks on the header still open immediately. Pointer clicks on a chooser tile choose that app.

`AppSwitcher` owns the transient selection and timer. `OpenInButton` still owns actual opening, saved preferences, the split button, and its numbered menu. No App, palette TypeScript, or shared ContextMenu wiring changes were needed. The chooser and palette CSS now reproduce the original `.lucide` one-pixel, non-scaling strokes. The exact original CSS filename, hash, offset, and declaration are recorded in the provenance file. Model the Domain shaped the nullable selection record; Prove It Works shaped the rerunnable browser checks.

## Verification

The isolated harness runs the built frontend, not source components, and replaces only backend dependencies. All workspace paths and calls are fake. No real playground, bergen, agent credentials, or local sessions are touched.

- `npm run typecheck`: passed.
- `node --test "src/**/*.test.ts"`: passed, 1254 tests.
- `node --test src/features/openIn/*.test.ts`: passed, 9 tests.
- Color scan: passed, 692 source files.
- `npx vite build`: passed.
- `OPEN_IN_BASE_URL=http://127.0.0.1:4518 node --test tests/e2e/open-in-switcher.e2e.mjs`: main before the fix failed 3 of 4 tests; after the fix passed 4 of 4. The decisive failure was `no app may open on keydown before Command is released`, actual 1, expected 0. [Before](before-tests.txt), [after](after-tests.txt).

The server starts through Reason's preview tool. `OPEN_IN_VERIFY=tests` runs those tests in the server's network namespace; a separate Bash sandbox cannot reach that localhost listener. The ordinary E2E suite also supports its existing Vite preview pattern without `OPEN_IN_BASE_URL`.

## Visual evidence

`tools/open-in/capture.mjs` drives the decoded reference and our built frontend using the same viewport and installed-app set. Reference and implementation captures cover the first app, the next app, and Close. See the capture record for bounds, labels, hashes, and close-button markup.

The initial [unmatched icon branches](unmatched-icon-branches/captures.json) are retained rather than scored as a match: the original mock lacked native bundle icons and used its 69 px catalog artwork; our mock supplied native icons and drew them at 88 px. The final harness explicitly supplies the native-icon branch to both implementations. This is dependency availability, not screenshot resizing or masking.

The unchanged numbered menu's dark and light evidence remains in [the Open in report](../README.md). Fresh command palette All, search, and no-results images are under `screens/`. Each has its own REA `capture-browser-scenario` evidence ID in `screens/captures.json`. Both implementations use dark Stone for this comparison. Neutral remains supported but was not used to claim a Stone color match. The fake backend is seeded with the reference workspace's visible title when testing search; unrelated sidebar datasets still differ. No screenshot fields are resized, recolored, or masked.

Separate verdicts:

- **Open in:** first, next, and Close chooser states have the same 928 by 144 bounds at 1280 by 820, tile layout, labels, native-icon branch, and one-pixel close glyph. Glass reveals different underlying workspace content, so these images are not a whole-window pixel-match claim. The numbered menu is unchanged and reuses its dark and light evidence.
- **Palette:** the All dialog matches the reference layout, Stone tokens, row spacing, shortcuts, and icon weights in the fresh REA pair. Search and no-results have separate raw captures. Workspaces filters, Projects tab contents, keyboard overrides, and the separate Experimental cloud-entry gate are not promoted by this check.
- **Global menus:** no implementation changes. #695, #697, and #713 were inspected and were already merged; their PR, chat-link, Review, Help, account, and diagnostics work was not duplicated. Packaged native menu ordering is still unverified.

Earlier palette evidence from #705 remains in [the shell comparison](../../../parity/side-by-side/shell-palette-01-all.png), [search](../../../parity/side-by-side/shell-palette-02-search.png), and [no results](../../../parity/side-by-side/shell-palette-03-no-results.png). Experimental cloud-entry gating belongs to its separate owner.

Not verified here: the packaged macOS WKWebView, actual external-app launch or clipboard on the Mac, remote chooser targets, light-theme chooser, or the Experimental cloud-entry gate. Native launch and backend preference persistence are unchanged.

## REA limitations encountered

1. Native `rea search /Applications/Conductor.app AppSwitcher` could not select a configured provider on the Mac. Ghidra lacked its Java runtime/install configuration; the other advertised native providers were unavailable. We used the verified decoded frontend instead. This is not a negative search result.
2. `rea search ... --format json --token-limit 2200` refuses structured output with token windows. The next call removed the token limit. This was a CLI constraint, not a target finding.
3. REA's browser scenario actions have `press` but no separate key-down and key-up operation. They cannot leave Command held for the chooser capture. A normal Playwright keyboard sequence supplies those captures; REA static evidence supports the behavior rules. No claim is made that REA captured the held-key state itself.
