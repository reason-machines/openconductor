# Workspace-name context menu candidate

Conductor Rebuild prepared this candidate against main `2b079f13e07b580d26191f7f1f50b4d21e62174e` and reconciled it with main `248b6c359c830c6ac5e050721bae18e44e168068`. It is not yet fully behaviorally verified. The first hosted run observed the intended baseline RED and seven candidate passes; the eighth case exposed a repository-expansion setup defect. The ledger authorized ready main-target publication to obtain the paired hosted proof below.

The retained REA spans in [reference.json](reference.json) trace the real Conductor 0.87.6 local header through `s8i → Llo → o8i → SI/wI → D9e`. `SI` handles the context-menu event and `D9e` supplies the existing workspace actions. The original asset digests, byte offsets and evidence IDs remain recorded. This continuation recovered the frozen packet and verified its embedded span digests; it did not rerun REA or the reference app.

## Candidate

- `WorkspaceContextMenu` extracts the existing sidebar action composition. Read, pin, status, rename, copy, archive and section actions keep their existing handlers.
- `SidebarWorkspaceRow` delegates to the shared component. Row rendering, selection, hints, grouping and producer logic remain unchanged.
- `WorkspaceNameHeader` opens that menu on right-click and reuses `RenameWorkspaceDialog`. Workspace identity keys the component. A primary click still has no new handler.
- `WorkspaceView` changes only its name component, required view props and imports. The branch header and chat effects are unchanged.
- `App` supplies only `sections` and `onNewSection` at the existing WorkspaceView call. Palette and SectionDialog handlers are unchanged.

Foundational Thinking shaped the shared action component: both triggers use one action composition rather than independently maintained copies.

## Verification

Run the source check with:

```bash
python3 evidence/header-name-context-menu/verify-source.py --base origin/main
```

It verifies the retained six REA span digests, unchanged eight-case fixture, normalized callback extraction, exact App and WorkspaceView replacement boundaries, and unchanged neighboring files. It is a source check, not behavioral RED or GREEN, and does not parse or typecheck TypeScript.

The original packet's `stage.py --packet <original-packet> --repo . --main 2b079f13e07b580d26191f7f1f50b4d21e62174e --out <separate-scratch-tree>` also passed. All 968 frontend files matched the frozen inventory before a separate baseline tree was written. [The exact receipt](source-staging.json) leaves Node, installed dependencies, target capacity and runtime admission unqualified. `git apply --reverse --check <candidate.patch>` and `git diff --check origin/main...HEAD` passed.

The frozen [eight-case behavioral fixture](../../tests/e2e/workspace-header-menu-cases.mjs) remains byte-identical to the original packet. SHA-256 is `b4f4cae76a414e5c3312ddd411e3b17ab39f90bc55b8662cdc058d55b2599605`. E1 retains execution on its existing admitted full-app page and preview. The separately authorized hosted workflow does not consume that reservation. Older queued units and the separate prefix9 packet keep their order and assertions.

The original prediction was two passing controls and six failures waiting for the header menu, followed by eight candidate passes. The first hosted run observed that exact baseline RED but only seven candidate passes. The remaining failure is recorded separately below; it is not GREEN. Navigation, import or setup failures are invalid reproductions, not intended RED.

## Limits

At hosted head `d85e6d2464d0bb9013cbdfaa898c76d7ab689eed`, baseline behavior, seven candidate cases, typecheck/build, unit checks and both ordinary built-app jobs passed. The dedicated paired check failed the eighth candidate case. Corrected-runner results remain pending. Native behavior, installed-app consumption and side-by-side Conductor/Cairo acceptance are unverified. Hosted screenshots exist in the retained artifact; no local or E1 app runtime was launched.

The fixture does not verify clipboard contents, archive effects, rename submission, all section branches, native dragging or positioning. Left-click workspace details remain outside this candidate. The dedicated hosted workflow supplies scoped production-renderer behavior checks independently of E1. Neither route supplies native parity by itself. No second E1 executor or watcher is needed.

## Restore the staging self-test

The original `verify_stage.py` reproduced a `FileNotFoundError` before staging because it hardcodes a historical prefix9 scratch path. This is a setup failure, not app behavior. Fix Root Causes shaped the repair: make the retained packet an explicit input instead of recreating an undocumented scratch tree.

E1 returned the original Prefix9 archive. Its SHA-256 is `67499667ce63369a620478514a15dae13bfd4a18da29c251f725b0072ded7265`. The exact 7,355-byte fixture remains `894e0f32379cf3bade2d18f7b04b373ff62eab3a002dbeec8f05be1dff8bc3ce`.

Run this command from the candidate checkout with the two original archives supplied by E1:

```bash
python3 evidence/header-name-context-menu/prepare-selftest.py \
  --archive <same271-header-name-menu-v1.tar.gz> \
  --prefix-archive <header-prefix-frozen-source-only.tar> \
  --repo . --out <new-separate-scratch-directory>
```

