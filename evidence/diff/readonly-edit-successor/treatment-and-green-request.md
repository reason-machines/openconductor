# Readonly Edit: exact source treatment and one separate GREEN21 request

Conductor Rebuild · `DIFF-READONLY-EDIT-AFFORDANCE-DE6-02`

## Source treatment, not a passing behavior claim

Source lease: ddfc message `a43d3008-9c9d-4614-965f-2b453fec2c1f`.
Candidate commit: `df331f2a27b5a3eef8bc3bcc0027da9a704886b0`, in the existing isolated `plan/diff-readonly-edit-successor-de6-02` worktree only. The primary checkout and its 41 protected discard inputs are unchanged.

Read the actual `useFileEdit` contract in `EditInViewer.ts`: the declared return is `FileEdit | undefined`; null `onDisk` produces `undefined`. Applied only the reviewed 638-byte proposal `53b6cf35e600e6644442c5c11cf9c2850995f16ddd7b23305a598a5654ae7b63`: `isEditableCode` tests `edit !== undefined` instead of `edit !== null`.

No editor, FileDiffView, hook, DTO, dispatcher, fixture, stub, selector, oracle, native operation or preview logic was changed. This uses the real capability already returned by the hook; it does not gate away eligible editing. The source comment and every other source byte remain as reviewed. The original patch filename and historical metadata still say UNAPPLIED: those records are immutable baseline evidence, not current treatment status.

- Baseline DiffViewer SHA-256: `b9385a977c26007391b9b47bb587c33d95045ed9e04b1b1240a031f411167e0f`.
- Candidate DiffViewer SHA-256: `e3f0a4fe181a652650bbdab1e481bb359ae5b7b99588b64a1a14390b8c82e820` (13,618 bytes).
- The exact one-site inverse equals qualified baseline `e97b9a3e563ab26dc9699be7d99ee403449313f0` and freshly fetched main `750b8bf25b2193141eff0cfcad64776228bea076`. All other 11 production/package bindings equal that main byte for byte.
- Candidate commit changes exactly one path and one predicate. The original proposal reverse-check passes; generated diff differs from the frozen patch only in Git's non-code hunk-heading suffix.

## Retained actual baseline

The original RED21 ran once and exited 1: 17 intended assertion failures, four passing controls, no harness failures, skips or cancellations. All 21 unmount checks released dispatcher handlers; fail-fast IPC was not hit. Three eligible-code pointer/shortcut cases and the independent Markdown source/preview control passed. The 15 ineligible/history/turn cases and two pending-content cases failed at the expected button/shortcut observation; their subsequent assertions were not reached.

Actual release `2026-11-18T02:58:39.648492Z`, owned PG 113 reaped, zero survivors. Preserved exact-byte copies, with the original files also retained:

- Lossless `runtime/red21.log.gz`: decompressed TAP is 21,936 bytes, SHA-256 `1f451638f440cf68433ff4664080dfefca34b62bf97d4fd4ebf98a25c4b2c0ab`; gzip SHA-256 `90b4cb2718cdb94c6eb2e5fa9cdfc886946335898ecccb607a920ba2423f26a6`. The original raw log remains unchanged in its runtime location. A direct staged whitespace check identified trailing whitespace in the raw TAP; lossless compressed storage retains every byte without adding that generated whitespace as source.
- `runtime/red21-receipt.json`: 33,904 bytes, SHA-256 `e2e81f819bc6bf6b91c498900c75c8968baaca4e370d0d304223fba2e45fdb69`.

Original fixture remains exactly 10,648 bytes, SHA-256 `30d82d680f50250682ce5769e5047495417e95d5ce52ac15eacecbdc728c20a7`. All 21 original case bodies/assertions/helpers/boundaries are unchanged. No historical source override is used.

## Static verification actually run

`PYTHONDONTWRITEBYTECODE=1 python3 evidence/diff/readonly-edit-successor/verify-treatment.py`: **246 inert checks passed**, without executing product/reference code. All 81 captured RED inputs compare exactly after reversing only the candidate predicate (80 byte-identical inputs, one specifically leased candidate). This includes the original 41 discard inputs, seven historical preservation inputs, provenance and dependency identity inputs. The original baseline verifier and RED supervisor remain hash-identical.

