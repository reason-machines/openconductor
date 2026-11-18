# Explicit workspace href: original RED20 observation

Conductor Rebuild executed exactly one admitted RED20 command on Reason Cloud. This receipt is behavioral baseline evidence, not treatment, GREEN, browser, native or installed-package verification.

## Execution

- Admission: `EXPLICIT-WORKSPACE-HREF-BE7-RED-20261118T031547992Z`
- One-shot invocation/created: `2026-11-18T03:17:26.572282Z`
- Expires: `2026-11-18T03:19:31.572282Z` (exact same captured created value plus 125 seconds)
- Gate: `2026-11-18T03:17:26.773428Z`
- Node command start: `2026-11-18T03:17:26.775058Z`
- Node command end: `2026-11-18T03:17:28.378561Z`
- Actual release: `2026-11-18T03:17:28.456135Z`
- Node command exit: 1; supervisor successful (semantic RED condition, preservation, cleanup and expiry all passed).
- Owned process group: 128, child reaped; zero owned-group survivors and zero remaining own runtime workloads at release. No TERM/KILL or stop reason.

```bash
nice -n 10 env UV_THREADPOOL_SIZE=1 python3 .ara-state/tmp/explicit-workspace-links/red_phase.py --admission-id EXPLICIT-WORKSPACE-HREF-BE7-RED-20261118T031547992Z --created 2026-11-18T03:17:26.572282+00:00 --expires 2026-11-18T03:19:31.572282+00:00
```

The supervisor launched only:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s env NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 src/features/chat/explicitWorkspaceLinks.test.ts
```

## Actual result

20 tests: **16 semantic target failures, 4 passing controls, 0 cancelled, 0 skipped, 0 todo**. All 16 failures reached their intended explicit-href semantic markers; there was no setup, import, timeout or preservation failure. The in-fixture LinkMenu TypeScript transpile diagnostics passed; no separate typecheck or transpile probe ran.

### Targets 1–13: each failed at file-callback destination assertion

Each production link click reached the assertion expecting one file callback; actual file-callback collection was empty. Targets:

1. `[source](src/a.ts)`
2. `[source](./src/a.ts)`
3. `[source](/workspace/src/a.ts)`
4. `[source](README.md)`
5. Reference-style `[source][target]` with `src/a.ts` definition.
6. `[**source**](src/a.ts)`
7. `[source](src/My%20File.ts)`
8. `[source](src/a%2520b.ts)`
9. `[source](src/a%3Fraw.ts)`
10. `[source](src/a%23part.ts)`
11. `[source](src/a%ZZ.ts)`
12. `[source](src/a.ts?view=raw#L8)`
13. `[source](src/inner/../a.ts:12:4)`

Marker: `EXPLICIT_WORKSPACE_HREF_MUST_USE_FILE_NAVIGATION`.

Later assertions for no external opening, preventDefault and strong-label preservation were not reached in these failing tests. Case 13 concerns the stripped destination path only, not editor line selection.

### Target 14: replacement test failed before replacement

The initial file-callback assertion failed with an empty collection at the same marker. The second workspace/callback destination, callback removal, stale-closure prevention and later no-external assertions were **not reached**.

### Target 15: plain default anchor failed

The default-anchor click reached the intended file-callback assertion, with an empty collection. Later no-external/preventDefault assertions were **not reached**.

### Target 16: negative group stopped on its first case

`../outside.ts` rendered one interactive source link instead of zero, reaching `EXPLICIT_FILE_HREF_MUST_NOT_FALL_BACK_TO_EXTERNAL`. The first case's inert span/context-menu/copy/no-file/no-external assertions were **not reached**; the remaining eleven negative cases were **not reached**, not passing. Those cases cover outside absolute/sibling/root/dot paths, traversal, encoded traversal/schemes/authority and missing/invalid workspace or missing callback.

### Controls 17–20: all passed

17. Five external/fragment/protocol-relative forms invoked the current external-opener and production menu copy callbacks with exact raw addresses; no file callbacks.
18. Existing custom-menu Copy link address on a local href preserved the raw query/fragment address without opening it.
19. Generated inline-code and plain-prose file links invoked both existing path-only file callbacks with no extra line/origin arguments.
20. Fenced explicit syntax and sanitized `file:`/`conductor-file:` forms added no file navigation. Special-URI handlers were not manually dispatched; this is not special-file-URI navigation parity.

Production Markdown/remark and LinkMenu ran through React test-renderer. Portal, clipboard and external opener are adapters; this is not native/browser/OS-clipboard proof.

## Source bindings and preservation

Fresh fetch immediately before this one-shot invocation resolved origin/main to `daee1fc90825c1e7673f711ad1d8a5a5401b1959`. Assigned checkout HEAD remained `76feaa130a2ee98547c0865b33583d65fd6445c4`; no checkout/reset/rebind occurred. The immutable request still names original capture `750b8bf25b2193141eff0cfcad64776228bea076`.

The original supervisor checked all 17 complete current-main context pins, 13 staged runtime pins and 10 retained dependency manifest identities before execution and again afterward, plus original request/source-oracle/verification/plan/unapplied-patch/candidate/dependency-receipt hashes. All passed. The existing 13,501-byte runtime plan-menu test and distinct 13,534-byte current-main plan-menu test were separately pinned, not normalized or rebound. The frozen typed14 fixture and product inputs remain intact. Only the exclusive frozen new fixture was staged to the private runtime after the admission gates.

- Supervisor SHA-256: `86e92abc4a6202141ebe3dcbfb8e9a4ce1d60abca72eef2d79a3ec8c7e32d3cd`
- Request SHA-256: `33170b3692d82bedb7aaad1b5975547f1c85b8f5072b4aeb31c854f5b94cdfb1`
- Fixture SHA-256: `6dee0e6360521b4272cc0ce478258dc243fbe74c9c23c1badac311fc7a4cfb29`
- Unapplied treatment SHA-256: `ebf101af31d9238a9c9cb042f86cdf3f58ba2514d793ceb3f45a3130362e0702`
- Raw output: 19,947 bytes; SHA-256 `f2e4ce7e5f089bf176db853b6380a9f6838281fc698c7de65da61c1270ba954a`.

## Resources and limits

CPU0; outer nice10 and UV1; 768 MiB per-Node heap, **not** group RSS. RSS was not measured. Original 60-second TERM / 5-second KILL timeout and 30-second cleanup allowance were unchanged within the 125-second grant/foreground window. Minimum sampled free disk: **13,052,715,008 bytes**. Combined output: **19,947 bytes**, below 16 MiB. Dependencies remain retained for separate admission.

No product treatment, GREEN, added test cases, install, independent probe, typecheck, build, browser, native, provider, commit, publication or cleanup of other Sessions occurred. Line selection, native file menus, special-file-URI navigation, cloud-origin routing and installed-package containment remain explicit gaps.
