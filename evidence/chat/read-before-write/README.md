# Read-before-write tool error explanation

Conductor Rebuild owns CHAT.ERROR-READ-BEFORE-WRITE. This successor to merged #1053 is based on main `1b415a2c9eacd606e5697cb30bee4d7c3b559b0f`, not another PR. Frozen #847 and unrelated product paths are untouched.

## Source

The original attachment SHA-256 is `36f62a224a324c7c9f8722bf0789928eb2e90bd67cc0c03fc79da6cd10685a57`. All 16 packet files matched their supplied manifest. The retained Conductor 0.87.6 renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. This is retained REA evidence, not a fresh acquisition or a runtime observation. REA evidence ID is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

[Original qualification receipt](reference/qualification-receipt.json) records the historical 15/15 source qualification at `435c3356`. Its current-source claim has been rechecked: the complete production ToolRows file on the main commit above is byte-identical to that historical file. [Frozen source identities](frozen-source.json) retain this new check and the independent regression hash.

Three complete renderer excerpts were verified against their exact UTF-8 spans in the full retained renderer:
- [AI shared error component](reference/reference-AI.txt), bytes `[7798976, 7800630)`, SHA-256 `55b4c9c66f291c95692ec57b2d7226646d9e2e11bdc209bcb4a9fd5e8fe85ba6`.
- [F0o Edit caller](reference/reference-F0o.txt) reaches AI only for a failed, nonempty result.
- [hpo Write caller](reference/reference-hpo.txt) reaches the same component under the same condition.

AI uses case-sensitive substring inclusion of `File has not been read yet. Read it first before writing to it.` and substitutes this exact text:

> Claude Code has to retry the file edit because of a bug in its permissions logic. Just a moment!

The reference styles are 12px/16px muted wrapping text, 20px left padding, 8px top padding and 8px radius. OpenConductor's existing `oc-tool-aside` supplies the shared typography and wrapping. The intended product change is only the early return in private ErrorRow after its existing state hook. It must not perform a retry, inspect the agent name, change backend behavior, or alter generic error handling.

## Frozen mounted regression

`src/features/chat/toolErrorRetry.test.ts` transpiles the complete production ToolRows module and mounts its real ConductorToolRow with React 18 and real hooks, following the existing writeRows fixture. No row or shared error component is extracted or mocked. Unrelated Markdown, link-menu and external-opener leaves throw if invoked. Production conductorTools, icons, highlighting and thinking-label dependencies are retained. The outer row stays closed; this isolates its independent error disclosure without native or provider execution.

There are 16 tests. For each of Edit and Write they cover exact and embedded matches, ordinary errors, case and punctuation near misses, successful matching results, empty failed results, and the same mounted row changing trigger to generic to trigger and back while retaining disclosure state. The six matching/transition tests are expected to fail at missing-note assertions on the baseline; ten controls should pass. Setup, compilation or import failures do not qualify as behavioral RED.

The baseline test was published first through normal automatic CI discovery (`node --test "src/**/*.test.ts"`), with no workflow edits or manual dispatch. [Hosted baseline job 130686900568](https://github.com/reason-machines/openconductor/actions/runs/43067684694/job/130686900568) at published head `c6e79a5a61ffdfc431a5c21da9c4c13bd9d0b2ff` completed all 16 fixture tests: six intended missing-note assertion failures (actual zero, expected one) and ten passing controls. Dependency setup and production module compilation/mount succeeded. [Qualified RED receipt and exact excerpt](hosted-red.json). Source review independently confirmed no material fixture/contract finding.

Current main `6b37c4dbb2aa9b6ff1186b988f16bbbb6eaab3ca` was re-read before the correction; ToolRows is still byte-identical to the frozen baseline. The product patch inserts only the exact case-sensitive note branch after the existing state hook. The fixture remains byte-identical. `python3 evidence/chat/read-before-write/verify.py` checks the frozen bytes, reference excerpts, qualified RED and exact insertion without running the app. Hosted unchanged GREEN, remaining full checks, protected merge and consuming package results are pending.

## Verification boundaries

Passed on Reason cloud with Python/git only: attachment identity, all packet manifest identities, three renderer-slice identities, current-main ToolRows identity, and `git diff --check`.

Not run: local Node/React, browser, native app, provider/CLI execution or E1 admission. There is no screenshot because actual UI execution is excluded from this lane. Mounted hosted tests do not establish installed macOS acceptance, geometry, genuine provider retry behavior or side-by-side native parity. The wording describes the source UI only; this change does not initiate a retry.
