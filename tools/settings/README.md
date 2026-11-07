# Verify settings in an isolated browser

Build OpenConductor with `npm run build`.

## Check saves and local preset controls

Start this foreground command through Reason's preview tool on port 51749:

```bash
PORT=51749 CHECK_SAVE_RACE=1 node tools/settings/fixture.mjs
```

The fixture replaces only the Tauri IPC boundary. It uses invented accounts, paths, and repository data. It never runs an agent or reads real settings.

The regression driver opens the built Agents page, clears three Reason defaults, and completes an older write while newer edits remain pending. It also checks a refused save followed by a successful save. A delayed Reason-status response verifies that saving the executable path starts a new status read and that an older failure cannot erase the latest account. The final check covers the Big terminal preset and custom-command controls. A successful run prints `SAVE_RACE_CHECK_PASSED`. Stop the preview after the check. Set `EXIT_AFTER_CHECK=1` to close the server after verification and return a failing exit code when a check fails.

To run the driver against an already running fixture in the same network namespace:

```bash
OC_BASE_URL=http://localhost:51749 node tools/settings/check-save-race.mjs
```

## Capture reference pages

Use a verified, REA-extracted Conductor frontend as `DIST`. Do not commit those third-party assets. Install the small `tools/screens` dependency separately if it is absent. Do not replace a shared root `node_modules`.

Start through the preview tool on port 51749:

```bash
PORT=51749 HOST=0.0.0.0 DIST=/path/to/verified/conductor/dist \
  REA=/path/to/rea CAPTURE_SETTINGS=1 SETTINGS_LANE=ref \
  node tools/settings/reference.mjs
```

Wait for `SETTINGS_CAPTURES_COMPLETE`, then stop the preview. Each capture uses a separate REA browser and invented backend data.

## Capture the built application

Start through the preview tool on the same released port:

```bash
PORT=51749 REA=/path/to/rea CAPTURE_SETTINGS=1 SETTINGS_LANE=oc \
  node tools/settings/fixture.mjs
```

Stop the preview after `SETTINGS_CAPTURES_COMPLETE`. `ONLY_SETTINGS=appearance,appearance-lower` limits either capture command. `SETTINGS_OUT` overrides the area evidence directory.

Agent tabs are selected by visible clicks. The application currently strips `providerTab` from a start URL before the Agents page mounts, so a query alone does not prove which tab was captured. The driver checks the active panel's label.

## Compare the captures

```bash
REA=/path/to/rea python3 tools/settings/review.py
```

The command runs REA at channel tolerances 0 and 24, writes pairs and a portable HTML review into `evidence/settings/local-pages`, and creates `.oc-tmp/settings-review.html` for `app_show`. It does not edit the aggregate UI map. Scenario files and raw DOM captures stay in `.oc-tmp/settings-captures`.

A low changed-pixel ratio at tolerance 24 does not prove exact colours, matching backend state, or functional completeness. Inspect both screenshots and their limitations.

## Check the terminal font slider

Build first. Start one of these foreground commands through the preview tool on port 51749. Each command exits after its browser checks and REA capture; stop that preview before starting the next lane.

Reference, using the verified extracted frontend and the small `tools/screens` dependencies:

```bash
PORT=51749 DIST=/path/to/verified/conductor/dist SLIDER_LANE=reference \
  node --input-type=module -e "await import('./tools/settings/reference.mjs'); await import('./tools/settings/check-terminal-slider.mjs').then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})"
```

Built OpenConductor, with invented IPC data:

```bash
PORT=51749 SLIDER_LANE=after \
  node --input-type=module -e "await import('./tools/settings/fixture.mjs'); await import('./tools/settings/check-terminal-slider.mjs').then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})"
```

Set `REA` to the installed REA executable if it is not `/home/runner/rea/node_modules/.bin/rea`. `SLIDER_OUT` changes the evidence directory. The driver checks Page Up/Down, Home/End, arrow steps, bounds, the 6px track, the opaque 16px thumb and in-memory IPC updates. Before the correction, `SLIDER_LANE=before` records the same check failing on Page Up. This does not test native rendering, real persistence or authentication.
