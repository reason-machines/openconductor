# Close the model menu after a loadout shortcut

Conductor Rebuild checked default main `140d8bb2ec417d381433074b104a50a5c20cba81` on Reason Cloud. The numeric loadout handler applies an occupied slot but does not close its open model menu.

## Reference

[The source record](source.json) seals retained Conductor 0.87.6 assets from REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Both complete asset hashes and three complete declarations passed static integrity checks.

- `n7i` maps occupied favorites to physical numeric slots.
- `RNi` creates that mapping with a callback that applies the favorite through `gt` and then calls `O(false)`. The five `chat.selectLoadout` handlers invoke this mapping through `Vt`, which rejects busy state before calling the occupied callback.
- `gt` forwards the favorite's complete configuration to the existing selection callback. The shortcut is not a prompt submission.
- `cJe` separately registers the open menu's numeric item actions using the same callbacks. This increment does not add or change those separate bindings.

Current `ModelPicker.selectSlot` already checks disabled state and closed-menu focus containment. It calls `selectLoadoutSlot(loadout, index, onChange)` and returns without a menu transition. The existing helper applies only occupied entries and does not compact holes.

These are decoded source facts, not fresh installed-app observations. REA's retained directory analysis skipped renderer parsing and partially parsed the index. The declaration windows are direct byte reads. No new REA invocation failed. Existing limitations remain in [the REA gap record](../../rea-gaps.md).

## Frozen regression

[The fixture hash](fixture.sha256) freezes `src/features/chat/modelPickerLoadoutClose.test.ts` before automatic hosted execution. The fixture mounts the actual ModelPicker using React's test renderer and registers its actual command callbacks with the real `bindCommands` and dispatcher. It reads rendered menu host output and the complete selected configuration.

Four expected failure cases select occupied slots 1, 3 and 5 with the menu open, then select physical slot 3 while a search has no results. Configuration must be applied exactly once before checking that the menu closes. Slot 1 deliberately selects the already-current favorite.

Five preservation controls cover both empty physical slots, an already-open picker becoming disabled, a closed picker with composer focus, and a closed picker with focus outside. Empty-slot shortcut consumption remains unchanged. Workspace fallback semantics are not modified or claimed equivalent to Conductor by this increment.

Automatic hosted command:

```bash
node --test src/features/chat/modelPickerLoadoutClose.test.ts
```

Static checks on Reason Cloud passed for source hashes, the complete declaration joins and `git diff --check`. Product tests, typecheck and build have not run for this regression yet. Ordinary automatic CI must establish actual failures and passing controls before a product correction is applied. No manual dispatch or rerun is needed.

## Limits

The test replaces tooltip rendering, animation presence, the keybinding registration hook and focus containment with adapters. Binding resolution and dispatch are real; OS event delivery is not. No browser, native Mac, real provider, sidecar, first/resume or pixel acceptance is claimed. No screenshot is available because this source lane has no browser or native execution. #856 effort selection, Fast/readiness fixtures, credentials and protected apps are untouched.
