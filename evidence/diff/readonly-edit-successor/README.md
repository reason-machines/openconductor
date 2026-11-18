# Readonly Edit affordance: reproduced and corrected

Conductor Rebuild · `DIFF-READONLY-EDIT-AFFORDANCE-DE6-02`

## Change and cause

`useFileEdit` declares `FileEdit | undefined` and returns `undefined` when complete editable text is unavailable. `OpenFile` incorrectly tested `edit !== null`; that expression also admits `undefined`, exposing a nonfunctional Edit button and consuming Cmd+E without an editor capability.

The product treatment changes exactly that predicate to `edit !== undefined` in `src/features/diff/DiffViewer.tsx`. Header and shortcut registration now use the real existing capability. No editor/save implementation, DTO, preview toggle, hidden-file shortcut boundary, discard/menu control, backend or native operation changed. The nearby historical comment is unchanged under the exact one-site treatment lease.

## Retained reference, not a fresh native observation

[Qualification and historical source](qualification.json) / [complete parent joins](historical-source.json) / [original plan](plan.md).

The packet retains complete REA-derived Conductor 0.87.6 `bji`, `Mqo`, `jqo` and `kqo`/`Tqo` function/wrapper bytes and 19 producer/consumer joins. They establish a loaded-text/edit-capability boundary; they do not establish exact equivalence of OpenConductor's toggle design. The original whole renderer/index assets are absent at their historical paths, so range extraction from those whole assets was not repeated. Retained function hashes were checked. Extracted application text is inert evidence, never executed or treated as instructions.

## Same original fixture, before and after

The permanent regression is `src/features/diff/readOnlyEditAffordance.test.ts`, byte-identical to the [historical frozen fixture](historical-fixture.test.ts.txt): **10,648 bytes**, SHA-256 `30d82d680f50250682ce5769e5047495417e95d5ce52ac15eacecbdc728c20a7`.

Exactly one separately admitted run per phase used the same child command on Reason Cloud:

```bash
node --experimental-strip-types --test src/features/diff/readOnlyEditAffordance.test.ts
```

- **Before: expected failure, actually reproduced.** Exit 1; **17 intended assertion failures and four passing controls**, no harness failures/skips/cancellations. The 15 history/turn/binary/deleted/metadata cases and two pending-content cases observed one Edit button and a consumed shortcut instead of zero buttons and shortcut pass-through. Later assertions after those failures were not reached. [Original receipt](runtime/red21-receipt.json) / [lossless original TAP](runtime/red21.log.gz).
- **After: passed.** Exit 0; **21 passed, zero failed/skipped/cancelled/todo**. [Original GREEN receipt](runtime/green21-receipt.json) / [exact raw GREEN TAP](runtime/green21.tap).
- All **15 ineligible cases** now reach and pass their empty-writes assertions.
- All **three eligible-code pointer/shortcut round trips** and the independent Markdown source/preview shortcut control remain passing.
- **Both pending-content cases reach and pass their later ready-state Edit-button and actual CodeView `edit`-prop assertions.** Neither was reached in RED. These two cases have no separate writes-array assertion.
- All **21 unmounts** pass the dispatcher-handler release assertion. The fail-fast IPC boundary was not hit. No actual file save or native operation was invoked.

The fixture mounts actual `DiffTab → OpenFile → useFileEdit → FileDiffView` with production editability, command binding and dispatcher. React renderer supplies no browser DOM. Pierre CodeView/editor, icons, unrelated UI and external ports have explicit adapters; complete text comes from deterministic WorkspaceDiff DTOs. This proves mounted capability/shortcut behavior, not actual editor typing, native writes, trusted keyboard input, pixels or visual parity.

## Execution identities and limits

Actual GREEN source candidate: `df331f2a27b5a3eef8bc3bcc0027da9a704886b0`; executed worktree HEAD: `9d153b31f219d56682dea42a998c0f8750197c9d`. Candidate DiffViewer SHA-256: `e3f0a4fe181a652650bbdab1e481bb359ae5b7b99588b64a1a14390b8c82e820`.

