# Home footer, icons and city catalogue

Conductor Rebuild, 2026-11-06. Base main `f385424` (merged #722).

## Reference and extraction

The read-only reference is the unmodified Conductor 0.87.6 frontend extracted from `/Applications/Conductor.app` on Sven's authorized `sven m5 max`. See [frontend provenance](../frontend/README.md), [Home route observations](../screens/home.md), and [the previous shell capture](../shell-actions/README.md). The program independently verified the real Mac binary and shared reference binary at SHA-256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`; both extracted `index.html` files have SHA-256 `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`.

- `renderApp-D_fmY7hW.js`, `UDn` at character offset 1,797,000, renders the three entry cards.
- `Xrs` at approximately 1,924,243 renders a ghost/small button and a tickets-plane icon with 6px right margin.
- The extracted stylesheet applies `.lucide { stroke-width: 1px }` and `.lucide * { vector-effect: non-scaling-stroke }`. Home scopes these rules to its four icons; other icon consumers are untouched.
- `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`, contains the `Uy` city data at character 187,951, length 23,941. `Hy` immediately following normalizes names to slugs, and `_qt=Uy.length` supplies the denominator.

[The extractor](../../tools/side-by-side/extract-home-cities.py) parses only city-name facts between strict literal boundaries, without evaluating source code, and checks that there are 385 distinct names. The generated Home catalogue has SHA-256 `2697b3582558df92e70f8eb54eb52fb178fb92a32f3445a52a50df0438e6c87f`. The independent workspace name generator is unchanged. Its 103-city list and rarity weights are not claimed to match Conductor.

## Verification

REA `capture-browser-scenario` captured both extracted frontends on isolated synthetic data at 1280×820, scale 1, Stone palette, dark and light. Both sides use mocked IPC. [Capture IDs and screenshot hashes](captures.json) and [comparison IDs and exact crop coordinates](comparisons.json) are retained. No pixels were shifted, resized, recoloured or masked for comparisons. The side-by-side image labels are not comparison inputs.

The same browser regression failed before the fix with `5/103 cities visited` instead of `5/385 cities visited`. [Before measurements](before.json) also show a 32px-high / 14px / weight-400 / radius-4 footer and 2px scaled strokes. [After measurements](after.json) show the reference's 28px / 12px / weight-450 / radius-6 footer and 1px non-scaling strokes in both themes. The regression compares the denominator, count, footer geometry and typography, card text styling, icon colours and vector effects. It also compares hover foreground CSS colours and background colours rasterized into browser-canvas RGBA, rather than treating equivalent `rgba()` and `color(srgb)` serializations as different colours.

Checks run on the Reason cloud computer:

- `npm run build`: passed (TypeScript and Vite).
- `npm run lint:colors`: passed, including six lint regression tests.
- `node --experimental-strip-types --test src/home/cities.test.ts src/home/homeScreen.test.ts`: all six passed.
- `node tools/side-by-side/main-shell.mjs --home-check`, through the supported preview: failing before, passing after in dark and light.
- REA captures and equal-coordinate crop comparisons: completed for Home and populated, collapsed sidebar repository menus in dark and light. Exact verdicts are in `comparisons.json`.

## Screen verdicts and remaining gaps

**Home remains partial.** At channel threshold 24, the main-content crop differs by 5.014% in dark and 4.349% in light; the equal-coordinate cards/footer crop differs by 0.209% and 0.184%. These are not exact-match verdicts. This increment corrects its city catalogue, footer sizing and icon weights. It does not replace OpenConductor's own 13-letter wordmark with Conductor's nine-letter mark. The wordmark height/colour remain different. The Passport/world-map dialog is still absent; the footer button is not claimed functionally equivalent. Card/footer pixel comparisons, not just DOM metrics, determine the visual verdict.

**Sidebar remains partial.** The populated, collapsed sidebar crop differs by 0.373% in dark and 0.374% in light at threshold 24. The repository action menu is pixel-identical in both captured themes at channel thresholds 0 and 24. The overall sidebar still differs in Home's intentional active-route styling and other trigger details. These captures do not verify section menus or every sidebar state.

**Native macOS/Tauri/WebKit was not run.** The runtime owner reports an unresolved OpenConductor process with the real data database mapped. It was neither driven, replaced nor terminated. The extracted-frontend harness is not a native-app test. No real `openconductor-playground` or `bergen` data was touched. No new REA failure was encountered; the existing minified-bundle semantic-analysis and native-capture limits remain as documented in Home evidence.

## Reproduce

```bash
python3 tools/side-by-side/extract-home-cities.py /path/to/extracted/assets/index-BGEQ8YjU.js /tmp/cityCatalog.ts
cmp /tmp/cityCatalog.ts src/home/cityCatalog.ts
npm run build
# Start through Reason preview_start on port 4682, not as a background shell server:
SHELL_STATES=home,repo-menu SHELL_THEMES=dark,light SHELL_OUT=.oc-tmp/home-details node tools/side-by-side/main-shell.mjs --home-check --capture
# After the captures finish:
python3 tools/side-by-side/compare-home-details.py .oc-tmp/home-details evidence/home-details
```

Set `DIST_REF` if the verified extracted frontend is not in `.rea-work/dist`. Stop the preview after the bounded captures to release shared capacity.
