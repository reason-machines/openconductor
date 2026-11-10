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

The mounted regression tests exercise production React event handlers with controlled catalog and storage fixtures. They are supplementary checks, not built-app evidence. Test execution and full typecheck await the shared runtime admission and the catalog/fixed-slot dependency increments.

The real `/Applications/Conductor.app` page has not been checked with REA for this request. A direct `rea --help` command timed out without output; no new REA evidence ID was produced. Mac execution authority was subsequently explicitly withdrawn in the concurrent onboarding lane, so no alternate Session or route was used to continue Mac execution.

Required acceptance remains: authorized built-app recording of catalog drag, reorder, removal, keyboard pickup/drop, and composer loadout, plus exact-merge `package-macos` verification. There is no browser-only recording offered in its place.
