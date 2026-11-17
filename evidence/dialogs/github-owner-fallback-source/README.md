# Generic GitHub owner-load error fallback

Conductor Rebuild. Source-only candidate qualified against fetched main `6ab46a36752de4f57cb3c3441f4336d334ad1340`.

## Scope and ownership

Ledger message `29664fd4-b718-4886-8651-d8e04a1d6fae` clears only `ownersErrorMessage`'s final generic fallback and the derivative migration of its contrary timeout assertion under existing SAME6013. This is not runtime admission, a new queue row, or permission to change authentication, retry, owner selection, provider transport, pending-name behavior, or the shared dialog shell.

Icons 6, Section V3 20, Quick Start 13, the nine protected inputs, NAME7c, Keyboard4, M11 completion, and the sole native executor retain their existing owners and inputs.

## Retained reference and current consumer

The retained Conductor 0.87.6 renderer and index identities, REA lineage, complete literal spans, and pinned current source links are in [reference.json](reference.json). The shipped JavaScript is untrusted data and is not evaluated.

The local mounts `Gls` and `Isa` supply `dbi`, whose alert popup contains `was`. The producer `Aos` throws when the signed-in user cannot be loaded. `H3i.owners` and `Ros` expose that error to `was`. Its native error paragraph displays `_as(v)`.

The complete `_as` declaration first classifies the error message with `Nni`. Its renderer import and index export resolve to complete `r2t`. For `timeout`, no category matches, so `_as` returns exactly `Couldn't load your GitHub accounts.`.

Current `GitHubRepoDialog.fetchOwners` passes a rejected owners-load message into `ownersErrorMessage`, stores the result in its error state, and displays it in the error paragraph. The helper's final return instead interpolates the raw detail. For `timeout`, the source yields `Couldn't load GitHub owners: timeout`.

This is a source-level counterexample, not an observed failed request or native screenshot.

## Smallest candidate and frozen fixture

[candidate.patch](candidate.patch) is unapplied. It changes only:

- The final return in `src/state/githubRepoDialog.ts` to the reference generic message.
- The existing contrary timeout expectation in `src/state/githubRepoDialog.test.ts` to that message.

No classifier condition or specialized error message changes. The existing assertion is migrated because its expected copy disagrees with the retained native paragraph consumer, not to accommodate an unverified implementation choice.

[ownersErrorFallback.test.ts](ownersErrorFallback.test.ts) imports the actual production helper. Its eight cases are frozen in [behavioral-spec.json](behavioral-spec.json): four generic-message counterexamples and four unchanged specialized-message controls. The latter preserve current behavior and do not claim specialized-copy parity with Conductor.

Predicted baseline outcome: four generic assertions fail and four preservation controls pass. This has **not** been executed and is not RED evidence.

## Source checks

Passed on Reason Cloud, without product application or behavioral execution:

```bash
python3 artifacts/github-owner-fallback-6013/seal_reference.py
python3 evidence/dialogs/github-owner-fallback-source/verify_source.py
git apply --check evidence/dialogs/github-owner-fallback-source/candidate.patch
git diff --check
```

The reference membership pass reads both retained assets, checks their complete SHA-256 identities, and extracts eleven exact UTF-8 ranges. The standalone verifier checks the retained spans, the three pinned current-main sources, the four packet identities, and fixture-data equality. Patch applicability is not proof of runtime behavior.

All fourteen previously recorded protected packet/input identities were rechecked unchanged in this pass. No historical fixture was edited.

## Deferred execution

Only a direct existing ACC serialized grant may authorize the following commands. These are a future command proposal, not a new admission request or runner:

```bash
# Baseline, before applying candidate.patch:
node --experimental-strip-types --test evidence/dialogs/github-owner-fallback-source/ownersErrorFallback.test.ts

# Candidate, after the same frozen fixture is preserved and the minimal patch is applied:
node --experimental-strip-types --test evidence/dialogs/github-owner-fallback-source/ownersErrorFallback.test.ts src/state/githubRepoDialog.test.ts
```

A future bounded pure-helper run needs no dependencies, browser, network, backend, provider, credentials, database, or native app. Proposed maximum wall time is 60 seconds total, with at most 20 seconds per Node invocation and no retries or installation. ACC must select and enforce the actual budget and slot. A changed helper or test base must be source-requalified before execution.

## Verification limits

Behavioral baseline, candidate tests, TypeScript parsing or typecheck, app build, browser, native, and provider execution are **not run**. No product file is applied. There is no screenshot because this is source-only preparation and no UI was launched.

The historical REA semantic renderer analysis exhausted heap. These literal-byte supplements are not a successful semantic graph. Equality with the currently installed Conductor renderer remains unverified. A pure-helper unit result, once admitted, would still not establish native error rendering or an actual GitHub failure.
