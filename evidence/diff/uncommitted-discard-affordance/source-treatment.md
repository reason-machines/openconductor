# Ordinary Uncommitted discard: source treatment

Conductor Rebuild · `DIFF-UNCOMMITTED-DISCARD-AFFORDANCE-DE6-01`

This is a source-only checkpoint after the [qualified semantic RED](execution-v3.md),
not treatment GREEN. The ledger reconciled six intended failures, four passing
menu controls and all ten side-effect controls before issuing the same-owner
source-treatment lease. No runtime was started to apply this change.

## Minimal policy change

Freshly fetched main `5100f02abdc1129050d5f020f8de552680fc2994` has the original
`target.ts`, `target.test.ts` and all other 20 baseline source/package bindings.
Only the pre-reviewed 1,955-byte treatment patch (SHA-256
`489533dd36eab191557f9a310756ce630b08a55eeb90734cc704f37d459a3d4f`) was applied:

- `discardScope("view", ...)` returns `"all"` only outside turn view when the
  selected view is `"all"`; it returns null for Uncommitted, commit and turn.
- The explanatory comment and the one contrary ordinary-Uncommitted unit
  expectation now describe that rule.
- `discardScope("menu", ...)` still returns `"all"` before the view predicate.
  No consumer, reference calculation, repository operation or native action
  changed. The existing helper remains the single owner of icon policy.

The retained REA qualification, not the desired implementation, justifies
superseding the old unit expectation. The complete retained `iyi` body has an
all-only guard below the caller's `showRevert` condition. The independent `Svs`
menu path intentionally supplies All scope. The original contrary test and
baseline policy remain archived unchanged, along with all raw RED receipts.
These are retained-source observations; this phase made no new native-app
observation and executed no extracted vendor JavaScript.

## Permanent regression and static verification

The permanent mounted fixture and existing frontend CI step were already
committed. Neither changed during treatment. The fixture remains 13,165 bytes,
SHA-256 `a2aef693638daac179d28cfdce96dea63bb4022d9e06cb7e68731b732060402b`,
with all ten case bodies still
`fb7c64475dd4d41efb4722df10479321f860115f8bb4002fd064f43f418868b3`.

- Passed: `python3 evidence/diff/uncommitted-discard-affordance/verify-reference.py`
  (148 data-only integrity checks; no JavaScript executed).
- Passed: exact reviewed-patch result and preservation comparison. The 38
  original preservation inputs contain only one leased change (`target.ts`);
  the RED receipt's complete 41-entry input map additionally includes the
  contrary unit file, frozen v3 fixture and private v3 helper. Only the two
  leased treatment files changed in that complete map; both originals remain
  in historical snapshots. Of the 22 main bindings, only those same two files
  differ from checked main. Package/lock, all other product inputs, fixture,
  helpers, ownership marker and original raw failure artifacts remain unchanged.
  `source-treatment.json` contains exact identities.
- Passed: `git diff --check`.

## Not yet verified

No Node, mounted GREEN, target unit suite, full tests, build or CI ran in this
source-only phase. No install, browser/native/provider action, dependency/cache
cleanup or publication was invoked. Retained owned dependencies and marker
remain protected for separately admitted GREEN. Identical-fixture GREEN and
adjacent unit execution are pending the existing serialized runtime queue;
this checkpoint does not create another lane or authorize an automatic run.

The mounted regression uses deterministic I/O/rendering boundaries and supplies
no native-app, destructive-Git or side-by-side visual-parity evidence. A ready
PR must state those gaps, and merging waits for every check on its exact head.
