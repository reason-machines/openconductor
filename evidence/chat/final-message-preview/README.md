# Whole-message final preview grouping

Conductor Rebuild. Source-qualified grouping contract only; not mounted or native parity.

## Qualified source and scope

The unchanged retained REA-linked asset `index-BGEQ8YjU.js` is 3,493,297 bytes with SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. [The exact qualification](reference/QUALIFICATION.md) and [33-span manifest](reference/manifest.json) preserve the message-ID selection chain and both direct callers. The exact supplied asset and every saved literal were verified by byte ranges, lengths and hashes, never imported/evaluated/executed. This is retained extraction evidence, not a new installed-app observation.

`Att` selects message IDs; `hie` unions them across `Ett` segments. `_jt` applies `s.has(a.id)` to whole messages before collapse batching; `jOt` retains a selected message's content whole. The unrelated `hjt` last-text accessor is not called by either selector chain. These facts establish whole-message membership, not downstream per-part visual semantics.

The initial treatment scope was `toolGroups.ts`, the new `protectedMessagePreview.test.ts`, and this evidence directory. The coordinator then cleared `transcriptAgentSummary.test.ts` only for the CI fixture correction below. WorkspaceView, providers, Terminal, native/runtime, shared styles and frozen reference helpers remain outside it.

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

Dependencies were subsequently restored without package/lockfile edits. Full local typecheck and production frontend build passed, including again after the CI correction below. Exact-head automatic frontend CI remains independently required. No test/check was skipped, disabled or weakened to obtain GREEN. Local regression commit `c4d7953c` preceded product edits; the server publication may squash local commits.

## CI display-fixture correction

The first published head `edd1e3f7d71464fe906a3db51ff381fd0970f8ef` passed hosted typecheck but failed frontend tests: **4,753 passed / 1 failed**. The sole outer failure was the display-filter emphasis check in `transcriptAgentSummary.test.ts`. It put two text blocks in one message while expecting only the final block to receive preview emphasis, contradicting the retained message-ID contract. Re-reading the exact `_jt` literal confirmed membership is `s.has(a.id)` for the whole message.

The unchanged test file reproduced **49 passed / 1 failed** locally: `NODE_ENV=development node --experimental-strip-types --test src/features/chat/transcriptAgentSummary.test.ts`. [Complete RED output](display-red.tap.gz).

The narrow test-only correction preserves both original emphasis assertions using two distinct assistant message IDs. Two additional cases exercise the real extracted React `Transcript`/`Part` functions with same-message multipart text: filter off/on, preview emphasis on both parts, correct displayed strings and byte-identical stored input. No production code or frozen fixture changed. This is React static rendering with explicit leaf mocks, not full mounted/native acceptance.

- **Focused PASS 159/159, zero skips:** the earlier ten-file command plus `src/features/chat/transcriptAgentSummary.test.ts`, with `NODE_ENV=development`. [Complete output](display-focused-green.tap.gz).
- **Full local suite PARTIAL:** clean committed head `70f0ff5ee7ae2a921f075c7cb46dfc2ec6a45ac4`; `NODE_ENV=development ONBOARDING_DOM_DEPS="$PWD/.ara-state/tmp/pr1404-dom-deps" nice -n 19 node --experimental-strip-types --test --test-concurrency=4 'src/**/*.test.ts'` — **4,754 passed / 2 failed / 0 skipped**, 3 suites, 764.16 seconds. Isolated jsdom was exactly 26.1.0, installed with scripts disabled. Both failures were Caffeinate whole-main baseline/current graph checks: the baseline off control and several current cases hit navigation-stage `page.goto` 30-second timeouts before product assertions; the baseline regression still reached its intended missing-effect assertion, but its failed control invalidates RED qualification. No timeout cause is established. No Caffeinate source, fixture, assertion or deadline was changed. [Complete full-suite output](full-suite.tap.gz).
- **Fresh typecheck PASS:** `nice -n 19 npm run typecheck`, exit 0.
- **Fresh production build PASS:** `nice -n 19 npm run build`, exit 0; Vite completed in 3m 18s with non-failing chunk-size warnings.
- Frozen ten-case fixture digest remains `3a9bca3c929b42cd6064e459fd0836b04c36b22999d6a29604fbd7956daeb705`. Exact-head hosted checks must all pass before merge; local full-suite success is not claimed.

## Verification limits

Source/range qualification, grouping checks and the extracted React static-rendering probe are separate from full mounted UI, exported renderer-chunk behavior, provider delivery, built-package containment and native acceptance. The full-suite browser graph attempt above was partial and grants none of those acceptance claims. There is no screenshot because this lane excludes runtime/native acceptance dispatch. Existing package/native owners retain that work; no duplicate campaign or watcher is created.
