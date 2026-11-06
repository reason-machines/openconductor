# Home Passport

Conductor Rebuild, 6 November 2026. This increment starts from main after #730. It adds Home's missing visited-city map without changing sidebar, palette, global menus, settings, or the cloud UI gate.

## Reference and observations

The reference is Conductor 0.87.6 extracted from the real `/Applications/Conductor.app` on Sven's authorized `sven m5 max`. [Frontend provenance](../frontend/README.md) and [Home detail evidence](../home-details/README.md) retain the artifact identity. The real and shared binaries have SHA-256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`. Both extracted index files have SHA-256 `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`.

The unmodified reference frontend and OpenConductor run with mocked IPC and isolated synthetic data at 1280 by 820, scale 1, Stone palette. REA `capture-browser-scenario` captures the open Passport in dark and light. [Capture IDs and hashes](captures.json), [browser measurements](checks.json), and the original scenario inputs are checked in.

Bounded static observations in `renderApp-D_fmY7hW.js`:

- `Xrs` at character 1,924,243 hides the footer for zero recognized cities and opens Passport from the visited-city button. Its tooltip reads "View workspace world map".
- Passport near character 1,925,800 sorts archived markers before active markers. Archived markers cannot navigate. Active markers close Passport and navigate to their repository and workspace.
- The header has Back to app, a title, legendary/rare/uncommon counts, and ten progress cells. The footer has the app version and `GRID::EQUALEARTH`.
- The map uses EqualEarth, scale 220, a viewBox of 800 by 600, and zoom limits 1 and 8. `lss` multiplies zoom by 1.5, `ass` divides by 1.5, and reset restores zoom 1 and center [0,0]. The default translate extent is unbounded.
- `Qrs` at character 1,923,801 names `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json`. The reference capture has zero country paths because the test page's restrictive network policy does not load that remote JSON. The reference bundle, policy, and image were not patched to hide this gap.

`index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`, contains the 385-city literal at character 187,951, length 23,941. [The extractor](../../tools/side-by-side/extract-passport-cities.py) reads geographic and tier facts between literal boundaries without evaluating extracted code. Its output SHA-256 is `f2456324584a113e76a80e111198e14c5737912fe94f23b9987f373b9c1d61ec`.

## Implementation choices

`PassportWorkspace` keeps the city, original directory name, archive state, and exact navigation selection together. `PassportViewport` owns zoom and translation. Pure functions implement projection, counts, selection, pan, and zoom. The component uses the existing archive API, Base UI dialog, and tooltip. No credential or runtime routing changes are involved.

OpenConductor renders a local SVG world map. A build-time generator uses D3 geoEqualEarth 3.1.1, topojson-client 3.1.0, and world-atlas 2.0.2. The generated 177 country paths and graticule are checked in. Runtime neither imports those packages nor fetches map data. Root package and lock files are unchanged. Generator dependencies have a separate lockfile. The atlas input SHA-256 is `2516c915867c7baf18ddec727aec46c315541a07cfb3d79a6559b05d5e94eee8`. The generated path module SHA-256 is `f2785e306ebf838207450cb7e5ffc3e1bef06613610789834e61d121e1ae45cc`.

The atlas redistributes Natural Earth 4.1.0 country boundaries at 1:110m. Natural Earth data is public domain. See [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/) and [the world-atlas ISC license](WORLD-ATLAS-LICENSE). The atlas is not a claim about political boundaries or their current accuracy.

## Verification

All checks below ran on Reason cloud with isolated test data.

- `npm run build` passed TypeScript and Vite. Existing large-chunk warnings remain.
- `npm run lint:colors` passed the colour check and its six regression tests.
- `node --experimental-strip-types --test src/home/passport.test.ts src/home/cities.test.ts src/home/homeScreen.test.ts` passed 13 tests. These cover the complete catalogue, archive counts, active/archived selection, deduplication, projection, panning, and zoom bounds.
- `node tools/side-by-side/main-shell.mjs --passport-check --capture`, run through the supported preview, passed in dark and light. Dialog, header, Back button, footer, and map geometry match the reference. All 385 projected marker bounds and radii match to 0.01 CSS pixel. The check does not normalize image pixels or use these assertions as a whole-screen match verdict.
- Reference and OpenConductor both passed button zoom factor 1.5, limits 1 through 8, reset, and active-city navigation. OpenConductor additionally passed drag/pointer-release, wheel zoom, Escape, Back, and focus return. Archived non-navigation is covered by the pure-model tests, not a native interaction capture.
- The first browser comparison failed the footer height, 32 instead of 37 pixels. The same assertion passes after the correction. A tighter Back-button assertion then caught padding and letter-spacing differences, which were corrected.
- Both data generators reproduced their checked-in output byte-for-byte with `cmp`.
- The first macOS CI build failed because `Passport.tsx` and `passport.ts` resolve to the same case-insensitive module stem. The component is now `PassportDialog.tsx`. Local TypeScript and module-stem checks pass after the rename. The macOS rerun result is recorded by PR #734, not inferred from Linux.

## Match verdicts and gaps

**Home remains partial.** Passport is no longer absent. The captured map controls, geometry, marker projection, and tested navigation behavior now work. OpenConductor retains its own branding and version. The country map is visible in OpenConductor but absent from the constrained reference capture, so country rendering and whole-Passport pixel equality are unverified. Tooltip styling, touch pinch, small-window behavior, and full native Tauri/WebKit parity are not exercised by this check.

**Sidebar remains partial.** This increment does not edit sidebar code. The [previous dark/light repository-menu evidence](../home-details/README.md) still proves only those captured menu states. Section-menu interactions and all empty/populated sidebar states remain unverified.

No native app, real `openconductor-playground`, or `bergen` data was modified. The runtime owner controls any safe isolated native capture. No new REA CLI failure occurred. The missing reference country data is an explicit observation gap, not a successful visual match.

## Reproduce

```bash
npm ci --prefix tools/side-by-side/passport-generator --ignore-scripts
node tools/side-by-side/generate-passport-world.mjs
python3 tools/side-by-side/extract-passport-cities.py /path/to/verified/assets/index-BGEQ8YjU.js /tmp/passportCities.ts
cmp /tmp/passportCities.ts src/home/passportCities.ts
npm run build
# Run with Reason preview_start on port 4682:
SHELL_OUT=.oc-tmp/passport SHELL_STATES=passport SHELL_THEMES=dark,light node tools/side-by-side/main-shell.mjs --passport-check --capture
```

Set `DIST_REF` to the verified extracted frontend when it is not at `.rea-work/dist`. The browser check must run in the preview process's network scope. Stop the preview when captures finish.
