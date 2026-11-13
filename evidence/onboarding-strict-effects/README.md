# Onboarding DOM and StrictEffects acceptance

Conductor Rebuild prepared `tests/onboarding-strict-effects.test.mjs` to mount the actual first-run components with development ReactDOM. No local behavioral run has occurred. The 18 cases need an executed CI result before they count as coverage.

The named Cloud 302 admission `DOM64-C302-01` stopped at its required start gate on 2026-11-10 at 05:19:29Z. The [one-second capacity receipt](resource-preflight.json) measured 11.95% CPU idle, below the required 25%. Load, available memory, and free disk met their thresholds. No install, syntax check, or behavioral test started. Both private scratch directories were absent before and after the attempt, with zero owned dependency or cache growth. The slot was released without a retry or machine change. This is a resource hold, not a harness or product failure. Execution requires a new explicit admission.

This adds coverage, not a product fix. The test does not change application code or mutate its source while loading it.

## Automatic CI

The existing `frontend-unit` job in `.github/workflows/ci.yml` invokes this file in its named "Onboarding DOM persistence and StrictEffects (18 cases)" step. That workflow runs on every pull request and push to main, without path filters or a manual dispatch. It keeps the pure TypeScript command unchanged and invokes this standalone file explicitly.

A separate runner-temporary dependency prefix pins React and ReactDOM 18.3.1, TypeScript 5.9.3, and jsdom 26.1.0. Lifecycle scripts are disabled. The repository manifest, lockfile, and application dependency installation stay unchanged. Transitive dependencies of this temporary install are not locked.

The step sets `NODE_ENV=development` and `ONBOARDING_DOM_DEPS`, checks syntax, and runs the 18 cases. The Actions step log retains the tested commit, TAP output, and source-hash diagnostics, including on test failure. The step has a three-minute timeout and fails if installation, syntax validation, or a behavioral assertion fails. A passing surrounding unit job is not proof unless that named step executes and reports all 18 cases passing. No local dependency admission is implied by this hosted job.

## Run locally after resource admission

Use Node 22.23.4 or a compatible Node 22 release from the checkout root. Do not set `NODE_ENV=production`.

```bash
npm install --prefix .qa/onboarding-dom-deps --cache .qa/onboarding-dom-cache \
  --ignore-scripts --no-audit --no-fund --package-lock=false --save-exact \
  react@18.3.1 react-dom@18.3.1 typescript@5.9.3 jsdom@26.1.0
node --check tests/onboarding-strict-effects.test.mjs
node --test tests/onboarding-strict-effects.test.mjs
```

The install uses ignored scratch directories and does not change the repository manifest or lockfile. `ONBOARDING_DOM_DEPS` selects a different isolated dependency prefix. Remove only this run's dependency prefix and npm cache after retaining the results.

## What the harness tests

The 18 declared cases run in two modes: non-Strict development control and development StrictMode. Every fixture asserts its actual effect trace. The StrictMode trace must be `setup`, `cleanup`, `setup`, followed by cleanup on unmount. The control must have one setup and cleanup. The actual gate's startup IPC reads must also occur twice versus once. Wrapping a component in StrictMode without observing replay does not pass that prerequisite.

The harness loads current, unmodified `FirstRunGate`, `FirstRunOnboarding`, `SignUp`, `LoginScreen`, `ReasonSignInControls`, the shared sign-in controller, account validation, onboarding API, and Toast sources. ReactDOM `createRoot`, React `act`, real subscriptions, effects, promise microtasks, and DOM click dispatch run against jsdom. No React hooks are replaced and no server rendering is used.

The cases require:

- Waiting for browser handoff does not finish onboarding.
- A validated account starts one save. Home and navigation wait for its acknowledgement, including when the account is initially connected.
- Disabled Continue clicks, rerenders, and repeated valid account notifications do not duplicate the pending save.
- A rejected save displays the actual error toast, does not silently retry, and permits an explicit Continue retry.
- Account error, empty identity, malformed workspace, and a stale Connected response after cancellation cannot finish setup.
- Unmount before a deferred account response prevents the component completion callback.
- Failed start and Retry handoff do not report success. The void completion callback fires once after a valid account, including across rerenders.

The first persistence-barrier case emits the observed replay trace, ordered boundary events, and SHA-256 identities for loaded application sources. A run is a pass only if its assertions execute and its decisive TAP result is retained.

## Isolated boundaries and limits

The production onboarding API runs, but its IPC transport is synthetic. The adapter supplies the raw onboarding step and repository list and defers or rejects `db_finish_first_run_onboarding`. This proves a UI acknowledgement barrier, not durable database storage. Unhandled IPC is an assertion failure even if application code catches its rejection.

Other isolated boundaries are opener, account responses, connection-default persistence, settings reads, appearance application, keybinding registration, icons, decorative motion, and clock timers. Timers are retained in maps rather than run on real time. Poll refresh is driven explicitly. This does not verify automatic polling intervals, keyboard dispatch, CSS, layout, or visual parity.

jsdom provides an emulated DOM, not a real browser. No browser process, server, native application, CLI, provider, credentials, real callback or deep-link delivery, database, live workspace turn, build, or packaged app runs here. There are no screenshots because no browser or visual change is part of this harness.

The separate [eight renderer checks](../onboarding-effects/README.md) are a prior manual result. This new test does not rerun them, and the CI step does not include that older file. Neither standalone file is discovered by `node --test "src/**/*.test.ts"`. Only the new explicit CI invocation can supply a result for these 18 cases. A green pure-TypeScript step still says nothing about either standalone file.

The retained static `AVe` validation and epoch checks, `o5a` callback bridge, and `wBi` and `Doa` first-run slices remain the [source grounding](../onboarding-effects/README.md#boundaries-and-remaining-gaps). They are not live Conductor authentication evidence. No new REA invocation or extraction is made for this coverage change.
