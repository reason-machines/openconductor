# Home navigation opens the workspace list

Conductor Rebuild, 2026-11-07. Base main `97c34f69e`. This increment supersedes the intentional #483 Home-target difference under the current main-screen parity directive. Official app/agent icons and the Home pixel wordmark are untouched.

## Reference evidence

A read-only command on authorized sven m5 max reverified `/Applications/Conductor.app/Contents/MacOS/Conductor` SHA-256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`. The retained extracted renderApp bundle hash remains `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

[Static excerpts](reference-static.json) show `Aia` tests `/all-workspaces` for the Home active state and dispatches that route. The global `nav.home` handler closes the dialog and navigates to the same route. These are decoded shipped JavaScript excerpts, not original source or native execution.

Fresh REA `capture-browser-scenario` records replay the extracted Conductor frontend with isolated synthetic data in cloud Chromium at 1280×820:

- Dark `ev_b0da51cf425c199e91830c6aafb951c187201572ffb52cc82b7795daf789fb13`.
- Light `ev_4905cfbab674f875b2d0bd7f92098ba8d37d3393cb999bd8ec47a10aebc17c2e`.

Both captures have four completed steps, complete retained scope and final `/all-workspaces` URL. [Inputs, compact evidence envelopes and captures](before/captures.json) retain the DOM and screenshot hashes. No REA error or new REA gap occurred in these successful captures. Existing native/semantic gaps remain unchanged. A transient Mac command timeout was retried successfully without GUI action.

## Failure and correction

The [same browser driver](../../tools/side-by-side/home-routing.check.mjs) exercises sidebar Home, actual Meta+Shift+H and palette Home in both themes. It starts each case on the entry-card root, verifies the cards exist, records the Home active state, performs the trigger and checks the workspace-list search/Create controls and active sidebar Home state.

Before, the six reference controls pass and all six OpenConductor cases remain on entry cards with Home incorrectly active there. The terminal assertion fails with `oc/dark/sidebar: entry cards are not the active Home list`, actual true, expected false. [Before observations](before/checks.json) retain each case independently.

The fix changes the sidebar Home dispatch and the shared palette/nav.home action from `root` to the existing `home` selection. Home is active only for that selection. The startup entry-card screen remains unchanged. Stale source comments are corrected; no new routing layer or compatibility wrapper is introduced.

After, all 12 reference/OpenConductor contexts pass. [After observations](after/checks.json), screenshots, [source hashes](provenance.json) and [preview output/stop receipts](preview-receipts.json) are retained. The production source hashes identify the working tree captured, rather than claiming the later published commit already existed at capture time.

Start the server and driver through the supported preview lifecycle, with port 4682:

```bash
SHELL_OUT=evidence/home-routing/after node tools/side-by-side/main-shell.mjs --home-routing-check
```

For the REA reference captures, add `--home-routing-capture`. The server and driver must share the preview execution context. A standalone Bash browser could not reach that server and was not counted as a behavior failure. Early driver attempts used a nonexistent reference Home heading and then an ambiguous Create-workspace button locator; the final driver uses the visible text control and search input, not a normalized title. Only the final complete runs count.

## Validation

- `npm run build` passed, including TypeScript. Existing chunk-size warning remains.
- `npm run lint:colors` passed.
- `node --experimental-strip-types --test --test-concurrency=2 'src/**/*.test.ts'` passed 1,337/1,337. The first unrestricted invocation timed out at the 45-second command limit after 925 reported passes, without a terminal verdict; it is not combined with this complete run.
- Focused Home, AllWorkspaces, selectors and navigation-history units passed 26/26 before the correction.
- `git diff --check` passed.
- The existing `shortcuts-workspace.e2e.mjs` nav.home case now requires the actual workspace list/search, active Home row and absent entry-card wordmark instead of only an absent workspace header. This suite was not run locally in its native/built-app environment; its CI result must be tracked separately.

## CI follow-up

Exact-head run [42404855915](https://github.com/reason-machines/openconductor/actions/runs/42404855915), Reason job `128500245045`, failed its command-palette flow at log line 3464. The old assertion expected three entry cards after Home and observed `{"list":true,"workspace":false,"cards":0}`. Open-in then timed out because the aborted command-palette flow had not reopened a workspace. Earlier Reason/model-picker/Codex/banner/transcript/slash steps passed. This is an obsolete test contract, not a retry justification.

The app-flow assertion now requires the workspace list, its Search input, active sidebar Home, zero entry cards and no workspace. Its existing follow-on search must still reopen the same workspace. `HOME_APP_FLOW=1 HOME_FLOW_ONLY=1` on the supported driver replays this actual exported `command-palette` flow through a Chromium transport adapter. Both dark/light replays passed, including keyboard search/Enter and return to the workspace. [Replay results](ci-followup/checks.json) retain the two verdicts. The first adapter launch lacked the required populated/local fixture query and timed out before the flow; the corrected launch supplied both. These replays are Chromium proof, not the full built-app suite. `node --check` on both changed scripts and `git diff --check` passed. Exact-head CI must be observed again after publication.

## Limits and next increment

This proves Home's selected-screen behavior in Chromium, not full Home pixel parity. The browser address bar in OpenConductor remains `/` because shell selection is internal; Conductor changes to `/all-workspaces`. URL/history synchronization remains an explicit gap. Titles, workspace fixture labels, row icons, some spacing and other whole-list details differ in the retained screenshots; no pixel-distance score is asserted or normalized.

Native WebKit, installed-app behavior, real authentication/agents, actual macOS modifier interception, database persistence and final side-by-side parity were NOT RUN. No Mac app launch/input/build/process/data change occurred. All owned preview servers were stopped and the slot released to the palette owner. Next material owned increment is fresh local workspace-header layout comparison; country-map rendering remains a separate ledger gap.
