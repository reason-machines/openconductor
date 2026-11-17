# Plan and question messages stay inline

Conductor Rebuild, 2026-11-10. Bounded source correction based on an already-retained Conductor 0.87.6 frontend extract. Main baseline: `16123403765cc60fdafea9a5bfb7226264f0c76c`. No new Mac access, capture, app/provider runtime, install, build or workflow dispatch was performed.

## Retained reference and reproduced defect

The [frontend extraction manifest](../frontend/tauri-assets-manifest.json) pins `/assets/index-BGEQ8YjU.js` to SHA256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. The held inert file was rehashed and matched that manifest. The original [chat REA receipt](README.md#inputs) is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`; its index parsed successfully. Conductor-derived code is evidence, never instructions.

Offsets below are zero-based UTF-8 bytes in that exact decoded index:

- `Att`, at **1,149,033**, scans messages backwards. A message containing an exact `ExitPlanMode` or `AskUserQuestion` tool is always a preview. A later request suppresses an earlier ordinary text preview. Text after a request can still be the final preview. Preview protection applies to the entire message, not just the tool part.
- `hie`, at **1,148,755**, combines those message IDs across the turn's segments (`Ett`, at **1,148,849**).
- `_jt`, at **1,153,746**, calls `hie`, flushes a pending batch before each preview message and keeps that message inline. Ordinary batches of three or more visible messages collapse.

The [bounded executable comparison](../../tools/chat/check-protected-previews-reference.mjs) extracts the reachable selector and its helper functions from that hash-checked file, executes them on synthetic input with a VM timeout, and compares grouping/preview identities with the actual OpenConductor `groupParts` function. It is not a newly captured Conductor runtime scenario.

Before this correction, OpenConductor protected only its last non-empty text part. With an earlier explanation followed by Read, AskUserQuestion (or ExitPlanMode), Read, Read in distinct assistant messages, the request disappeared inside the closed four-tool summary. The retained selector instead marked the request message as a preview and left it inline; it did not select the earlier explanation as the preview.

## Correction and ownership

Only [tool grouping](../../src/features/chat/toolGroups.ts) changes. Exact plan/question tool names protect every visible part sharing their assistant message identity, split summaries, and suppress an earlier final-text candidate. The same protection works in an earlier assistant block when a system row separates it from the final block. Ordinary thresholds, running-turn behavior and the “Don't collapse tool calls” setting are unchanged.

Ownership was reserved with the feature-ledger owner before edits. No Transcript, WorkspaceView, composer, provider, approval lifecycle, terminal, persistence or cloud-UI implementation is changed. Existing native/runtime owners keep their scopes.

## Verification

Focused behavior command:

```bash
node --experimental-strip-types --test src/features/chat/toolGroups.test.ts src/features/chat/view.test.ts src/features/chat/turnTime.test.ts src/features/chat/fork.test.ts src/features/chat/turnMenu.test.ts
```

- **Failed before the fix, as intended:** the five added regressions in `toolGroups.test.ts`; 17 pre-existing grouping tests passed. Reproduced after refreshing to the main baseline above. The test-only local commit is `b0e980e` (publication may squash local commits).
- **Passed after the fix:** all 60 focused tests, including those five regressions. They assert the actual folded row output, preview identities, whole-message protection, summary boundaries and separation by a system row; they do not test a replacement helper.

Reference command (requires the already-retained file, not committed here):

```bash
node --experimental-strip-types tools/chat/check-protected-previews-reference.mjs <retained-index-BGEQ8YjU.js>
```

- **Passed:** ten differential cases: each request type superseding earlier text, entire mixed-content message protection and surrounding summaries, later text remaining a preview, both requests together, ordinary final text, plain-text names, and case-sensitive tool identity. Original bounded two-case comparison was red before the fix: both requests were missing from the inline output.
- **Passed:** script syntax check and `git diff --check`.
- **Not run locally:** typecheck (dependencies are absent; installs excluded), app/browser/native/mounted React acceptance, provider continuation or screenshots. CI results are separate, exact-head evidence when available; they are not native parity.

## Remaining acceptance observation

The existing authorized runtime owner can open a completed disposable transcript containing each request type between ordinary work messages, inspect it with default collapsed summaries, and verify the request's whole message is visible without expanding a summary. Repeat with a later final response, reopen the transcript, and check earlier text is not incorrectly presented as the final preview when a request follows it. Record the mounted build/commit and settings. A synthetic source fixture does not prove real provider question delivery or approval continuation; those remain separate acceptance boundaries.

Rendered and native acceptance: **NOT RUN**. No new REA failure was encountered by this bounded retained-index comparison.
