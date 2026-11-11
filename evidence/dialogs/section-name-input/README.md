# Section name input attributes

Conductor Rebuild adds `autoCorrect="off"` and `autoCapitalize="off"` to the section-name input in create and edit modes. These are the only production changes. Handlers, shared wrappers, emoji search, onboarding, repository icons, global producers, workflows, and infrastructure are untouched.

## Retained source

The original archive has SHA256 `c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d`. Its renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

[reference.json](reference.json) retains complete UTF-8 spans and hashes: `Qo` input wrapper `[1934438,1935194)`, section dialog `Aya` `[11056145,11058891)`, and section-name input `[11058477,11058707)`. The input explicitly supplies both attributes; `Qo` forwards them to the HTML input. This is static shipped-source evidence, not target execution. Historical REA semantic analysis exhausted its heap; no new REA installation or live analysis ran. The retained target JavaScript was never executed.

Fresh default main `5bea00de87fac9ef306e89a4fd35e3d88527ad15` was consumed on the assigned branch after #1048 merged. Its SectionDialog blob `ebc0c163910c1a36920de86ce04e0b1c3b654e5b` and section-emoji source/test are byte-identical to the accepted RED baseline `248b6c359c830c6ac5e050721bae18e44e168068`. The current existing frontend-unit workflow includes the new test. Ledger confirmed this Session's exclusive two-attribute/test/evidence scope; historical owner15 has no active attribute/shared-hunk reservation.

## Offline RED and GREEN

All checks ran on Reason Cloud with the existing supplied React, react-test-renderer, and TypeScript dependencies; no install ran. Fixture SHA256 is unchanged: `006cabec6907c845ca308f3a258e64085fa196b84bc5a8b892e079d5f05701c3`.

Historical command against the unchanged scratch main component:

```bash
NODE_PATH="$PWD/.ara-state/settings-icon-popup-deps/node_modules" \
  node --test .ara-state/section-name-input-regression/src/components/sectionNameInput.test.ts
```

[historical-red.tap](historical-red.tap) records exit 1: exactly two create/edit attribute assertions failed; eight control tests passed. Both props were `undefined`, not `"off"`. This accepted RED receipt was preserved without replay. The same component/dependency bytes were independently checked on the fresh implementation base before editing.

GREEN against the actual production component:

```bash
NODE_PATH="$PWD/.ara-state/settings-icon-popup-deps/node_modules" \
  node --test src/components/sectionNameInput.test.ts
```

[green.tap](green.tap): all 10 tests passed, zero failures or skips. The fixture transpiles production source without rewrites and mounts it with React. Only the Modal boundary returns its children. Assertions observe host-input props, initial names, focus selection, trimmed submit-before-close, blank validation, IME-safe Enter, and Cancel in both modes. It does not exercise a browser, OS autocorrection, or native text input.

Neighbor command:

```bash
NODE_PATH="$PWD/.ara-state/settings-icon-popup-deps/node_modules" node --test \
  src/components/sectionEmoji.test.ts src/components/repoIconUpload.test.ts \
  src/components/repoIconEmoji.test.ts src/state/repoIcon.test.ts \
  src/settings/rows/repoIconPopover.test.ts
```

[neighbors.tap](neighbors.tap): all 34 tests passed, zero failures or skips, including the merged #1045/#1048 icon composition. `npm run check:branding`, `npm run lint:colors`, and `git diff --check` passed.

Source/receipt verification:

```bash
python3 evidence/dialogs/section-name-input/verify_source.py --archive "$ORIGINAL_ARCHIVE"
```

Passed archive/renderer/full-span identities, explicit input-to-wrapper forwarding, fresh-main baseline identities, the exact two-attribute product diff, unchanged fixture, historical RED/new GREEN receipts, and existing workflow inclusion. The verifier reads retained JavaScript only as data.

## Verification limits

Full local typecheck/build and the full frontend suite were not run with the focused dependency subset. Hosted automatic exact-head CI and consuming macOS package verification are separate delivery checks, pending when this evidence was written.

Native correction/capitalization, visible/raster and side-by-side behavior remain unverified. No screenshot exists because runtime admission is prohibited. No server/browser/native app/provider/real picker ran. No runtime/native/install/queue changes or new admission; frozen work/native queue unchanged. No model witnesses were repeated. The strict invocation/deadline publication property remains **UNSATISFIED and unwaived**; this input-attribute fix does not address that property.
