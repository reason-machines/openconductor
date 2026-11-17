# Settings search target reveal

Conductor Rebuild · SEARCH-REVEAL-49 · 17 November 2026

## Reproduced discrepancy and smallest repair

Fresh default branch `d90bed88174656d577adfa793d3850d28eaea7e2` still top-aligns a matching Settings row without emitting its reveal highlight. The retained original's final `Eki` consumer requests centered scrolling and, when Web Animations is supported, a temporary outline on the direct reveal frame or the row itself.

Only the body of exported `scrollToRow` in `src/settings/SettingsView.tsx` changes: `block: "center"`, a direct `:scope > [data-reveal-frame]` lookup with row fallback, and a `typeof animate === "function"` guard around the exact retained keyframes/options. The existing theme's `--ring` token is used. Selectors, exact-title matching, bounded requestAnimationFrame retry, no-row handling, caller routes, provider selection and #1451's remembered repository ref are unchanged. PaletteHost is read-only; it already consumes this helper.

The ledger granted this exact helper/test/evidence lease, with no conflicting writer. No old harness ports or existing test changes were needed: the earlier activation loader supplies no matching DOM rows, the Palette caller fixture stubs the helper, and the frozen new fixture already includes the required host methods. No reduced-motion, cancellation or new motion policy is invented from evidence that does not specify one.

## Complete inert retained REA contract

`source-closure.json` is the preserved qualification packet at main `ee7bb510506906a08e2acff5e196a484bffb1480`; its historical status fields predate the lease and repair. `fresh-main.json` independently pins all eleven source owners at fresh main `d90bed88174656d577adfa793d3850d28eaea7e2`, byte-identical to qualification before the edit.

The complete retained renderer is **11,600,457 bytes**, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. It was read and hashed as data, never evaluated or mounted. Sixteen complete declarations, their UTF-8 half-open ranges and hashes close:

- `a9a` click/Enter activation → `wGt` navigation; `xUi → _Ui → pUi → Dba` target construction and `Uba` gating.
- `_5` route scrollTo → `gSa → mSa`: matching identity calls `Eki` through the row ref.
- `Zzt/Cki → eUt/hS → Al`: the actual data-settings-row element has the ref and a direct data-reveal-frame child.
- `Eki` performs `scrollIntoView({block:"center"})`, selects the direct frame or row, and conditionally calls animate. The outline is `2px solid var(--ring)` at offsets 0 and 0.55, then transparent; outlineOffset is 8px, duration 1400ms and easing ease-out.

Original source was parsed only during qualification. The original REA acquisition/semantic-analysis limitations remain in upstream evidence; no new acquisition or REA tool gap occurred in this pass.

## Frozen actual-helper and mounted regression

`reveal.test.cjs` is byte-for-byte the pre-repair fixture, SHA-256:

`c28e05ab904e4349c9aca2de423e5ecfec8d3645e8ace1535391953384c34cc0`.

`src/settings/settingsSearchReveal.test.ts` only loads that fixture. It transpiles the actual SettingsView/SettingsSearch modules and uses the real search index, fuzzy matcher, page groups and routes. Account/provider/storage/network/page bodies and host DOM methods are controlled. It does not run original Conductor JavaScript.

```bash
node --experimental-strip-types --test --test-concurrency=1 src/settings/settingsSearchReveal.test.ts
```

**Fresh main before repair: 3 passed / 7 intended assertion failures** (`red-fresh-main.tap`), all `ERR_ASSERTION`, no loader/setup failure. The exact baseline SettingsView is preserved in `baseline-SettingsView.tsx.txt`.

**Identical fixture after repair: 10/10 passed** (`green.tap`). Cases cover:

1. Center the exact matching row.
2. Animate a direct reveal frame rather than the outer row.
3. Fall back to row animation when no reveal frame exists.
4. Missing Web Animations support is harmless.
5. Actual mounted search click requests the target reveal.
6. Actual mounted Enter activation requests the target reveal.
7. A page-only result schedules no reveal.
8. Existing delayed-row retry reveals once when the target appears.
9. An absent target exhausts its bounded retries harmlessly.
10. Preserve the first exact match, excluding unrelated and duplicate later rows.

The controls for absent Web Animations, page-only targets and exhausted retries already passed before repair. Every other case failed an expected scroll or animation assertion. Query clearing and destination routing are checked during activation. Retry/label selection are OpenConductor nonregression controls, not a claim that the original uses this retry mechanism.

## Adjacent caller and source checks

```bash
# Fresh-main baseline: 41/41 passed (adjacent-before.tap).
node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/searchIndex.test.ts src/settings/routes.test.ts \
  src/settings/providerTab.test.ts src/palette/settingsRepository.test.ts

# Treatment: 56/56 passed (adjacent-after.tap).
node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/searchIndex.test.ts src/settings/routes.test.ts \
  src/settings/providerTab.test.ts src/palette/settingsRepository.test.ts \
  src/settings/settingsSearchActivation.test.ts src/settings/settingsSearchShortcutHint.test.ts

# Full original identity/span, source freshness, scope, freeze and receipts.
python3 evidence/settings/search-reveal/verify.py \
  --renderer .oc-tmp/settings-loader-reference/renderApp-D_fmY7hW.js

# Passed six rule tests plus source scan; raw log retained.
npm run lint:colors

git diff --check
```

The existing PaletteHost callback controls preserve its remembered-repository/page/provider/row handoffs. The 56-case focused suite is not a full frontend test-suite claim. No closed async, scrollback, font or completion fixture was rerun. #1451's mounted fixture is included only as a neighboring navigation nonregression control.

Full local TypeScript/build is **NOT_RUN**: no serialized heavy slot was requested or consumed; exact-head hosted CI will exercise those checks. Conditional skipped jobs must not be described as passing executions. Merge only once all executed exact-head checks pass.

## Acceptance boundaries

This proves emitted method calls and controlled mounted activation, **not visible geometry, smoothness, paint or native motion**. No screenshot/recording is available because browser/native/runtime admission remains with the existing serialized owners and this lane was explicitly kept inert. No provider launch, installation, physical persistence, native keyboard/focus delivery, package build or duplicate watcher was started.

Actual browser/native centered geometry, outline appearance under themes, physical click/keyboard/focus delivery, installed consuming-build identity, packaged/embedded inclusion and full side-by-side acceptance remain **unverified**. Existing release/native custody is unchanged. After merge, the existing custodian must prove actual-squash inclusion and retest click/Enter reveal, direct-frame/row fallback, no-Web-Animations and missing-row controls on the consuming build; this lane does not claim that acceptance.
