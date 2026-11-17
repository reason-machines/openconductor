# CREATE-TARGET-FOCUS-135

Conductor Rebuild · qualified static REA source → mounted actual Create/Editor regression → minimal treatment.

## Change

At baseline `d90bed88174656d577adfa793d3850d28eaea7e2`, the shared Create composer only focuses its editor on mount. If it mounts without a selected available repository, a later repository arrival does not restore focus. The retained Conductor `dQo` lifecycle does.

Production treatment is exactly 19 added lines in `src/components/CreateWorkspaceComposer.tsx`: arm only when initially targetless; focus the current registered editor once when a selected repository exists; cancel on Tab or pointerdown; remove listeners on settlement, cancellation, and unmount. Existing mount autofocus remains. Switching already-available repositories does not refocus.

No ComposerEditor, TipTap engine, repository I/O, suggestions, WorkspaceView, terminal-focus, OS-drop-focus, provider, native or runtime changes.

## Retained source qualification

`qualification.json` records the retained full renderer parent SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` (11,600,457 bytes), exact UTF-8/UTF-16 ranges, and SHA-256 for every complete declaration. `reference/` contains complete `oya`, `K4a`, `q4a`, `Hji`, `dQo`, `hEe`, `lHt`, and the exact `pEe=hEe` alias statement: eight spans, 21 recomputed bindings. The chain connects reactive repositories through selected available target → Hji → dQo and the actual editor registration. No snippet is evaluated as instructions or executable application code.

`verify.mjs` replays syntax, span integrity, the 21 bindings, original baseline consumer assertions, fixture preservation, and the exact production insertion. An optional original full renderer argument additionally verifies every parent byte/code-unit range and full-parent hash.

## Frozen before/after

- Original v1 fixture SHA-256: `2c013fd034d0c4000f12d77680d65e8116cfda57b601d8b6ab63a5b0d6e69720`. Frozen baseline: 6 pass, 2 intended missing-focus failures; unchanged treatment: 8 pass. Original fixture and receipts remain immutable in `history/fixture-v1.test.ts.gz`, `baseline.tap.gz`, and `green.tap`.
- Compiler-compatible v2 SHA-256: `37af20994544881b504c156365538aef450cc864c02f0daec22e2319e47b6a6b`. The sole change removes an unused `dirname` import exposed by repository `noUnusedLocals`. Its own frozen main baseline again produced 6 pass / 2 intended failures, then the same v2 fixture produced 8 pass. `verify.mjs` requires byte equality after exactly this import deletion plus AST/text equality for all test/assertion invocations.
- Eight mounted cases exercise target arrival once, unrelated keys, Tab cancellation, pointer cancellation, available-at-mount/switching, targetless stability, unmount cleanup, and live editor-instance isolation. Actual CreateWorkspaceComposer and shared ComposerEditor execute; the DOM/TipTap engine, repository I/O and surrounding controls are inert ports. This is not native parity.
- Adjacent baseline: 139 pass. Initial treatment: 138 pass / 1 harness failure because the first no-repository launch fixture lacked document listeners. The approved sole legacy change adds inert `addEventListener`/`removeEventListener` methods to its first document mock; the second mock and every scenario/assertion/invocation remain unchanged. Original blob and failure log are preserved in `history/`.
- Final integrated run: 147 pass, 0 fail, 0 skipped, 0 cancelled. Includes new eight plus launch-close, preparation/Plan, newline, suggestions, suggestion controls, pending controls, create flow, section launch, launch model and first-workspace controls.
- Narrow fixture strict typechecking with repository unused-local/parameter flags: PASS after the import cleanup. Earlier failure retained. Color lint: PASS (6 harness tests and 1,257 source files).

The two initial source qualification loader errors are retained separately in `history/`; they were harness setup failures, not accepted RED baselines. Historical PR #1432 and its original qualification inputs were not reused or altered for this delivery.

## Replay

```bash
node evidence/composer/create-target-focus/verify.mjs [original-renderer-path]
node --experimental-strip-types --test src/components/createWorkspaceTargetFocus.test.ts
node --experimental-strip-types --test --test-concurrency=1 src/components/createWorkspaceTargetFocus.test.ts src/components/createWorkspaceLaunchClose.test.ts src/components/createWorkspacePreparation.test.ts src/components/createWorkspaceNewlineShortcut.test.ts src/components/createWorkspaceSuggestions.test.ts src/components/createWorkspaceSuggestionsControls.test.ts src/components/createProjectPendingControls.test.ts src/workspace/createFlow.test.ts src/workspace/createInSection.test.ts src/workspace/launchModel.test.ts src/home/createFirstWorkspace.test.ts
node_modules/.bin/tsc --noEmit --strict --noUnusedLocals --noUnusedParameters --target ES2021 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck src/components/createWorkspaceTargetFocus.test.ts
npm run lint:colors
sha256sum -c evidence/composer/create-target-focus/SHA256SUMS
```

## Limits

Full local `npm run typecheck` PASS and sequential `npm run build` PASS (Vite 45.74s, branding checks included; existing chunk-size warning only). The serialized slot was explicitly released with no owned npm/tsc/Vite process remaining. Hosted exact-head CI must also pass before merge. No new app build, browser/native interaction, provider dispatch or package verification was authorized for the qualification itself. There is no screenshot: this delivery was explicitly source/mounted-harness only. Packaged inclusion and real native focus behavior remain unverified and belong to the existing release/native owners.
