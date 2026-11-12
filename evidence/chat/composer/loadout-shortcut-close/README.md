# Close the model menu after a loadout shortcut

Conductor Rebuild found the missing menu transition at default main `140d8bb2ec417d381433074b104a50a5c20cba81` and re-read it unchanged at `26f8345401efb021bef2f12b17815eba6c57170c` on Reason Cloud. The correction closes the menu after applying an occupied slot's complete configuration.

## Reference

[The source record](source.json) seals retained Conductor 0.87.6 assets from REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Both complete asset hashes and three complete declarations passed static integrity checks.

- `n7i` maps occupied favorites to physical numeric slots.
- `RNi` creates that mapping with a callback that applies the favorite through `gt` and then calls `O(false)`. The five `chat.selectLoadout` handlers invoke this mapping through `Vt`, which rejects busy state before calling the occupied callback.
- `gt` forwards the favorite's complete configuration to the existing selection callback. The shortcut is not a prompt submission.
- `cJe` separately registers the open menu's numeric item actions using the same callbacks. This increment does not add or change those separate bindings.

Baseline `ModelPicker.selectSlot` checks disabled state and closed-menu focus containment, then calls `selectLoadoutSlot(loadout, index, onChange)` without a menu transition. The correction wraps that helper's callback to apply the choice and call `setOpen(false)`. The helper still invokes its callback only for occupied entries and does not compact holes. Empty-slot consumption, disabled state, focus containment and #856 effort handlers are unchanged.

These are decoded source facts, not fresh installed-app observations. REA's retained directory analysis skipped renderer parsing and partially parsed the index. The declaration windows are direct byte reads. No new REA invocation failed. Existing limitations remain in [the REA gap record](../../rea-gaps.md).

## Frozen regression

[The fixture hash](fixture.sha256) freezes `src/features/chat/modelPickerLoadoutClose.test.ts` before automatic hosted execution. The fixture mounts the actual ModelPicker using React's test renderer and registers its actual command callbacks with the real `bindCommands` and dispatcher. It reads rendered menu host output and the complete selected configuration.

Four expected failure cases select occupied slots 1, 3 and 5 with the menu open, then select physical slot 3 while a search has no results. Configuration must be applied exactly once before checking that the menu closes. Slot 1 deliberately selects the already-current favorite.

Five preservation controls cover both empty physical slots, an already-open picker becoming disabled, a closed picker with composer focus, and a closed picker with focus outside. Empty-slot shortcut consumption remains unchanged. Workspace fallback semantics are not modified or claimed equivalent to Conductor by this increment.

Automatic hosted command:

```bash
node --test src/features/chat/modelPickerLoadoutClose.test.ts
```

## Hosted reproduction and correction

[The ordinary automatic baseline run](https://github.com/reason-machines/openconductor/actions/runs/43150684988) executed regression-only head `20e1a71ca52355e8f7cbd1b618187f431551bc97`. Both frontend jobs failed only the four intended cases. In each case, dispatch ran and the exact occupied configuration assertion passed before the menu assertion failed with expected `0`, actual `1`. All five independent controls passed. The full suite reported 3,303 tests, 3,299 passed and four failed. Typecheck itself passed; the later build step was skipped after the regression failure. [The retained receipt](hosted-red.json) links both jobs and records their decisive results.

Only after this qualified failure, the correction adds menu dismissal inside the occupied-slot callback. The nine-case fixture remains byte-identical to the regression-only head. Static source integrity, `git diff --check` and `npm run typecheck` passed on Reason Cloud. Corrected hosted tests and build are pending. No local behavioral execution, manual dispatch or rerun was used.

Laziness Protocol kept the product diff inside the existing callback. Fix Root Causes put the missing transition after successful selection, rather than adding unrelated dismissal events.

## Limits

The test replaces tooltip rendering, animation presence, the keybinding registration hook and focus containment with adapters. Binding resolution and dispatch are real; OS event delivery is not. No browser, native Mac, real provider, sidecar, first/resume or pixel acceptance is claimed. No screenshot is available because this source lane has no browser or native execution. #856 effort selection, Fast/readiness fixtures, credentials and protected apps are untouched.
