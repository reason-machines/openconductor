# React onboarding effect and callback checks

Conductor Rebuild ran this isolated Node harness against the unchanged application sources from main `762b59e5`. No product defect was reproduced or fixed. These are component-effect regression checks and mutation-sensitivity evidence, not browser or native acceptance.

## Run the checks

From the checkout root, use Node 22.23.4 or a compatible later Node 22 release:

```bash
npm install --prefix .qa/react-effects-deps --cache .qa/react-effects-cache \
  --ignore-scripts --no-audit --no-fund --package-lock=false --save-exact \
  react@18.3.1 react-test-renderer@18.3.1 typescript@5.9.3
node --test tests/onboarding-effects.test.mjs
```

The prefix and dedicated cache are ignored scratch directories. The setup does not change the repository manifest or lockfile. `REACT_EFFECTS_DEPS` can select another isolated dependency prefix with these versions. This standalone check is not discovered by the existing `src/**/*.test.ts` CI command.

The harness transpiles and loads the current `FirstRunGate`, `FirstRunOnboarding`, `SignUp`, `LoginScreen`, `ReasonSignInControls`, shared sign-in controller, account model, and Toast code. React 18.3.1 and react-test-renderer 18.3.1 execute their actual hooks, subscriptions, effects, rerenders, and cleanup through `act`. It does not replace React hooks or use server rendering.

## Results

[The restored-source run](green.tap) passed **8 tests, 0 failures, 0 skips**:

- Browser handoff alone cannot finish onboarding. A validated account starts one pending finish, and Home waits for that finish to resolve. Repeated account notifications and rerenders do not duplicate it.
- A rejected finish displays the failure toast. Continue becomes available, does not silently auto-retry, and supports a successful explicit retry.
- Account error, empty identity, and malformed workspace responses cannot complete onboarding.
- Cancellation rejects a stale Connected result without logging out.
- Unmount before an account result suppresses the completion callback.
- The actual SignUp failure callback runs once for the same snapshot. Retry is not success. Validated completion calls the void completion callback once across rerenders.

Three **in-memory mutations**, never written to product files, produced the expected failures:

```bash
EFFECTS_MUTATION=advance-before-save node --test --test-name-pattern='actual onboarding effect waits' tests/onboarding-effects.test.mjs
EFFECTS_MUTATION=skip-validation node --test --test-name-pattern='invalid account' tests/onboarding-effects.test.mjs
EFFECTS_MUTATION=repeat-callback node --test --test-name-pattern='actual SignUp failure callback' tests/onboarding-effects.test.mjs
```

[Premature navigation](red-save.tap) failed `Home waits for persistence` with 1 instead of 0. [Skipped identity validation](red-validation.tap) failed both invalid-identity cases. [Removed completion guard](red-callback.tap) delivered 2 callbacks instead of 1. Each command exited 1. Removing the mutation option restored the 8-test passing run. This RED-to-GREEN sequence proves sensitivity to those regressions. It is not a before-and-after product fix.

`node --check tests/onboarding-effects.test.mjs`, production-source equality against the fetched main tree, and `git diff --check` passed. The only repository additions are this harness and its evidence. The scratch dependencies and cache were removed after verification.

## Boundaries and remaining gaps

The harness replaces IPC, browser opening, runtime-default persistence, onboarding persistence, settings reads and appearance application, keybinding registration, icons, and decorative motion. Clock callbacks are retained in test maps rather than run on real time. Account and persistence responses are synthetic. Calls to refresh are driven explicitly, so this does not verify automatic polling intervals. Actual Toast hook behavior runs, but CSS and motion do not.

No DOM layout, real browser, browser approval, real callback or deep-link delivery, native IPC, native application, CLI, provider, credentials, real database, production account, workspace turn, build, or packaged application ran. React development StrictMode effect replay is not exercised by this renderer run. A void `SignUp.onSignedIn` callback is not tested as an awaited Promise contract.

The source grounding remains static. The retained Conductor index is 3,493,297 bytes with SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`, originally recorded by REA as `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Recovered `AVe.applyApiToken`, validation, epoch checks, and authenticated-store updates motivate rejecting invalid or stale completion. The retained `o5a` renderer callback slice exchanges or accepts a token, requires a truthy validation result, then invokes `onAuthenticated`. Its renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; `o5a` occupies UTF-8 bytes 11,105,212–11,105,759, not index offsets. The [first-run evidence](../screens/first-run-onboarding.md) records `wBi` auto-advance and awaited `Doa` persistence. None of this executes Conductor or proves its live authentication behavior. No new REA invocation, extraction, gap, or bug was introduced here.
