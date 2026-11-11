# Ordinary WebFetch prompt disclosure

Conductor Rebuild owns this source-backed component correction. Production remains unchanged at the test-only milestone. A mounted failure must precede the web-arm-only fix. Browser, native, provider, visual, and installed-package acceptance are not part of this unit.

## Retained reference

The original upload is `webfetch-prompt-source-closure.tar.gz`, 4,572,490 bytes, SHA-256 `0869483a8d7bf3feca5acdbec4f31652e8a4fa6b6a1398a1ed27138156774f86`. Recipient verification checked the original digest and all 15 regular members with safe relative paths before extraction. The reviewed standard-library verifier passed for two full assets, 14 reference spans, seven main snapshots, 13 main spans, and 27 declarative checks. No reference JavaScript was executed or newly acquired.

Retained Conductor 0.87.6 evidence comes from REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The earlier semantic renderer analysis exhausted its heap. This unit uses retained shipped bytes and literal/hash closure, not a successful semantic rerun or reference runtime observation.

- Renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Companion `index-BGEQ8YjU.js` is 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- Complete web renderer `upo` occupies UTF-8 range `[7842303,7844170)`, SHA-256 `03f614bf3830760c8865284a75eb61880d57d2fca854e5a59adb286dc6eecc66`. It selects `input.prompt || ""` and declares a conditional list item containing `Prompt:` followed by a plain code child. That item precedes the result in the same result-gated disclosure.
- Complete row shell `Mu` occupies `[7795403,7798463)`, SHA-256 `2a88a2516341f7a98563d2f4b2a602ac9c0acc584282cd01cf54a011e3e4231d`. Registry and dispatcher closure connect ordinary tool use to `upo`.

These declarations establish a source-backed omission. They do not establish native visual parity, output-Markdown parity, target fallback, truncation, or error behavior.

## Fresh-main check

The source packet's historical main is `2fd9759216603cb040cfcffb4a258833948d4120`. Before test edits, current main `6be97d85b854b2a1bf7930db49e2227a26af2e6a` was fetched and merged into this Session's assigned branch, with zero tracked net difference from main. Eleven of the thirteen recorded main spans remain literal-identical, including the web arm, row shell, normalizer, native input mapping, and reducer/view joins. The two changed spans were re-read. They add TodoWrite disclosure state forwarding and bind that state in the row dispatcher; neither changes WebFetch input or dispatch. Read syntax and Edit hover changes outside the web arm remain intact.

The current web arm reads only URL/query and output. It does not read prompt. Ordinary Claude `toolName` and `rawInput` reach `ConductorToolRow` through `applyReasonPayload`, the reducer, `buildRows`, and `conductorTools` without losing the prompt.

The preceding Read fix #1004 merged at that same current-main commit. Its 23 PR checks passed. Exact-main CI [42968043876](https://github.com/reason-machines/openconductor/actions/runs/42968043876) and macOS packaging [42968043823](https://github.com/reason-machines/openconductor/actions/runs/42968043823) passed. Artifact `13832118359` matches its recorded SHA-256 `7d72bd286ed8ba2ec48d19870905f0811f762591878dc03344f64acff80aacd7`; all 39 bundle-contract checks passed. Recipient static verification checked both archive layers, bundle identity, and the executable hash `302a30c646490f10c357d9d07135a8b537e9ed606557bb0319b289785524baf3`. This is package verification, not installed or native behavioral acceptance.

## Frozen mounted regression

`webFetchPrompt.test.ts` runs that actual normalization path and the actual compiled production `ConductorToolRow` with real React and react-test-renderer. It toggles the real row header. Only unrelated Markdown, syntax, link, and external-open leaves throw if executed; no web-row behavior is replaced by a mock.

Seven cases cover exact prompt text and whitespace, prompt-before-result order, plain-code rendering of markup-like input, collapsed state and collapse controls, unchanged URL/query chips, missing/empty prompt, completed WebSearch without prompt, and the existing empty-result gate. Three prompt-bearing cases should expose the missing child. Four output-only or empty-result controls should pass. Those counts are expectations until execution, not reported test results.

The test is frozen at SHA-256 `836d8f41c20f90a2956989a52249dd4ad823e5299c4c62622f82c96ef4eb9197` before production changes.

## Verification

- `python3 .rea-work/webfetch-prompt-handoff/verify-packet.py`: PASS for retained byte identities, spans, and declarative checks.
- `node --check src/features/chat/webFetchPrompt.test.ts`: PASS for syntax only.
- `git diff --check`: PASS.
- Mounted RED: pending hosted CI on the test-only publication. No production edit has been made.
- Mounted GREEN, full-suite tests, typecheck, and build: not run for this unit yet.
- Local dependency installation and heavy build: not run.
- Browser, native, real-provider, visual, and installed-package acceptance: not run, excluded from this scoped unit. There is no screenshot because no browser or native run was performed.

The implementation boundary is only the existing web arm plus this new fixture and evidence file. Shared row shell, imports, CSS, Markdown, output text, target extraction, truncation, pending/error handling, TodoWrite, Read, Edit, Write, and MultiEdit are outside the change. Frozen #847 remains untouched.
