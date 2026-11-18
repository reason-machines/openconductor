# Explicit workspace href GREEN20 — actual execution

Author: Conductor Rebuild

Admission: `EXPLICIT-WORKSPACE-HREF-BE7-GREEN-20261118T034519945Z`

## Actual outcome

Executed the existing frozen supervisor exactly once on Reason Cloud. Supervisor exit 0, Node exit 0. TAP: 20 tests, 20 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo. No timeout, setup failure, retry, TERM or KILL. Only the two previously reviewed candidates were staged into the retained runtime by the frozen supervisor after preflight.

Exact child command:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s env NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 src/features/chat/explicitWorkspaceLinks.test.ts
```

Outer supervisor invoked with `nice -n 10 env UV_THREADPOOL_SIZE=1 python3`, unchanged request and supervisor. Created was captured immediately before invocation; expiry used that same value plus exactly 125 seconds. Foreground call timeout: 125 seconds.

- Created: 2026-11-18T03:47:22.660359Z
- Expiry: 2026-11-18T03:49:27.660359Z
- Start gate: 2026-11-18T03:47:23.624950Z
- Test start: 2026-11-18T03:47:23.645020Z
- Test end: 2026-11-18T03:47:27.205881Z
- Actual release: 2026-11-18T03:47:27.421017Z
- Owned process group: 270; child reaped; owned-group survivors empty and own visible workload list empty.

## Reached assertions

All thirteen explicit local href positive cases passed their actual production Markdown click handlers: relative, dot-relative, absolute-within-workspace, basename, reference definition, formatted label, single decode, percent-preserving double encode, encoded question/hash characters, malformed percent, query/fragment stripping, and dot/line-suffix path normalization. The callback received the expected path only, no invented line/origin argument; external opener remained unused and preventDefault was asserted. This is path-only proof, not line-selection parity.

The replacement case reached both destinations (`/workspace/src/a.ts`, then `/second/src/b.ts`) with the replacement callback tag, then removed the callback and proved no interactive stale closure or external fallback. The default-anchor case reached the actual file callback and preventDefault assertion.

The negative group completed all twelve subcases, including parent escapes, absolute outside/root/sibling-prefix paths, workspace-root and dot-only targets, encoded traversal/external/protocol-relative forms, missing/invalid workspace, and missing callback. Each reached its inert-span production context-menu handler, selected Copy link address through the adapter, copied the original raw href, and asserted zero file/external callback invocations.

All four controls passed: external/fragment/protocol-relative opener and raw-copy handlers; accepted local-href raw copy; generated code/plain-file path-only callbacks; fenced syntax and unchanged special-URI sanitization. The real portal, clipboard and native opener are adapters, not end-to-end proof.

## Integrity and scope

- Fresh fetched main checked: `234ec70ea89135b83f68f287330a3701d27f2b2d`.
- Product commit remained `9a615be52c140f17144618ce31c0d18b812f9169`; primary and isolated product tracked/staged trees clean.
- All seventeen whole-file current production baselines passed. Before invocation, materialized reversal of the exact reviewed patch returned all seventeen production baseline files.
- All thirteen retained runtime input pins passed before staging and after treatment. Only markdown.ts and LinkMenu.tsx differ, exactly as reviewed.
- Ten dependency manifests retained their name/version/hash and physical device/inode/mtime/byte identities across execution. This does not attest every file in the dependency tree.
- Eleven frozen original evidence/source files, two retained reference assets, binding and treatment receipts, original request and supervisor remain unchanged. All frozen postflight checks passed.
- The typed-subagent fourteen-case and plan-menu eleven-case fixtures remain distinct preserved historical witnesses. They were not rerun in this admission; the retained plan fixture and fresh-main plan fixture remain separately pinned, not normalized.
- No new fixture, install, separate parser/probe, typecheck, build, CI, browser, native, provider call or publication occurred.

## Resources

- CPU0 test affinity, nice10, UV1 and 768 MiB per-Node heap retained.
- Minimum sampled free disk: 15,838,638,080 bytes (at least 4 GiB throughout observed samples).
- Combined raw output: 4,941 bytes (below the sampled 16 MiB limit).
- RSS not measured; the heap setting is not a process-group or aggregate RSS ceiling.
- Private dependency directory retained. No protected evidence or dependency cleanup occurred.

## Exact artifact identities

- Supervisor: `5c4c4ad8fffc2c78fd1a3e91a45b4f8d6369c7df32b6c3d543495721f07c4da3`
- GREEN request: `53b34e11c09c9296d236565b24252d0a66f78a6e1fe158a1003fc6e0ccf29bd3`
- Original fixture: `6dee0e6360521b4272cc0ce478258dc243fbe74c9c23c1badac311fc7a4cfb29`
- Raw GREEN TAP: `0c76dcb34cb0624d3b946cb5ebb648a467b0d158b3a3d576537ba2aa31d4c58a`
- Original RED TAP (16 target failures, four controls passing): `f2e4ce7e5f089bf176db853b6380a9f6838281fc698c7de65da61c1270ba954a`

Receipt and owner pre/postflight JSON files carry the actual measurements and byte-preservation checks; packet-manifest JSON supplies hashes of the original-byte files included in this handoff.

## Remaining gaps

No browser/native/OS clipboard/Finder/editor line selection, native file menu, special-file-URI navigation, Reason cloud-origin routing, full WorkspaceView mounting, symlink/filesystem confinement, visual parity or installed-package containment claim is made. No screenshot exists because this admission authorized only the frozen unit run. No PR or additional runtime was started; stop after actual release and await the delivery continuation.
