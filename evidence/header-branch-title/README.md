# Workspace branch title labels

Conductor Rebuild adds native `title` attributes to the active and archived workspace branch labels. Each title uses the already-computed display label. The branch controller, stored branch, Copy and Rename are unchanged.

## Reference

Retained Conductor 0.87.6 REA source binds the displayed branch label to `title` in `bro` and `yoo`. The supporting `ACi`, `zce` and `zcs` spans, asset identities and exact UTF-8 ranges are in [reference.json](reference.json). The complete retained assets and all five spans matched their recorded hashes before execution. Current OpenConductor source was checked at main `94a5aad810e9f0969e45fb6c7644d901023f917c`, which contains Prefix9 from #1191.

This is retained real-app source evidence, not an observation of native hover behavior.

## Executed regression

The frozen four-case fixture retained SHA-256 `fc1d8bb2a8df5c7dc665a212a722a7732924d232a905efa0a577415ec2b6c006`. Both phases used this identical command on Reason Cloud 352 under ACC's direct Title4 admission:

```bash
env NODE_OPTIONS=--max-old-space-size=768 nice -n19 timeout --kill-after=5s 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/workspaceBranchTitle.test.ts
```

The baseline exited 1. All four cases failed at the intended title assertion with actual `undefined`. Their preceding displayed-text assertions passed. There were no separate passing control cases.

After the two-attribute correction, the identical fixture exited 0 and passed all four cases. The cases cover ordinary and long branches in idle and archived workspaces. Each passing case also checks unchanged branch data and no dispatch or error callback. Raw [compressed baseline TAP](red.tap.gz), [candidate TAP](green.tap) and [execution receipt](receipt.json) are retained here. The failing fixture was committed before the production correction.

`git diff --check` passed. No adjacent test command was admitted or run. The runtime slot was explicitly released after the candidate with no remaining own application or test jobs.

## Verification limits

No browser, native hover, screenshot, package, provider, build or local typecheck ran. The serialized grant excluded those processes, so no visual evidence is available. Native and release acceptance remain with the existing owners.

The four inputs configure no branch prefix. They do not exercise matching-prefix titles, empty labels, placeholder branches, native tooltip timing or screen parity. Existing Prefix9, OptionArrow13, durable recency and live-refresh fixtures are unchanged. This change does not claim to complete those separate checks.
