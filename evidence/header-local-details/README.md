# Local workspace-name details

Conductor Rebuild adds the missing primary-activation details popup to the local workspace label. The popup uses the existing Base UI popover and workspace Rename/Actions implementations. The only WorkspaceView change passes repository metadata within the cleared header caller.

## Reference and current source

Checked main `85194324762be7c00ba8d092c4e00bdb564f1ac4`. The header has right-click actions but no primary details trigger or content. Its original bytes are retained in `WorkspaceNameHeader.baseline.tsx.txt`, SHA256 `f3d487eb9e62229e6e5d03595a7f19ab9b69b60374bd9bf9f64ccc3560dd31dc`.

The retained real-app REA target is Conductor 0.87.6, evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. A read-only check on Sven's `sven m5 max` confirmed the installed binary remains SHA256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`. No app launch, live UI observation or new REA extraction ran.

`source.json` retains source pins and 32 exact UTF-8/UTF-16 spans:

- Renderer `Llo/o8i/a8i`, retained in the earlier source/focus packets, define the controlled label popup, repository/creation rows, Rename and workspace actions. Base UI supplies nonmodal dialog semantics, keyboard activation, default dismissal and focus management; the popup explicitly focuses itself.
- Native index `w_` sets creator identity to undefined for local workspaces. `Blo` uses a resolved name or email only, and `nSe` is the imported `cC`, not the unrelated index function with the same minified name. Its `PVe/ko` query is disabled for undefined identity. No new identity field, fake creator, profile request or cloud UI is needed.
- Renderer `SS/Ece/Nai` defines time conversion, invalid values, future clamping and rounded calendar distance. The existing age calculation is reused behind a narrow falsy/invalid-Date boundary. Local timestamps stay numeric; date parsing and persistence are unchanged.

The inline folder-git-2 and clock shapes are Lucide geometry from the retained renderer's `Jui/VLt` and `_ui/bI` declarations. Lucide Icons and Contributors, ISC License, as with the repository's existing menu icons.

## Checks

Passed on Reason Cloud352:

```bash
python3 .ara-state/header-details-data-v4/qualify.py
git diff --check
```

The source qualifier passed 25 checks, including unchanged dependencies, original Prefix9 bytes, pinned baseline, and the single caller-prop delta. It did not run JavaScript or the product.

Prepared focused regression command, not executed locally:

```bash
timeout 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/workspaceDetails.test.ts
```

The regression includes a pinned-main replay that expects the missing-primary-activation failure while checking original right-click behavior, followed by candidate cases for activation, local fields, absent creator, missing repository, zero/NaN/invalid/future timestamps, rounding boundaries, existing Rename/Actions, and dismissal delegation. Its popover transport is mocked; the actual age calculator runs with a fixed clock. This is not a claim that the replay or candidate passed before CI executes it.

Prepared adjacent command, not executed locally:

```bash
timeout 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/workspaceBranchHeader.test.ts src/home/dashboard.test.ts src/state/persisted.test.ts
```

Local runtime remains subject to the existing serialized allocator. No install, local Node/tests/typecheck/lint/build, server, browser, native/provider or package checks ran. Standard exact-head pull-request CI covers the new test file and typecheck/build without introducing a custom workflow or dispatcher.

## Limits and ownership

No screenshot is attached because shared browser/server/native execution has not been admitted. Actual Base UI focus, touch interaction, native nested-menu behavior, rendered parity and package consumption are unverified. There is no claim that source qualification proves those behaviors.

This is the existing SAME271 local-header-details scope. Prefix9 and Title4 inputs remain unchanged; no duplicate row, owner, publisher or executor was created. DE6's review/chat glue is untouched. Release owner `992a715e-aafd-49b0-88ba-9cabca1a3126` retains package/native consumption, outside the unchanged #992 cut. Merge waits for all enabled checks on the exact published head.
