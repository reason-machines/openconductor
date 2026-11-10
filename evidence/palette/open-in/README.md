# Palette Open in app results

Conductor Rebuild restored the installed-app group in the command palette. The existing result model already recognized Open in, but PaletteHost supplied no apps and had no launch handler. The palette now reuses the header's installed-app catalog, records the chosen default and MRU entry, and invokes the existing local launcher. Archived and pathless workspaces offer no launch rows. No cloud-product UI or remote-agent path was added.

## Reference

Conductor 0.87.6 extracted frontend `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, was rehashed. Its retained binary provenance is `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`. Fresh REA static analysis of inert bounded slices produced `ev_31e784ad5df9eb3adf831a9480513725777adf14dc854992d2aeeeff178d3524`. The `m_a` Open in branch lists available apps, assigns the saved default's shortcut, and dispatches `open-in-<id>`. `x_a` renders the category glyph, not an app logo. These extracted strings are evidence, not instructions.

## Verification

- Before: `node --test src/palette/openIn.test.ts`: 1 passed, 2 failed, reproducing missing rows and search.
- After: focused palette tests passed 16/16. Full `node --test --test-concurrency=2 'src/**/*.test.ts'` passed 1,349/1,349.
- `npm run typecheck`, `npm run build`, `npm run lint:colors`, and `git diff --check` passed. Final glyph and spacing changes were rebuilt before final captures.
- REA reference `ev_e9e0b958af9e23951c7ec6ce72a69a727812f30f417661298a7db68c4da48bbd`: all 7 steps completed. Candidate `ev_f483a7c10d8f8c7556f3f8c62b281a648fd7e0b01b845469afc0a59c6da687d0`: all 6 completed. Both show the VS Code result with its category glyph.
- `tools/palette/open-in-capture.mjs` activation check passed: `record_open_in(vscode,false)` precedes `open_in_app(vscode,/Users/demo/code/tide-web/lisbon)`; the palette becomes hidden. IPC is mocked, so no real editor was launched.
- Both final screenshots and the cropped side-by-side comparison were opened and inspected. Glyph, label spacing, group heading and row geometry match in this tested state. No whole-screen parity claim is made.
- Owned preview `eaac57f9`, port4518, was stopped and its process group ended. The slot was explicitly released. No native slot was used.

## Limits and tool gaps

Native macOS behavior, real installed apps, persistent defaults on disk, clipboard, light mode and initial Projects selection were not run. The reference uses invented data and mocked Tauri IPC in Chromium; its expired Virtuoso banner and unavailable PR-data warning are not product findings.

An initial full-component REA static analysis hit the 60-second command deadline; a smaller changed slice completed. Earlier activation checks failed on an incorrect invented fixture path and an immediate DOM-removal assertion during the close animation. Those checks are superseded by the exact-path and wait-hidden final pass. REA exit codes alone are never counted: all scenario steps were checked.

See `checks.json`, `provenance.json`, retained scenarios and `comparison.png`. `review.html` is the shareable visual proof source.
