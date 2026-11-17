# Generic GitHub organizations warning

Conductor Rebuild. Source-only candidate checked against fetched main `09b1c998acb093f4d905d5ef844c80136ea987f6`.

## Scope

Ledger clearance `df4c1e5c-9001-4f3e-9901-f12a06327c82` covers only the final generic return in `orgsErrorMessage` under existing SAME6013. [candidate.patch](candidate.patch) adds the missing word `GitHub`. It remains unapplied. No existing test assertion changes because the current state test contains no organizations-message assertion.

The separate fatal-owner fallback commit `6ad62c23` and its eight frozen cases remain unchanged. The two helper changes compose as disjoint literal replacements. No classifier, specialized `read:org` message, retry, cache, authentication, owner selection, pending-name, provider transport or shared dialog code changes. Icons, Section V3, Quick Start, protected inputs, NAME7c, Keyboard4, M11 and native work retain their existing owners.

## Retained reference and current consumer

[reference.json](reference.json) binds the complete Conductor 0.87.6 retained assets and eleven UTF-8 byte ranges to REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Shipped JavaScript is read as untrusted data, never evaluated.

The local mounts `Gls` and `Isa` supply `dbi` and `was`. If the personal-user command succeeds but organization loading fails, `Aos` returns the personal owner with `orgsError`. `H3i.owners` and `Ros` carry it to `was`. The truthy `g.orgsError` branch renders `vas(g.orgsError)` in a native paragraph. `vas` resolves classifier `Nni` through the renderer import and index export to `r2t`.

For synthetic detail `timeout`, no reference category matches. The displayed reference string is `Couldn't load your GitHub organizations. You can still use your personal account.`

Current `GitHub::owners` also returns the personal owner and nonfatal error. Serde camelCase serialization, `github_repo_owners`, `githubRepoOwners`, `loadOwners` and `fetchOwners` carry it into ready state. The paragraph at `GitHubRepoDialog.tsx:112` calls `orgsErrorMessage`. Its generic return omits `GitHub`.

The current sources are pinned in the reference record. This is a source counterexample, not an observed failed GitHub request or native rendering result.

## Frozen checks and source verification

[orgsErrorFallback.test.ts](orgsErrorFallback.test.ts) imports the actual production helper. [behavioral-spec.json](behavioral-spec.json) freezes two generic-message counterexamples and one unchanged `read:org` control. That control preserves current specialized wording; it does not claim specialized-copy parity with Conductor. Test Behavior, Not Implementation shaped the fixture: its assertions concern the returned message used by the actual paragraph, not helper implementation structure.

Predicted baseline is two failures and one passing control. No case has run.

Passed on Reason Cloud:

```bash
python3 artifacts/github-orgs-fallback-6013/seal_reference.py
python3 evidence/dialogs/github-orgs-fallback-source/verify_source.py
python3 evidence/dialogs/github-owner-fallback-source/verify_source.py
git apply --check evidence/dialogs/github-orgs-fallback-source/candidate.patch
git diff --check
```

The source verifier checks exact span and source identities, frozen fixture-data equality, the one-line patch boundary and disjoint composition with the fatal-owner source change. Exact-main patch applicability is also checked against detached current-main source, without changing the product checkout. Prove It Works shaped the verification boundary: these checks do not establish behavioral RED/GREEN.

## Deferred behavioral contract

This proposal belongs to existing SAME6013 source intake only. It creates no runtime row, admission, watcher, publisher or inherited grant. Only ACC may admit execution and select its actual budget. Proposed ceiling is 60 seconds total with no more than 20 seconds per Node invocation, no retry or installation.

Baseline before either applying this patch or changing the frozen fixture:

```bash
node --experimental-strip-types --test evidence/dialogs/github-orgs-fallback-source/orgsErrorFallback.test.ts
```

Candidate, after an admitted intended baseline and the minimal patch, uses the identical command. Composition with the fatal-owner packet is source-only; its behavioral checks require that packet's existing admission, not this proposal.

No dependencies, network, database, credentials, backend, browser, provider or native app are needed for the proposed actual-helper tests.

## Limits

Behavioral baseline and candidate, TypeScript parsing and typecheck, build, browser, actual GitHub operations and native acceptance are not run. There is no screenshot because no UI was launched. A helper test would not establish personal-owner retention, retry behavior or native rendering.

The earlier REA semantic renderer pass exhausted heap. These retained literal spans are supplements, not a successful semantic graph. Equality with the currently installed Conductor assets is unverified.
