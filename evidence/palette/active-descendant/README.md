# Palette selected-option accessibility binding

Conductor Rebuild / `PALETTE-ACTIVE-DESCENDANT-SAME15`.

## Reference and defect

Retained real-Conductor 0.87.6 REA renderer `renderApp-D_fmY7hW.js` is
11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
This pass rehashed that full already-held file, and compared all 14 literal
records in `source.json` to their exact zero-based, half-open UTF-8 byte spans.
No new acquisition or reference JavaScript execution occurred.

The complete retained chain is `h_a → qZ → Y5s → KV → P6=Xyi`.
`m_a → kI → P6.Input=B5s` consumes the input, while `$o → P6.Item=M5s`
creates results. M5s generates an ID with `_j`, registers it with `c.item`,
and renders that ID on the option. Pointer/keyboard selection changes the
root's value; Xyi's selected-option lookup `G()` supplies the actual element
ID to `selectedItemId`. B5s subscribes to that state and sets
`aria-activedescendant`, with `aria-autocomplete="list"`. Jba uses the same
root/input/item wrappers for sections. The binding is not inferred from an
unconnected library declaration.

Main `eef01e9b287472280fb3f4a585bc697d5f1f8f51` lacked both the input's
active-descendant relation and option IDs in all three render paths. The
actual component source-unit fixture reproduced 11 assertion failures with
three passing behavior controls. Baseline product hashes are in `source.json`.

## Minimal repair

CommandPalette owns one React `useId` namespace and the index-to-option-ID
mapping. Its input references the selected rendered result, or omits the
attribute when no result exists. Regular, workspace and section/footer rows
receive the same ID mapping. Navigation, filtering, disabled-item callbacks,
activation, list order and visual styles are unchanged. The section component's
new ID callback and WorkspaceRow's ID are optional for standalone callers.

## Checks on Reason Cloud

- **RED:** `node --experimental-strip-types --test src/palette/activeDescendant.test.ts`
  — 11 intended assertion failures / three passing controls, exit 1.
- **GREEN:** identical frozen fixture — 14/14. SHA-256 remains
  `0f358cda74b6a85bf5daa68df514828e839c01c06fe2a606586106898ea4ea17`.
- **PASS:** same command with `src/palette/activeDescendantControls.test.ts`
  additionally — 16/16, including disabled pointer/click preservation.
- **PASS:** `node --experimental-strip-types --test --test-concurrency=2 src/palette/*.test.ts src/palette/search/*.test.ts src/keybindings/*.test.ts`
  — 392/392 before the two supplemental disabled controls were added.
- **PASS after integration with main `1d8c37ab634e4eca9f86d54c138dc73fb0ee3fb5`:**
  same full palette/keyboard command — 394/394 (including both supplemental controls);
  focused command — 16/16; production baseline hashes unchanged in the three leased files.
- **PASS:** `npm run typecheck`; `npm run build` (includes branding and typecheck),
  including a fresh build after that main integration.
  Build emitted a nonfatal chunk-size advisory. A supplemental test-harness
  type annotation was corrected before the final passing typecheck.
- **PASS:** `python3 evidence/palette/active-descendant/verify.py` and
  `git diff --check`. The verifier can also take the full retained renderer
  file as its sole argument to compare every literal to the parent bytes.

Validation logs are compressed without changing their uncompressed bytes.
Dependencies were installed with `npm ci --ignore-scripts --no-audit --no-fund`.
No lifecycle scripts, app/backend/provider, browser, package dispatch, native
process or watcher was started.

## Acceptance boundary

These are actual OpenConductor React component renders and callback assertions
through react-test-renderer with inert external dependencies, not a browser DOM
or native accessibility-tree observation. No screenshot is supplied because
runtime/browser/native execution is excluded from this source-only lane; this
repair changes ARIA/ID attributes, not appearance. VoiceOver announcements,
physical focus/keyboard input, current installed Conductor identity, containing
package and native side-by-side acceptance remain **NOT_RUN** with their existing
owners. Source binding parity is not a claim of native accessibility parity.
