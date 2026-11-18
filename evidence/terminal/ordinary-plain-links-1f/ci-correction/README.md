# #1461 frozen-dependency setup correction

Conductor Rebuild read the failed hosted job [134209258850](https://github.com/reason-machines/openconductor/actions/runs/44131432524/job/134209258850) at published head `4cd28d5737067c23aab0e1ba5e466f842e38d3ca`. Typecheck passed. The frontend unit step reported **5,422 pass / 1 failure**, then the build was not run. The sole failure was the historical Caffeinate graph's **setup** guard requiring the current package manifests to be byte-identical to its immutable `bbdca3e984f5b80183703daa9f9bb27bbaf0f47c` graph. This PR's one additive official web-link dependency caused that drift. It was not a semantic Caffeinate failure or evidence against the addon callback.

Fresh default head read: `74c004a95d7b10072f54f71ca611f22c50944f64`; its Caffeinate test is byte-identical to the pre-correction test, and its package manifests differ from this branch only by the documented addon additions.

## Small correction

Only the dependency setup block of `src/features/settings/caffeinateConsumer.test.ts` changes:

- If live manifests still match the historical hashes, preserve the existing dependency symlink.
- Otherwise, install the **unchanged historical** package/lock files in the extracted temporary graph with `npm ci --ignore-scripts --no-audit --no-fund --include=dev --prefer-offline`.
- Installation launch failure, signal, nonzero exit or historical-manifest mutation remains a hard setup failure, never a classified semantic RED. The temporary graph and its installed dependencies are cleaned in the existing `finally`.

The original archive, manifest, all 1,046 graph-file hash guards, browser fixture, two baseline behavior assertions and nineteen current-graph behavior controls remain untouched. No package pin, product behavior, URL/provider/native boundary, workflow, test name, expected result, skip or timing gate changes. This avoids normalizing hashes or tolerating a different dependency graph.

## Checks

On Reason Cloud, before the correction:

```bash
timeout 60s nice -n 19 node --max-old-space-size=512 --test --test-name-pattern='^frozen whole-main graph qualifies semantic Caffeinate' src/features/settings/caffeinateConsumer.test.ts
```

**Reproduced: 0 pass / 1 failure**, at the exact dependency-drift guard, before npm or browser startup (`before.tap.gz`). The archive and all extracted file identities had already passed.

After the correction:

```bash
timeout 180s nice -n 19 node --max-old-space-size=512 --test --test-concurrency=1 src/features/terminal/ordinaryPlainLinks.test.ts src/features/terminal/ordinaryLinks.test.ts src/scripts/outputLinks.test.ts evidence/terminal/ordinary-plain-links-1f/ci-correction/dependency-setup.test.mjs
```

**Passed: 39/39**, no skips (`adjacent.tap.gz`). This includes unchanged plain links 10, encoded links 12, ScriptOutput links 10, and seven new inert dependency-setup controls. The latter execute the actual setup block with an inert npm edge, not a simulated addon or URL provider. `setup.tap.gz` also records the standalone seven passing controls.

```bash
python3 evidence/terminal/ordinary-plain-links-1f/ci-correction/verify.py
git diff --check
```

The verifier proves exact original reconstruction outside the dependency-setup block, original archive/manifest/browser-fixture identities, unchanged frozen link fixture, and receipt identities/counts.

**Pending:** full original browser regression replay and frontend build are delegated to the existing exact-head hosted CI workflow, per coordinator instruction. They are not claimed locally GREEN. No local npm install, browser, full build/typecheck, new native/provider runtime, package pipeline, release dispatch or duplicate watcher was started. Native/browser/PTY/package acceptance limits from the parent evidence remain unchanged. Merge is held until every exact-head hosted workflow passes.
