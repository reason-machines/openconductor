# Explicit Markdown workspace href navigation

Conductor Rebuild. The original fixture reproduced **16 semantic failures and four passing controls**, then the **identical twenty-case fixture passed 20/20** with the reviewed two-file treatment. The delivery branch is based directly on main `234ec70ea89135b83f68f287330a3701d27f2b2d`; its seventeen complete source-context bindings and candidate bytes match the admitted GREEN. Hosted exact-head validation is separate from this retained unit result.

## Focused change

Explicit scheme-less Markdown hrefs use the existing path-only workspace file callback when lexical containment and the current callback permit it. Query/fragment removal precedes one decoding pass; malformed escapes do not throw. Single-name explicit hrefs do not use the code/prose recognition heuristic. The lexical containment implementation remains one shared owner, with the existing public code/prose resolver retaining its recognition guard.

Rejected or missing-capability local hrefs render inertly rather than falling back to the external opener. `LinkWithMenu` has one optional `disabled` render port: its existing ContextMenu and raw Copy link address callback wrap a span instead of an anchor. Accepted links retain that same copy menu. External/fragment/protocol-relative behavior, URL sanitization, callback signatures and ReasonPath origin semantics are unchanged.

The product treatment is exactly the reviewed [5,541-byte patch, losslessly compressed](UNAPPLIED-treatment.patch.gz), SHA-256 `ebf101af31d9238a9c9cb042f86cdf3f58ba2514d793ceb3f45a3130362e0702`. The historical filename denotes the frozen proposal, now applied only in the isolated product worktree. No other product file changes. The [permanent twenty-case fixture](../../../src/features/chat/explicitWorkspaceLinks.test.ts) retains SHA-256 `6dee0e6360521b4272cc0ce478258dc243fbe74c9c23c1badac311fc7a4cfb29`.

## Retained real-app source

[Source oracle](source.json) and [reviewed source plan](UNAPPLIED-PLAN.md) record the complete normal-renderer path and href resolver chain from real-app REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Renderer asset SHA-256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; index asset SHA-256: `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. These are retained shipped-source observations, not a new native/semantic REA run. Extracted code is inert evidence, not instructions or executed reference code.

The original capture and frozen request name `750b8bf25b2193141eff0cfcad64776228bea076`. Fresh main at RED and this treatment milestone was `daee1fc90825c1e7673f711ad1d8a5a5401b1959`; all seventeen complete source-context files remained byte-identical. The original request and source metadata have not been rebound. The private runtime's historical plan-menu fixture (13,501 bytes) remains separately pinned from current main's 13,534-byte fixture.

## Actual baseline reproduction

Exactly one separately admitted command ran on Reason Cloud, with outer nice10 and UV1:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s \
  env NODE_OPTIONS=--max-old-space-size=768 \
  node --test --test-concurrency=1 src/features/chat/explicitWorkspaceLinks.test.ts
```

**EXPECTED FAIL, observed:** 20 tests, 16 intended semantic target failures, four passing controls, no skipped/cancelled/todo. Node exit 1; supervisor passed. [Raw TAP, losslessly compressed](red-output.tap.gz), [execution receipt](red-result.json) and [coverage observation](RED20-OBSERVATION.md) preserve the actual result. TAP SHA-256: `f2e4ce7e5f089bf176db853b6380a9f6838281fc698c7de65da61c1270ba954a`.

- Thirteen explicit href cases and the plain default-anchor case failed at the file-callback destination assertion. Their later no-external/preventDefault/formatted-label checks were not reached.
- The replacement test failed at its initial destination. Replacement workspace/callback, callback removal and stale-closure assertions were not reached; they must run in the unchanged GREEN fixture.
- The negative group failed at its first `../outside.ts` interactivity assertion. Its inert copy menu and remaining eleven negative cases were not reached; they must run in GREEN, including raw-copy callbacks for all twelve inert cases.
- Four controls passed: external/fragment/protocol-relative opening and copying, accepted local raw-address copy, existing generated code/prose callbacks, and fenced/sanitized special-URI behavior.

