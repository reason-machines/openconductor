# Mixed TodoWrite rows

Conductor Rebuild fixes the missing started row for ordinary Claude `TodoWrite` calls containing both completed and active todos. The completed and started rows use independent entries in the existing Transcript disclosure map. No new store or persistence layer is added.

## Retained source

The source owner supplied `chat-source-be7-09-10-final.tar.gz`, 4,553,038 bytes, SHA-256 `9a001cd388eac07d8716fc797336ebfae3838ca38ca04bf54619b8513265b036`. Recipient verification checked safe regular-file paths and the compressed identity. Only the todo packet and its shared retained originals were extracted; the unrelated task-agent packet was not reopened.

`python3 .rea-work/todo-mixed-handoff/todo-mixed/verify-packet.py` passed both original identities, 24 reference spans, eight main snapshots, 20 main spans, 53 declarative joins, and seven derived eligibility cases. The retained REA receipt is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The inherited renderer-analysis heap-exhaustion limit remains; this pass made no new REA call and encountered no new REA failure.

The unchanged retained assets are:

- `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

Reference UTF-8 byte ranges are zero-based and half-open. `G0o` at `[7827910,7830986)` emits two rows only when an active item exists and `0 < completed < total`. It passes `${toolId}-completed` and `${toolId}-started` to `Mu`. `Mu` at `[7795403,7798463)` reads and updates each key independently through `dIt`, whose declaration is `[7795149,7795241)`. The retained import/export and store-factory bindings close the in-memory key relationship. They do not establish disk or restart persistence.

The packet also closes the ordinary native tool payload's `rawInput` shape through the provider mapper, reducer, normalization, view, grouping, and actual Part consumer. Native emission was inspected statically, not executed. The product regression starts at that mapped payload boundary.

Fresh main `de772b84c4be571ffc51dabf8b327b9291534742` preserves seven packet files byte-for-byte. The only change in the eighth, ToolRows, is the already-merged Edit-hover prop from #994; the todo arm is unchanged. The assigned branch was rebased there before the regression. The Edit change remains intact.

## Reproduction and correction

The witness is an ordinary `TodoWrite` with these statuses and contents:

- completed: Inspect parser
- in_progress: Add regression
- pending: Run checks

The reference emits `Todo completed | 1/3 completed` and `Todo started | 2. Add regression`. Before this fix, OpenConductor emitted one combined row.

Regression-only local commit `004b06761` precedes the production change. The frozen test SHA-256 is `eba57080cc4bd83f631a8a95044af922462a7547362a2048245def569c1b8e7f`. The exact same test bytes were used before and after the fix.

Local command:

```bash
node --import ./.oc-tmp/todo-mixed-runtime/register.mjs --test src/features/chat/todoMixedRows.test.ts
```

The local preload resolves only the isolated lockfile-version React 18.3.1, React DOM 18.3.1, react-test-renderer 18.3.1, and TypeScript 5.9.3 packages. With normal repository dependencies installed, CI uses `node --test src/features/chat/todoMixedRows.test.ts`.

Before the production edit, six regressions failed and six controls passed. The first failure was `expected: 2`, `actual: 1`; other failures showed the missing started row, insufficient rows for distinct tool IDs, missing remounted disclosure, and missing active index/fallback text. After the fix, all 12 passed. The fixture hash remained unchanged.

The check mounts real React components with react-test-renderer, runs actual provider-payload mapping, reducer, normalization, buildRows, folding, Transcript, Part, ConductorToolRow, and RowShell, then invokes real header callbacks. Unrelated user/text leaves and external openers are stubbed. It verifies independent toggles, full list contents, distinct call IDs, active index/fallback, the existing expand-tools preference, and summary-driven todo-row unmount/remount. Transcript stays mounted during that remount; cross-Transcript retention is not claimed.

Five nonmixed cases retain one row: empty, only active, no active, all completed, and only pending. TodoRead is an unchanged control. This change does not attempt to correct nonmixed labels or general todo styling.

## Checks and limits

The following focused single-worker command passed 143 tests with zero failures, skips, or cancellations:

```bash
node --import ./.oc-tmp/todo-mixed-runtime/register.mjs --test --test-concurrency=1 src/features/chat/todoMixedRows.test.ts src/features/chat/conductorTools.test.ts src/features/chat/reducer.test.ts src/features/chat/view.test.ts src/features/chat/toolGroups.test.ts src/features/chat/transcriptAgentSummary.test.ts src/features/chat/multiEditRows.test.ts src/features/chat/multiEditHover.test.ts src/features/chat/writeRows.test.ts src/features/chat/writeHover.test.ts src/features/chat/editFileHover.test.ts
```

`git diff --check` passed. Full typecheck, build, and hosted workflows are left to ordinary PR CI rather than starting a heavy local build.

Exactly four files belong to this unit: the todo arm and optional Todo-only ToolRows binding, the existing Part-to-tool binding, the new regression, and this note. Shared RowShell, other tool arms, normalization, global toggles, imports, styles, and frozen #847/#916 resources are unchanged.

No screenshot or recording is included because this lane has no browser or native execution admission. Installed-app behavior, physical input, visual parity, real provider execution, cross-window behavior, disk persistence, and restart survival are unverified. Reference JavaScript was neither imported nor executed. Conductor Rebuild retains exact-head green merge and consuming-main package follow-through; a built but uninstalled artifact is not deployed or native acceptance.
