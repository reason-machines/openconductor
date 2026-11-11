# Default models loadout

## Reference and scope

Conductor Rebuild inspected Sven's supplied [reference image](reference-request.png) after copying its exact bytes from `~/oc-native-refs/requests-2026-11-10/default-models-loadout.png` on Sven m5 max. SHA-256: `68b86d14dfd59b1021b5d9da5ebf1444b79efa9a691f8512a92a6d15eb7b868f`.

The image shows the Default models heading, Loadout description, five numbered cards, DEFAULT on slot 1, a Share action, and Reason Machines, Claude Code, and Codex columns. It is evidence of appearance, not keyboard, persistence, or drag behavior. The interaction requirements come from Sven's request, not inferred Conductor source.

## Implementation

- `ModelLoadout.tsx`: live catalog cards, drag into any slot, physical-slot reorder, drag out, context Add to slot / Move to slot / Remove, and Enter / arrow / Enter keyboard pickup and drop. Escape cancels a pickup.
- Slot persistence and default selection use the fixed-slot domain helpers. Clearing slot 1 does not promote another model.
- The page reads runtime model catalogs, shows per-agent failures, and permits refresh. No copied Conductor palette is used to offer models. Only advertised effort metadata is offered for changes.
- Share copies the loadout configuration to the clipboard. It does not claim to publish a share URL.

## Verification limits at the source checkpoint

The 13 mounted regression cases exercise production React event handlers with controlled catalog and storage fixtures. They are supplementary checks, not built-app evidence. Catalog PR #913 and fixed-slot PR #912 are integrated from main `d7d316031d97acaff81ebd08ad0884a70c4e57e0`. This supplies the physical-slot exports and the fifth explicit-agent argument used by both settings components; no compatibility wrapper is added. Exact-head mounted-test, typecheck, and keybinding results are recorded on PR #914 after hosted CI runs. Local test/build execution remains paused.

The hosted App flows check on published head `00525a4b` failed `agent-settings: no GPT-5.5 in the Codex column`. That flow assumed the old static palette without configuring a catalog CLI. The fixture now advertises `e2e-codex-catalog` through Codex `model/list`; the flow configures that executable through Settings, checks its advertised name, agent, effort and physical-slot persistence, removes it through the current accessible button, and restores the executable override. Hosted verification of this correction is pending. No product catalog fallback is added.

Real installed-Codex discovery remains a separate, unverified acceptance check under the runtime/native hold. Source inspection at main `d7d316031d97acaff81ebd08ad0884a70c4e57e0` confirms `local_model_catalog` resolves through `agent_launch::current`, including configured, ready bundled and system executables, then uses `app-server --listen stdio://` and paginated `model/list`. The fixture exercises that configured-executable path but does not prove a real installed CLI's response.

The real `/Applications/Conductor.app` page has not been checked with REA for this request. A direct `rea --help` command timed out without output; no new REA evidence ID was produced. Mac execution authority was subsequently explicitly withdrawn in the concurrent onboarding lane, so no alternate Session or route was used to continue Mac execution.

Required acceptance remains: authorized built-app recording of catalog drag, reorder, removal, keyboard pickup/drop, and composer loadout, plus exact-merge `package-macos` verification. There is no browser-only recording offered in its place.
