# Accepted workspace launch closes its modal

Conductor Rebuild. Product scope is `CreateWorkspaceDialog.tsx` and `CreateWorkspaceComposer.tsx`.

## Reference and source identity

Current main `4b6bc34e93c4fa9ab3eaa042e855b77bd712a926` was fetched and reread before the patch. All eight source snapshots in the prior qualification still match. The current-main receipt is `current-main.json`.

Retained Conductor 0.87.6 renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The index SHA-256 is `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. `retained-source.json` preserves the original qualification, full-asset identities, half-open UTF-8 span offsets and REA lineage. Its 20 source slices are in `reference/`.

For the qualified accepted local launch, `pya` provides `closeDialogId` through `WUi` to `oya`. `oya` supplies its launch-start callback to `Hji`. After the readiness guards and client pending registration through `qCi`, `Hji` requests close and then awaits `GCi`. `GCi` invokes the workspace creation mutation. This proves callback order in retained shipped bytes. It does not establish a measured native dismissal time or that a currently installed Conductor version has these same bytes. The original semantic renderer REA pass exhausted heap; the retained asset is read as data, not executed.

## Change

The modal supplies an accepted-launch callback to the shared composer. After validation, pending registration and the local-checkout guard, that callback requests close before asynchronous repository registration and workspace creation. Full-page creation has no such callback and retains completion-time closure and inline failures.

A modal launch records whether it dismissed at launch. Late success then cannot invoke the old close callback against a replacement dialog. Late failure uses the existing persistent `onWarning` surface that App renders as a sticky error toast. Existing setup, first message, section dispatch and pending-launch cleanup remain in the same pipeline.

## Regression inputs

`src/components/createWorkspaceLaunchClose.test.ts` mounts the actual composer/dialog lifecycle with controlled external dependencies and real request validation. Its dialog primitives are test doubles, so this is component lifecycle coverage, not browser focus or native proof. It exercises accepted close ordering, late replacement success, detached failure, full-page success and failure, pending duplicate rejection, invalid input, missing checkout, missing repository, first message, sections and both setup outcomes.

The baseline command reads only the two product components from an exact-main snapshot:

```bash
OC_LAUNCH_CLOSE_SOURCE_ROOT=evidence/dialogs/workspace-launch-close/baseline node --experimental-strip-types --test src/components/createWorkspaceLaunchClose.test.ts
```

The identical candidate assertions run without that source-root override:

```bash
node --experimental-strip-types --test src/components/createWorkspaceLaunchClose.test.ts
npm run typecheck
```

The original tracked browser file is preserved byte-for-byte as `create-workspace-dialog.original.mjs`. The first three focus cases and their helper remain byte-identical. Only case 4's obsolete keep-open expectation is migrated, with the creating Session's explicit instruction, to accepted dismissal plus persistent failure reporting while a replacement dialog stays open. The original Keyboard4 fixture, driver, HTML, wrapper and NAME input are untouched.

The existing `tools/dialogs/index.html?workspaceFixture=1` page mounts the actual components with a deferred creation bridge. Browser evidence must use the supported preview and scoped browser tools under ACC's admission, not an extra browser executor. The retained native E1 lane remains separate.

## Verification state

Passed before runtime admission: exact-main source readback, five frozen-input SHA-256 checks, original first-three browser cases byte comparison and `git diff --check`.

Component baseline/candidate, typecheck, preview/browser, build, packaged application and native checks are not yet run. ACC has this same owner's distinct unit at the existing canonical queue tail. Source preparation is not a product RED/GREEN result. The original Keyboard4 90-second adapter failure and interrupted v6 run remain separate evidence, not results for this change.
