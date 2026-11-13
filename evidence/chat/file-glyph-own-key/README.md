# FileGlyph rejects inherited extension keys

Conductor Rebuild checked default main `349b49a75d90abe3a8ff25f10937c7a2e05a724f` and merged it normally into assigned branch `reason/openconductor-publish-fo-d7b27c48` at `6f2eeae4eb6d1badf1d27f5b5f7b9a8d89e53bf3` before this correction. The product tree matched that main before the change.

`GLYPH_BY_EXT` is an ordinary object. Previously, `photo.constructor` selected the inherited `Object` function and `photo.__proto__` selected its prototype. Both bypassed the nullish fallback and threw while destructuring the result. The correction checks ownership before indexing. Registered extensions, lowercasing, glyph data, tint and unknown-extension fallback remain unchanged. No Read disclosure logic changes.

## Bounded local proof

The existing ACC coordinator admitted only this correction on Cloud352, grant `e8f52fb4-b909-48af-83b6-ca7943eb8be2`. Commands ran once, sequentially, with existing dependencies only. No install, restore or retry occurred.

**Baseline reproduced:** the six new component cases reported exactly the intended two tuple crashes (`constructor` and `__proto__`) and four passing controls, exit 1. **Identical candidate passed:** six passes, exit 0. The unchanged fixture renders the real transpiled `FileGlyph` with real ReactDOM and icon data. Other ToolRows imports are tripwires, not lookup or icon substitutes.

```bash
nice -n 19 timeout --kill-after=5s 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/features/chat/fileGlyph.test.ts
```

Focused fixture SHA-256: `546ecd20268cfc502bf2c82f3a51909f21c72520b3fc2d4e89f1931e6f38d1b4` before and after. Controls cover TypeScript, uppercase PNG, an unknown extension and no extension. Raw commands, timestamps, stderr, TAP and exits are retained beside this document.

**Original constructor control passed:** the byte-identical sealed READ28 test and input were staged at their original chat paths, then this one case passed, exit 0:

```bash
nice -n 19 timeout --kill-after=5s 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 --test-name-pattern='^Read image disclosure gate: no-inherited-constructor$' src/features/chat/readImageDisclosure.test.ts
```

This command exercised one case only, not all 28. The other 27 were not run in this grant. The staged copies were removed during cleanup. `frozen/` retains the original test and input without changing their bytes. To reproduce this control, copy those two files into `src/features/chat/` before invoking the recorded command, then remove the copies. The original disclosure patch remains unapplied and its original freeze remains unchanged. Patch artifacts are gzip-compressed without changing their decompressed bytes.

**Adjacent check partial, not passing:** this command timed out at its 90-second bound, exit 124, after 39 observed passing subtests. It emitted no failing assertion and no final TAP summary. The reason it exceeded its bound is not established.

```bash
nice -n 19 timeout --kill-after=5s 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/features/chat/readSyntaxHighlight.test.ts src/features/chat/conductorTools.test.ts
```

The stop rule was obeyed immediately. The proposed typecheck command was **NOT RUN**:

```bash
env NODE_OPTIONS=--max-old-space-size=1024 nice -n 19 timeout --kill-after=5s 120s npm run typecheck
```

Static frozen identities, exact correction applicability and `git diff --check` passed. The original bytes retained in `correction.patch.gz` have SHA-256 `83aa6558c36f764c37f7a51d97960d7dc956bb4b2da2dae2ddb4e76c00ffe035`. `frozen.sha256` records original identities; its paths refer to the execution checkout, not this evidence directory.

## Resource sample and release

At 18:01:33Z on 2026-11-12, the target reported 24,698 MiB available memory, 8.4 GiB available disk, load averages 36.27/36.56/34.96, CPU pressure some avg60 94.35% and full 0%. Exact cgroup maximum limits were unavailable. No own test, build, server or zombie job was present. This resource sample does not establish the cause of the later timeout.

Setup completed at 18:01:34Z. The 630-second overall allowance included setup, command limits, kill grace, cleanup and release. Execution stopped and explicitly released at 18:06:34Z after 301 seconds. Cleanup confirmed own jobs [], zombies [] and servers []; frozen packet and lockfile identities were unchanged. Publication takes place after release.

## Limits

This proves the focused component correction and the original mounted constructor control, not native parity. The original image-read disclosure failures are not fixed or claimed green. The disclosure patch, COPY26, provider execution, browser, full suite, local build, native app, packaging and release acceptance were not run. Local adjacent coverage is partial and local typecheck was not run. No screenshot exists because browser and native execution were excluded from this serialized grant.

The ready PR targets main, not another PR. Merge must wait for every enabled exact-head hosted check to pass. Existing release owners retain containing-package and native acceptance; merge alone is not deployment or behavioral verification.
