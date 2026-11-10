# MultiEdit file-badge aggregate hover

## Scope and ownership

Conductor Rebuild owns MULTIEDIT-AGGREGATE-HOVER-BE7-05 in the fresh-main Session
`ece4efab-55e5-4fa4-90cb-edbf01158c49`. Exclusive transfer T1-r666 was confirmed
by ledger receipt `7973d2e3-950a-49ba-a15d-9bb2f37c2624` before edits.

The assigned branch is `reason/openconductor-multiedit-ece4efab`, bound to
`refs/heads/main`. The initial checkout and live default/main were both
`3470916c691f5b7deace83eb8723466e339976c3`. The Session had no associated PR
before opening [PR #925](https://github.com/reason-machines/openconductor/pull/925).
Frozen PR #847 and its branch are not part of this delivery.

Only these paths change:

- `src/features/chat/ToolRows.tsx`: opt-in FileBadge hover and MultiEditRow aggregate.
- `src/features/chat/multiEditHover.test.ts`: dedicated behavioral cases.
- This evidence record.

## Reference identity and limits

The supplied archive `multiedit-hover-be7-05-handoff.tar.gz` is 4,429,335 bytes,
SHA256 `8fea109d8da76e0582f2c3c73c7c78e209ad13e3e1a21e2aaa95c94c0229ed6d`.
It was extracted as data into this Session's untracked evidence directory. No
extracted JavaScript or handoff audit script was executed.

Retained REA receipt:
`ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

REA GAP: retained REA skipped the renderer because of heap exhaustion. The
reference is decoded retained shipped bytes, not original source, decompiler
success, or runtime/native proof. No new acquisition, REA run, Conductor launch,
or device operation was performed for this delivery.

The successor independently rehashed both full assets and every span below:

- `renderApp-D_fmY7hW.js`: 11,600,457 bytes, SHA256
  `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` — PASS.
- `index-BGEQ8YjU.js`: 3,493,297 bytes, SHA256
  `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3` — PASS.

All offsets are UTF-8 byte offsets with half-open bounds. Each hash is of that
exact byte slice, not a normalized string:

- Renderer kind table `[7587405,7588524)`:
  `f262bc45b6b432b6c2d202cc40ba21555037558e2d109ac511931f4687085fa8` — PASS.
- Renderer registry `[7877182,7877769)`:
  `13b04178ae2eb95efe536f1c3d23c22198d7585d2e1741d3eade645151d39599` — PASS.
- Renderer MultiEdit `[7823740,7826901)`:
  `11a70ced92c1cb8a161cbaea66bc298e927bcf19e42574382b7eeaaec2321f55` — PASS.
- Index Codex selector `[3138603,3138683)`:
  `0d157066506877b3ef1ea78831d7308d218091f49663fbdf472b2b89f0250ddc` — PASS.
- Index Codex guard `[3140607,3140730)`:
  `c86328b345fec14411bf81fc3659d54e4d5bb03d006d6da8c22d6f735b2f6196` — PASS.
- Renderer guard alias `[56266,56275)`:
  `4da30be9aa773d02f94c8fac8cf93699269e4ac1746af12b472983432ab0484d` — PASS.
- Index guard alias `[3483173,3483182)`:
  `5212a61ced162c8ad790f4cc3a892133d52a12f4a5588d519f2a4508449a682d` — PASS.
- Renderer file-badge hover `[7777001,7782029)`:
  `38d4a2efa99fd08a87b2540dfb48add94860e8932a56c644132fcecf20165bf0` — PASS.
- Renderer inline diff `[7775444,7776600)`:
  `8b38333809c09e26d0d90ecf0ae88eae19cf9694747952170a37cea38edbf1e6` — PASS.

## Static reference chain

The retained kind table maps MultiEdit and NotebookEdit to `multi-edit`. The
registry maps that kind to `$0o`. Its `a=fSe(sessionId)` guard resolves through
renderer `ey as fSe` and index `JKt as ey` to the Codex selector.

For non-Codex calls, `$0o` supplies `tee` with `hoverCardContent` containing `sV`.
The old and new contents each join the corresponding marker-stripped edit
strings with a newline, in input order. The file button remains the navigation
trigger. The hover opens after 150ms and closes after 100ms, above the trigger,
start-aligned with an 8px offset. Its width is 28rem, bounded by the viewport;
`sV` defaults to a 20rem maximum height. Codex omits this aggregate hover.

The reference also contains nested per-edit inspectors. Those inspectors already
exist in OpenConductor and are not the missing feature.

## Current-main assessment and correction

The successor re-read default/main at
`3470916c691f5b7deace83eb8723466e339976c3`, rather than relying on the historical
handoff assertions. At that commit, ToolRows blob
`b8367bdf706e17a635c79d1a391bb713ed559387` has SHA256
`1ec0921fce0d80c6fb1229c18208a5e1689b9e375d5b00f7e7d892e25587d1e1`.
FileBadge supplies a path tooltip and navigation callback. MultiEditRow supplies
no aggregate hover.

The correction makes hover content opt-in on FileBadge. Only MultiEditRow opts
in, using the existing DiffBlock and stripMarkers implementation. The wrapper
keeps the same file button, delay lifecycle, pointer-to-content close gap,
viewport bounds, and Escape, resize, and outside-scroll dismissal. It performs
no provider or diff API request. Styling is local to the opt-in wrapper; no
shared CSS or footer component changes.

Codex coverage is bounded to the existing native `file_change` projection into
Edit, Write, and Bash. Those rows do not opt in. ToolRowProps has no provider or
session identity, so this delivery does not claim to implement or verify a new
provider discriminator for arbitrarily supplied MultiEdit payloads. No Codex
adapter, provider, shared API, or transcript caller was changed.

## Hosted RED before correction

The fixture-only ready PR head was
`800101d3cf2f0d309fa207f75befd339b4832246`. Production remained at the baseline
ToolRows blob. Automatic [CI run 42873156752](https://github.com/reason-machines/openconductor/actions/runs/42873156752)
ran `node --test "src/**/*.test.ts"` in both frontend jobs.

[Unit job 130029394976](https://github.com/reason-machines/openconductor/actions/runs/42873156752/job/130029394976)
failed the four intended hover cases. Its decisive output included:

```text
not ok 403 - MultiEdit badge hover shows the full marker-normalized aggregate after 150ms
error: aggregate hover opens independently of the collapsed row
0 !== 1
expected: 1
actual: 0
not ok 404 - NotebookEdit badge hover shows the full marker-normalized aggregate after 150ms
not ok 405 - aggregate hover cancels short entry, bridges the 100ms close gap, and dismisses on Escape
not ok 406 - hover preserves file navigation and independent nested edit inspection
ok 407 - plain FileBadge keeps path tooltip, children and navigation without a hover
ok 408 - Read, Write and Edit badges do not acquire the opt-in aggregate hover
ok 409 - native Codex file_change projection remains Edit/Write/Bash with no aggregate hover
ok 410 - touch and focus do not open a pointer hover; pending timers are cleaned up
```

The other frontend job passed typecheck and color checks, then failed the same
unit stage: 1,838 tests, 1,834 passed, four failed. The existing nine MultiEdit
row tests passed. Production correction began only after these failures were
read from hosted logs.

The fixture blob is `2d2069375c9a3bdf07be1f7aa154abaeec338b6a` and stays unchanged
for GREEN. Automatic CI runs the same regressions and controls on the correction.
The PR records exact-head GREEN and merge receipts; this static record alone is
not a GREEN, merge, or packaging attestation.

## Preservation and verification boundaries

Baseline blobs retained unchanged by this delivery:

- Existing `multiEditRows.test.ts`: `58442d28b8a04bf220496a5db52a7a0239b707f1`.
- `conductorTools.ts`: `1b899339620f130ecbb2f39a1131de8a4c04ea68`.
- `TurnChanges.tsx`: `7dd024dfa4586face78c870ab27791b8236e58b4`.
- `turnFilePreview.ts`: `dc93e9bc8c0be29d95570c3858afcc022d08feac`.
- `turnFilePreview.css`: `1845722ad416eb9815527e181d7da5beb5d1020d`.
- `markdown.ts`: `cca8f5da8ee804351b0e223134a3b56706f4d7ea`.

The nested inspector body and DiffBlock remain byte-identical. All other
FileBadge call sites remain unchanged. No generic Read, Write, or Edit expansion
was added.

Browser and native checks: NOT RUN. There are no screenshots because runtime,
native execution, and new acquisition were explicitly excluded. The behavioral
fixture runs real React callbacks and effects with deterministic timers and
synthetic host geometry; it does not prove browser hit-testing, layout,
clipping, native parity, or the original app's execution.

Shared-cloud dependency installation, tests, builds, provider execution, and
manual workflow dispatch or rerun: NOT RUN. Only existing automatic hosted
workflows execute. The delivery owner follows every exact-head check before a
protected merge, then follows automatic consuming-main CI and macOS packaging.
A package build is not evidence that the hover was observed in a native app.
