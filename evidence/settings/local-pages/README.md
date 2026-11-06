# Local settings review, 2026-11-06

Conductor Rebuild captured 16 selected states from each application at 1280 × 820 in dark mode. [Open the comparison page](review.html). The reference is Conductor's extracted frontend in Chromium, not its native Mac window. OpenConductor is the built frontend with an invented Tauri IPC fixture. No agent runs and no real workspace or credential is read.

## Reference identity

The diff owner verified these against `/Applications/Conductor.app` on Sven's authorized `sven m5 max` before this capture:

- Native binary SHA256: `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
- Extracted `index.html` SHA256: `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`.
- Read-only cloud reference: `/home/runner/conductor-ref/dist`, Conductor 0.87.6.
- REA 6.8.0 captures and comparisons. The per-state evidence IDs, final URLs, viewport and PNG hashes are in [ref.json](ref.json), [oc.json](oc.json), and [compare.json](compare.json).

## Changes supported by the reference

- Appearance's palette extension now follows the reference rows rather than shifting them. Its rows use the reference spacing, the code sample is the `ola` preview, and the mono and Markdown previews use the reference sizing.
- Big terminal's description is in the page header. Presets have their agent icons, selected rows use the highlight tokens, and Add custom command is a ghost button with a plus icon.
- Source locations in the REA-extracted `renderApp-D_fmY7hW.js`, as character offsets in UTF-8-decoded text: Appearance `vla` at 10176010, code preview `ola` at 10167909, Markdown row `pla` at 10172352, terminal-font row `gla` at 10173591, preset icons `yla` and `xla` at 10176723 and 10177039, preset table `wla` at 10177678, row `Sla` at 10178165, and Big terminal page `Cla` at 10179294. These are text-search observations in the extracted artifact, not JavaScript semantic traces.

The separate settings-save fix concerns OpenConductor behavior. Completing an older settings IPC write restored a newer cleared model before the fix. The deterministic check now preserves three rapid clears, rolls back a refused save, and accepts the next save. A third check selects a local preset, edits a custom command, and deletes it. All three passed on the final built frontend. No command is executed. This does not infer Conductor persistence behavior.

## Scope and verdict limits

The selected states cover General, Appearance at two scroll positions, Default models, Git, Environment, Experimental, Advanced, local Claude Code and Codex tabs, Big terminal, and five repository pages. Account and onboarding presentation belong to the dialogs work. Organisation, team, routines, triage and cloud-workspace screens are deferred and are not missing features.

The main General, Git, repository and Big terminal content aligns in these captures. This is not a full-settings completion claim:

- OpenConductor retains its Neutral palette, keyboard-shortcuts navigation, own app name, and Reason tab. Cursor and OpenCode were intentionally removed from agent model settings. At zero tolerance, nearly every full-window pixel differs. A low changed-pixel ratio at channel tolerance 24 does not prove exact colours.
- Default models intentionally lists only supported agents. This review does not restore removed provider options.
- Existing cloud-only rows on Advanced are outside the verdict. Their visual differences are not scored as missing local features.
- Lower Appearance still differs in automatic scroll alignment and its native range-control rendering. It is not an exact-match verdict.
- Auth, every dropdown, hover state, custom font and Markdown-style variant, scrolling to every offscreen row, actual file pickers, and every setting's runtime consumer were not exercised here.
- Live Claude Code, Codex and Reason authentication, native Mac rendering, and desktop filesystem persistence were not tested by this browser fixture. Claude Code and Codex remain local-Mac runtimes only.

## Capture gaps and corrections

- The OpenConductor start-route canonicalizer drops `providerTab` before Agents mounts. A query alone initially captured Reason instead of Claude Code or Codex. Those records are replaced by visible-tab clicks and an active-panel assertion. This is an app routing issue, not an REA screenshot failure. The App owner was notified separately.
- The reference Codex CLI variant reports an invalid account response from the reference backend fixture. It also displays two auth cards, while OpenConductor keeps the three-card design from #689. That screenshot is partial layout evidence and cannot prove sign-in behavior or an exact match. No mock error is copied into the product.
- An initial OpenConductor environment capture lacked the `env_vars_list` fixture response. The fixture now returns an empty list. That record is replaced, not accepted as a match.
- The initial fixture enabled Big terminal globally to make its page accessible. The final fixture enables it only for that page, so the other states use the reference's disabled default.
- REA's screenshot comparator takes capture JSON with base64 images, not PNG paths. The existing comparison script supplies that wrapper. No new REA execution error was observed in this pass.

## Reproduce

Follow [the settings verification instructions](../../../tools/settings/README.md). Raw DOM and scenario files remain local scratch data. This directory keeps screenshots, comparison records and the review page. The aggregate UI map is maintained by its own owner.
