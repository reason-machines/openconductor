# Tufte font family

Conductor Rebuild, 2026-11-08. Retained shipped-source evidence, not native or visual acceptance.

## Reference provenance

The retained Conductor 0.87.6 asset manifest identifies `/assets/renderApp-BYEcFwvt.css` as 420,010 decoded bytes, SHA-256 `5b876e143b67a7b0f09e3816b12c18bc588b4af7a9a43f04ce77fd5337d9ff04`. See [the asset manifest](../frontend/tauri-assets-manifest.json) and [the extraction description](../frontend/README.md).

A retained read on Sven's Mac recovered this declaration from `~/oc-rea-scripts-runner/frontend/assets/renderApp-BYEcFwvt.css`:

```css
.tufte-article{color:var(--foreground);max-width:55rem;margin:0 auto;padding:2rem 4rem;font-family:Georgia,Times New Roman,serif;font-size:.95rem;line-height:1.8}
```

The retained Session is [resize reflow and header height](https://reasonmachines.com/agents/fd3fef49-a3c3-496d-a084-fd625e689ff2). Tool-input source `c0b03298-8f9c-45c4-ae98-fdf78fec9fa9`, revision `22486019`, records the read command and path. Tool-output source `ea80c3c8-473c-4a32-868e-e9623dac0641`, revision `22486069`, retains the declaration. This pass recovered that historical record; it did not read the Mac or rehash the extracted CSS again. The manifest identity and historical read are separate retained records, not a fresh hash attestation of that read.

The retained renderer read in [Settings pages](https://reasonmachines.com/agents/49e3976d-9553-42d8-8101-2504177fbb97), source `9135a04e-971f-4a87-a5ad-538ceacf3053`, revision `23804758`, shows `Yuo` producing an `article` with `tufte-article`. `eee` chooses `Yuo` when `markdown_style` is `tufte`. Source `86686a6f-387d-4409-a3db-9d0f6eeef2c0`, revision `22969315`, shows Settings' `pla` using the same `eee` renderer with `tufte-sm`. The [Markdown preview receipt](../files/markdown-preview.md) records the file consumer and renderer identity.

## Bounded correction

Fetched main `44e5b6a7984c2f82c7c98b6a831af015c990b2ef` still placed `et-book`, Palatino, Palatino Linotype, and Book Antiqua ahead of Georgia in both Settings' Markdown sample and the workspace file preview. Both declarations now use `Georgia, "Times New Roman", serif`. Quoting the multiword family is valid CSS syntax. No font asset, default-style rule, layout, heading rule, scroll behavior, or persistence code changed. This does not implement the remaining Tufte renderer or claim full Tufte parity.

## Verification

- Before the CSS edit, `node --experimental-strip-types --test src/features/files/tufteTypography.test.ts` failed both cases. Actual family started with `et-book`; expected family started with Georgia.
- After the edit, the focused typography test and neighboring dependency-free file tests passed. The tests inspect the source declaration only, not the browser's resolved font or pixels.
- The broader `node --experimental-strip-types --test src/features/files/*.test.ts` attempt passed 16 cases but failed to import `fileView.test.ts` because this checkout has no installed `react` package. No dependency install was attempted in this source-only lane.
- `git diff --check` passed. No application build, browser, workflow dispatch, native runtime, or screenshot was run. Native admission remains unchanged.

## Separate font availability gap

The retained manifest contains `/fonts/iAWriterMonoV.ttf`, SHA-256 `ca8b5740d7fd05ffd1a9e985a2fe6b7608101f0583d2cf971317c82b4ce01240`. OpenConductor offers iA Writer Mono but its tracked font assets and font-face declarations on the inspected main contain only Geist and Geist Mono. Availability therefore depends on the user's installed fonts. The shipped asset's presence does not establish redistribution rights. No iA asset was copied; licensing and availability remain separate from this correction.
