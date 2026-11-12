# Branch-prefix labels

Conductor Rebuild corrected the local workspace header's label only. The active and archived labels remove a matching configured prefix through the existing `useBranchPrefix` hook. The branch controller, Copy, rename input and backend branch value still receive the full branch.

Retained Conductor 0.87.6 REA source shows the same separation in `bro`, `yoo` and `zce`. The asset hashes, exact UTF-8 ranges and excerpt digests are in [reference.json](reference.json). Source comparison was checked against main `2ffcb278ff76c92716e98c5f9de6f90b49027b39`. This is retained static evidence, not a new observation of Conductor running.

## Executed checks

On Reason Cloud 352, the frozen original nine-case regression ran once before and once after the fix with this identical command:

```bash
env NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 90s node --test --test-concurrency=1 --test-reporter=tap src/components/workspaceBranchPrefix.test.ts
```

Baseline failed as intended, with five label assertions failing and four preservation controls passing. Candidate passed all nine. Fixture SHA-256 remained `894e0f32379cf3bade2d18f7b04b373ff62eab3a002dbeec8f05be1dff8bc3ce`. The regression mounts the actual header and prefix hook using React's test renderer. It exercises matching, unmatched and absent prefixes, active and archived labels, settings notifications, full Copy and initial rename input. Native IPC is mocked.

The three retained adjacent files ran once in sequence:

```bash
nice -n19 timeout 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/workspaceBranchHeader.test.ts src/components/sidebarLabel.test.ts src/workspace/naming.test.ts
```

All 45 adjacent cases passed. The existing header fixture gained only two mocks for the newly imported prefix hook; its assertions are unchanged. Raw TAP and exit results are retained beside this document. `git diff --check` passed.

## Verification limits

No browser, native app, screenshot, build, local typecheck, package, provider or original-Conductor runtime check ran. The serialized execution grant excluded those processes, so no visual evidence is available. Rendered desktop and package acceptance remain with the existing acceptance owners. These nine cases do not exhaust every default/GitHub/custom-prefix normalization domain. No claim of complete screen parity is made.

Title4, OptionArrow13 and the Home recency packets remain separate and unexecuted. The runtime slot was explicitly released with no remaining own jobs after the three checks finished.
