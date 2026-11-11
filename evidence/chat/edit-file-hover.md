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

The tests cover 149/150 ms opening, normalized insertion/deletion/identical/marker-prefixed sides, equal hover/expanded content, retained counts, both-empty and pathless controls, navigation/stopPropagation, independent error disclosure, pointer leave/Escape, touch/focus, independent rows, cleanup, and non-Edit exclusion. Existing Write/MultiEdit tests remain unchanged.

Before the production fix, hosted CI runs the test-only commit to capture a genuine assertion failure. The fixture will be frozen after that RED result, then run unchanged against the single Edit-call prop change. Full hosted CI typecheck/build and adjacent tests are separate checks. Local dependencies are absent, so no dependency install or heavy local build is performed.

## Validation record

- `python3 .rea-work/edit-hover-handoff/verify-packet.py`: PASS, two originals, 15 reference spans, seven main sources, 11 main spans.
- `node --check src/features/chat/editFileHover.test.ts`: PASS for syntax only, not execution.
- `git diff --check`: PASS before test-only publication.
- Hosted RED/GREEN and frozen test SHA: awaiting the test-only CI result.
- Containing-main CI and exact macOS package/contract/artifact identity: pending merge and consuming build.

## Limits

No local app runtime, native/browser/visual acceptance, actual Claude provider, or real clipboard acceptance is run or authorized. No screenshots are supplied because app/browser execution is excluded. The fixture proves component behavior under deterministic doubles, not real geometry, native pointer dispatch, or a live provider. A hosted macOS bundle is an uninstalled artifact, not deployment or native acceptance.

Only three paths belong to this change: the Edit-arm FileBadge call in ToolRows.tsx, the new editFileHover.test.ts, and this evidence note. Shared FileBadgeHover, DiffBlock, RowShell, Write, MultiEdit, Markdown, CSS, result parsing, and backend/provider code remain unchanged. Structured result diffString selection is outside this fix; hover must match the existing expanded-body semantics.
