# Help shortcut overrides

Conductor Rebuild corrected Help's default-only shortcut hints against main `791cbcf61`.

## Reference

The retained decoded Conductor source establishes `Help KQo → Ss(commandId) → jde → Mde` (subscribed snapshot) → imported `OQt/GUt/nh`, which prefers saved command overrides over defaults. `openKeyboardShortcuts` is configurable. `Ss` renders both primary and additional shortcuts. Artifact hashes, exact UTF-8 byte ranges, import/export mappings and raw inert slices are preserved in [reference-provenance.md](reference-provenance.md), [reference-focused.json](reference-focused.json), [reference-transitive.json](reference-transitive.json) and [reference-trace.txt](reference-trace.txt). These are static shipped-artifact evidence, not native observation; extracted text was treated as data, not executed.

The earlier REA worker-heap/graph-budget gaps remain documented in the provenance record; the focused retained-source inspection closed this resolver lookup only.

## Correction

Help previously rendered `glyphs(COMMANDS.find(...).key)`, even when the dispatcher used a remap. It now reads the existing `useKeybindingOverrides()` context and passes its current snapshot to `effectiveShortcuts`, rendering each effective hint. Shared provider, registry, storage and dispatch code are unchanged.

The first commit extracted the existing hint algorithm into the production helper and added the regression. The second corrects that helper. The component subscribes through the existing provider hook, so changes to provider overrides trigger normal React rendering.

## Checks

- **Failed before:** `node --experimental-strip-types --test src/components/helpShortcutHints.test.ts`: 1 passed, 2 failed. Saved `⌘⇧Y`/`⌘K` replacement shortcuts displayed `⌘⌥/`; see [red.tap](red.tap).
- **Passed after:** `node --experimental-strip-types --test src/components/helpShortcutHints.test.ts src/components/helpMenuItems.test.ts src/keybindings/*.test.ts src/settings/keybindingOverrides.test.ts`: 102 passed, 0 failed; see [green.tap](green.tap). Covers defaults, parsed persisted remaps, multiple shortcuts, changed snapshots and reset to defaults, plus existing dispatcher/storage tests.
- **Passed:** `npm run typecheck`; see [typecheck.txt](typecheck.txt).
- **Passed:** `git diff --check`.

The regression executes the production pure hint helper, not a mounted React component. Live context updates are source-wired, not runtime-observed here. No screenshot is supplied because runtime/native use is withheld under the existing serialized executor boundary. No app launch, build, install, provisioning, destination change or new watcher occurred. Native visible remap and rapid-reopen acceptance remain **NOT RUN**. No full native or pixel-parity claim is made.
