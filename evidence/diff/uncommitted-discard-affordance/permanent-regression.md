# Permanent regression integration

Conductor Rebuild · `DIFF-UNCOMMITTED-DISCARD-AFFORDANCE-DE6-01`

## Current verified treatment checkpoint

The permanent fixture is now the reviewed v3 surface-binding correction:
SHA-256 `a2aef693638daac179d28cfdce96dea63bb4022d9e06cb7e68731b732060402b`,
13,165 bytes. Its ten case bodies remain byte-identical to v2, with SHA-256
`fb7c64475dd4d41efb4722df10479321f860115f8bb4002fd064f43f418868b3`.
The original fixtures, setup failures and selector failures are retained.

Dependency provisioning passed, and the unchanged v3 fixture reproduced six
intended Uncommitted visibility failures with four passing context-menu
controls against main `5100f02abdc1129050d5f020f8de552680fc2994`.
[Baseline execution](execution-v3.md) records the actual results and limits.
After that qualified RED and its source-treatment lease, only the shared
view-discard predicate/comment and the contrary unit expectation were changed.
The independent menu policy, consumers and frozen fixture are untouched.
[Treatment record](source-treatment.md) records the static checks.

The separately admitted identical-fixture treatment run **passed all ten cases**
on `3382c0f5979e9617379e4faa22f40951d4afb934`, with zero failures, skips or
cancellations. All ten zero-IO/timer/DTO teardown controls passed. The owned
process group was released at `2026-11-18T02:14:43.901667Z` with zero survivors;
all preservation and installed-identity checks passed.
[Treatment execution](green-v3.md) retains the raw TAP, receipt and limits.

The existing frontend CI step still selects that same fixture. The target unit
suite and full CI have **not run locally**; hosted CI on the successor ready PR
must pass every executed check on its exact head before merge. No additional
local runtime, native or visual verification is implied.

## Initial source-only integration record (historical)

The remainder records the earlier v2 integration plan, not a current execution
receipt or runtime grant. At that checkpoint the CI step was enabled but
provisioning, semantic RED, treatment and GREEN had not run. V3 supersedes only
the reviewed selectors, never the ten cases, assertions or product oracle.

## Frozen behavior coverage

`tests/diff/uncommittedDiscardAffordance.mounted.test.mjs` v2 has SHA-256
`f31ff7c6e2037ef63d953da8da49ab6f008270211a8c1e73172e2dd87fbfdd61`
(12,896 bytes). It is loaded from the actual product files, not vendor source.

- Six cases drive All → Uncommitted → All through the real toolbar and hook:
  unified, split and entire-file layouts, each for row and header discard.
  All must queue/cancel confirmation, Uncommitted must hide the view action,
  and returning to All must restore it.
- Four independent menu cases cover All, Uncommitted, commit and turn. Each
  must still queue/cancel confirmation through the real menu policy with the
  All-changes base. Commit and turn also assert absent view actions.
- Every mounted case has `finally` cleanup that asserts zero Git discard and
  zero native/clipboard/provider calls, released polling timers, and a real
  hook read of the deterministic nonempty changed-file DTO. Report explicitly
  if setup prevents any of those assertions from being reached.

The v1 → v2 fixture change corrects only the unavailable `useFileEdit` return
contract (`null` → `undefined`). Both versions and the original setup-failure
identities are retained in `frozen-v2.json`. A setup failure is not product RED.

## Required execution order

1. Separately admitted v2 dependency provisioning, with current ownership and
   all five lock identities read back after completion.
2. Separately admitted, unchanged v2 fixture against untreated current product.
   Intended semantic RED is six view-affordance assertion failures and four
   passing menu controls, not ten setup failures or a timeout.
3. Only after that result is reconciled, the minimal policy correction and the
   explicitly superseded contrary unit expectation may be applied. Retained
   REA qualification, not the desired implementation, justifies the correction.
4. Separately admitted unchanged v2 fixture on treatment, plus the relevant
   `src/features/diff/target.test.ts` unit suite under its agreed reservation.
5. Publish a focused ready PR against main after relevant GREEN. Every check
   on the exact published head must pass before requesting merge.

Each runtime invocation retains its original output, exit status, input/output
hashes, named case outcomes, assertion-versus-setup classification, actual
start/end/release times, group cleanup and userspace resource-measurement scope.
No implicit installation, retry, browser/native dispatch or next phase is part
of this plan.

## Historical CI integration checkpoint (before runtime verification)

Freshly fetched main `8f0f8707a529e17937cd8e9447b8b769b6bc5e21` has the same
`.github/workflows/ci.yml` bytes as this branch before this change. Its automatic
frontend job runs `node --test "src/**/*.test.ts"`, which does not select this
`.mjs` fixture under `tests/diff/`. One named step now follows those unit tests in
that **existing** frontend job, reusing its existing dependency installation:

```yaml
- name: Uncommitted discard mounted regression
  timeout-minutes: 3
  run: node --experimental-strip-types --test tests/diff/uncommittedDiscardAffordance.mounted.test.mjs
```

The workflow change is exactly the three lines above. It adds no workflow, job,
trigger, platform, dependency installation or baseline-failure run. Existing
automatic jobs and the repository CI cost policy remain unchanged. The same v2
test command is selected for local RED, local GREEN and CI; CI does not set
`DIFF_DISCARD_BASELINE=1`. No CI run or Node execution was started to prepare this
integration. At that historical checkpoint enablement was not evidence that any
case passed. The later unchanged v3 fixture has now produced qualified semantic
RED and treatment GREEN under separate serialized admissions, as linked above.

## Verification limits

The fixture tests actual React consumers with explicit deterministic I/O and
rendering boundaries. It is not a native-app, browser, provider or destructive
Git check and supplies no visual-parity screenshot. Any such missing evidence
must be stated in the PR rather than described as observed behavior.
