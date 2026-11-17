# Bind Follow-up validation to the integrated source

Conductor Rebuild supplies the source-eligibility supplement requested by sole
ACC in message `3a38e659-d8e8-4d44-80ed-a1b6f865a6ff`. This is the existing
SAME49 interest, not another intake, executor, runner, or execution grant.
The COPY26, 13519, 15, 64LAST order is unchanged.

The earlier [composition contract](../follow-up-pending/composition/README.md)
and its frozen files remain unchanged at `5d4e0c16`.
[Binding](binding.json) records that contract's exact hash, the full current-main
file, the SendKey candidate, the proposed integrated successor, dependency
inputs, and the complete validation commands. No product patch is applied.

## Current-main and successor qualification

The GitHub comparison resolved `main` to
`09b1c998acb093f4d905d5ef844c80136ea987f6` during this pass. Its complete
`GeneralPage.tsx` equals the frozen historical baseline. The current product
file equals the preserved SendKey candidate. The proposed successor is the
composition candidate, not another independently written implementation.

The source verifier checks whole files, not selected matching lines. It also
checks that the current-to-successor difference is exactly `candidate.patch`
and that the complete `SendKeyRow` tail is identical. It pins every file in the
existing protected-product map without replacing any old manifest.

The retained Conductor 0.87.6 evidence remains historical. This supplement
adds no real-app observation and does not claim current native parity.

```bash
python3 -B evidence/settings/follow-up-integration/qualify.py
```

## Proposed execution contract

These commands are declarative inputs for the existing ACC owner. They have
not run. The source supplement neither obtains a lease nor implements a
scheduler. A future matched grant must bind this exact supplement, dependency
disposition, checkout, source state, and total bound before any application
or execution. An older SendKey whole-file grant cannot cover the successor.

Use only dependencies in this checkout, matching its unchanged lockfile.
Dependency restoration passed in the coordinator checkout; that does not prove
the dependencies are present here. This contract contains no installer,
private-cache mutation, fallback dependency path, or network operation.

The proposed total foreground bound is 360 seconds plus at most five seconds
for process-group termination. Run one process at a time at nice level 19,
with a 768 MiB Node heap limit. Each command's timeout must be capped by the
remaining total time. Retain complete output and exit status for each phase.
Stop on an unexpected result; do not rerun, edit tests, or install dependencies
under this contract. A correction requires the same owner's matched successor
bound. Release the execution slot before publication.

The ordered phases in `binding.json` are:

1. Run the six unchanged retained-reference cases against synthetic boundaries.
2. Run the pending-disabled case against the pinned main baseline. Expect one
   assertion failure and eight name-filtered cases, not an infrastructure error.
3. After a future matched application allowance, apply only the exact retained
   Follow-up delta. Check the complete successor hash before tests.
4. Run all nine unchanged product cases with `FOLLOW_UP_SOURCE` pointing to the
   actual integrated `src/settings/GeneralPage.tsx`, not the saved candidate.
5. Rerun the eight unchanged SendKey cases on that same integrated source.
6. Run the three unchanged adjacent Settings test files.
7. Run TypeScript on the actual integrated checkout, with no emit.

The reference and every passing test phase must have zero failures,
cancellations, skips, or todos. The adjacent phase must discover at least one
test; its count is not yet measured. TypeScript must exit zero. The baseline
must exit one, report exactly the named `ERR_ASSERTION`, and report no other
failure or cancellation. Inspect the complete failure output, not only its
summary. Recheck the successor and protected-input hashes after execution.
The only approved source delta for that check is the Follow-up candidate;
all old frozen manifests and protected files remain byte-identical.

No screenshot exists because neither browser nor native execution is part of
this source-only work. Behavioral tests, TypeScript, app input, and native
parity remain unverified. A ready product PR still requires actual validation
and every exact-head workflow to pass before merge.

Build the Lever is applied through the read-only verifier. It checks the exact
binding without creating another executable validation runner.
