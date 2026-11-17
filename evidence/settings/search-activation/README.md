# Settings search: retain the last viewed repository

Conductor Rebuild · SETTINGS-SEARCH-LAST-REPO-49 · 2026-11-17

## Qualified discrepancy

At unchanged default branch `2ada6e3e186391695cae1ce5694ac251a6323079`, visit Beta's repository Settings, navigate to Personal → General, then search and activate Scripts, Actions, or Misc. OpenConductor incorrectly navigates to Alpha, the first repository. The retained Conductor controller remembers Beta while it remains selectable.

This is distinct from outside-press dismissal, shortcut hints, search-result caps, global shortcut recording, the closed Big terminal async seam, and Advanced scrollback. No team/org/cloud behavior is inferred.

## Retained source contract

`reference.json` contains 22 complete inert source spans from the REA-retained original renderer `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The full renderer and every UTF-8 half-open span were rehashed on Reason Cloud 1 before qualification. Original JavaScript was never evaluated or mounted.

- `L9a` retains `se` as the last viewed repository. On a repository route, `g` replaces `se`. After navigating to a personal Settings page, `g` is undefined but `se` remains.
- `bUi({selectableRepos:B,lastViewedId:se})` chooses the remembered selectable repository, falling back to `B[0]` only if it is missing.
- Eligibility: `k1e` → `Tet`. Initial memory: `$9a` → `gUi` (prior route). Those complete functions are retained, but the bounded repair/test is only same-mounted-Settings memory, not global app history or eligibility parity.
- `L9a` passes `searchRepoId: Q?de:void 0` → `I9a` → `a9a`. Result click/Enter calls `wGt` with that current repository id before clearing the query.
- `wGt` maps a repo-section result through `BCe` and preserves its `scrollTo`; `xUi`, `pUi`, and `Dba` preserve the target type. `_5` → `gSa` → `mSa` → `Eki` is the separate retained row-scroll consumer. No browser geometry or timing claim follows from those spans.

The current production path and related source hashes/blob identities at the qualification pin are in `reference.json`. A fresh identity comparison additionally found all 104 previously catalogued Settings source owners unchanged at that pin; this is source custody, not 104 tested controls.

## Frozen actual-component regression

`activation.test.cjs` loads the unchanged actual `SettingsView`, `SettingsSearch`, real search index, fuzzy matching, page groups and route definitions. It replaces external account/provider/backend/organization/page-body boundaries and supplies inert host refs. Each repo is a self-contained invented fixture; no filesystem or account data is read.

The exact fixture was frozen before the decisive baseline:

SHA-256 `50da45b6a2f39eefb42652dada3ab38e403d438efb7bda102bb8ab914eaa12b5`.

`src/settings/settingsSearchActivation.test.ts` is the Node test entry point, loading that same frozen fixture without duplicating it.

```bash
node --experimental-strip-types --test --test-concurrency=1 src/settings/settingsSearchActivation.test.ts
```

**Before: 4 passed / 5 intended assertion failures.** `baseline.tap.gz` retains the standalone fixture result. The entry point reproduced the same result before product edits. All five failures report actual `repoId: alpha` versus expected `repoId: beta`:

1. Beta → General → Scripts click.
2. Beta → General → Actions click.
3. Beta → General → Misc click.
4. Beta → General → Scripts Enter activation.
5. Alpha → Beta → General → Misc (latest repository wins).

**After: 9/9 passed using the identical frozen fixture** (`green.tap`). The repair stores the last valid repository visited within the mounted Settings shell in a ref, updated after the repo view commits. `openResult` still prefers the currently viewed repo, then the remembered repo only while it exists, then the first repository. It adds no global history, storage or service state.

Passing controls: no-history first-repo fallback, the currently viewed Beta, removed remembered Beta falling back to Alpha, and personal Appearance remaining personal. Query clearing is asserted after every activation. Search ranking itself is not changed.

### Preserved harness-only correction

The first fixture attempt (`activation.v1.harness-rejected.cjs`, `harness-v1.tap`) was invalid because the custom CommonJS transpiler omitted default-import interop required by `fuzzysort`. It failed all nine tests before destination assertions. That is not a product RED. The only correction enabled TypeScript `esModuleInterop` in the test loader, then re-froze the fixture before rerunning the unchanged production source. The decisive fixture has no harness failures.

## Adjacent checks

```bash
node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/searchIndex.test.ts src/settings/routes.test.ts \
  src/settings/settingsSearchShortcutHint.test.ts src/settings/providerTab.test.ts
```

Passed: 31/31 before any product change (`adjacent.tap`), then 31/31 again after the repair (`adjacent-green.tap`).

`python3 evidence/settings/search-activation/verify.py` passed 87 source/evidence checks, including the full retained renderer, 22 complete spans, preserved v1 harness, frozen decisive fixture, baseline identity and RED/GREEN summaries. `npm run lint:colors` passed all six rule checks plus the source scan (`lint-colors.log`).

Full build/TypeScript awaits the serialized heavy-check admission; no overlapping heavy check was started.

## Acceptance boundaries

This is mounted callback/state evidence, not a full Settings side-by-side or installed-app verdict. No native/browser/runtime/package executor, provider operation, user data change, new acquisition or watcher was started. OS keyboard/focus delivery, actual scroll geometry/paint, global prior-route seeding, real persistence/restart and package inclusion remain unverified. Runtime/package custody remains with the existing serialized owners. No new REA tool operation or gap was encountered; the original retained-source acquisition limitations remain in the upstream evidence notes.
