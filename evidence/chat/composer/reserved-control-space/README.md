# Reserved Ctrl+Space in the composer

Conductor Rebuild owns packet `COMPOSER-RESERVED-CTRL-SPACE-135-01`. The source comparison uses main `12a805ed90f5aeb0d472e53a64ad6d85bf2d3479`.

## Source finding

Conductor reserves Ctrl+Space before composer commands. Its `P5o` predicate accepts either logical `key === " "` or physical `code === "Space"`, requires Ctrl and excludes Meta. Shift and Alt do not change the result. `aqn` directly returns this predicate, and its `dBr` wrapper is an identity function.

The shared editor's low-level key handler checks `aqn` before composition, suggestion plugins and configured send matching. The outer React handler also checks it first, then prevents default, stops propagation and returns. The React wrapper's `onKeyDown` points directly to that handler. No keyboard normalization is inferred.

On the checked main, `ComposerEditor` forwards this chord to its parent callback. That callback belongs to either the normal Composer or its queued-message editor. The fix adds an early guard in the shared editor. Reserved chords no longer reach the parent, and the editor reports them handled with default and propagation prevented. Other chords retain the existing callback path.

[Exact retained spans and source pins](source.json) record the complete predicate, identity wrapper, low-level handler, outer handler and wrapper dispatch. The retained renderer is 11,600,457 bytes with SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its identity matches the [decoded asset manifest](../../../frontend/tauri-assets-manifest.json).

The original REA evidence ID is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. That analysis exhausted its JavaScript worker heap. This pass reads retained original bytes as inert text, not a generated call graph or observed native behavior. No new REA failure occurred.

## Regression scope

The new regression mounts the complete production `ComposerEditor` through React test-renderer. Its Tiptap boundary uses a real headless document and a substituted DOM view. It invokes the key handler installed by the production component, not a copied guard.

Six reserved cases cover both predicate branches and the Shift/Alt variants. Six controls cover plain Space, Meta variants, another Ctrl key, and the parent's existing handled result. Each case observes forwarding, handled/default/propagation state and an unchanged draft. The fixture also checks editor-handle cleanup.

The events are synthetic Node `Event` objects with keyboard fields. The fixture does not execute the actual parent send handler, DOM editor dispatcher, browser, ancestor listener, OS input method, native IME or provider. No native event producer or visual parity is claimed.

## Verification

Passed in the source-only pass:

- Whole retained renderer identity and exact span hashes.
- Current-main source pins and five-line production diff review.
- `git diff --check`.

Not run yet: baseline failure proof, candidate tests, typecheck, browser, native app, real IME, provider or screenshots. The existing serialized executor owns runtime admission. Expected counts in `source.json` are predictions, not results.

The same frozen test can select the baseline product source with `COMPOSER_RESERVED_SPACE_SOURCE_REF=12a805ed90f5aeb0d472e53a64ad6d85bf2d3479`. The candidate path leaves that variable unset. A loader, dependency or fixture failure does not count as a behavioral baseline failure.

No existing #1019 assertion, global shortcut, send preset, menu, terminal, model picker, Home or local-clear code changes. The existing composition guard remains unchanged. This is not a which-only-229 or real IME correction.
