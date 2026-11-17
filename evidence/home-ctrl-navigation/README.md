# Home Ctrl-letter adjacent selection

Conductor Rebuild / Home271 — `HOME-CTRL-LETTER-NAVIGATION-271`.

## Change and ownership

Home Search now treats lowercase **Ctrl+N / Ctrl+J** as next-row selection and
**Ctrl+P / Ctrl+K** as previous-row selection. These reuse the existing clamped
ArrowDown/ArrowUp selection branches, without opening a workspace. In an empty
result list, these four shortcuts cancel the event without selecting or opening
anything. Enter remains the separate activation path.

Only Search `onSearchKey` in `src/components/AllWorkspaces.tsx` changes. The new
mounted regression and this evidence directory are the other leased paths.
There is no palette, dispatch, CSS, persistence or shortcut-registry change.
Combined Ctrl+Meta/Alt letters remain untouched rather than extending this
repair to unqualified endpoint/group behavior. The new recognition does not
normalize uppercase letters. Existing composing/consumed-event guards stay
first in the handler.

This is separate from #1387's selected-row reveal. Source preparation occurred
locally while #1387 was open; no Ctrl-letter repair was published into it.
Delivery is against main after #1387 merges, not stacked on its open branch.

## Historical REA source contract

[Reference manifest](reference.json) pins the original qualification main
`c821b27519ab1831cf62dce6d236337bf75cc3e0`, component SHA-256
`22ac2e190bcfab6a02b86d6f4d3ae74990a4965e428f76fef63654f728eca1b0`,
seven retained span byte/UTF-16 ranges and hashes, P6 binding, and both fixture
identities. Every retained span's bytes, SHA-256 and range length, plus the
separate P6 binding, were checked again before the product edit.

The retained Conductor 0.87.6 renderer is `renderApp-D_fmY7hW.js`, recorded
11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`,
inherited REA parent
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.
The whole asset and real app were **not reacquired** during this repair.

- [Retained endpoint spans](../home-keyboard-endpoints/retained-reference.json):
  `UJo` mounts `KV` with no `vimBindings` override; `KV` forwards its remaining
  props to `P6`.
- [Retained P6 binding](../home-ime/reference/command-component-P6.js.txt):
  `P6=Object.assign(Xyi,...)`.
- The retained `Xyi` span defaults `vimBindings` to true, maps lowercase
  Ctrl+N/J to `Z` and Ctrl+P/K to `se`, and cancels the event before selection.
  Without Meta/Alt, these call adjacent helper `Q`, not Enter's activation.
  Xyi bytes `[2903072,2908580)`, SHA-256
  `2701c99fba31d3c09d171e08b3c5bc5a157fea048c5aab293a4c271728933d92`.

This is historical retained-source evidence, **not fresh native observation**.
Reference JavaScript was read as data and never evaluated. No new REA call or
acquisition failure occurred; prior semantic-renderer heap limitations remain
unchanged.

## Portable frozen regression: RED then unchanged GREEN

The original scratch fixture SHA-256 is
`659e5894c742559bc1d9eef8183853745221d48e5b3d4176a721dee6177657dc`.
Its baseline-pinned loader and absolute imports could establish only its old
RED result, not test a future repair.

Before the product edit, only imports/types and the source loader were ported
to repository-relative production files. All nine test case bodies and
assertions are byte-identical to the original. The portable fixture was frozen
at SHA-256
`94b13df577538e95a8a443ac1279590113dceccf4b2cca5d9d7348bbeb7390ca`
in [fixture.sha256](fixture.sha256) **before** its fresh RED run. The loader
reads the real adjacent `AllWorkspaces.tsx`, not the exported baseline.

```bash
timeout 90s node --max-old-space-size=512 --experimental-strip-types \
  --test --test-concurrency=1 src/components/homeCtrlNavigation.test.ts
sha256sum -c evidence/home-ctrl-navigation/fixture.sha256
```

- **RED reproduced:** [raw receipt](red.txt), exit 1, **3 passed / 6 failed**.
  Four Ctrl-letter cases leave the previous selection unchanged; filtered
  navigation and empty-results cancellation also fail. All three controls pass.
  There are no setup/import failures, skips or cancellations.
- **Unchanged GREEN passed:** [raw receipt](green.txt), exit 0, **9/9 passed**.
  The frozen fixture digest still matches after execution.
- **Adjacent checks passed:** [raw receipt](adjacent.txt), exit 0, **173/173**:

  ```bash
  timeout 120s node --max-old-space-size=768 --experimental-strip-types \
    --test --test-concurrency=1 src/components/allWorkspaces*.test.ts \
    src/components/home*.test.ts src/home/*.test.ts
  ```

- **Typecheck failed:** [raw diagnostic](typecheck.txt), exit 2:

  ```bash
  timeout 120s node --max-old-space-size=2048 node_modules/typescript/bin/tsc --noEmit
  ```

  The sole diagnostic is TS2307, missing existing `@tauri-apps/plugin-fs` in
  this checkout's dependencies, also recorded by #1382/#1387. No dependency was
  installed and no manifest changed. A hosted installed-dependency check is a
  separate exact-head verification, not a local pass.
- **Product/test whitespace passed:** `git diff --cached --check --
  src/components/AllWorkspaces.tsx src/components/homeCtrlNavigation.test.ts`.
  The full staged whitespace check **failed** on 12 whitespace-only lines
  emitted by `node:test` in the raw RED receipt. That receipt is preserved
  byte-for-byte so its recorded SHA-256 remains valid; this is not a
  product/test-source whitespace failure.

The regression mounts real React, the production Home component and the real
KeybindingsProvider. It invokes the rendered Search callback with cancelable
Event objects. Unrelated IO/preferences/icons have adapters; navigation,
selection, row ordering, filtering and Enter activation are not mocked.
Controls cover plain/uppercase letters, composition, legacy keyCode 229,
already-consumed events, and existing Arrow/End/Enter behavior. These are
source-unit checks, not physical-key or browser tests.

## Deferred acceptance: browser/package/native NOT_RUN

No screenshot exists: this lane has no product runtime/browser/native admission.
No Mac/native dispatch, server, install, provider turn, workflow dispatch/rerun
or replacement executor occurred. The existing sole native executor retains
identified-build acceptance, using the required isolated disposable profile:

1. Confirm a packaged build contains the repair and record its source/build
   identity before testing behavior.
2. Focus Home Search; verify Ctrl+N/J/P/K move among visible and filtered rows
   without activation, clamp at the ends, and keep the selected row visible.
3. Verify plain Enter opens exactly the selected workspace; empty/no-match
   results cancel the four keys without opening anything.
4. Verify plain/uppercase text entry, IME, consumed events, ordinary arrows,
   Home/End and pointer activation remain intact. Browser/OS interception,
   propagation and modifier combinations need their own observed evidence.

Package inclusion, visual parity, scroll geometry, browser/native interception
and combined Ctrl+Meta/Alt-letter behavior were **NOT_RUN** here. Source-unit
GREEN alone does not establish those properties.
