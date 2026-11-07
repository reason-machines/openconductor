# Terminal font slider proof

Conductor Rebuild reproduced a lower Appearance mismatch on current main `f16d9338`, integrated into the assigned Settings branch as `d29a076f`. The native HTML range control looked different and used browser-dependent Page Up/Down increments. This change uses the existing Base UI Slider dependency, with a 6px track, opaque outlined 16px thumb, one-pixel arrow steps and ten-pixel page steps. The 10–20px bounds and existing settings-save API stay unchanged.

[Open the review page](review.html). [Three-lane crop](comparison.png). Each crop translates without resizing. Full captures remain alongside it. The Neutral palette differs from Conductor's warm palette and is not normalized away.

## Reference and source identity

The reference is the REA-extracted Conductor 0.87.6 frontend, rendered in isolated Chromium with invented backend data. The previously verified real Mac binary SHA256 is `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`; extracted index SHA256 is `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`. No native app or real user data was touched in this pass.

The extracted `renderApp-D_fmY7hW.js` text locates `gla` at character 10173591 and its `VBi` Slider definition at 10160172. The latter supplies `largeStep = step * 10`, a `h-1.5` track and `size-4` thumb. These are text-search observations, corroborated by the fresh browser reference run, not claims of recovered original source.

The final application capture was made on local source commit `0b11e129a980833899262f41f54e48edbba5a8da`. Its two changed application files have combined SHA256 `8e21222b244c5b863ac8c8eed93d4c7683a09125f4838a5cc7026db7804df7e4` (TerminalFont.tsx bytes followed by settings.css bytes). Later evidence-only commits do not change that application source. Each capture JSON records its own source identity, screenshot hash and REA Evidence ID. Do not relabel the original baseline as a later-head capture.

## Results

- Fresh Conductor reference passed all nine keyboard assertions and measured a 6px track and 16px thumb.
- Baseline OpenConductor failed the same driver. Page Up from 12 selected 13 instead of 20. Page Down from 20 selected 19 instead of 10. Later arrow checks also differed because that wrong value carried forward. The baseline capture separately resets the control to 12 before taking its screenshot.
- Corrected OpenConductor passed all nine keyboard assertions, both size assertions and the opaque-thumb assertion. Each keyboard value reached the invented IPC store. That store is memory, not desktop filesystem persistence.
- `npm run build` passed, including TypeScript.
- `node --test 'src/settings/**/*.test.ts' 'src/settings/*.test.ts' src/features/terminal/font.test.ts` passed 133 tests.
- `node --test 'src/**/*.test.ts'` passed 1,293 tests.
- `npm run -s lint:colors` and `git diff --check` passed.
- Every owned preview exited after its bounded proof. `preview_stop` then confirmed no running server.

Use `tools/settings/check-terminal-slider.mjs` with the supported preview commands in [the verification guide](../../../tools/settings/README.md). `reference-checks.json`, `before-checks.json` and `after-checks.json` contain the actual values; the REA records and scenarios retain screenshot provenance. No new REA execution gap was observed.

## Not proven

Native macOS rendering, live authentication, real filesystem persistence, pointer dragging, all other Appearance variants and the final whole-app side-by-side verdict remain unverified. This browser check does not replace the runtime/native lane. No cloud UI, credential hand-off, agent runtime or shared App file changed.
