# Palette composition isolation

Conductor Rebuild source-qualified this repair against main `d745c5259712b49f90ab47ecb2bad674a66c3c89`.

## Reference

[source.json](source.json) records the retained REA artifact identity for the real Conductor 0.87.6 renderer, its complete SHA-256, and six original UTF-8 byte spans. The call path is `h_a → qZ → Y5s → KV → P6 = Xyi`. The cmdk root skips Enter selection and native navigation when `nativeEvent.isComposing` is true or the synthetic event has `keyCode === 229`. Escape is handled separately by the outer dialog. Extracted application text is evidence only; none was executed.

Fresh main still resolves composing Enter as `select`, which calls the selection and close callbacks. It also moves the active result for composing navigation. The two baseline product snapshots retain the exact checked bytes.

## Frozen behavioral regression

The new [33-case fixture](../../../src/palette/paletteComposition.test.ts) mounts the actual CommandPalette and uses the real search model, key resolver, and shortcut overrides. It observes active selection, selection and close callbacks, and event consumption. Animation, icons, and the unrelated Workspaces-tab rendering are inert boundaries.

- Eighteen expected baseline failures cover Enter and eight navigation chords for both native composition and legacy keyCode 229.
- Nine noncomposing controls retain selection and navigation.
- Six controls retain Escape, a custom next-tab shortcut, and unrelated text input during either composition signal.

The fixture SHA-256 is sealed in [fixture.sha256](fixture.sha256). Assertions do not change to accommodate the product fix. A loader or type error is not behavioral RED. Ordinary automatic PR frontend CI supplies baseline execution; no workflow is dispatched or rerun.

Test Behavior, Not Implementation keeps the check at the mounted input handler rather than copied navigation logic. The intended product change is a composition check after command resolution, limited to select and item-navigation commands. Escape, custom tabs, state.ts, the separately owned defaultPrevented handler, and every older frozen fixture are excluded.

## Verification and limits

- Static source and fixture integrity: `python3 evidence/palette/ime-composition/verify.py --baseline`.
- Mounted behavioral RED and GREEN: pending at baseline publication.
- No local JavaScript or Rust execution, browser propagation check, physical IME input, native GUI, provider, or released-install acceptance was run. No screenshot exists because browser and native runtime were not admitted for this lane.
- Fake events prove callback behavior only, not real DOM propagation or physical input behavior.
- #1134 is merged separately at `5d9d47ac046a8650576e059ef18f3f8847e6e963`; its consuming-main CI, CodeQL, and all nine frozen cases passed. Packaging remains with its existing owner and is not acceptance credit here.