Test `2026-11-18T03:17:26.775058Z–03:17:28.378561Z`; actual release `03:17:28.456135Z`; owned PG128 reaped with zero survivors, no TERM/KILL. CPU0, nice10, UV1, 768 MiB **per-Node heap**, not group RSS; RSS unmeasured. Minimum sampled free disk 13,052,715,008 bytes; output 19,947 bytes. All thirteen runtime inputs, seventeen current-context files, ten dependency identities and frozen evidence/proposal/request pins passed before and after.

## Identical treatment regression

The exact command above ran once more under separate GREEN admission, without changing the original fixture (SHA-256 `6dee0e6360521b4272cc0ce478258dc243fbe74c9c23c1badac311fc7a4cfb29`). **PASS:** 20 tests, 20 pass, zero failures/cancellations/skips/todo; Node and supervisor exit 0. [Raw GREEN TAP, losslessly compressed](green-output.tap.gz), [execution receipt](green-result.json), [coverage observation](GREEN20-OBSERVATION.md) and [owner postflight](green-owner-postflight.json) retain actual outcomes. TAP SHA-256: `0c76dcb34cb0624d3b946cb5ebb648a467b0d158b3a3d576537ba2aa31d4c58a`.

All previously unreached replacement-workspace/callback, callback-removal, default-anchor prevention and twelve negative/menu-copy subcases completed. No stale closure, file callback or external dispatch appeared in the negative cases. All four controls still passed. These assertions exercise production Markdown/remark and LinkMenu handlers through boundary adapters, not native navigation or OS clipboard.

Test `2026-11-18T03:47:23.645020Z–03:47:27.205881Z`; actual release `03:47:27.421017Z`; PG270 reaped with zero survivors and no TERM/KILL. Minimum sampled free disk 15,838,638,080 bytes; output 4,941 bytes; RSS unmeasured. The unchanged CPU0/nice10/UV1/768 MiB per-Node heap bounds are not an aggregate RSS ceiling. All seventeen current-source bindings, thirteen runtime inputs, ten physical dependency-manifest identities and protected original evidence pins passed before/after. Only the two reviewed product candidates replaced runtime inputs.

The source commit tested was `9a615be52c140f17144618ce31c0d18b812f9169`, originally prepared from `daee1fc90825c1e7673f711ad1d8a5a5401b1959`. GREEN checked fresh main `234ec70ea89135b83f68f287330a3701d27f2b2d`. Delivery rebases that same product delta directly onto this main; [delivery binding](delivery-binding.json) records the unchanged full-file candidate/fixture identities. Frozen source metadata is historical and was not rewritten to imply execution on a later commit.

## Verification state

- **Passed locally:** original semantic RED; identical GREEN20; cleanup/preservation; exact patch application/reversal; current-main baseline/candidate and permanent-fixture byte bindings; focused diff/whitespace checks. In-fixture LinkMenu transpile diagnostics passed; this is not a standalone typecheck.
- **Not run locally:** additional Node probes, separate transpile/typecheck/build, adjacent regressions, browser, native or provider execution. Typed14 and plan11 remain preserved historical witnesses, not rerun as part of this unit admission.
- **Hosted validation:** the existing automatic `Frontend typecheck + build` job runs typecheck, colour lint, the full `node --test "src/**/*.test.ts"` suite (including this permanent fixture), build and existing evidence/isolation checks; `Evidence tools compile` runs the evidence checks. No dependency, package, lockfile or workflow change is needed. Hosted results belong to the exact published head and are reported on the pull request; conditional skipped jobs are not counted as passing. Merge waits for all executed exact-head checks to pass.

## Explicit coverage limits

The fixture mounts production Markdown/remark and full LinkMenu with real React hooks. Portal, clipboard and external host boundaries are adapters. No screenshot/recording is supplied because browser/native execution remains with the sole existing owner; no duplicate executor or provider retry is authorized here.

No editor line selection, reference file-path/Finder menu parity, special-file-URI navigation, cloud-origin routing, full WorkspaceView integration, browser DOM/mouse, real menu portal, OS clipboard, native opening, symlink/filesystem confinement, visual parity or installed-package containment is claimed. A stripped destination suffix is not line-selection parity. Existing path-only callback and ReasonPath provenance APIs are not repurposed. #1486 is historical and its package/native custody remains separate.