Read-only checks of all five installed versions, resolved locations, SRI and real package placements passed. Owner dependencies and marker remain retained; no worktree node_modules or owner cache exists. All four Python verification/supervisor files compile in memory without execution or bytecode. `git diff --check` passed. `treatment-validation.json` records the complete static results.

These checks do not claim GREEN. No new Node process, install, cleanup, adjacent suite, build, browser/native execution or publication was run during treatment preparation.

## Exactly one requested future GREEN21 unit

**Not admitted and not run.** Wait for a new explicit serialized ddfc grant. From the same existing isolated worktree, with the future actual admission identity:

```bash
READONLY_EDIT_ADMISSION='<new actual serialized grant>' python3 evidence/diff/readonly-edit-successor/green21-supervisor.py --execute-readonly-green21
```

Exactly one child, identical to RED:

```bash
node --experimental-strip-types --test src/features/diff/readOnlyEditAffordance.test.ts
```

`green21-supervisor.py`: 11,452 bytes, SHA-256 `128f2defa7c9472b539bdedc4c699bed39b7a51866ce723632643abd2a133a48`.

It is byte-identical to the original reviewed RED supervisor after exactly eight explicit source-only mappings recorded in `treatment-validation.json`: distinct state/log/receipt/flag/phase names; use the treatment verifier and its 246-check count; label HEAD as candidate instead of baseline. No child, dependency, process, resource, monitoring, release, or post-drift logic changed.

Preflight verifies the sole candidate against its fixed hash/commit and one-site inverse, the original fixture and historical provenance, original RED receipts/logs and all 81 RED input records. The supervisor snapshots all candidate production/package and evidence files, original fixture, all 41 primary discard inputs plus retained runtime evidence, five installed identities/lock bytes, original owner marker and pinned process helper before and after the child. Only DiffViewer's originally qualified input has an explicit before/after mapping; every other RED input must remain byte-identical.

Keep the original SAMEDE6 lock held throughout. Only its already-owned primary ancestor node_modules is allowed, with no symlink, allocation, repair, restore, installation or cache. Node executable/CPU0 capability, no visible own Node/npm, clean tracked isolated tree and absent `DIFF_READONLY_EDIT_REF` remain required. Missing input, drift or resource failure means NO_RUN/release, not repair or retry. Runtime output/receipt paths must not exist beforehand.

Unchanged envelope: CPU0, nice10, UV1, 768 MiB heap per Node; 120-second child, TERM/KILL/reap within five seconds, 130-second foreground tool timeout. At 100-ms userspace samples, own group RSS <=2 GiB, free disk >=4 GiB, output <=1 MiB. These are sampled guards, not kernel, burst or escaped-process quotas. Prior disk readings are not future admission claims.

Only new `.oc-tmp/readonly-edit-green21-runtime` log/receipt writes are authorized when admitted. No automatic next phase, own Node probe, extra case, fixture rebind, source refresh, repair/reinstall, cleanup, build, browser/native or provider run.

## GREEN acceptance and reporting

All 21 original cases must execute and pass with zero skips/cancellations. In particular:

- All 15 ineligible/history/turn cases must reach and pass their empty-writes assertions.
- All three eligible-code pointer/shortcut round trips must continue to pass.
- The independent Markdown source/preview shortcut control must pass.
- Both pending-full-content cases must first pass the no-edit/no-shortcut observation and then **reach and pass the ready-state Edit button and actual CodeView edit assertions**. Neither later ready-state assertion was reached in RED.
- All 21 unmounts must release dispatcher handlers. IPC remains fail-fast. The loading cases have no separate writes-array assertion; do not claim one.

Return actual outcomes and assertion reachability versus harness/setup failure; skip/cancel counts; raw TAP SHA/bytes; source/dependency pre/post comparisons; exact start/end/release, child exit, process-group survivors and sampled resources. Released is not passed.

Only a separate actual 21/21 GREEN allows moving to required adjacent regressions through the hosted route where possible, a ready successor PR against main, and merge after all executed exact-head checks pass. #1412 and #1485 are historical, not this successor's delivery target. Existing custodian `992a715e-aafd-49b0-88ba-9cabca1a3126` remains sole package/native custody; no new executor. Whole renderer/index assets remain absent at historical paths: qualification uses retained complete REA functions and parent joins, not a fresh native observation. Browser/native/package behavior stays unverified until the existing custodian records actual proof.
