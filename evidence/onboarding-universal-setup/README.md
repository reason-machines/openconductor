# Universal Reason setup and inline authentication

Conductor Rebuild, 2026-11-10. PR [#916](https://github.com/reason-machines/openconductor/pull/916) integrates backend [#915](https://github.com/reason-machines/openconductor/pull/915), merged at main `0a1d066930acf0bed2244839c9d953715cf6d8f0`.

## Requested behavior

Every normal startup entry, including first run, `/login`, and already-completed onboarding, starts `reason_cli_ensure_current` in the background. Claude Code, Codex, and Reason all request installation or update, without holding the current screen for setup or sign-in. Progress and retryable errors remain visible beside the usable screen. Onboarding completion persists the explicitly chosen default agent, then writes completion. A connected account never auto-advances past the agent choice. The explicit `?demo=1` browser/demo route remains a synthetic preview, not an onboarding installation path.

A signed-out Reason send keeps its failed original user message and presents **Sign in to Reason** inline, using the existing #753 browser-pairing controls. The clicked control alone arms continuation. After valid pairing, an explicitly selected workspace is stored only if there was no pinned workspace. The runtime reopens that same undelivered turn, retaining its user row and turn ID. Duplicate approval cannot resend a running turn; cancellation, timeout and failure clear the continuation. Other agents' normal retry behavior is unchanged.

Absent Reason settings are covered by direct tests of the actual helper modules, not a non-null assertion. The installer does not require signing in. Claude Code and Codex remain local-only. No provider credential handoff or cloud execution of either was added.

## Historical verification before the nonblocking correction

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

## CI fixture correction, 2026-11-10

The hosted frontend job passed TypeScript, source tests, and production build, then failed the unchanged scroll suite because fake desktop backends rejected `reason_cli_ensure_current`. The shared populated fixture now explicitly returns completed onboarding (`999`) and a synthetic CLI-present result. The same missing command is modeled in the independent desktop fixtures; no scroll test or assertion changed.

- **Failed before correction:** `node --test --test-name-pattern='wheel over fixed chrome' tests/e2e/scroll-containment.e2e.mjs`, against the production preview in the supported preview-server namespace, timed out after 30 seconds waiting for `.rp-tabs`.
- **Passed after correction:** `node --test --test-concurrency=1 tests/e2e/scroll-containment.e2e.mjs`, in that same namespace: fixed chrome passed; settings zoom/resize passed; real content pane scrolling passed; settings wheel scrolling passed. All 4 passed, none skipped.
- **Passed:** `REACT_EFFECTS_DEPS=node_modules node --test tests/onboarding-effects.test.mjs`: 17/17. New regressions cover both an explicit completed step and an existing repository with an unset step. A successful CLI check reaches Home without sign-in, onboarding writes, or navigation.
- **Passed:** `npm run build` on the integrated source before this test-only correction, including TypeScript and branding. Only existing large-chunk warnings were emitted.
- **Partial:** a full local browser suite attempt was stopped after profiler/paste assertions and a dialog navigation timeout failed under shared-cloud contention. It is not a full-suite pass. The unchanged isolated scroll suite passed afterward. A redundant full source-suite attempt timed out at 90 seconds and is not counted as a fresh pass. Exact corrective-head hosted checks remain required.
## Existing working CLI is not trapped by update failure

The release check still runs on each installer request. If checking or applying an update fails, the backend probes the managed executable again. Only a successful actual-version probe can return the usable path/version with an optional `warning`; missing, broken, or removed executables still reject. A pre-install successful probe cannot mask damage from a partial failed install. Healthy current/newer installations retain the existing no-reinstall/no-downgrade behavior and omit the warning.

The startup gate renders that warning as a persistent dismissible info toast beside the normal app, onboarding, or login surface. It does not claim the installed version is current and does not require an account. The local-agent and Settings executable-override boundaries are unchanged.

- **Failed before frontend correction:** `REACT_EFFECTS_DEPS=node_modules node --test --test-name-pattern='existing working CLI with an update warning' tests/onboarding-effects.test.mjs` failed `degraded startup is visible, not reported as current`.
- **Passed after frontend correction:** `REACT_EFFECTS_DEPS=node_modules node --test tests/onboarding-effects.test.mjs`: 18/18, including warning visibility, Home remaining mounted, no sign-in, and dismiss without reopening setup.
- **Passed:** `REASON_ACP_HARNESS_DIR="$TMPDIR/reason-acp-working-cli" bash tools/reason-acp/run-rust-tests.sh`: all 101 tests, including 21 installer tests. The installer owner reproduced offline/update-failure rejections before correction. Integrated tests cover offline release lookup, failed update with fresh reprobe, damaged partial install, missing/broken CLI, and healthy-current omission of warnings. Clippy was not available locally; hosted clippy remains required.
- **Passed:** final `npm run build`, including branding, TypeScript and Vite. A preceding standalone typecheck timed out under contention; the subsequent complete build's TypeScript check passed.
- **Passed:** the rendered onboarding/sign-in fixture suite `TEST_BASE_URL=http://127.0.0.1:5197 node --test tests/e2e/onboarding-sign-in.e2e.mjs`: 24/24 in the supported preview-server namespace. The new test uses the actual startup gate, verifies Home plus the warning, no onboarding/sign-in attempt, and safe dismissal. All account/CLI values are synthetic IPC.
- **Passed:** the 77 selected chat/auth/first-run/startup/WebDriver/terminal-flow tests with `node --experimental-strip-types --test --test-concurrency=2` on the relevant test files.
- **Passed:** all four unchanged scroll tests rerun against the final frontend production build.

![Synthetic browser fixture: Home remains usable with an installed CLI update warning; not native proof](https://api.reasonmachines.com/media/pr-screenshots/c67057f3-0a44-4310-ada7-124229eb11df/a605f4124bc425ee055da9fa59b15447/working-cli-update-warning.png#w=1280&h=900)

## Unmet acceptance proof

The requested real built-app tests remain **not run**: independent fresh throwaway HOME/no Reason PATH for each agent choice, verification that the official CLI is installed and current after each, and actual signed-out send → inline button → browser pairing → original-chat reply with a published recording.

Direct execution on the discovered Mac was withdrawn after initial read-only inspection. That actual denial was respected; no other Session, identity, browser, or device route was used to bypass it. A report was submitted about the missing recovery path. Native authentication and the requested recording therefore remain unverified, not simulated successes.

No fresh Conductor runtime or REA claim is made by this request-driven behavior change. Existing reverse-engineered reference evidence remains historical. There is no new native-parity sign-off, and no aggregate feature-ledger row is promoted by these fixture checks.

## Nonblocking startup correction

Sven's later requirement supersedes the awaited installer gate described in the historical checks above. Every normal app launch still requests the official CLI installation or update, but the check runs in the background. Progress, failures with **Retry setup**, and usable-CLI update warnings appear beside the current screen. They never replace onboarding, login, or Home. Onboarding persists the agent choice without waiting for installation or sign-in.

The continuation button now keeps the same DOM node when account status changes from checking to connected, and disables that node during persistence. Optional sign-in stays available while its initial account probe is pending. The built-app Reason fixture now persists the same explicit model in the Reason pin, settings default, and physical default slot. No built-app assertion or scroll test was relaxed.

Verification on the corrective source published at `95e09c87`:

- **Failed before:** five slow-CLI component regressions failed because all three choices and both existing-user Home paths were blocked.
- **Failed before:** the real DOM continuation test failed in both development modes because account resolution detached the original button.
- **Passed after:** `REACT_EFFECTS_DEPS=node_modules node --test tests/onboarding-effects.test.mjs`, 23/23.
- **Passed after:** `ONBOARDING_DOM_DEPS=/tmp/oc-onboarding-dom-f75 NODE_ENV=development node --test tests/onboarding-strict-effects.test.mjs`, 22/22. Includes actual completion while installer and initial account reads remain unresolved, plus Home surviving installer rejection.
- **Passed:** selected first-run, sign-in, chat, archive, and Reason fixture settings tests, 45/45 using `node --experimental-strip-types --test` on their files.
- **Passed:** `TEST_BASE_URL=http://127.0.0.1:5197 node --test tests/e2e/onboarding-sign-in.e2e.mjs`, 30/30 in the supported preview namespace. All six slow/failed CLI × Claude Code/Codex/Reason paths reach Home with sign-in unresolved and zero login starts. IPC is synthetic.
- **Passed:** the 34 baseline startup, WebDriver transport, and terminal-flow tests before the correction. Existing built-app assertions are unchanged.
- **Partial:** `npm run build` passed branding and TypeScript, then timed out during Vite transformation after 240 seconds on the shared cloud computer. It is not a complete local build pass. Hosted exact-head checks remain separate.
- **Passed:** `git diff --check`.

![Synthetic IPC proof: Home remains usable while CLI setup and sign-in checks are pending](https://api.reasonmachines.com/media/pr-screenshots/5a4cf33e-1c21-4d7d-a6f4-1ae9b6fca6ac/bf48409ed8d89535dc75451a45fd8037/reason-home-slow-cli-unsigned-in.png#w=1280&h=900)

![Synthetic IPC proof: Home remains usable after CLI setup fails, with Retry setup](https://api.reasonmachines.com/media/pr-screenshots/5a4cf33e-1c21-4d7d-a6f4-1ae9b6fca6ac/d4ff7d59f75f8bfdaaa022a3103047dd/reason-home-failed-cli-unsigned-in.png#w=1280&h=900)

The real Mac fresh-HOME installation/current-version checks, native inline pairing, same-chat original-message continuation, and requested native recording remain unverified under the execution stop. No fixture image proves those requirements. Consuming-main package identity awaits merge.
