# Whole-message final preview grouping

Conductor Rebuild. Source-qualified grouping contract only; not mounted or native parity.

## Qualified source and scope

The unchanged retained REA-linked asset `index-BGEQ8YjU.js` is 3,493,297 bytes with SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. [The exact qualification](reference/QUALIFICATION.md) and [33-span manifest](reference/manifest.json) preserve the message-ID selection chain and both direct callers. The exact supplied asset and every saved literal were verified by byte ranges, lengths and hashes, never imported/evaluated/executed. This is retained extraction evidence, not a new installed-app observation.

`Att` selects message IDs; `hie` unions them across `Ett` segments. `_jt` applies `s.has(a.id)` to whole messages before collapse batching; `jOt` retains a selected message's content whole. The unrelated `hjt` last-text accessor is not called by either selector chain. These facts establish whole-message membership, not downstream per-part visual semantics.

Only `toolGroups.ts`, the new `protectedMessagePreview.test.ts`, and this evidence directory are in the treatment scope. WorkspaceView, providers, Terminal, native/runtime, shared styles and frozen reference helpers remain outside it.

## Frozen RED on post-merge main

After actual PR #1399 merge `802324ec1eeb3c25b27d7accbe8a0357b767342d`, refreshed default main was `fcbd2d2cb9e99dd9a66a94b8ee0b0b6780c400ac`. The assigned branch merged main as `b5e9ee40d269f084d1ae9badd6bd1730d3cedb3f`. Grouping/types/view sources matched that main before treatment.

The [frozen 10-case fixture](frozen-regression.mjs.txt) remains byte-identical to the pre-clearance qualification, SHA-256 `3a9bca3c929b42cd6064e459fd0836b04c36b22999d6a29604fbd7956daeb705`. It executes only locally authored tests and product code. The permanent typed test checks its hash and runs these exact bytes against copies of the current product modules in a disposable directory, without rewriting expectations or requiring vendor execution.

**Reproduced:** three intended failures, seven passing controls, zero skips. [Raw RED TAP, compressed without normalization](red.tap.gz).

- Failing cases: multipart final text; final text/tool/text; already-visible thinking plus final text. Each currently protects only the last text part and allows earlier parts of the same message into a summary.
- Passing controls: single final text; latest ordinary text; later ordinary tool-only message; later AskUserQuestion inhibition; final text after ExitPlanMode; nonfinal block; blank final parts.

## Correction and GREEN

The correction changes the ordinary preview selector from a part index to its message key, then protects visible parts with that key. It retains the existing reverse scan, request inhibition and nonfinal guard. Hidden tool metadata is not emitted as a visible preview part. No reducer, view, renderer or provider code changes.

**Passed on Reason Cloud:**

- Exact frozen fixture, unchanged bytes: **10/10**, zero skips. [Raw GREEN TAP](green.tap). The same runner command used for RED/GREEN was `node --experimental-strip-types --test --test-concurrency=1 .ara-state/tmp/preview-selector-be7/main/protected-message-preview.test.mjs`, with only product `toolGroups.ts` updated in the disposable graph.
- `node --experimental-strip-types --test --test-concurrency=1 src/features/chat/protectedMessagePreview.test.ts src/features/chat/summaryMessageCounts.test.ts src/features/chat/toolGroups.test.ts src/features/chat/view.test.ts src/features/chat/reducer.test.ts src/features/chat/assistantToolVisibility.test.ts src/features/chat/thinkingChip.test.ts src/features/chat/turnTime.test.ts src/features/chat/turnMenu.test.ts src/features/chat/fork.test.ts`: **107/107**, zero skips. [Raw output](adjacent.tap). This includes the permanent frozen-fixture runner, a hidden-tool/input-immutability guard, #1399's count regression, reducer/view/fold paths, collaboration visibility and existing turn behavior.
- `python3 evidence/chat/tool-disclosure-remount/verify_baseline_root.py`: passed its frozen source/archive preflight. [Exact result](preservation.json). This is preservation, not JavaScript or UI behavior.
- Full asset, all 33 literal lengths/ranges/hashes, the frozen fixture digest, focused scope, `git diff --check` and staged whitespace: passed.

Full local typecheck/build was **not run** because this checkout has no installed dependencies; exact-head automatic frontend CI owns that gate. No test/check was skipped, disabled or weakened to obtain GREEN. Local regression commit `c4d7953c` preceded product edits; the server publication may squash local commits.

## Verification limits

Source/range qualification and grouping checks are separate from mounted UI, exported renderer-chunk behavior, provider delivery, built-package containment and native acceptance. None of the latter is asserted or dispatched here. There is no screenshot because this lane excludes runtime/native dispatch. Existing package/native owners retain that work; no duplicate campaign or watcher is created.
