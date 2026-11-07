# Agents tab navigation

Conductor Rebuild reproduced two OpenConductor navigation defects on unchanged source with the tree of main `cb4c03a5` (local reconciliation commit `07a520bc`). The independent defaults-clear correction in #750 is already merged; this is not another fix for that historical timeout.

## Before and after

The same browser driver runs against the built application with the existing invented Settings IPC fixture:

```bash
PORT=51749 NAVIGATION_OUT=.oc-tmp/navigation-before node --input-type=module -e \
  "await import('./tools/settings/fixture.mjs'); await import('./tools/settings/check-agent-navigation.mjs').catch(e=>console.error(e))"
```

Start this foreground command through the supported preview lifecycle. On cloud the driver must run in the preview's own network namespace; an initial driver invocation from Bash could not reach the preview (`ERR_CONNECTION_REFUSED`). That attempt is not a behavioral failure. `check-agent-navigation.mjs` asserts on either failure; the wrapper catches it to keep the preview available for inspection. Read the driver verdict, not the wrapper's process status.

- **Canonical URL, FAIL before:** `/settings/user/providers?providerTab=codex` mounted the Codex panel in this schedule, but startup removed `providerTab`. This proves loss of URL intent, not an initial wrong-panel render.
- **Mounted search, FAIL before:** from that mounted Codex panel, choosing the exact Claude Code search result changed the URL to `providerTab=claude` but kept both the Codex tab and panel visible.
- **Both PASS after:** the canonical URL retains `providerTab=codex`; the same search changes URL, selected tab and visible panel to Claude Code.

[Before](before.json) and [after](after.json) retain the actual URL and accessible panel observations. [Review screenshots](review.html). A second manual check through the cloud's visible Chrome confirmed the search failure and its correction. No login button was pressed.

## Root cause and correction

`App.navigateSettings` discarded every Settings search parameter, including the still-relevant provider tab. `AgentsPage` separately held a one-time local state copy of the URL, while Settings search and chat actions wrote the URL directly. Those independent states diverged.

The tab now reads the URL through `useSyncExternalStore`. All three writers (tab clicks, Settings search and chat's existing Open agent settings event) use one setter and notification. Browser history also notifies subscribers. Canonicalization retains only supported provider names on the Agents page; leaving Agents drops the parameter. No authentication component, provider command, credentials, native data or E2E assertion changed.

## Checks

- PASS: same two built-browser regression checks after the fix; both failed before.
- PASS: `node --experimental-strip-types --test src/settings/routes.test.ts src/settings/providerTab.test.ts`, 17/17, including URL preservation, unknown-provider fallback, notifications and unsubscribe.
- PASS: `node --experimental-strip-types --test --test-concurrency=2 $(find src -name '*.test.ts' -print)`, 1,329/1,329. [Full output](all-unit.tap.gz).
- PASS: `npm run build` (TypeScript plus Vite), existing large-chunk warning only.
- PASS: `npm run lint:colors`, 6 checker tests and no forbidden literals.
- PASS: `git diff --check`.

## Conductor evidence and limits

The retained [REA-extracted reference](../local-pages/README.md) identifies Conductor 0.87.6 from `/Applications/Conductor.app` on authorized `sven m5 max`, native SHA256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`. The paired reference screenshot is the extracted frontend rendered in Chromium, not a native capture. Its per-state REA IDs and capture hashes are in [ref.json](../local-pages/ref.json). Route/search source observations are in [Settings notes](../NOTES.md#settings-routes). They are reused, not newly verified against an installed app in this pass.

The reference and after screenshot both show the Claude Code panel, but supported-provider tabs, app identity, neutral palette, fixture executable paths and deliberately different authentication designs prevent an exact-pixel verdict. This change corrects OpenConductor navigation, not those visual differences. Static REA evidence does not prove runtime navigation.

No new REA tool was run, so no new REA failure is claimed. Native access stayed with the sign-in owner and then the coordinated native queue. Native startup, macOS URL dispatch, browser Back/Forward end-to-end, real authentication and filesystem persistence remain unverified here. No native application, agent, global reset, E2E workflow or watcher was launched. The cloud preview lifecycle receipt is retained separately.
