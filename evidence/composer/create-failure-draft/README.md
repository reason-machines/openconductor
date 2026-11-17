# CREATE-FAILURE-DRAFT-135 — detached Create rejection recovery

Conductor Rebuild. Baseline: default main `74c004a95d7b10072f54f71ca611f22c50944f64`, fetched 17 November 2026. Historical #1432 and #1458 are preserved; `history/same135-before-create-failure-77df027` retains the prior Session tip. The exact ledger lease covers only Create failure metadata, two actual App warning callback bodies/imports, this new regression and this evidence directory. No Dialog/Page/Toast/Toaster API, selected-target restoration or shared editor change.

## Source finding and treatment

The accepted Create modal unmounts before local creation settles. Previously, its ordinary creation rejection sent only an error string to the persistent warning surface, leaving the submitted prompt inaccessible. The full-page composer already retained its editable draft, repository and target; that is a passing control, not a data-loss claim.

The retained REA route `pya/WUi → oya → Hji → GCi → OVn → n5 → l1` captures the pre-launch raw prompt, then offers **Recover prompt** on normal rejection if it is truthy. The action copies the exact captured string, not the replacement composer's state. It neither retries nor restores a target. `n5` contains clipboard rejection and confirms success only after the write completes.

Complete parent identities were reverified before treatment: renderer 11,600,457 bytes SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; index 3,493,297 bytes SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. `qualification.json` closes 15 complete declarations/statements, all UTF-8/UTF-16 ranges and hashes, 26 explicit caller/import/export/consumer joins and ten baseline source identities. The exact `ek as rc → We as ek → We` formatter join and `l1 → bS as xni → Q0e as bS → Q0e` clipboard join are included. Retained vendor JavaScript is inert evidence and was never executed. No new REA tool invocation or new REA gap occurred; prior native/extraction limits remain.

The treatment captures `draft.firstMessage` at the failure producer before the first await and sends optional `{ prompt }` metadata only on detached failure. Existing one-argument warning callers and full-page inline errors remain unchanged. Both App warning callbacks use the already-supported toast action and existing `features/openIn/apps.ts` `copyText` adapter, following the established LinkMenu/ChangesList success/error convention. They report `Copied prompt to clipboard` only after fulfillment and `Failed to copy to clipboard` on rejection. No formatter or clipboard transport is invented, and the adapter remains read-only.

## Preserved reproduction

Original mounted fixture v1 SHA-256: `66edcc8e10791bd49ff18fd9d0bafb6df48d22308715f1b50cbabf269ea72eba`. Its original bytes are retained as `history/frozen-v1.test.ts.txt`; qualification baseline and a current assigned-checkout baseline are both preserved. On unmodified baseline main: **8 total / 6 pass / 2 intended missing-action assertion failures / zero skips or cancellations**, exit 1. No fixture setup failure is counted as a product regression.

The two intended failures are dismissed nonempty-prompt recovery and a detached rejection while an unrelated replacement composer has a different draft, repository and target. The six controls preserve full-page editable recovery/retry, pending duplicate suppression, empty prompts, actual string-error formatting, successful creation and missing-repository behavior.

The actual Create dialog/composer and actual `useToasts/Toaster` mount. The exact two App warning arrow expressions and actual `errorText` declaration execute. Full App is not mounted. DOM/TipTap, surrounding controls, creation I/O and clipboard are inert ports. The original failed cases stop at the missing action, so their baseline post-click assertions are not claimed as exercised.

## Checks and replay

- PASS: original v1 baseline reproduces exactly 6P/2F; raw receipts retained.
- PASS: all 147 adjacent tests, zero failures/skips/cancellations (`adjacent-147.tap`).
- PASS: full-parent source verifier, all 15 spans / 26 joins / ten baseline source identities (`source-verification.log`, `qualification.json`).
- PASS: approved loader-only v2 SHA-256 `ba7a7f14799ecf0602d1235bf1cc11fe613e62625b82171f0e479ba0f00ecf5f` independently rebaselines **6P/2F**, then **8/8 pass** on treatment (`baseline-v2.tap`, `green.tap`). The only v2 changes bind actual `apps.ts` `copyText` and add inert `isTauri=false`; all eight original scenario/assertion/invocation bytes and ASTs remain identical. No copied helper or error formatter.
- PASS: eight supplemental real-App-callback/actual-adapter controls (`clipboard-controls.tap`): both callbacks preserve one-argument sticky errors, wait for clipboard fulfillment before success, and contain rejected or unavailable clipboard failures with no false success.
- PASS: strict fixture typecheck including unused-local/parameter flags; exact producer scope, exact two App callback/import scope, immutable clipboard adapter, eight read-only controls, frozen test/input integrity and `git diff --check`.

