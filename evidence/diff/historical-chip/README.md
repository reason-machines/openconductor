# Historical Changes chip colours

Conductor Rebuild, 2026-11-07. This source-only follow-up corrects the selected commit and turn chip's normal and hover colours. It does not change scope selection, filter state, history, or back navigation.

## Reference identity and corrected search

This pass reused the original cached Conductor 0.87.6 Mach-O and the existing embedded-asset table reader. It decoded only the CSS and renderApp assets into temporary investigation storage. No installed app, native process, browser, preview, or capture ran.

The binary SHA-256 is `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`. Both decoded assets match [the retained extraction manifest](../../frontend/tauri-assets-manifest.json):

- CSS `renderApp-BYEcFwvt.css`, 420,010 bytes, SHA-256 `5b876e143b67a7b0f09e3816b12c18bc588b4af7a9a43f04ce77fd5337d9ff04`.
- JavaScript `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The earlier exact search for `.text-link-foreground{` incorrectly reported the utility absent. The actual declaration is grouped with its 70% variant:

```css
.text-link-foreground,.text-link-foreground\/70{color:var(--link-foreground)}
```

That selector starts at decoded CSS character offset 158881. The normal `text-muted-foreground` and `text-foreground` declarations also use grouped selectors. An exact selector followed immediately by `{` is not a valid absence check. This was an investigation error, not a new REA capability bug.

The retained REA static analysis `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` remains incomplete for the large renderApp chunk. These bounded decoded-source reads supplement it. No new REA analysis or browser observation is claimed.

## Complete source cascade

Offsets are decoded character offsets, not native addresses.

- `_ws` at JavaScript 2935975 requests the historical classes `bg-link text-link-foreground border border-link-foreground/40 hover:bg-link-elevated hover:text-link-foreground-elevated`.
- Button `ghost` at JavaScript 1922178 requests `text-foreground/90 hover:bg-sidebar-accent hover:text-accent-foreground`. Its final class list passes through `lo`, the same class merger as `Xe`.
- `Xe` at JavaScript 431697 and `lo` at 563807 both call `jPt(uQe(...))`. `jPt` is initialized at 419909. An isolated check of the exact pure class-merger code at 392786 through 419921 removes `text-muted-foreground`, `text-foreground/90`, and both generic ghost hover classes. [The retained result](class-merge-result.json) records the final class list. No app or DOM ran for that check.
- `.bg-link` at CSS 129881 sets the opaque `--link` background.
- The grouped text rule at CSS 158881 sets `--link-foreground`.
- `.border-link-foreground\/40` at CSS 120117 has a solid-colour fallback, then an `@supports` rule at 120225 uses `color-mix(in oklab,var(--link-foreground) 40%,transparent)`.
- `.hover\:bg-link-elevated:hover` at CSS 237176 sets `--link-elevated`.
- The complete exact CSS contains no `hover\:text-link-foreground-elevated` selector or `--link-foreground-elevated` custom property. Since the class merger removes the ghost hover text class, the link text rule remains in effect on hover. This conclusion follows from the complete class and declaration chain, not absence alone.

The light theme defines fill `#faf7f5`, text `#a4847f`, and hover fill `#f3ece7`. The dark theme defines fill `#2a1e1d`, text `#cca694`, and hover fill `#413030`. The border uses the same text colour at 40%. These definitions are retained in [the theme tokens](../../frontend/css-tokens.json).

## Correction

OpenConductor previously used 15% of its primary action accent for the fill, the action accent for text, and a 40% sRGB mix for the border. Its generic `.rp-icon:hover:not(:disabled)` rule also outranked the historical-chip rule and replaced its colours on hover.

The historical chip now uses existing `--highlight` and `--emphasis` semantics for its opaque fill, link text, and 40% OKLab border. Those existing Stone tokens match the reference. A more-specific chip hover rule keeps the link text colour and uses the new `--link-elevated` token. Stone's new token matches the reference light, explicit dark, and system-dark values. Other palettes derive it from `--surface-accent`, so Neutral stays neutral. That non-Stone mapping is an OpenConductor palette choice, not a new Conductor claim.

## Checks and limits

The three new source regressions failed before the fix: the normal fill was an accent mix, the chip-specific hover declaration was absent, and `--link-elevated` was absent. [The original failing output](unit-before.tap) retains all three failures. The test moved from the diff directory into the theme directory so its expected reference colour literals comply with the existing colour lint.

Passed after the correction:

```bash
node --test src/theme/changesScope.test.ts src/theme/tokens.test.ts src/features/diff/changesPresentation.test.ts src/features/diff/changesFilter.test.ts src/features/diff/changesTree.test.ts src/features/diff/target.test.ts src/features/diff/nav.test.ts
npm run lint:colors
git diff --check
```

[The focused source suite](unit-after.tap) passed 40 tests, with zero failures or skips. [Colour lint](colors-after.txt) passed. These are stylesheet and token contract checks, not a browser's computed-style engine. The style tests also pin the retained pure-merger result's surviving link classes and removal of the muted and generic ghost classes. They do not rerun the shipped merger in CI.

No install, build, typecheck, browser test, screenshot, package inspection, or native test ran for this correction under the source-only assignment. The existing commit-history screenshots predate this correction and are not after evidence. Exact-head workflows and consuming-main package acceptance remain required before merge and delivery acceptance.
