# Ordinary Uncommitted view: discard affordance

Conductor Rebuild · `DIFF-UNCOMMITTED-DISCARD-AFFORDANCE-DE6-01`

## Current result

The unchanged permanent v3 fixture reproduced six intended visibility failures
with four passing menu controls before treatment, then **passed all ten cases**
on the minimal shared-predicate treatment. See the [baseline execution](execution-v3.md),
[source treatment](source-treatment.md), [treatment execution](green-v3.md) and
[permanent CI integration](permanent-regression.md). All original frozen source,
fixtures and failure artifacts remain retained. This is mounted React behavior,
not native or visual-parity verification; no destructive Git action was run.

## Frozen source and oracle (historical qualification)

Fresh source qualification checked main `1e2500a959f68411be54cdca5c0473d0010b0559`.
The 143 data-only checks passed: 17 complete retained Conductor 0.87.6 REA
spans (47,022 bytes), 11 pinned main files, normal scope propagation, both
view consumers and the independent context-menu consumer. `qualification.json`
contains ranges, digests, source joins, provenance and the source-only result.
The JavaScript under `reference/` is inert evidence, never executed.

The ordinary Uncommitted option travels through `_ws → Wd → fLn → Qls →
uF/scs → bys/SBe → syi → iyi`. The complete `iyi` body returns null unless
`viewMode.type === "all"`, even when its caller's `showRevert` gate allows it.
The normal Diff header passes through `Eji → Jqo → bji → GPo → NPo → OPo`
to that same guard. By contrast, `Svs` intentionally gives context-menu
Discard an All-changes view in every scope.

The prior `target.test.ts` expected Uncommitted view discard. That interpretation
observed the caller but missed the nested all-only guard. The complete original
test is retained as `superseded-target.test.ts.txt`; this task explicitly
supersedes that one contrary assertion, not the All-changes menu policy or
Git's Uncommitted diff/discard capabilities. Existing historical evidence is
unchanged. `baseline-target.ts.txt` is the exact checked-main production file.

The new fixture is `tests/diff/uncommittedDiscardAffordance.mounted.test.mjs`.
It mounts the real `useWorkspaceDiff`, `ChangesToolbar`, `ChangesList`,
`DiffTab`, `FileDiffView` and `FileContextMenu`. Actual Changes options and
Back to all changes controls drive the scope round trip. A nonempty modified
text DTO is used in unified, split and entire-file layouts. The context-menu
controls cover All, Uncommitted, commit and turn; commit and turn additionally
retain absent view actions. The real discard policy is wrapped only to record
its arguments and result, and the menu must still queue confirmation using
All scope.

Data loading, preferences, popup primitives, CodeView geometry, editing and
unrelated chrome are explicit deterministic boundaries. Git discard and native
IPC are fail-fast counters and must remain zero. Confirmations are queued and
cancelled; destructive confirmation is never invoked. Polling timers are
owned but not fired, and must be cleaned on unmount. No real repository,
clipboard, provider, browser, Mac or native operation is exercised by the test.

`frozen.json` records the pre-treatment fixture and dependency lock identities.
Before product treatment, the expected baseline result is six visibility
failures and four passing menu controls. A loader/setup failure is not an
accepted product RED. The identical frozen fixture must then pass treatment.

```bash
node --experimental-strip-types --test tests/diff/uncommittedDiscardAffordance.mounted.test.mjs
# Baseline first, before treatment; then identical file on treatment.
DIFF_DISCARD_BASELINE=1 node --experimental-strip-types --test tests/diff/uncommittedDiscardAffordance.mounted.test.mjs
# Optional replay uses only the pinned original target.ts, not extracted vendor JS.
```

## Preservation and verification boundary

The previous live tip `8caed4f901352e4ab51e3b1ae7c2ef164e720617` was preserved in
`refs/backup/de6-live-before-uncommitted-discard` and a verified bundle before
the assigned branch was reversibly reset to fresh main. All six original
candidate branches/worktrees/bundles are untouched. None is part of this patch.
Source PR #1412 was read as merged, with no pending merge operation.

At the frozen-fixture checkpoint: no dependencies were installed, no mounted
fixture or product runtime ran, no product predicate changed, and no RED/GREEN,
build, typecheck, browser/native or publication success is claimed. Runtime
admission is serialized through the existing ledger. New results are recorded
separately; this checkpoint's assertions are not rewritten as executed checks.