- The run's captured local `origin/main` was `750b8bf25b2193141eff0cfcad64776228bea076`. Coordinator admission separately compared `daee1fc90825c1e7673f711ad1d8a5a5401b1959`; that is not a fetch performed by the child. Delivery subsequently fetched that main and compared all 12 production/package bindings directly; only the exact predicate inverse is permitted. Original receipts and old request statuses remain immutable historical records.
- **Passed before execution:** 246 inert source-integrity checks, the single candidate inverse, 81 original RED input identities after that inverse, all 41 protected discard inputs, seven historical inputs and five installed version/resolution/SRI/placement identities.
- **Passed after execution:** 97 captured inputs had zero drift; no visible own Node/npm process remained. Dependencies and ownership marker were retained; owner cache absent.
- GREEN supervisor start: `2026-11-18T03:24:04.406658Z`; child start/end: `03:24:04.671262Z` / `03:24:09.860799Z`; actual release: **`2026-11-18T03:24:09.861354Z`**. Owned PG117 was reaped, zero survivors. RED release: `02:58:39.648492Z`, PG113 reaped, zero survivors.
- CPU0, nice10, UV1 and 768 MiB heap per Node; 120-second child, five-second release grace, 130-second foreground bound. Own process-group RSS ≤2 GiB, free disk ≥4 GiB and output ≤1 MiB were sampled every 100 ms: **userspace guards, not kernel/burst/escaped-process quotas**. GREEN peak sampled RSS: 298,401,792 bytes; minimum sampled free disk: 12,495,745,024 bytes.
- The original supervisor receipt deliberately leaves TAP classification `UNCLASSIFIED_TAP_REQUIRED`; the result above comes from inspection of all 21 raw TAP outcomes and the unchanged case bodies, not exit status alone. No receipt fields were rewritten.

Exact retained bytes:

- RED decompressed TAP: 21,936 bytes; SHA-256 `1f451638f440cf68433ff4664080dfefca34b62bf97d4fd4ebf98a25c4b2c0ab`.
- RED receipt: 33,904 bytes; SHA-256 `e2e81f819bc6bf6b91c498900c75c8968baaca4e370d0d304223fba2e45fdb69`.
- GREEN raw TAP: 4,915 bytes; SHA-256 `918ce37744b47c180a00d4bcd7952baacefabb50667e53eabb5e5ccad7225b21`.
- GREEN receipt: 84,529 bytes; SHA-256 `9fbe3f70d05c3658168435f8afb422a504d66890acc4a5010ad9f462491fcb4c`.

[Original treatment and admission preparation](treatment-and-green-request.md) / [original source validation](treatment-validation.json). These are historical source-bound records; their former NOT_RUN labels are not the current execution status. Their local-path/commit-dependent verifiers are not portable CI entrypoints.

## Permanent regression and delivery

The unchanged existing automatic CI frontend job runs:

```bash
NODE_ENV=development node --test "src/**/*.test.ts"
```

That glob includes the permanent 21-case fixture and adjacent diff tests. The same job runs typecheck, colour checks, the existing ten-case discard regression and production build. No workflow, dependency, lockfile or test body changes are needed. Full-suite/typecheck/build have **not been run locally** after GREEN; hosted exact-head results must be read before merge. Skipped manual/dispatch-only jobs are not passes.

This is a distinct ready successor against **main**; merged #1412 and #1485 are provenance only. Keep the existing PR subscription as sole observer and merge only after every executed exact-head check passes, with required reviews satisfied and no conflict.

## Visual and release gaps

**No screenshot or recording is available:** the serialized grant was for React test rendering only; browser/native dispatch remains held with the existing sole custodian. No duplicate browser/native/package executor was started. Browser appearance, native-app behavior, packaged inclusion, actual editor typing/save and side-by-side visual parity remain **unverified**. After merge, use existing package custodian `992a715e-aafd-49b0-88ba-9cabca1a3126`; merged source, packaged inclusion and observed native behavior are separate claims.
