# Enabled split-tab consumer and center-layout lifecycle

Author: Conductor Rebuild / SAME1f. Candidate `TERMINAL-CENTER-PANEL-SPLIT-1F`.

## Finding and retained reference contract

Qualified at main `da5d179229db0ed3333b98235310928038bd2a26`. Main exposed the default-false **Split tabs** setting and declared Cmd+D, but WorkspaceView consumed neither the setting nor `nav.splitTab`.

This is an **enabled-mode source/dispatch defect**, NOT a claim that ordinary/default Cmd+D should split. Retained real-Conductor REA originals establish:

1. `experimental_configurable_center_panel` is boolean, default false. `gXo` calls `oSe` (index export `d9` -> `s5t` -> `ln(KE)`). False/unset mounts ordinary `Dji`; true mounts `bXo` -> `vXo`; `bXo` calls `yYo`.
2. `yYo` registers `nav.splitTab` at HIGH priority, resolves the active group/tab and requires at least two tabs. It sends the workspace/group/existing-tab key and a fresh group ID to `i2.splitCenterPanelGroup`.
3. Facade -> `Toe` -> `Tcs`: validate target and new ID, remove the existing tab from its source, choose a surviving active source tab, replace the source node with a horizontal **50/50** split (new group second), and activate the new group. No tab/session creation is part of this operation.
4. Reconciliation drops unavailable tabs and collapses empty branches. The persisted store `workspace-center-panel-layout-v1` owns layouts keyed by local workspace ID.

`qualification.json` contains FULL original archive/asset hashes, eleven exact half-open UTF-8 byte ranges and hashes, plus baseline source hashes. Full assets were independently hashed locally. Only bounded literal spans are committed; no reference JavaScript was evaluated.

Original archive: attachment `e78b8633-85a2-4561-a67c-ff7181b1d9fc`, SHA256 `991f15ebf130ccb8e705fc74f612dbb46095bd6d73b420fbced1ffbcd94165bc`.

The small qualification packet is retained as attachment `3cf7589c-6647-4f4a-a164-9b2f189e5e1c`, SHA256 `7740d3d95546eb291d7a6f9f0b939360b4a0fc064975b2095b0dfd20c0da0089`.

## Change and boundaries

- Existing table-backed `useBoolPref` is the admission. No default flip, new preference store or preference write.
- Pure layout/controller owns guards, immutable existing-key transfer, active-group selection, nested geometry, close reconciliation and per-workspace local persistence. Storage failure cannot disrupt live panes.
- Flat tab-keyed content siblings keep identity independent of group geometry; inactive tabs remain hidden/mounted. Focus scopes and selected-chat window actions prevent inactive panes receiving shortcuts/drops. Grouped auxiliary tabs do not clone the primary composer.
- Existing ordinary markup and close-selection behavior remain the disabled path; grouped close selects/collapses through the layout model. Explicit chat-navigation requests still win over restored group selection.
- Scope: existing `src/components/WorkspaceView.tsx` ONLY; new `src/features/workspace/{centerPanelLayout.ts,centerPanelLayout.test.ts,CenterPanelGroups.tsx,CenterPanelGroups.test.mjs,centerPanelGroups.css}` and this evidence directory. Chat and palette owners returned no collision; ledger admitted this exact scope.
- No `session.ts`, PTY, provider, registry, existing preference/state/shared-style, native or package changes.

## Verification

**Passed — inert provenance:**

```bash
python3 evidence/terminal/center-panel-split-1f/verify-reference.py
```

Eleven literal spans, four baseline source identities and the gate -> consumer -> model -> keyed-store chain match.

**Failed before / passed after — unchanged flag-aware source-dispatch fixture:**

```bash
SOURCE_REF=da5d179229db0ed3333b98235310928038bd2a26 \
  node --experimental-strip-types --test src/features/workspace/CenterPanelGroups.test.mjs
node --experimental-strip-types --test src/features/workspace/CenterPanelGroups.test.mjs
sha256sum -c evidence/terminal/center-panel-split-1f/fixture.sha256
```

Before: **4 controls passed / 4 intended enabled consumer cases failed**, exit 1. After: **8/8 passed**, exit 0. Same fixture SHA256 `31629817aa204c7408e8e842fe94c03d4bfa2790623bc0e52aed9689baba5a37`. Executes actual WorkspaceView callback registrations with real OpenConductor registry/binder/dispatcher and the real pure controller; no React mount or native dispatch. Covers false/unset fallback, ordinary tab cycling, typing/dialog exclusion, plain/custom Cmd+D, terminal-focus context and one-tab guard.

**Passed — source/pure lifecycle suite, 23/23:**

