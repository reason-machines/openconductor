# Palette Shift navigation

Owner: Conductor Rebuild / SAME15. Dedupe: `PALETTE-SHIFT-NAVIGATION-SAME15`.

## Reproduced mismatch

On fresh main **`1b2d83e6c2e2b3fa2eb251fc25a56d96401d96f1`**, the actual mounted `PaletteHost → CommandPalette` normal input leaves selection unchanged for Shift+ArrowDown, Shift+ArrowUp, Shift+Home and Shift+End. The complete retained Conductor root handles these keys without filtering Shift. This unit covers only those four keys with no other modifiers; no broader modifier parity is claimed.

The new fixture exercises All, Actions, Settings, Workspaces and Projects with actual result construction, rows, command resolution and movement functions. Every failure first asserts a reachable list with at least three real rows and selected row 1. After dispatching the actual input's handler, selection incorrectly remains at row 1 instead of the evidenced target.

```bash
node --experimental-strip-types --test src/palette/paletteShiftNavigation.test.ts
```

Frozen fixture SHA-256: `878a54f9469db23e4de2542a5df043f3e8bd9e5b2247900cdbcc5665f1886b58`.

RED: **31 tests: 11 passing controls / 20 intended assertion failures**, exit 1, no skips or loader failures (`red.tap.gz`). Controls preserve unshifted navigation, composing and legacy-229 keys, explicit next-tab/previous-tab/close overrides, empty/disabled results, and unrelated shifted text. The fixture uses real React and the current production resolver; it does not implement a substitute key matcher or movement function.

## Complete retained source and interception boundary

Both entire retained parents were independently rehashed on Reason Cloud:

