# Node REPL result truthiness

Author: Conductor Rebuild. Candidate: `CHAT.NODE-REPL-RESULT-TRUTHINESS`.

## Source contract and exact scope

Fresh default-main audit pin: `c3c9ab420f62edb08159f6bcbbcc921ca57f52f3`.

The retained real-Conductor renderer is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Full parent hash, seven complete exact declarations and the original `U9e=1e5` limit binding passed readback. `source.json` contains complete byte ranges, hashes and declaration text for registry selection, dispatch and the `Kpo → V9e → H9e → Mu` consumer chain. No vendor code executed.

`Kpo` selects disclosure from nonempty input OR original result-content truthiness. `V9e` preserves strings, pretty-prints truthy structured content and hides falsy output. `Mu` makes the row interactive only when content is present. Null, false, zero and empty strings therefore do not create output or a disclosure without input; an empty array or object is truthy and still renders JSON. Nonempty input can independently keep disclosure while the output stays hidden.

At the audited main pin, MoreRows' Node REPL arm serializes explicit null/false/zero to nonempty strings and selects disclosure using `nodeOutput !== undefined`. This incorrectly displays these falsy outputs, creates an empty-string disclosure, and preserves an empty legacy-result disclosure. The adapter, reducer and view already retain the original raw values.

The ledger confirmed no competing ToolRows writer. The production lease covers ONLY the Node REPL branch's selected-content conversion and disclosure condition. InputOutput, resultText, GenericRow, McpRow, SubagentRow, other arms, maps, providers/backend, styles and other owners' fixtures are unchanged. The candidate is three additions and two removals in one Node-only hunk.

## Frozen mounted RED before product edit

Fixture: `src/features/chat/nodeReplResultTruthiness.test.ts`.
SHA-256: `20b169940ed2f18c0ecb29918c5f1a1172fc08646e55b9858fe755dbde8de117`.

Twenty-four cases start at actual `applyReasonPayload`, then `applyChatEvents` and `buildRows`, and mount the complete production `ConductorToolRow → Row → MoreRows → RowShell → InputOutput` path. React, JSX runtime, real tool helpers and icons participate. Unrelated Markdown, link and native opening boundaries throw if reached. No browser/server/native/provider is involved.

Before any product edit, unchanged main produced **16 PASS / 8 intended ERR_ASSERTION failures**, exit 1, zero skips/cancellations. The eight failures are null/false/zero/empty-string without input, null/false/zero with input, and legacy-empty without input. Assertions observe actual disclosure roles, handler presence, controlled open/close/reopen, output nodes/bytes and labels—not source strings.

The sixteen passing controls cover input-only/pending, legacy success/error, explicit empty-string with input, raw verbatim strings, object and array metadata, empty arrays/objects, true, truthy strings `0`/`false`, raw error and 100,005-character truncation. Freeze metadata precedes RED; the fixture stayed byte-identical through GREEN.

## Minimal correction and checks

The branch selects `content = rawResult === undefined ? result : rawResult`. It converts truthy structured content to JSON, preserves strings, and uses original selected-content truthiness for disclosure. Undefined alone selects legacy fallback; explicit null/false/zero/empty-string never revives stale flattened output. Existing InputOutput owns labels, truncation and output styling unchanged.

Passed on Reason Cloud:
- `node --test --test-concurrency=2 src/features/chat/nodeReplResultTruthiness.test.ts`: same frozen **24/24 GREEN**.
- Focused adjacent command (Node24, generic16, prefix18, fallback30, typed error/links, tools, Reason adapter, reducer, view, groups, retry): **216/216**.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; existing large-chunk advisory only.
- Full retained parent, seven complete declarations, original limit binding, frozen24, exact Node-only hunk and seven unchanged controls: passed.
- `git diff --check`: passed.
- In a complete main-based worktree committed as isolated candidate `e560de7944c5b882cbf43a5524fc0054bf710f5b`, `node --test --test-concurrency=2 src/features/chat/*.test.ts`: **1,807/1,807**, zero failure/skip/cancel.

Initial scratch archive attempts omitted tracked evidence/tools/tests. Those preparation errors are retained in labelled logs. Restoring tracked files fixed the missing-file checks. One remaining disclosure verifier requires a real committed Git source graph; its archive run was not a product failure. The complete committed worktree passed that same unchanged check (2/2) and then the whole chat suite (1,807/1,807). No assertion, existing test or fixture was weakened or skipped.

## Isolation, delivery and limits

The isolated candidate is based directly on main `c3c9ab420`, never on open #1423's branch. Its commits and evidence are NOT appended to #1423. The assigned working tree remains unchanged. Publication of a separate ready successor awaits #1423's actual merge, then fresh-main ancestry/source reconciliation and unchanged-fixture replay. #1423's existing subscription retains sole CI-to-merge ownership; no duplicate watcher was created. This packet is not a delivered successor PR.

The full chat receipt above predates inclusion of #1423's new typed42. The final typed-subagent V3 fixture `dea7a1df1432b2b325944f1bd9243ac056ea59aec9e7be2a00ccd23e6107ae79` remains retained unchanged in the assigned checkout; disqualified V2 is not substituted. Fresh-main verification must include that merged control.

Historical REA semantic renderer analysis exhausted heap and skipped the renderer. These retained bytes are a source-contract oracle, not a new successful REA pass, current reference-app identity or native observation. No new REA acquisition or bug occurred. Native/visual/provider behavior, package containment and installed identity remain unverified; no app screenshot exists under this source-only scope. Existing serialized package/E2E/native owners retain those acceptance boundaries. No runtime/server, package dispatch, installation or new watcher was started.
