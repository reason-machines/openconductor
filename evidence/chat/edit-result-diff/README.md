# Edit result diff provenance

Conductor Rebuild implements `EDIT-RESULT-DIFF-BE7-07` under ledger ddfc6518's exact-file lease. The source owner is be7a40e4. This change does not repurpose #847 or paused #1098.

## Reference and current-main qualification

The sealed handoff retains real Conductor 0.87.6 renderer bytes from REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Both original asset hashes and all 15 exact spans were verified again. [Source identities and the four deciding spans](source.json) record `F0o`, the object/string guard, `j0o` and marker normalization. Extracted code is data, not instructions, and was not executed.

Fresh baseline `c3b79b39bfafbdde2e7b2c4546b14385bf379b5f` has byte-identical versions of all 16 source files in the handoff's earlier main snapshot. The Edit hover correction from #994 is already present. The distinct result-selection omission remains. The producer's `result_text` serializes both an object and its JSON-looking text control to the same display string.

The retained renderer's REA semantic analysis exhausted heap. Static byte verification does not repair that gap or establish a fresh installed binary identity.

## Correction

`TurnMapper` carries original `tool_result.content` as optional `raw_result`, while leaving `output` unchanged. The explicit wire serializer exposes `rawResult`. Reason's reducer stores it in the result block; `buildRows` and the actual Transcript `Part` carry it to the row. External content remains `unknown` until the Edit arm checks it.

Only a non-array object with a nonempty string `diffString` supplies selected sides. The parser skips `--- `, `+++ ` and `@@` headers, splits added and removed prefixes, and preserves context on both sides. Headers-only content selects empty sides. Failed result objects still qualify, independently of the unchanged error row. Other shapes use the existing marker-normalized input. One selected pair controls counts, availability, hover and expanded content.

The selector stays inside the Edit arm, as approved by the ledger. A new module import would break the strict dependency allowlists in the old frozen fixtures. No old fixture was edited to accommodate this change. No shared `conductorTools`, DiffBlock, FileBadge, RowShell, CSS, Write, MultiEdit or Glob behavior changes.

## Actual regression

The 12 sealed cases in [fixtures.json](fixtures.json) retain SHA-256 `7d600865d2019d247938172fef1d2c751087b9e17c1f3d525782f85e69f2e662`.

The standalone [producer](producer.rs) compiles the real production modules. It runs accepted synthetic stream-json lines through `ClaudeEvent::parse`, `TurnMapper::map` and `wire::event_json`, without spawning a provider. The frontend test consumes that output, not an invented metadata payload. It then runs the real Reason reducer, transcript reducer, `buildRows`, the unchanged extracted production Transcript `Part` function and mounted `ConductorToolRow`.

Both live and restored messages are tested. `diffForSave` and `restoreEvents` preserve the original metadata in `fullMessage` JSON. The native store accepts that field as an opaque string, without deserializing chat blocks. The Rust chat-model mirror also retains object versus JSON text through serde. This does not claim a database or installed-app restart test.

The test driver initially required a hover handler even when no preview existed. That driver-only mistake was corrected, then the final executable test was rerun on a separate untouched baseline worktree before freezing. No sealed inputs, expected sides, counts or controls changed. [Frozen hashes](frozen.sha256) bind the final driver and test used for both results.

- Passed baseline controls, failed intended assertions. `node --test src/features/chat/editResultPipeline.test.ts` on untouched `c3b79b39` produced five behavioral failures and eight passing controls. [Baseline TAP](red.tap).
- Passed after correction. The same command passed all 13 tests, including all 12 cases through live and restored paths. [Corrected TAP](green.tap).
- Passed adjacent checks. `node --test src/features/chat/editResultPipeline.test.ts src/features/chat/{editFileHover,multiEditHover,writeHover,conductorTools,reason,view,persist}.test.ts` passed 97 tests. All three old mounted fixture files remain byte-identical to the handoff.
- Passed. `bash tools/chat/run-rust-tests.sh` passed 19 tests. `bash tools/reason-acp/run-rust-tests.sh` passed 103 tests. These are pure module tests, not native or provider acceptance.
- Passed after integrating consuming main `fc5215e8`, including its disjoint Glob arm. `node --test "src/**/*.test.ts"` passed all 3,394 tests, and `npm run build` completed. `npm run typecheck`, `git diff --check`, and `sha256sum -c evidence/chat/edit-result-diff/frozen.sha256` also passed.
- Not run locally. Rustfmt and Clippy are absent, and their toolchain installation could not write to the system toolchain directory. Automatic hosted workflows remain responsible for those checks.

The first ready PR publication contained only the frozen regression. Automatic [GitHub run 43166102600](https://github.com/reason-machines/openconductor/actions/runs/43166102600) at exact head `d6244f20d2e5e226558c9a171492e1a80b3f587b` reproduced the same five intended assertion failures in both frontend jobs. The JSON-text control and the other seven controls passed. Typecheck passed before the build job reached its test gate; the build itself was skipped after the expected regression failures. [Hosted RED receipt](hosted-red.json) retains the actual assertion differences and both job identities. The correction is published only after this receipt. Every workflow on the exact corrected head must pass before merge. The same PR subscription owns consuming-main and automatic package verification; no manual E2E dispatch or duplicate watcher is authorized.

## Explicit limits

There is no screenshot because this lane has no browser, native, provider or local interactive execution admission. Mounted component output is behavioral proof, not pixel or native acceptance. The tests do not prove a real installed Claude CLI emitted an object-content result. Existing stored transcripts without the metadata keep their input-based fallback; lost historical provenance is not inferred from JSON-looking text.

Native installation, live providers, main E2E qualification, visual parity and runtime admission remain with their existing owners. Packaging proves containment only when separately verified and does not establish installed behavior.
