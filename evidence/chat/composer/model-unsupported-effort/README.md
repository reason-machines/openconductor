# Unsupported built-in Effort row

Conductor Rebuild135 restores the disabled Effort row for the built-in Haiku selection. This is a retained-source and mounted-component correction, not native or visual parity acceptance.

## Source contract

The retained REA-extracted Conductor renderer is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its imported registry is `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The existing source-only packet passed 34 static assertions. It joins the actual selected-model configuration to the capability check, row declaration and disabled trigger/tooltip consumer. Exact UTF-8 byte ranges below are half-open.

- Index `Uv` effort registry, bytes `[295379,296841)`, SHA-256 `c4c96ee59e047ce387b875c16ca400b22f90db1f644cc97d666c1482f5154569`, gives both `haiku-4-5` and `haiku` empty effort levels.
- Index `kN`, bytes `[297324,297701)`, SHA-256 `226dcbecb9d5e9a09987465cd8e26da325e3be1e1a3dfd7b938ea3ef671b83b1`, returns no effort capability for empty levels. The imported capability predicate `bqt`/`ASe`, bytes `[297874,297912)`, SHA-256 `fbef59373fb29295abdd3f0e73e65dd8e34c6e9555524a0986e1c8aa99613297`, tests that result.
- Renderer `RNi`, bytes `[8617661,8623873)`, SHA-256 `d3d66fcdcef43ef2ae30e74b0fb35553aa8e5e8c59850535353696f174880eb7`, passes the selected model, resolved built-in agent and configuration producer to `L7o`. The `lgo`/`fUt` producer preserves that selected Haiku model.
- Renderer `O7o`, bytes `[8602034,8602210)`, SHA-256 `9accd5b388e31712162b75f90715cac30f866bb67dd8ef62ae7b6f331d110a30`, resolves the unsupported value to `Not supported` and `supported: false`.
- Renderer `L7o`, bytes `[8603880,8613595)`, SHA-256 `763d5d0e217d3fd22a7decbb99b3551df62c8356626dbb8a07d87585386c6f3c`, declares the built-in `Effort` row even when unsupported. It forwards disabled state and `Not supported for this model` to `fHe`.
- Renderer `fHe`, bytes `[8482263,8483174)`, SHA-256 `7b9a63869a120b726389059e03f5a1373c2bc1deb6686f39f8034bf11064d157`, forwards disabled state to its trigger and tooltip content to the right-side tooltip.

Current-main comparison was refreshed to `2fd9759216603cb040cfcffb4a258833948d4120`. All six source-file hashes still matched the packet originally checked on `887964ad496b1069e6ef0fb54f16df373e82932a`. The actual chat/loadout producer retains explicit Claude/Haiku choices. `modelEfforts` correctly returns null for those empty levels, but `ModelPicker` used that null result to omit the entire row.

## Focused correction

Only `ModelPicker.tsx` changes production behavior. The known built-in model must resolve to its own catalog agent before an unsupported row is added. An explicit or callback-resolved Reason/foreign agent, an unknown model or a local CLI sentinel is unchanged.

The new row says `Effort` and `Not supported`. Its native button is disabled and has no click handler, keyboard handler or submenu. A non-disabled wrapper forwards tooltip events to the existing right-side `Tooltip`. The original supported Effort subtree and separator expression are unchanged. Search hides the new row and its tooltip; clearing search restores them. Search matching, model identity, ordering, selection, Fast mode, provider paths and CSS are unchanged.

## Mounted RED then unchanged GREEN

The new test uses the repository's existing React test-renderer fixture pattern. It mounts the actual transpiled `ModelPicker` and uses real model, effort, loadout and shortcut helpers. Browser-only presence, tooltips, icons and keybinding registration are substituted. Tooltip assertions verify content and side forwarding, not real hover behavior.

Before any production edit, against fresh main:

```bash
node --experimental-strip-types --test --test-concurrency=1 src/features/chat/modelPickerUnsupportedEffort.test.ts
```

Result: **12 tests, 8 passed, 4 failed**. Canonical Haiku, its alias, inferred-agent Haiku and search/clear failed because the row was absent. The first failure was:

```text
unsupported built-in Effort row must remain present
0 !== 1
```

Supported Claude and Codex effort selection, unknown/sentinel/Reason/foreign-agent exclusions, callback precedence, favorite order and exact selection identity passed before the fix. The failing test was committed locally as `28b50b529` before production changes.

After the minimal correction, the same command passed **12/12**. The test file's SHA-256 stayed `a8797ec832cbebf23d7b8f2321d9a828334bcaa151ae40c004e5bcfe9e1591e7`. To replay the failing source without changing the current implementation:

```bash
MODEL_PICKER_UNSUPPORTED_EFFORT_SOURCE_REF=2fd9759216603cb040cfcffb4a258833948d4120 node --experimental-strip-types --test --test-concurrency=1 src/features/chat/modelPickerUnsupportedEffort.test.ts
```

Nearby validation:

```bash
node --experimental-strip-types --test --test-concurrency=1 src/features/chat/modelPicker*.test.ts src/features/chat/composerModels.test.ts src/features/chat/loadoutChoices.test.ts
npm run typecheck
git diff --check
```

Results: **121/121 passed**, **typecheck passed**, **diff check passed**. Existing test files and fixtures are unchanged. An initial nearby run caught the existing source assertion for the supported separator; the correction retains that original expression rather than changing the frozen assertion.

## Acceptance limits

All local checks ran as lightweight single-worker Node tests/typecheck on the shared Reason cloud computer. No full local build, server, browser, native app, provider request, new REA acquisition or E2E dispatch ran. There is no screenshot because browser/native execution was outside this lane's serialized admission. Browser tooltip hover, visual geometry, native interaction and real-provider acceptance remain unverified. Hosted CI, exact-head merge eligibility and consuming-main/package results must be recorded separately after publication.