- REA-subject `renderApp-D_fmY7hW.js`: 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; retained artifact `ev_a4ce503a76a3198b2d2bec127c09bb6940b806849318ccc51523f40701751ab5`.
- Original retained `index-BGEQ8YjU.js`: 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`; existing uploaded original bytes, no new acquisition.

`source.json` pins 21 UTF-8 half-open byte records and the full parent identities. Most records are complete declarations or binding initializers; import/export specifiers and the modifier declaration prefix are explicitly labelled as such, not represented as complete enclosing statements.

1. Actual caller: `h_a → qZ → Y5s → KV → P6=Xyi`; `Y5s` sets looping. It only handles Escape in the enclosing dialog key handler. `m_a → kI → P6.Input=B5s` forwards input props with no replacing keydown handler in any of those complete records.
2. Root dispatch: `Xyi` invokes a supplied root handler first, then exits on `defaultPrevented`, IME or legacy 229. Its Down/Up functions prevent the default and use Meta endpoints, Alt groups, otherwise ordinary movement. Home/End select endpoints. The complete root has no `shiftKey` predicate. This is positive handler evidence, not a conclusion from an absent local condition alone.
3. Capture: `rzr` installs the window capture listener. An exclusive recorder `P0i` takes and stops the event first. Otherwise ordinary non-Escape keys reach `C8t.dispatch`. Matched explicit shortcuts call preventDefault/stopImmediatePropagation and cannot also reach root. Unmatched shortcuts return false.
4. Overrides: `m_a` registers both palette tab commands; `oi` obtains effective shortcuts through `ZOt(...overrides...)` and merges the enclosing dialog, registry `when` and options. Preserve that priority in any fix; the mounted fixture already checks custom shifted tab and close bindings.
5. Exact modifier matcher: retained renderer imports `bZ as GOt` and `b_ as qOt`; the retained index exports `Hfe as bZ` and `_Ut as b_`. `_Ut` compares all modifier flags. Its Shift/Alt punctuation exception only concerns a one-character non-letter key, so it cannot make an unmodified Arrow/Home/End binding consume these shifted multi-character keys.
6. The **entire 165-entry default registry** is retained and parsed into a TypeScript AST, never evaluated. All five default ArrowDown/ArrowUp candidates resolve to modifier lists other than Shift alone; no Home/End default exists. Hence these four Shift chords are not default registered shortcuts. This does not claim no user override or recorder can intercept them; those remain explicitly prior consumers.

```bash
node evidence/palette/shift-navigation/verify.cjs <retained-renderer.js> <retained-index.js> --baseline
node --experimental-strip-types --test src/keybindings/listeners.test.ts src/keybindings/dispatcher.test.ts src/keybindings/resolve.test.ts
```

At the qualification milestone, source/frozen verification **passed** both complete parent hashes, all 21 records and joins, statically parsed registry, 31-case freeze, **42 unchanged adjacent fixtures** and unchanged baseline production. The source-backed expectation migration after the product repair is recorded separately below.

Existing capture/dispatcher/resolver controls: **31/31 passed** (`capture-controls.tap`), including exclusive captures, handled bare Escape/default prevention, listener ordering, typing/dialog scopes, custom matching and held-key rules. These controls and retained source are not physical-input or browser event-propagation evidence.

## Shared section boundary, separately qualified

The complete retained `Jba` function (record 21, bytes 10,877,545–10,880,908) renders the same `KV → P6=Xyi` root with looping. Its input `O` handles only empty Backspace; its root `I` handles only Escape. Neither consumes these four Shift-navigation keys. The current section is still explicitly disabled. The root's inherited Shift handling therefore applies to this path as well; this is not inferred merely because the local command resolver is shared.

A separate supplemental fixture mounts actual `PaletteHost → CommandPalette → MoveToSection`. It is frozen independently at SHA-256 `bbd3cbe805fc444516517ff90a113c572745977ae7adbd240af960a511008712`; the original 31-case fixture is unchanged. On the same unfixed main, its **12 tests report 4 passing controls / 8 intended selection assertion failures** (`section-red.tap.gz`). Cases cover all four keys with both a middle and leading disabled current section. Controls cover composition and legacy 229, disabled-only filtered results, and ordinary enabled-index navigation. No assignment, New-section or close side effect occurs during the navigation cases.

## Minimal repair and expectation migration

The reconciled production change is only `src/palette/state.ts`, inside `paletteCommandFor`'s existing default arm **after** explicit `resolveCommand` handling: six lines add Shift-only ArrowDown, ArrowUp, Home and End fallbacks, plus one clarified comment. Existing Option, Meta, Control, Enter and Escape routing is unchanged. No CommandPalette, PaletteHost, section helper, CSS, keybindings or registry edit occurred.

One existing test made an assumption contradicted by the newly closed retained source: `src/palette/state.test.ts` expected Shift+Home and Shift+End to return null. Its targeted migration preserves all **eight runtime modifier assertions**: the six Meta/Control/Alt null checks remain, and the two Shift assertions now require the evidenced first/last-item commands. The original whole file and SHA-256 are retained losslessly in `state-test-before.ts.gz` and `test-migration.json`; the verifier reconstructs the exact single-block replacement. The other **41 existing affected fixtures** are byte-identical. Neither frozen new fixture (regular31 or section12) changed.

## Fresh-main verification

The first test-only milestone was committed as `30b08345a`. The section boundary was separately qualified before any production edit. After fetching actual main `426d3a3e1b528b1611c321a7c7054f2dd786a1a3`, the unchanged combined43 reproduced **15 passing controls / 28 intended assertion failures** (`fresh-main-red.tap.gz`). After the minimal fallback, the same43 passed unchanged (`green.tap.gz`). Final integration used fresh main **`6cc9a9c75cb2ee4cdec678bc51f6b2960dac2280`**; all three baseline production files and the old state fixture at that head are byte-identical to the reproduced baseline.

- **PASS:** unchanged regular31 + section12: **43/43**, no skips.
- **PASS:** all current palette/keybinding tests and the explicitly named pointer, group-binding and section supplements: **521/521**, no skips (`final-affected.tap.gz`):

```bash
node --experimental-strip-types --test --test-concurrency=1 $(find src/palette src/keybindings -name '*.test.ts' -type f | sort) evidence/palette/pointer-selection-scroll/pointer-transition-controls.test.ts evidence/palette/shift-navigation/section-controls.test.ts evidence/palette/group-navigation/binding-controls.test.ts evidence/palette/section-auto-scroll/pointer-controls.test.ts
npm run typecheck
npm run build
node evidence/palette/shift-navigation/verify.cjs <retained-renderer.js> <retained-index.js>
git diff origin/main --check
```

- **PASS:** explicit TypeScript check, branding and production build on final integrated source (`final-typecheck.log.gz`, `final-build.log.gz`); advisory chunk-size warnings only.
- **PASS:** full retained parents, 21 byte records, closed input/root/capture/modifier/override/section joins, static 165-entry registry, frozen31/12, exact minimal production change, exact expectation migration, 41 other fixture pins and lossless log identities.
- **PASS:** diff whitespace check. `delivery.json` pins tested main, predecessor #1437's actual squash `cf084b8aef2213dc9f6f0f89f26dd22e7655289e`, production identity and acceptance gaps.

### Separate pre-existing optional harness failure

The initial expanded command also ran the old optional `evidence/palette/group-navigation/section-preservation.test.ts`. It reported seven VM `ReferenceError`s because its synthetic scope lacks the section-specific enabled indices and selected/setter state introduced before this change. This is not a product assertion failure: a separate detached worktree at unmodified main `426d3a3e1` reproduced exactly the same seven failures, while all nine original state tests passed (**23 combined: 16 passed / 7 failed**, `old-harness-baseline.tap.gz`). The initial expanded product-tree run was **535: 527 passed / 8 failed**: these seven setup errors plus the one source-backed old Shift expectation described above (`initial-affected-failure.tap.gz`). Neither run is represented as passing.

This optional legacy fixture is unchanged and its separate repair is tracked in [issue #1442](https://github.com/reason-machines/openconductor/issues/1442). The final 521-case command above includes all current source test files and the other named supplements, but not that known-broken optional historical VM. No assertion was skipped, deleted or weakened to manufacture a passing result.

## Acceptance limits

Retained source and mounted normal-input callback proof only. Browser event propagation, DOM geometry/viewport visibility, physical input, native accessibility, installed identity, provider execution and package inclusion: **NOT_RUN**. No screenshot because this lane has no serialized runtime admission; no app/browser/native/package dispatch, new acquisition, vendor-JS evaluation or additional watcher occurred. Existing Home271/SAME992 release custody has #1437's confirmed squash and its unchanged downstream acceptance gaps. No new REA operation was invoked, so no new REA tool failure arose in this qualification.

Assertion TAP and typecheck logs are archived losslessly; `log-identities.json` pins the raw and compressed identities. This preserves diagnostic whitespace without adding whitespace errors to source-control diffs.
