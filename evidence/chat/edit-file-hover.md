# Ordinary Edit file-badge hover

Conductor Rebuild, EDIT-FILE-HOVER-BE7-06. Sole builder 6c9f; source owner be7.

## Source and boundary

Refreshed main `74e48d1354ff54e3ef252558d41f2edf242a2248` before edits, on the assigned branch `reason/openconductor-copycode-r-6c9f1b05`. The previous PR #978 is merged and closed. Tracked tree matched main with zero net difference. #847 is not changed or rerun.

The handed-off archive is 4,525,713 bytes, SHA-256 `ca24dab0efc04f438f0149633dc7637799ca212549795b51173d6f0a3074447d`. Recipient checks verified its 13 regular members and safe relative paths before extraction, then read HANDOFF.md and verify-packet.py before running the verifier. Both full retained assets, 15 reference spans, seven main files, 11 main spans, and the 15 reference/11 main joins passed the packet verifier. The join checks verify the packet's recorded assertions; the byte checks independently recompute each identity and literal span. No reference JavaScript was executed.

Retained REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` identifies Conductor 0.87.6 evidence. Original REA semantic renderer analysis exhausted heap and skipped that asset. This handoff is static shipped-byte evidence, not a new semantic-analysis success or observed native behavior.

- Renderer `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Companion `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- Complete Edit `F0o` renderer byte range `[7821278,7823360)`, SHA-256 `cdc0e2040029e55c5c45119879784658d59ba81c3aef8a771766ea351222b636`. It selects normalized old/new sides, enables content when either side is nonempty, and sends that same diff to `tee.hoverCardContent` and the expanded body.
- Complete badge `tee` range `[7777001,7782029)`, SHA-256 `38d4a2efa99fd08a87b2540dfb48add94860e8932a56c644132fcecf20165bf0`. The content-bearing branch has 150 ms open and 100 ms close delays.
- Complete marker normalizer `oV` range `[7819708,7819811)`, SHA-256 `526ea731df5736946c84a167c3e36ab7a5a21816baf9eb51fb8818c72633e963`.

The supplied complete static chain closes ordinary assistant tool-use `ROo` → `cTr` → `hIt` → Edit registry `F0o` → badge `tee`; eligibility has no Edit-specific exclusion. Current source retains actual Claude `tool_name`/`raw_input` in `src-tauri/src/claude_chat/map.rs`, delivers through `claudeChat.ts` and `reason.ts`, normalizes in `conductorTools.ts`/`view.ts`, and passes the resulting tool through Transcript to ConductorToolRow. The bounded omission is the Edit-arm FileBadge call, not normalization or shared hover behavior.

## Regression and fix

`src/features/chat/editFileHover.test.ts` uses the existing Write/MultiEdit mounted-test idiom. It runs real applyReasonPayload → reducer → buildRows/conductorTools → ConductorToolRow → FileBadge → FileBadgeHover → DiffBlock code. React and react-test-renderer are real; time, geometry, global event listeners, and file-open callback are deterministic test doubles. Unrelated Markdown/link/external-open leaves throw if invoked. No provider process, DOM/browser, native app, or clipboard is used.

The tests cover 149/150 ms opening, normalized insertion/deletion/identical/marker-prefixed sides, equal hover/expanded content, retained counts, both-empty and pathless controls, navigation/stopPropagation, independent error disclosure, pointer leave/Escape, touch/focus, independent rows, cleanup, and non-Edit exclusion. The new fixture stays frozen. Existing Write/MultiEdit production behavior remains unchanged.

Before the production fix, hosted CI ran the test-only head `ef735acd4bc8d652376423f26f7ff9917198f432` in run [42957839682](https://github.com/reason-machines/openconductor/actions/runs/42957839682). All eight missing-preview assertions failed and four controls passed. The ordinary Edit assertion reached the actual mounted file badge at 150 ms and failed with `ordinary Edit file badge opens its diff preview`, `0 !== 1` (expected 1, actual 0). The full suite had 2,376 passes and eight failures; no fixture/import failures occurred. `npm run typecheck` and color lint passed; build was skipped after the expected test failures, not passed.

The test is frozen at SHA-256 `2f6aab47c4a4bb8c13fd5a457a0c68246be64d1f8fd6451717019c99a3a9442e`. After RED, current main was refreshed to `aad6fcc3421adc3ac30d3a90936ffb94c8c5ecfb`; ToolRows.tsx is byte-equivalent to the pre-test source there. The fix adds only the Edit-arm FileBadge `hoverContent` prop, conditional on the existing counts/content presence, using exactly the existing expanded-body DiffBlock sides. The fixture remains unchanged. Full hosted CI typecheck/build and adjacent tests are separate checks. Local dependencies are absent, so no dependency install or heavy local build is performed.

## Validation record

- `python3 .rea-work/edit-hover-handoff/verify-packet.py`: PASS, two originals, 15 reference spans, seven main sources, 11 main spans.
- `node --check src/features/chat/editFileHover.test.ts`: PASS for syntax only, not execution.
- `git diff --check`: PASS before test-only publication.
- Hosted RED: `node --test "src/**/*.test.ts"` — FAIL as intended, exactly eight missing-preview assertions; four focused controls PASS. Hosted typecheck/color lint PASS; build NOT RUN after RED.
- Frozen fixture SHA-256: `2f6aab47c4a4bb8c13fd5a457a0c68246be64d1f8fd6451717019c99a3a9442e`.
- Fixed-head run [42958548886](https://github.com/reason-machines/openconductor/actions/runs/42958548886), head `3971f97ca86d0ae1b7b78c5b15ef4c7b8b580003`: all 12 unchanged Edit fixture tests PASS (tests 413–424). Full suite FAIL, 2,386 passes and two failures. Both failures are existing `multiEditHover.test.ts` assertions that require Edit never to preview (`1 !== 0`, lines 200 and 219). The frontend build did not run after these test failures. This is not full CI GREEN.
- Refreshed main `9e4df51294ab5cd6abdd73aa1212ae501c551b13` after this result. Its ToolRows.tsx differs only by the intended Edit hoverContent prop, and its multiEditHover.test.ts matches the branch before test reconciliation. Ledger clearance `cecf040f-67f5-451d-bad6-783054fa3480` adds only the two existing test hunks in multiEditHover.test.ts: retain Read/Bash negatives, Write's own preview and Codex tool identities; require Edit's exact selected old/new sides, never MultiEdit aggregate content. A hosted RED milestone temporarily removes only this change's Edit hoverContent prop to re-prove both revised expectations against the omission. After decisive RED, restore the identical one-call fix without modifying either fixture.
- Revised-test RED preparation refreshed main to `887964ad496b1069e6ef0fb54f16df373e82932a`; ToolRows.tsx with only this change's hoverContent prop removed is byte-equivalent to that main. Revised multiEditHover.test.ts is frozen at SHA-256 `66fb7ad9f7a9cc53c222c83e4397f8673c0e5fd55aff5c090a638c5202ccb733`; new fixture SHA remains unchanged. Syntax checks and whitespace checks PASS; dependency-backed execution remains hosted only.
- Revised-test hosted RED head `43bc4a35e591356d25ae045fb6821a2d7e256c42`, run [42960207054](https://github.com/reason-machines/openconductor/actions/runs/42960207054): `node --test "src/**/*.test.ts"` FAIL as intended, 2,404 passes and ten missing-preview assertion failures. Eight failures are the original new regression; tests 650 and 651 are the two revised existing expectations. Both revised tests reached the Edit file badge and failed `0 !== 1` (expected 1, actual 0), at multiEditHover.test.ts lines 201 and 222. Read/Bash negatives, Write preview and other existing controls were retained, not removed to make CI green. Hosted typecheck and color lint PASS; frontend build NOT RUN after RED.
- Restored the identical one-call Edit `hoverContent` prop after this decisive RED. Both test hashes above remain unchanged. Main refreshed to `2fd9759216603cb040cfcffb4a258833948d4120`; ToolRows.tsx still differs only by this prop. Local syntax checks for both fixtures and `git diff --check` PASS. Final hosted GREEN/full suite, typecheck and build are pending; no dependency installation or heavy local check.
- Containing-main CI and exact macOS package/contract/artifact identity: pending merge and consuming build.

## Limits

No local app runtime, native/browser/visual acceptance, actual Claude provider, or real clipboard acceptance is run or authorized. No screenshots are supplied because app/browser execution is excluded. The fixture proves component behavior under deterministic doubles, not real geometry, native pointer dispatch, or a live provider. A hosted macOS bundle is an uninstalled artifact, not deployment or native acceptance.

Only four paths belong to this change: the Edit-arm FileBadge call in ToolRows.tsx, the new editFileHover.test.ts, two collision-cleared expectation hunks in multiEditHover.test.ts, and this evidence note. Shared FileBadgeHover, DiffBlock, RowShell, Write, MultiEdit, Markdown, CSS, result parsing, and backend/provider code remain unchanged. Structured result diffString selection is outside this fix; hover must match the existing expanded-body semantics.
