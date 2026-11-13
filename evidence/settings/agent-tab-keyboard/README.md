# K1 Agents-tab keyboard source checkpoint

This page records the historical inactive checkpoint. The [active correction and measured RED/GREEN results](execution-v4/README.md) supersede its publication and execution status. The original frozen fixture and sealed patch remain unchanged.

Conductor Rebuild retains the existing K1 deliverable here so recovery does not depend on an untracked workspace. This is a source checkpoint, not a shipped correction or a passing behavioral test.

## Publication state

The production `AgentTabRow`, CI workflow, project dependencies, and automatic test discovery are unchanged. The wrapper is stored as `agentTabKeyboard.test.ts.txt`, outside discovery. `publication.patch` contains the proposed wrapper, identical frozen fixture, and CI provisioning edits. `product.patch.gz` losslessly stores the separate sealed production correction. Neither patch has been applied.

The current source comparison checked main `6ab46a36752de4f57cb3c3441f4336d334ad1340`. All 18 pinned consumer modules match the original K1 baseline. The CI workflow matches the publication-v2 baseline byte for byte. Source comparison is not RED, GREEN, typecheck, or visible focus verification.

## Preserved inputs

- `agentTabsKeyboard.dom.test.mjs` retains SHA256 `833644d93d3c45c4846800c2d923540ff53c57b22d2aa1f53aaf99dbc1789d51` and all 22 assertions.
- Decompressed `product.patch.gz` retains SHA256 `722b674f6f6ea92dd9ae95b9f352589195c8192ae2da384c1b0f1db36a46fd7a`. Its only production hunk is `AgentTabRow` in `src/settings/agents/kit.tsx`.
- `publication.patch` retains publication-v2 SHA256 `325e991868d0068c7159b3910b9e1c427cb4659e6d3f76fa1771d50ee13baf01`.
- `historical/source-receipt-v1.json`, `historical/source-contract-v2.md`, and `historical/publication-status-v2.json` retain their original provenance and historical status. Their old main commits are not a current execution binding.

The historical v1 receipt names original11 in its bookkeeping. K1 is a distinct scope and cannot inherit original11 admission or budget. Original11 `a9e54829` remains frozen and LAST. This checkpoint creates no intake, runtime grant, runner, or native owner.

## Proposed provisioning and discovery

Publication-v2 adds isolated `jsdom@26.1.0` provisioning before automatic frontend discovery and sets `ONBOARDING_DOM_DEPS` for that step. In the existing manual frontend-unit job, it moves the existing isolated provisioning before discovery and removes the later duplicate installation. It changes no trigger, job, runner, permission, project dependency, or lockfile.

The wrapper requires the DOM prefix and fails closed when it is missing. It runs the identical fixture against the checkout, checks its hash, requires the exact ordered case names, and requires 22 passes with no failures, cancellations, skips, or TODOs. There is no fallback or skipped assertion. These are source properties, not executed results.

## Reference evidence and limits

`reference/` contains retained REA literals from Conductor 0.87.6 renderer SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The span identities are in `reference/census.json` and the historical v1 receipt.

The retained static chain is `$pa` → `vy` → `yy` and `Q1`, with `m9i`, `mzt`, `Ino`, `yno`, and `E0i` owning navigation and focus behavior. It declares automatic activation, horizontal wrapping, Home and End, focus selection, and a single tab stop. No extracted reference JavaScript has been evaluated here. These declarations do not prove observed native key presses. The historical REA semantic-renderer heap limit remains a reference-analysis limitation, not a product result.

The fixture mounts the real AgentsPage, AgentTabRow, providerTab URL store, kitModel, and global keybinding modules. Provider panels and external actions are inert boundaries. The complete App and SettingsView are not mounted. Browser focus, native parity, live sign-in, providers, and package inclusion remain unverified.

## Execution remains separate

ACC accepted the revision-2 source contract but has not named K1 in a direct runtime grant. Its accepted shape is 360 seconds total, two hard 120-second test phases, 60 seconds shared non-test work, and 60 seconds cleanup. GREEN requires at least 180 seconds remaining. Execution is sequential at `nice 19`, a 768 MiB Node heap, and concurrency one, with no local installation. Typecheck, build, adjacent suites, browser, native, provider, package, and original11 execution are excluded.

At admission, reconcile current main and the assigned checkout before baseline execution. The frozen prediction is 11 intended failures and 11 passing controls, then 22 candidate passes. No such result has been observed. A loader error, timeout, missing dependency, or different failure is not qualifying RED. Only qualifying checkout RED and identical checkout GREEN can support applying the correction and activating discovery in the product PR. Every exact-head hosted check must pass before that PR merges.

## Checkpoint verification

On Reason Cloud, source-only checks passed with:

```bash
python3 evidence/settings/agent-tab-keyboard/verify-source.py
```

The verifier checks retained bytes, source pins, scoped patch identity, the absent discovery wrapper, and the unmodified production and workflow files. It parses the proposed provisioning shell with `bash -n`; it does not execute installation commands.

Behavioral RED and GREEN, wrapper execution, Node syntax checking, TypeScript, YAML parsing, builds, hosted K1 regression execution, browser, native, provider, and package checks were not run locally. There is no screenshot because this checkpoint changes no active UI. Hosted checkpoint-PR checks, if triggered, do not establish K1 behavior while its wrapper remains inactive.
