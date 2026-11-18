# Identical-fixture treatment verification

Conductor Rebuild · `DIFF-UNCOMMITTED-DISCARD-AFFORDANCE-DE6-01`

## Result: PASS, 10 of 10

The separately admitted `SAMEDE6-GREEN10-20261118T021212979Z` invocation ran
exactly once on treatment `3382c0f5979e9617379e4faa22f40951d4afb934` on the
Reason cloud computer. The child exited **0**. All ten cases passed; zero failed,
skipped, cancelled or todo. This is behavioral treatment verification, not a
static-check verdict.

```bash
node --experimental-strip-types --test tests/diff/uncommittedDiscardAffordance.mounted.test.mjs
```

The permanent fixture is unchanged from the [qualified semantic RED](execution-v3.md):
13,165 bytes, SHA-256
`a2aef693638daac179d28cfdce96dea63bb4022d9e06cb7e68731b732060402b`.
Its ten case bodies retain SHA-256
`fb7c64475dd4d41efb4722df10479321f860115f8bb4002fd064f43f418868b3`.
Only the [reviewed shared predicate/comment and contrary unit expectation](source-treatment.md)
changed between baseline and treatment. No consumer, Git/native operation or
context-menu policy changed.

## Executed cases

1. Unified row: All → Uncommitted → All — PASS.
2. Unified header: All → Uncommitted → All — PASS.
3. Split row: All → Uncommitted → All — PASS.
4. Split header: All → Uncommitted → All — PASS.
5. Entire-file row: All → Uncommitted → All — PASS.
6. Entire-file header: All → Uncommitted → All — PASS.
7. All context menu retains All-scope discard — PASS.
8. Uncommitted context menu retains All-scope discard — PASS.
9. Commit context menu retains All-scope discard — PASS.
10. Turn context menu retains All-scope discard — PASS.

All six view cases reached the formerly failing Uncommitted absence assertions
and the return-to-All confirmation assertions. All four menu cases queued and
cancelled the actual confirmation using All scope. All ten `finally` teardown
paths passed zero Git-discard invocations, zero native/clipboard/provider calls,
released polling timers and deterministic changed-file DTO-read assertions.
Commit/turn cases also verified both view actions absent.

## Timing, ownership and guards

- Child start: `2026-11-18T02:14:39.257843Z`.
- Child end: `2026-11-18T02:14:43.901098Z`; sampled monotonic child duration:
  4.643301 seconds.
- Actual owned-group release: `2026-11-18T02:14:43.901667Z`.
- Owned process group 142 reaped; zero group survivors and zero visible own
  Node/npm processes after release.
- CPU 0, nice 10, `UV_THREADPOOL_SIZE=1`, 768 MiB heap per Node process;
  120-second child / five-second termination-reap / 130-second foreground bounds.
- Sampled peak own-group RSS: 291,418,112 bytes; minimum free disk:
  5,711,212,544 bytes. The unchanged guards were 2 GiB sampled group RSS and
  4 GiB free disk, sampled every 0.1 seconds. These are userspace observations,
  not kernel, burst, escaped-group or disk quotas.

Preflight verified clean tracked source at the exact treatment head, the full
41-entry preservation map (39 unchanged inputs plus only the two leased treatment
files), the frozen fixture/body/helper, matching SAMEDE6 ownership marker,
cache absence and five installed package/version/resolution/SRI identities and
placements. Freshly fetched main was `735db18c9141cb409b26d142b8d0a305edaf91c8`:
all 22 baseline source/package bindings still matched their original untreated
hashes, with the two treatment hashes recorded separately. Postflight found no
input drift and identical installed manifest/lock bytes. Owned dependencies and
marker remain retained; no filesystem cleanup was attempted.

## Retained evidence and limits

- [Runtime receipt](runtime/green10-v3-receipt.json).
- [Per-case classification](runtime/green10-v3-classification.json).
- [Lossless raw TAP](runtime/green10-v3.log.gz): 2,511 uncompressed bytes,
  SHA-256 `1560354e94ad456736e2c2b25622c5a67fe8fa356bebae2f16c39542302a8d9c`.
- [Invocation supervisor](runtime/green10-v3-supervisor.py), reusing the RED
  process-group envelope with phase/output names and explicitly leased treatment
  comparisons. No fixture cases, assertions or selectors were rebound.

No other local unit suite, typecheck, build, install, browser, native, provider or
packaged-app check was included. Hosted CI will exercise the relevant unit suite
and this permanent fixture on the published PR head. No screenshot is supplied:
this admitted check used React test renderer with deterministic rendering/I/O
boundaries, not a browser or a native window; native/visual work remains with the
existing custodian. In particular this does not prove native visual parity or a
destructive Git action. No extracted Conductor JavaScript was executed.
