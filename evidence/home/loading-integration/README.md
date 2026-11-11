# Home loading integration

Conductor Rebuild keeps Home in its loading state while the local desktop store hydrates. The shell already knew `startup === "loading"`, but did not pass it to Home. Home therefore evaluated placeholder rows or the settled-empty action before the data arrived.

## Correction

The change passes the existing startup signal from `App` to `AllWorkspaces`, renders the loading status before the unchanged row/empty branches, and adds one CSS rule. It reuses `RowStatusIcon`. Store behavior, #1017 settled-empty actions, #1011 selection, providers, cloud UI, and native code are unchanged.

Laziness Protocol kept the correction to the existing signal and three product files. Prove It Works kept source qualification, mounted regression, hosted checks, and native acceptance separate.

## Retained real-Conductor evidence

[The historical source manifest](manifest.json) records 33 exact inert spans, UTF-8/UTF-16 offsets, aliases, and the full asset identities for Conductor 0.87.6. The parent REA evidence is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`; the attributed retained service receipt is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. No new acquisition or reference-JavaScript execution occurred.

`UJo` consumes `Xh().isLoading`, `nF().isLoading`, and `so().isLoading`. Its `Jo = r || u || I || Ye === undefined` predicate renders `Loading workspaces` before rows or the settled empty state. The header action is outside that branch. The retained implementations and local hydration transitions close these aliases to `Afe`, `q2t` through `A2t`, and `rl`.

On OpenConductor, FirstRunGate checks onboarding/repository count before mounting App, not full workspace hydration. Once admitted, a non-demo desktop window on `/all-workspaces` can mount Home while actual repository/workspace IPC reads remain pending. This is the bounded source condition, not a claim about native timing.

The source manifest intentionally retains its historical baseline and source-only classification. [The terminal execution receipt](terminal-receipt.json) and [delivery reconciliation](delivery-reconciliation.json) record the later runtime result without rewriting historical evidence.

## Regression and actual result

The unchanged four-case `src/components/homeLoading.test.ts` mounts production App, actual `useAppStore` hydration, persisted mapping, AllWorkspaces, and RowStatusIcon. IPC/storage are controlled; unrelated App-only effects and unrelated imports are inert. FirstRunGate is not mounted.

The sole executor ran this command in separate frozen baseline/candidate trees on Reason Cloud 298, with the same fixture and existing public nine-package resolver:

```bash
node --test --test-concurrency=1 src/components/homeLoading.test.ts
```

Each run used a 90-second timeout, a 5-second kill grace, and a 384 MiB Node heap limit. The exact outer command, resource limits, full TAP, digests, and timestamps are in the terminal receipt.

- **Expected failure observed.** Baseline main `12a805ed90f5aeb0d472e53a64ad6d85bf2d3479` exited 1. Only pending hydration failed, with `Loading workspaces` actual 0, expected 1. Three controls passed. The run terminated at 10:14:02Z on 2026-11-11.
- **Passed.** The candidate exited 0 with four passes, including pending-to-ready hydration showing the actual workspace row. The run terminated at 10:14:27Z.
- **Passed controls.** Populated startup, settled-empty Create action, and browser-ready/no-desktop-read behavior.
- **Passed source reconciliation.** All 18 baseline inputs at delivery main `b6e7473d17462ce09948437b4239fb0a31e8d37f` are byte-identical to the executed baseline. All three delivered product files match the executed candidate hashes. No replay was duplicated.
- **Passed fixture identity.** 9,460 bytes, SHA-256 `7fc4ee787d23650efa77d716e79ee3701b178b01506b497c20a3b6a569a132d6`, unchanged before/after. The three-file patch remains SHA-256 `19528f2a344f9163bfad4b1872744c3d35b0dff6849fe62244cd934f1427bde4`.
- **Passed.** `python3 evidence/home/loading-integration/verify-delivery.py` checks the receipt, 18 delivery inputs, fixture, candidate files, and all 33 retained span digests. `git diff --check` passed.

Two earlier pre-runtime source-drift stops were not behavioral failures. Their original receipts and revised source-only packets remain preserved in the owning Session. The eventual executed snapshot includes unrelated upstream local-clear and section-dialog changes without changing the assertions.

## Limits and consuming build

- Full-app typecheck/build were not run locally. The nine-package resolver proves this bounded fixture only, not a reduced-tree substitute for complete application checks. Existing exact-head hosted CI runs full-lockfile installation, `npm run typecheck`, frontend tests including this fixture, and `npm run build`. No workflow or dependency changes are needed.
- Native/reference mounting, FirstRunGate runtime, real initialization/query timing, browser rendering, and visual geometry remain unverified. No screenshot is supplied because native/browser execution was outside this serialized admission.
- Startup also waits for sidebar-section hydration. The correction does not claim exact reference per-query timing or post-startup refresh policy.
- No provider, real agent process, or reference JavaScript ran. The historical REA semantic-renderer heap-exhaustion gap is unchanged.

Conductor Rebuild owns the ready-main PR, exact-head hosted checks, protected merge, and consuming-main macOS package verification. A successful package proves consumption of the merge, not native/visual parity.