```bash
node --experimental-strip-types --test src/components/createWorkspaceFailureDraft.test.ts
node --experimental-strip-types --test --test-concurrency=1 src/components/createWorkspaceTargetFocus.test.ts src/components/createWorkspaceLaunchClose.test.ts src/components/createWorkspacePreparation.test.ts src/components/createWorkspaceNewlineShortcut.test.ts src/components/createWorkspaceSuggestions.test.ts src/components/createWorkspaceSuggestionsControls.test.ts src/components/createProjectPendingControls.test.ts src/workspace/createFlow.test.ts src/workspace/createInSection.test.ts src/workspace/launchModel.test.ts src/home/createFirstWorkspace.test.ts
node_modules/.bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck --noUnusedLocals --noUnusedParameters src/components/createWorkspaceFailureDraft.test.ts
node --test evidence/composer/create-failure-draft/clipboard-controls.test.mjs
node evidence/composer/create-failure-draft/verify.mjs
sha256sum -c evidence/composer/create-failure-draft/frozen-v2.sha256
sha256sum -c evidence/composer/create-failure-draft/clipboard-controls.sha256
git diff --check
```

For baseline replay, create a detached worktree at the named `74c004a95d7b10072f54f71ca611f22c50944f64` commit and run the current fixture with `OC_CREATE_FAILURE_SOURCE_ROOT` set to that worktree's absolute root. The fixture imports its React/TypeScript test dependencies from this checkout but loads product source from the pinned root. Expected result is exactly 6P/2F, exit 1. `verify.mjs` checks all ten named baseline identities against that commit and checks both archived original product blobs. It reads retained reference spans as data, never executes vendor JavaScript.

## Hosted CI compatibility correction — 17 November 2026

Hosted head `4e3768a61f0ef92acb6d9debcdcc98efa1cfc3c3` passed typecheck and colour lint, then failed the frontend suite with **5452 pass / 20 fail**. All twenty failures were strict App-shell fixture dependency errors, not recovery assertions: `Unexpected ../App.tsx dependency: ./features/openIn/apps.ts`. The skipped build step is not a build pass.

The two existing Palette fixtures (`createSection.test.ts` and `moveToSection.test.ts`) now each allow exactly the newly imported module with `{ copyText: forbidden }`. The adapter function throws if called: no clipboard success is fabricated, no production path changes, and their original scenarios/assertions/invocations remain byte/AST identical. Both complete originals, the twenty-error hosted log window, and local paired receipts are archived in `ci-compatibility/`.

- Reproduced before correction: those two files **6 pass / 20 fail**, all twenty missing-import errors.
- Passed after correction: unchanged **26/26** tests, no skipped or cancelled tests.
- Passed: frozen recovery eight plus original 147 adjacent tests, **155/155**; actual-adapter clipboard controls **8/8**.
- Passed: `node evidence/composer/create-failure-draft/ci-compatibility/verify.mjs` checks exact single-line ports, complete original file identities, unchanged test-call bytes/ASTs, all twenty hosted/local error identities, paired receipts and unchanged production/frozen fixture hashes.
- Passed: original source/scope verifier, both frozen fixture manifests and whitespace checks. No additional full local frontend pipeline, browser, native, real clipboard or package dispatch ran. Corrected exact-head hosted results are reported on the PR separately.

```bash
node --experimental-strip-types --test --test-concurrency=1 src/palette/createSection.test.ts src/palette/moveToSection.test.ts
node evidence/composer/create-failure-draft/ci-compatibility/verify.mjs
```

## Acceptance limits

No screenshot or recording exists: this source-only admission explicitly excludes a browser/server, runtime/native execution or real clipboard access. Tests prove callback/data-flow behavior through inert boundaries, not visible geometry, native focus, actual macOS clipboard permission or engine behavior. No full-app typecheck/build, Rust checks, provider run, package/release dispatch or duplicate watcher was started. Exact-head hosted CI remains a separate delivery check. Package inclusion and native acceptance, including existing #1458 obligations, stay with the existing canonical release custodians; merge and package/native acceptance are distinct facts.