```bash
node --experimental-strip-types --test \
  src/features/workspace/centerPanelLayout.test.ts \
  src/features/workspace/CenterPanelGroups.test.mjs
```

Covers existing-key transfer, 50/50 and nested geometry, missing/duplicate guards, both close-collapse directions, active selection, new tab placement, keyed persistence/restore with stale tabs, corrupt/blocked storage, live disable/re-enable, actual table-pref semantics, scoped content identity source wiring and selected-chat drop routing. The `.test.ts` suite also runs the frozen `.mjs` fixture so the normal CI glob includes it.

**Partial — adjacent controls:** `adjacent.tap` records 38 passed / 1 dependency-loading failure. Command: `node --experimental-strip-types --test src/keybindings/{bind,dispatcher,resolve,focusScope}.test.ts src/features/terminal/attachmentOwnership.test.mjs src/features/terminal/shortcuts.test.ts`. `focusScope.test.ts` could not import local React; no assertion in it ran. It is not reported as passing.

**Failed locally — typecheck:** `npm run typecheck` exited 127 (`tsc: not found`). No install was attempted under the retained-only/no-install boundary. Hosted CI must supply full typecheck/build and dependency-backed regressions before merge.

**Passed:** color policy and `git diff --check`.

## CI adapter correction

Hosted head `8c48ec34112014115ac8a3234bb571adb1bb7d89` passed typecheck and color checks, but failed 64 frontend tests. The same nine-file regression command reproduced **61 passed / 64 failed** locally. Seven sandbox loaders treated the new `CenterPanelGroups.tsx` hook as a decorative component returning null; the Diff and focus-scope extraction fixtures also lacked the newly referenced disabled-layout/render locals.

The correction loads the **real** layout hook/controller in the seven existing mounted harnesses and supplies ordinary-mode context to the two extraction probes. It changes no product code, behavioral assertion, baseline source archive, split preference or runtime path. The disclosure host's sole added real-module classification requires renewing only its SHA256 in `fixture-freeze.json` from `79fe0b7bf9efd793e3ef647f7177339e1f5172fc13b4ca730861a12663d966c0` to `f54ad55a9f64d16efd974f319098e58f0fae53bc32bcb28b5940fecec685a9e0`; the five cases, exact intended baseline failures, proof loader and historical source pins remain unchanged. Its current-source integrity guard requires committed source for replay.

Reproduction command:

```bash
node --test --test-concurrency=2 \
  src/features/chat/{recentColdHydration,recentTranscriptIdentity,workspaceLocalClear,workspacePlanApproval,workspacePlanMode,disclosureRemount}.test.ts \
  src/features/diff/viewed.test.ts src/keybindings/focusScope.test.ts \
  src/palette/paletteOpenInLifecycle.test.ts
```

After correction, the full standard frontend glob passed **4,685/4,685 tests**, 3 suites, 0 failures/skips, using `NODE_ENV=development ONBOARDING_DOM_DEPS="$PWD/.oc-tmp/dom-deps" node --test --test-concurrency=4 'src/**/*.test.ts'`. Isolated DOM dependencies were `jsdom@26.1.0`, matching CI. The committed-source disclosure replay independently passed 2/2 outer checks, qualifying the unchanged five-case historical RED and current candidate GREEN. Local `npm run typecheck`, `npm run lint:colors` (6/6 + policy), `npm run build`, `verify-reference.py`, the frozen dispatcher SHA256 check and `git diff --check` all passed. Vite emitted non-fatal mixed-import/chunk-size warnings. These are local results, not hosted CI or native acceptance.

Ordinary cloud `npm ci --ignore-scripts --no-audit --no-fund` dependencies are now available for CI reproduction, explicitly cleared by the coordinator. No native app installation, server, provider/PTY operation or Mac access occurred.

## Limits and REA gap

The earlier declaration-only qualifier remains unchanged as `historical-qualification.mjs.txt` plus `historical-qualification-red.tap.gz`: **5 controls passed / 3 intended failures**. It is historical qualification, not the implementation acceptance fixture; its original scratch-relative imports are not a runnable test at this renamed archival path. The acceptance fixture above was frozen before production edits and provides RED -> GREEN.

Retained semantic renderer analysis was skipped after a worker heap exhaustion; it is not absence proof. Whole original bytes and exact spans recovered the missing contract without another REA run.

**Not run:** mounted React/UI, browser screenshot, fresh REA/native behavior, native input/focus, actual PTY/session survival or cold-start integration, build/package containment. The no-runtime/native/install boundary was preserved, so there is no product screenshot. Source key identity and synthetic focus context are not native proof. E1 remains sole reference/native owner; SAME135 retains package/native follow-through. No duplicate watcher or admission was created.
