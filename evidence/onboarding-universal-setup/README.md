# Universal Reason setup and inline authentication

Conductor Rebuild, 2026-11-10. PR [#916](https://github.com/reason-machines/openconductor/pull/916) integrates backend [#915](https://github.com/reason-machines/openconductor/pull/915), merged at main `0a1d066930acf0bed2244839c9d953715cf6d8f0`.

## Requested behavior

Every normal startup entry, including first run, `/login`, and already-completed onboarding, awaits `reason_cli_ensure_current`. Claude Code, Codex, and Reason have the same installer gate. Onboarding completion awaits setup again through the shared promise, persists the explicitly chosen default agent, and only then writes completion. Sign-in is optional; a connected account no longer auto-advances past the agent choice. The explicit `?demo=1` browser/demo route remains a synthetic preview, not an onboarding installation path.

A signed-out Reason send keeps its failed original user message and presents **Sign in to Reason** inline, using the existing #753 browser-pairing controls. The clicked control alone arms continuation. After valid pairing, an explicitly selected workspace is stored only if there was no pinned workspace. The runtime reopens that same undelivered turn, retaining its user row and turn ID. Duplicate approval cannot resend a running turn; cancellation, timeout and failure clear the continuation. Other agents' normal retry behavior is unchanged.

Absent Reason settings are covered by direct tests of the actual helper modules, not a non-null assertion. The installer does not require signing in. Claude Code and Codex remain local-only. No provider credential handoff or cloud execution of either was added.

## Verification retained for this increment

- The initial `agentSignIn` regression failed two assertions before the fix (ACP authentication-required error detection and exact button label). The same command passed 4/4 afterward.
- `node --experimental-strip-types --test src/features/chat/reasonChat.test.ts src/features/chat/chatRuntime.test.ts src/workspace/archiveAgents.test.ts`: passed 33/33. The new signed-out test verifies no ACP start before sign-in, preservation of the original user row, the same chat and original turn ID after retry, a synthetic assistant reply in that turn, and no duplicate resend.
- `node --experimental-strip-types --test src/onboarding/firstRunAgent.test.ts`: passed 6/6. Each agent can be chosen with no Reason settings; pairing stores the selected workspace, preserves an existing pin, and rejects a missing selection rather than inventing one.
- `REACT_EFFECTS_DEPS=node_modules node --test tests/onboarding-effects.test.mjs`: passed 15/15, including all three agent choices, existing-install and login gates, clicked-only continuation, cancellation, and background sign-in.
- `ONBOARDING_DOM_DEPS=/tmp/oc-onboarding-dom-f75 NODE_ENV=development node --test tests/onboarding-strict-effects.test.mjs`: passed 18/18, using React/ReactDOM 18.3.1, TypeScript 5.9.3, and jsdom 26.1.0. The dependency directory is local scratch state, not a deliverable.
- `TEST_BASE_URL=http://127.0.0.1:5197 node --test tests/e2e/onboarding-sign-in.e2e.mjs`: passed 23/23 in the supported preview server namespace. It uses real components and synthetic IPC, not real authentication.
- `node --experimental-strip-types --test 'src/**/*.test.ts'`: passed 1,773/1,773 after integration.
- `node --test tests/e2e/startup.test.mjs tests/e2e/webdriver.test.mjs tests/e2e/terminal-flow.test.mjs`: passed 34/34. The helper waits for the real installer, surfaces setup errors, explicitly clicks Continue, then awaits the shell; it never fakes setup completion. The eight built-app drivers now use it and preserve their isolated executable overrides. The first shell-only deadlock fixture failed under repeated reads and was made deterministic by retaining onboarding until the explicit after-case.
- `git diff --check`: passed.
- Initial hosted typecheck failed on optional `settings.reason` in two helpers. Both were changed to optional access. Exact-head hosted typecheck, build, full workflows, and post-merge package identity must be recorded separately; earlier passes are not final-head proof.

The inline button was inspected in the browser on the actual Transcript component. Its [published screenshot](https://api.reasonmachines.com/media/pr-screenshots/f75ca39a-0be8-4ebc-accd-ada3e64c8181/87bf44163693846f0b9b327c3f3e1d78/42a06b40-9e3b-49a3-a2a9-ca1905494d49.png) visibly labels the fixture as isolated synthetic IPC. It is not native or full-workspace proof.

## Unmet acceptance proof

The requested real built-app tests remain **not run**: independent fresh throwaway HOME/no Reason PATH for each agent choice, verification that the official CLI is installed and current after each, and actual signed-out send → inline button → browser pairing → original-chat reply with a published recording.

Direct execution on the discovered Mac was withdrawn after initial read-only inspection. That actual denial was respected; no other Session, identity, browser, or device route was used to bypass it. A report was submitted about the missing recovery path. Native authentication and the requested recording therefore remain unverified, not simulated successes.

No fresh Conductor runtime or REA claim is made by this request-driven behavior change. Existing reverse-engineered reference evidence remains historical. There is no new native-parity sign-off, and no aggregate feature-ledger row is promoted by these fixture checks.
