# Composer Send-readiness controls

Conductor Rebuild rechecked main `021aeaa4027770258b4daae127bc829d1575d0ab`. All eight previously pinned source files were unchanged. No product defect was established.

## Four preserved controls

`service-controls-v1.mjs` retains the original bytes and SHA256 `eb5cd51e6e8451870c2bdd255c32b49a66a70086e1e5a719b775f83ef4bf6a09`. Its historical `PROPOSED_NOT_EXECUTED` export is preserved, not the current execution verdict. The thin `sendReadiness.test.ts` loader changes only the import target to the actual checkout's `ComposerSession`.

The four cases cover deferred reads, deferred writes, failed B with ready A, and workspace-copy failure. Each checks draft retention, admission, payloads, and explicit retry. No session guard is relaxed.

The mounted matrix uses the same four classes across three actions, two key presets, and idle, working-queue, and working-opposite-steer states. There are 72 cases. The actual Tiptap `ComposerEditor`, `Composer`, and whole `WorkspaceView` module run. The loader adds an export for the existing internal `ChatPanel` entry without changing its body. The surrounding workspace layout, native APIs, provider transport, preferences, and decorative components are replaced. `agent.submit` is an observer, not provider execution.

Files enter through the actual file input callback. Text enters through a paste event on the real contenteditable. Button and key events reach actual production handlers. Read, write, and workspace-copy ports use controlled promises. Disabled-button assertions are not used to force an action or claim reference parity.

The existing CI frontend-unit job runs the service wrapper. Its existing DOM step discovers the mounted file through `tests/chat-search/*.dom.test.mjs` and supplies `ONBOARDING_DOM_DEPS`. No workflow or dependency manifest is changed.

## Executed checks

- On Reason Cloud, `node --experimental-strip-types --test .source-prep-13576/send-readiness-qualification-v3/service-controls.test.mjs` passed all four original cases against source bytes identical to the pinned main.
- On Reason Cloud, the pre-publication mounted fixture passed 79 cases. The published matrix keeps only the 72 same-four cases. Seven extra empty-input diagnostics are excluded from publication.
- Three separate in-memory mutations failed the intended behavioral assertions. Bypassing pending admission delivered early. Clearing after a rejected async submit erased prose. Duplicating `agent.submit` submitted twice. These are sensitivity checks, not defects observed in production source.
- One supplementary exploratory write-failure probe passed its empty-input case but failed a representation assumption in its ready-A case. It expected `userContent.parts` to be `[]`; the actual serializer retains `{kind: "text", text: ""}`. This is not a delivery defect or a qualified product RED. Its failed log is retained unchanged, and the probe is not shipped.
- Exact published-path execution, typecheck, build, and merge eligibility are left to the automatic hosted workflows. The local pre-publication result is not described as GitHub Actions evidence.

## First automatic hosted attempt

[CI run 43131764457](https://github.com/reason-machines/openconductor/actions/runs/43131764457) at published head `2bfd010937d27b315ca97f2c4ced7de67a7c1ce9` failed the service wrapper in both frontend jobs: the child exited zero but emitted zero TAP case rows (`0 !== 4`). The [unchanged failure excerpt](hosted-loader-failure.tap.txt) is a runner/loader failure, not product RED and not execution credit for the four controls. The inherited `NODE_TEST_CONTEXT` is removed only from the child environment, following the existing nested-runner wrappers in this repository. Actual four-case TAP is now printed after all original wrapper checks pass. The frozen service fixture, mounted matrix, and mounted host hashes are unchanged.

The same run also failed the existing disclosure-remount baseline because its pinned `src/scripts/api.ts` hash differs. That separate baseline repair belongs to #1109, not this change. Neither failure is skipped, weakened, or called passing. No additional local tests were run for the environment correction; automatic exact-head CI must verify it and reach the mounted step.

## Corrected automatic hosted attempt

At head `adf2e616a53d48524a1ac5751a346a0343741ab4`, [CI run 43132430659, frontend-unit job 130899686329](https://github.com/reason-machines/openconductor/actions/runs/43132430659/job/130899686329) emitted all four original case names, `1..4`, `tests 4`, `pass 4`, `fail 0`, and `skipped 0`. The [unaltered hosted excerpt](hosted-service-controls-adf2e616.tap.txt) includes the passing outer wrapper. This proves service execution, not the 72 mounted cases.

Both frontend jobs still failed the independent disclosure-remount baseline hash check owned by #1109. The DOM step was skipped after that failure; the published 72-case matrix has no hosted execution credit yet. No additional local tests were run. The wrapper now also asserts each exact case name, the four-case plan, total test count, zero failures, and zero skips without relaxing its existing count or pass predicate. Automatic CI must verify these added assertions on the next exact head.

## Reference and limits

Retained Conductor 0.87.6 REA evidence is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. The source record distinguishes the upload registry, attachment-record loading, and mutation completion. Their phases are not interchangeable. Passing OpenConductor controls do not close the original native path-mention read/write barrier gap.

This change adds tests and evidence only. There is no screenshot because no app UI change is made and jsdom does not render pixels. Native macOS, same-Cairo, original-app execution, provider authentication, credential handoff, database, real IPC, packaged deployment, and IME acceptance are not run. #1097 remains closed; its cancelled E2E run receives no qualification credit.
