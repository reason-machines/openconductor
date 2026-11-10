# Compact Tufte Settings preview

Conductor Rebuild, 2026-11-10. This is a retained shipped-source correction, not visual or native acceptance.

## Reference

Conductor 0.87.6's retained, REA-analyzed asset `/assets/renderApp-BYEcFwvt.css` has 420,010 decoded bytes and SHA-256 `5b876e143b67a7b0f09e3816b12c18bc588b4af7a9a43f04ce77fd5337d9ff04`. Its identity is recorded in [the asset manifest](../frontend/tauri-assets-manifest.json), with extraction provenance in [the frontend evidence](../frontend/README.md).

The [native evidence owner](https://reasonmachines.com/agents/e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46) made a bounded read and verified export of that already-extracted asset on Sven's Mac. Receipt `d6788692-d3ef-4855-aabe-d663b89de5a0`, revision `25819634`, retains the complete Tufte CSS section. Its zero-based, half-open UTF-8 byte range is `[408967, 412492)`, with 3,525 bytes and SHA-256 `7dfffaaeeb2631115b403e9bc639b2354dd72e07f3cbd40ace9d4173480de117`. All 39 `.tufte-` mentions in the asset fall inside that section. The receipt preserves all 34 leaf rules and their `@supports` wrappers. Manifest identity, mention coverage, brace balance, and JSON round-trip checks passed. This was not an analyzer or app launch.

The retained renderer receipt in [Settings pages](https://reasonmachines.com/agents/49e3976d-9553-42d8-8101-2504177fbb97), source `9135a04e-971f-4a87-a5ad-538ceacf3053`, revision `23804758`, shows `pla` passing `tufte-sm` to `eee` inside a `p-4 bg-muted rounded-md` card. `eee` selects `Yuo`, which wraps the sample in `tufte-article`. The fixed sample has one heading and one paragraph.

The applicable shipped declarations are:

```css
.tufte-article{color:var(--foreground);max-width:55rem;margin:0 auto;padding:2rem 4rem;font-family:Georgia,Times New Roman,serif;font-size:.95rem;line-height:1.8}
.tufte-article.tufte-sm{padding:1rem 2rem;font-size:.95rem}
.tufte-article.tufte-sm h1{font-size:1.75rem}
.tufte-article h1{text-align:center;margin-top:2rem;margin-bottom:1.5rem;font-size:2rem;font-weight:400;line-height:1.2}
.tufte-article p{text-align:justify;-webkit-hyphens:auto;hyphens:auto;margin-top:0;margin-bottom:1.4rem}
```

## Bounded change

Compared with fetched main `f81bc428b77012da6eddb590899a56502c1a27ea`, the Settings Tufte sample lacked the inner article's dimensions. Its heading inherited the default 30px size and added italics absent from the shipped Tufte heading. Its paragraph retained the default 14px font and 24px line height.

The correction targets only `.settings-markdown-preview.tufte` and its existing inner `.md`. The inner block gets the compact article dimensions, color, font size, and line height. Its heading gets the compact size, centered alignment, shipped margins, weight, and line height. Its paragraph gets the shipped margins, justification, and hyphenation, with inherited article metrics. These more-specific rules override the shared `.md` first-child and last-child margin resets and the default Settings sample rules.

The outer preview card, Georgia font family, default sample rules, preference handling, sample content, and workspace Markdown files are unchanged. Other Tufte descendants are outside this fixed sample and are not implemented by this change.

## Verification

On the Reason cloud computer, with no dependency installation or app launch:

- Before the CSS edit, `node --experimental-strip-types --test src/settings/tuftePreview.test.ts` failed the three Tufte cases and passed the unchanged-default case. It reported the missing compact inner rule, missing centered heading declaration, and missing Tufte paragraph rule.
- After the edit, `node --experimental-strip-types --test src/settings/tuftePreview.test.ts src/features/files/tufteTypography.test.ts` passed all six cases.
- The same command extended with `src/settings/prefs.test.ts src/settings/model.test.ts` passed all 17 cases.
- Adding `src/settings/appearance.test.ts` made the broader local run partial: 17 cases passed, but that suite failed to import the uninstalled `@tauri-apps/api` dependency from `sidebarTransparency.ts`. No dependency installation or test modification was attempted. Hosted CI must cover the installed-dependency suite and typecheck/build.
- `git diff --check` and `git diff --exit-code origin/main -- src/features/files src/settings/AppearancePage.tsx` passed.

These are source-declaration checks, not a browser cascade engine. They do not prove resolved fonts, computed layout, rendered pixels, preference persistence, or restart behavior. No screenshot is supplied because this lane has no runtime admission. The selected-Tufte original-app capture remains a separate dependency with the native evidence owner. `#847 FULL STOP` is unchanged.