The adapter verifies both archive hashes and the original verifier, then copies the exact Prefix9 fixture into separate scratch. It creates a separate verifier with only two setup substitutions: the explicit fixture path and a separate report destination. Reversing those substitutions must reproduce the original verifier byte-for-byte. All eight original header packet members and both input archives remain unchanged. It does not populate the old scratch path or run Prefix9.

[The actual staging self-test](restored-selftest.json) passed all five original checks on the frozen `2b079f13` frontend: 968-file staging, output-overwrite refusal, fixture-drift refusal, source-drift refusal, and unchanged tracked tree and Prefix9 fixture. [The preparation receipt](restored-preparation.json) records exit code zero and unchanged assertions. This is source qualification of the frozen baseline, not qualification of a newer main or E1's installed runtime.

The four [setup input checks](setup-input-checks.json) also passed. Reproduce them with:

```bash
python3 evidence/header-name-context-menu/test-selftest-setup.py \
  --archive <same271-header-name-menu-v1.tar.gz> \
  --prefix-archive <header-prefix-frozen-source-only.tar>
```

They verify refusal of missing Prefix9, tampered Prefix9, tampered header8 and existing output without changing retained data. No Node, app, browser, native executor, runtime admission or queue change occurred. The behavioral eight-case fixture and Prefix9 assertions remain frozen. E1 still owns runtime qualification and behavioral results in the existing order.

## Dedicated hosted paired proof

The ledger cleared a separate GitHub-hosted Chromium route. [The dedicated workflow](../../.github/workflows/header-context-menu.yml) does not modify the shared E2E workflow, dispatch a run, or consume E1's app-runtime slot. It builds the full production frontend and loads the supported `?demo=1` entry without injected storage, module mocks, synthetic menus or alternate app components.

On the PR that introduces this runner, it checks out the exact PR-base SHA, requires identical dependency locks, builds that renderer and imports the byte-identical eight-case fixture from the candidate checkout. The baseline must finish both controls successfully and fail all six menu cases at the explicit workspace-menu visibility wait. Setup failures, renderer exceptions, missing rows, wrong ordering and unrelated timeouts invalidate proof. Only after attributed baseline RED does it build the candidate renderer and require all eight cases to pass.

The result-contract unit tests use synthetic result rows solely to verify fail-closed reporting. They are not app reproductions. Test Behavior, Not Implementation shaped this route: the app assertions remain ordinary clicks, keys and visible state. Prove It Works keeps the actual results separate from expected outcomes.

The runner saves every case's phase/status/error, the exact source and harness SHAs, fixture and dependency-lock digests, selected source-file digests, every built-renderer file digest, browser/Node versions and screenshots. The workflow retains the artifact even on failure. No result is claimed before that artifact is read.

After this regression has landed, later PRs retain the eight-case candidate check without demanding that an already-fixed base reproduce the bug. Main pushes run the candidate check on the consuming main SHA. This does not establish packaged-app consumption, WebKit behavior, native geometry, real-provider operation or side-by-side Conductor/Cairo acceptance.

The [publication source check](publication-source-check.json) passed against `d8f6bdf`; a subsequent source-boundary check also passed against `248b6c3`. Workflow YAML parsing, the unchanged fixture hash and `git diff --check` passed locally. No Node, app, browser or native process was launched in this checkout.

### Initial hosted result and explicit UI setup correction

[Run 43031371815](https://github.com/reason-machines/openconductor/actions/runs/43031371815) retains [artifact 13860504203](https://github.com/reason-machines/openconductor/actions/runs/43031371815/artifacts/13860504203). Its GitHub digest and downloaded ZIP SHA-256 both equal `66ed96fb50e4ce73709b7392a4f580610f6f6f2977867cdc480a031954629c9e`. [The retained result summary](hosted-initial-results.json) records every original row and phase identity, not a corrected rerun.

- Base `d8f6bdf` produced both passing controls, six attributed missing-menu failures and zero renderer exceptions: actual intended RED.
- Candidate `d85e6d2` passed seven cases. Target isolation pinned Copper wren correctly, then timed out reading Quiet harbor. The failure screenshot shows the `openconductor` repository collapsed. `isRepoCollapsed` legitimately folds a default-state repository when its selected workspace moves to Pinned; no stale-target action failure was observed.
- The external runner now establishes an explicit expanded repository choice once per navigation using Playwright's locator handler and the actual repository button. It observes `aria-expanded`, collapses an initially expanded default group and awaits the collapsed state, then expands and awaits both the expanded state and Quiet harbor. This is ordinary UI setup, not a product/default-collapse change, a page wrapper, an injected event, a mock or a storage write. Both phases use the same adapter.
- Each setup result is retained by case ID; missing, failed or out-of-order setup invalidates the run. The original eight-case file and every assertion remain byte-identical (`b4f4cae7…`), as do Prefix9 and E1's queue. Corrected RED/GREEN is **not yet observed**. No timeout, result expectation or product action was weakened.
