# Recent repository selection during cloning

Conductor Rebuild found a retained-source mismatch at main
`f73d7c30489bd09fbdeb78a812bc10a6bcfad21a`. Conductor keeps recent-repository
buttons enabled during a clone. OpenConductor disables them. Selecting a recent
repository should update the form without changing the captured in-flight clone
or bypassing the pending-submit guard.

## Source proof

[source.json](source.json) records the original REA archive and both asset
identities, complete `los` and `dos` declarations, and the immediate controller,
root and content. `los` supplies `dos` only repositories, loading, selected URL
and a selection callback. `dos` renders native buttons without a disabled prop.
The current counterpart supplies `disabled={pending}` on those buttons.

The original semantic renderer analysis exhausted heap. These checks read the
retained shipped bytes as data and do not execute Conductor JavaScript.

```bash
python3 evidence/dialogs/clone-recent-pending-selection/verify-source.py /path/to/conductor-a2t-source-closure.tar
```

Static identity verification **passed** on Reason Cloud. Both complete asset
hashes, seven complete spans, baseline counterpart hashes, the original neighbor
fixture and the new regression checksum matched. `git diff --check` passed.

## Frozen regression and test-first publication

The new `cloneRecentPendingSelection.test.ts` mounts the actual
`CloneGitHubRepoDialog` and `DialogFrame` using React test renderer. Base UI host
parts and transport calls are substituted. Its six cases cover HTTPS and SSH
selection before cloning, selection while the captured request is unresolved,
and retry with that pending-time selection after rejection. It also checks
selection highlighting, the captured request and the pending-submit guard.

[fixture.sha256](fixture.sha256) freezes this new fixture across hosted RED and
GREEN. No local component test, build or browser ran because this lane has no
serialized local test slot. Normal automatic hosted checks provide the execution
route. The regression-only head `f69cdd7fcc5ad69cf7ad7afdfb726aa90eb9fed3` left
production and the old test unchanged. Automatic hosted
[unit job 130670992015](https://github.com/reason-machines/openconductor/actions/runs/43063190036/job/130670992015)
ran `node --test "src/**/*.test.ts"` and reported **2923 passed, 4 failed**.
Both idle-selection cases passed. Only the four new pending-selection and
retry cases failed, each on the disabled recent button. The separate frontend
build job ran the same suite and failed on the same four cases, not compilation.
[Hosted RED receipt](hosted-red.json) preserves the failing names and output.

The old [clonePendingInputs fixture](baseline-clonePendingInputs.test.ts.txt)
asserts that recent buttons are disabled while cloning. Its original bytes and
hash are preserved here. The ledger found no explicit user freeze of that
assertion and reserved its single-assertion migration for this owner. After
intended RED, the candidate removes only the recent button's `disabled={pending}`
prop. The old fixture now asserts that recent selection remains enabled. Only
that assertion and its case label changed. No test is skipped, deleted or marked
expected-failure. Its other submit, progress, retry and input controls remain
unchanged. The new six-case fixture remains byte-identical to hosted RED.
Candidate hosted GREEN has not yet been observed.

Before applying the candidate, fresh main
`435c3356902c3e7cdf246f3089029154b3f908f6` had byte-identical
`CloneGitHubRepoDialog.tsx`, `clonePendingInputs.test.ts` and `DialogFrame.tsx`
counterparts. The retained-source verifier and frozen fixture checksum passed
again on Reason Cloud. This static check runs no component or reference app.

## Limits

Only the recent button's pending-disabled prop, this new fixture, the old
single-assertion contract migration and dedicated evidence are reserved here.
No shared dialog, URL attributes, location control, handler or workflow changes
are included. The separate pending-dismissal source inquiry found no
clone-specific guard mismatch and produced no product edit.

Component results, when available, prove rendered props and synthetic state,
not physical clicks, focus, keyboard delivery, native appearance or real cloning.
No screenshot exists because browser and native execution are not admitted in
this lane. Strict physical publication remains **UNSATISFIED and unwaived**.
