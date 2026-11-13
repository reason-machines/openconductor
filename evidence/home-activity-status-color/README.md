# Home failed-status icon colour

Conductor Rebuild checked current main `6acd4f8f8b79ef5b79c4a98b15eab68174943487` on Reason Cloud 352. Ledger disposition `8f38dbfd-5eec-46f3-b39d-73b4b6dd174c` reserves this one-selector correction and a distinct focused source/CSS contract. It is prepared in a detached source-only worktree, not in the live tooltip PR or its validated checkout.

## Source and reachability

The retained Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js` has 11,600,457 bytes and SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. REA parent evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367` records its provenance. The accepted `dWt` range at UTF-8 bytes `[9829651,9829961)` has SHA-256 `c9d43d6ad1f5f9446f64e026ab45b47391f902fbcadc219502655e2762e6a41d` and maps failed status to the destructive semantic colour. Full-asset and range hashes were checked without executing reference code. No extracted implementation is copied into product code.

The current `AllWorkspaces.Row` consumer takes `ws.state = failed` through the existing `homeStatus` producer to `showsActivityStatus` and `rowStatusColor = destructive`. For a nonarchived row with the status matrix disabled, its `allws-status` span renders the alert glyph using inherited `currentColor`. The selector instead used the deletion-colour token. Existing tokens differ: destructive/deletion are `#dc2828`/`#cf222e` in light mode and `#f87272`/`#f85149` in both explicit and system dark modes.

The correction changes only `.allws-status[data-color="destructive"]` from `--diff-del` to `--destructive`. Deletion counts retain `--diff-del`. No shared token, glyph, spinner, status acquisition/precedence, store, matrix, callback, binding, layout or tooltip changes.

## Contract and limits

`src/theme/homeActivityStatusColor.test.ts` uses the real failed-status producer and the repository's existing CSS-contract style. It requires the destructive semantic token for the Home icon while retaining the deletion-count token. The prepared test is byte-identical to the separately retained inquiry fixture.

- Source qualification and `git diff --check` passed. This is not an executed RED/GREEN result.
- Regression, adjacent tests, typecheck and build are **not run** for this colour correction. The tooltip allocation was released and does not cover this change.
- Exact proposed regression command for ACC binding is `NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --signal=TERM --kill-after=5s 90s node --test --test-concurrency=1 src/theme/homeActivityStatusColor.test.ts`, against the actual-main CSS and then the one-token candidate with identical test bytes. This is a command proposal, not an allocation or execution.
- Proposed adjacent scope is `src/theme/rowStatusColors.test.ts` and `src/state/rowStatus.test.ts`, followed by the repository's typecheck/build under ACC's eventual matched limits. No extra runner or queue row was created.
- Browser computed colour, light/dark visual parity, screenshot and native macOS verification are **not run**. A later visual check must exercise an actual failed Home row with the status matrix disabled; a CSS assertion alone cannot prove rendered pixels.

Original tooltip packet, repaired ten-case fixture, keyboard24, branch-search and Target14 remain separate and unchanged. The frozen source increments and unpublished scratch were not cleaned or reset. This candidate must have its own ready PR against main after matched validation, never be added to the tooltip PR.

No new REA call failed. The retained acquisition limitation remains that REA established the executable identity but did not enumerate embedded Tauri assets. The renderer range is static source evidence, not a newly observed installed-app result.
